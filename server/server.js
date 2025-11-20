import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import http from 'http';
import { WebSocketServer } from 'ws';
import admin from 'firebase-admin';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import cors from 'cors';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync.js';
import * as awarenessProtocol from 'y-protocols/awareness.js';
import * as encoding from 'lib0/encoding.js';
import * as decoding from 'lib0/decoding.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Document } from './models/Document.js';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Express app
const app = express();

// Middleware
// Enable CORS. In development we allow the requesting origin dynamically so
// that clients running on different localhost ports (3000,3001,3002...) can
// talk to the server without needing to set an explicit CLIENT_URL env var.
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like curl or server-to-server)
        if (!origin) return callback(null, true);
        // In production you should validate the origin against a whitelist.
        // For dev convenience accept any localhost origin and any origin
        // explicitly listed via process.env.CLIENT_URL (comma-separated).
        const allowed = (process.env.CLIENT_URL || 'http://localhost:3000')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
        if (allowed.includes(origin) || isLocalhost) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Basic security headers
app.use(helmet());

// Basic rate limiter for sensitive endpoints
const execLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down.' }
});

// Initialize Firebase Admin SDK if credentials are provided
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(svc) });
        console.log('[Auth] firebase-admin initialized from FIREBASE_SERVICE_ACCOUNT');
    } else {
        // Attempt default initialization (e.g., GOOGLE_APPLICATION_CREDENTIALS set in env)
        admin.initializeApp();
        console.log('[Auth] firebase-admin initialized with default credentials');
    }
} catch (err) {
    console.warn('[Auth] firebase-admin initialization failed or not configured:', err && err.message ? err.message : err);
}

// Middleware to verify Firebase ID tokens
const verifyFirebaseToken = async (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
        // Development bypass: allow unauthenticated requests from localhost when NOT running in production
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[Auth] Missing token — development bypass enabled');
            req.user = { uid: 'dev-local', dev: true };
            return next();
        }
        return res.status(401).json({ error: 'Unauthorized: missing token' });
    }
    const idToken = authHeader.split(' ')[1];
    try {
        if (!admin || !admin.auth) throw new Error('firebase-admin not configured');
        const decoded = await admin.auth().verifyIdToken(idToken);
        req.user = decoded;
        next();
    } catch (err) {
        // Development bypass if firebase-admin isn't configured or verification fails — allow in non-production environments
        console.warn('[Auth] Token verification failed:', err && err.message ? err.message : err);
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[Auth] Token verification failed — development bypass enabled');
            req.user = { uid: 'dev-local', dev: true };
            return next();
        }
        return res.status(401).json({ error: 'Unauthorized: invalid token' });
    }
};

// Test endpoint
app.get('/', (req, res) => {
    res.json({ message: 'Server is running' });
});

// Serve client in production when the build exists
if (process.env.NODE_ENV === 'production') {
    try {
        const clientBuildPath = path.join(__dirname, '..', 'client', 'build');
        app.use(express.static(clientBuildPath));
        app.get('*', (req, res) => {
            res.sendFile(path.join(clientBuildPath, 'index.html'));
        });
        console.log(`[Setup] Serving client from ${clientBuildPath}`);
    } catch (err) {
        console.warn('[Setup] Could not enable production static serving:', err && err.message ? err.message : err);
    }
}

// Code execution endpoint (protected)
app.post('/api/execute', execLimiter, verifyFirebaseToken, async (req, res) => {
    const { code, language, input } = req.body;
    console.log(`[${new Date().toISOString()}] Executing ${language} code:`, {
        code: code.slice(0, 100) + (code.length > 100 ? '...' : ''),
        input: input !== undefined && input !== null && input !== '' ? `"${input}"` : 'No input provided',
        inputType: typeof input,
        inputLength: input ? input.length : 0
    });

    try {
        // Language version configuration
        const languageConfig = {
            python: '3.10.0',
            javascript: '18.15.0',
            typescript: '5.0.3',
            java: '15.0.2',
            cpp: '10.2.0',
            rust: '1.68.2',
            go: '1.16.15'
        };

        const version = languageConfig[language] || '3.10.0';
        const fileName = {
            python: 'main.py',
            javascript: 'main.js',
            typescript: 'main.ts',
            java: 'Main.java',
            cpp: 'main.cpp',
            rust: 'main.rs',
            go: 'main.go'
        }[language] || 'main.py';

        const response = await fetch('https://emkc.org/api/v2/piston/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                language,
                version,
                files: [{
                    name: fileName,
                    content: code
                }],
                stdin: input || ''
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('Execution result:', result);

        // Extract output and error information
        const error = result.run?.stderr || (result.compile?.stderr);
        const output = result.run?.stdout || (result.compile?.stdout) || '';

        res.json({
            success: !error && (result.run?.code === 0),
            output: output.trim() || 'No output',
            error: error?.trim(),
            language,
            version
        });
    } catch (error) {
        console.error('Code execution error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to execute code'
        });
    }
});

// MongoDB connection
const connectToMongo = async () => {
    try {
        console.log('[MongoDB] Starting connection...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/code-editor');
        console.log('[MongoDB] Connected to MongoDB');
    } catch (err) {
        console.error('[MongoDB] Connection error:', err);
        // Don't exit on MongoDB connection error - continue without it
    }
};

// Don't await - let it connect in the background
console.log('[Setup] Starting MongoDB connection in background...');
connectToMongo().catch(err => {
    console.error('[MongoDB] Failed to start MongoDB connection:', err);
});

console.log('[Setup] Creating HTTP server...');
// Create HTTP server
const server = http.createServer(app);

console.log('[Setup] Creating WebSocket server...');
// Create WebSocket server
const wss = new WebSocketServer({ noServer: true });

// Store Y.js documents and awareness states by room
const docs = new Map();
const awareness = new Map();

console.log('[Setup] Setting up WebSocket upgrade handler...');
// WebSocket upgrade handler
server.on('upgrade', (request, socket, head) => {
    try {
        console.log('[WebSocket] Upgrade request for:', request.url);

        // Parse token from query string (e.g. ws://host:port/docId?token=...)
        let token = null;
        try {
            const url = new URL(request.url, `http://${request.headers.host}`);
            token = url.searchParams.get('token');
        } catch (e) {
            console.warn('[WebSocket] Could not parse upgrade URL for token', e && e.message ? e.message : e);
        }

        const proceedWithUpgrade = (decodedUser) => {
            if (decodedUser) {
                request.user = decodedUser;
            }
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        };

        if (token && admin && admin.auth) {
            admin.auth().verifyIdToken(token)
                .then(decoded => {
                    console.log('[WebSocket] Token verified for uid:', decoded.uid);
                    proceedWithUpgrade(decoded);
                })
                .catch(err => {
                    console.warn('[WebSocket] Token verification failed:', err && err.message ? err.message : err);
                    if (process.env.NODE_ENV !== 'production') {
                        console.warn('[WebSocket] Development bypass: accepting connection without valid token');
                        proceedWithUpgrade({ uid: 'dev-local', dev: true });
                        return;
                    }
                    try {
                        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                    } catch (e) {}
                    socket.destroy();
                });
        } else {
            // No token provided
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[WebSocket] No token provided in upgrade request — development bypass enabled');
                proceedWithUpgrade({ uid: 'dev-local', dev: true });
                return;
            }
            console.warn('[WebSocket] No token provided in upgrade request; rejecting');
            try {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            } catch (e) {}
            socket.destroy();
        }
    } catch (err) {
        console.error('[WebSocket] Upgrade error:', err);
        socket.destroy();
    }
});

console.log('[Setup] Setting up WebSocket connection handler...');
// WebSocket connection handler
wss.on('connection', (ws, req) => {
    try {
        // Attach authenticated user (if present from upgrade)
        if (req && req.user) {
            ws.user = req.user;
            console.log('[WebSocket] Connection authenticated for uid:', req.user.uid);
        }
        // Parse document ID from URL
        const docName = req.url.slice(1).split('?')[0];
        console.log('[WebSocket] New connection for document:', docName);

        // Get or create Y.js document
        let doc = docs.get(docName);
        let awarenessState = awareness.get(docName);
        
        if (!doc) {
            doc = new Y.Doc();
            docs.set(docName, doc);
            awarenessState = new awarenessProtocol.Awareness(doc);
            awareness.set(docName, awarenessState);
            console.log(`[WebSocket] Created new document: ${docName}`);
        }

        // Handle incoming messages
        ws.on('message', (message) => {
            try {
                const uint8 = new Uint8Array(message);
                const decoder = decoding.createDecoder(uint8);
                const encoder = encoding.createEncoder();
                const messageType = decoding.readVarUint(decoder);

                switch (messageType) {
                    case 0: // Sync Step 1 or 2
                        encoding.writeVarUint(encoder, 0);
                        syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
                        // Broadcast to other clients
                        const syncMessage = encoding.toUint8Array(encoder);
                        wss.clients.forEach((client) => {
                            if (client !== ws && client.readyState === 1 && client.docName === docName) {
                                client.send(syncMessage, { binary: true });
                            }
                        });
                        break;
                        
                    case 1: // Awareness
                        awarenessProtocol.applyAwarenessUpdate(
                            awarenessState,
                            decoding.readVarUint8Array(decoder),
                            ws
                        );
                        // Broadcast awareness to other clients
                        const awarenessMessage = uint8;
                        wss.clients.forEach((client) => {
                            if (client !== ws && client.readyState === 1 && client.docName === docName) {
                                client.send(awarenessMessage, { binary: true });
                            }
                        });
                        break;
                }
            } catch (err) {
                console.error('[WebSocket] Message handling error:', err);
            }
        });

        // Send sync step 1
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0);
        syncProtocol.writeSyncStep1(encoder, doc);
        ws.send(encoding.toUint8Array(encoder), { binary: true });

        // Send current awareness state
        if (awarenessState.getStates().size > 0) {
            const awarenessEncoder = encoding.createEncoder();
            encoding.writeVarUint(awarenessEncoder, 1);
            encoding.writeVarUint8Array(
                awarenessEncoder,
                awarenessProtocol.encodeAwarenessUpdate(awarenessState, Array.from(awarenessState.getStates().keys()))
            );
            ws.send(encoding.toUint8Array(awarenessEncoder), { binary: true });
        }

        // Store document name on WebSocket for filtering
        ws.docName = docName;

        ws.on('close', () => {
            console.log('[WebSocket] Connection closed for document:', docName);
            awarenessState.setLocalState(null);
        });

        ws.on('error', (err) => {
            console.error('[WebSocket] Connection error:', err);
        });
    } catch (err) {
        console.error('[WebSocket] Connection handler error:', err);
    }
});

const PORT = process.env.PORT || 3001;
console.log(`[Setup] Starting server on port ${PORT}...`);
console.log(`[Setup] Server object:`, typeof server, server ? 'exists' : 'null');

// Bind explicitly to loopback to avoid any interface-specific issues on Windows
server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Server] Server running on port ${PORT}`);
    console.log(`[Server] Server is ready to accept connections`);
    console.log(`[Server] Server address:`, server.address());
});

server.on('error', (err) => {
    console.error('[Server] Server error:', err);
    if (err.code === 'EADDRINUSE') {
        console.error(`[Server] Port ${PORT} is already in use`);
        process.exit(1);
    }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('[Process] Uncaught Exception:', error);
    console.error(error.stack);
});