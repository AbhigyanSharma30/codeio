import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import http from 'http';
import { WebSocketServer } from 'ws';
import mongoose from 'mongoose';
import cors from 'cors';
import { setupWSConnection } from 'y-websocket/src/y-websocket.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Document } from './models/Document.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer({ server });

// Middleware
app.use(express.json());
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3001',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
}));

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');
    setupWSConnection(ws, req);
    
    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});

// Code execution endpoint
app.post('/api/execute', async (req, res) => {
    const { code, language, input } = req.body;
    console.log(`[${new Date().toISOString()}] Executing ${language} code:`, {
        code: code.slice(0, 100) + (code.length > 100 ? '...' : ''),
        input: input || 'No input'
    });

    try {
        const response = await fetch('https://emkc.org/api/v2/piston/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                language,
                version: '3.10.0',
                files: [{ content: code }],
                stdin: input
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('Execution result:', result);

        res.json({
            success: result.run.code === 0,
            output: result.run.output,
            error: result.run.stderr,
            language,
            version: '3.10.0'
        });
    } catch (error) {
        console.error('Execution error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to execute code'
        });
    }
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/code-editor')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});