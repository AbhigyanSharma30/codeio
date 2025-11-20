import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import fetch from 'node-fetch';
import { WebsocketProvider } from 'y-websocket';

// Create a function to handle Y.js WebSocket connections
const setupWSConnection = (ws, req) => {
    ws.on('message', (message) => {
        try {
            // Handle Y.js protocol messages
            const data = JSON.parse(message);
            if (data.type === 'sync') {
                // Broadcast to all other clients
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === ws.OPEN) {
                        client.send(message);
                    }
                });
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    });
};

const app = express();
app.use(express.json());
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
}));

// Create HTTP server
const server = http.createServer(app);

// Setup WebSocket server for both collaboration and code execution
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    console.log('[WebSocket] New connection established');
    
    // Set up Y.js WebSocket connection
    try {
        setupWSConnection(ws, req);
        console.log('[Y.js] WebSocket connection initialized');
    } catch (error) {
        console.error('[Y.js] Failed to set up WebSocket connection:', error);
    }
    
    ws.on('error', (error) => {
        console.error('[WebSocket] Connection error:', error);
    });
    
    ws.on('close', () => {
        console.log('[WebSocket] Connection closed');
    });
});

// Code execution endpoint with detailed logging
app.post('/api/execute', async (req, res) => {
    const { code, language, input } = req.body;
    
    console.log(`[${new Date().toISOString()}] Executing code:`, {
        language,
        codePreview: code.slice(0, 100) + (code.length > 100 ? '...' : ''),
        input: input || 'No input'
    });
    
    // Define language versions and configurations
    const languageConfig = {
        python: { version: '3.10.0', name: 'python', ext: '.py', template: (code) => code },
        javascript: { version: '18.15.0', name: 'nodejs', ext: '.js', template: (code) => code },
        typescript: { version: '5.0.3', name: 'typescript', ext: '.ts', template: (code) => code },
        java: { version: '15.0.2', name: 'java', ext: '.java', template: (code) => code.includes('class Main') ? code : `public class Main {\n    public static void main(String[] args) {\n        ${code}\n    }\n}` },
        cpp: { version: '10.2.0', name: 'cpp', ext: '.cpp', template: (code) => code.includes('main(') ? code : `#include <iostream>\nusing namespace std;\n\nint main() {\n    ${code}\n    return 0;\n}` },
        rust: { version: '1.68.2', name: 'rust', ext: '.rs', template: (code) => code.includes('fn main') ? code : `fn main() {\n    ${code}\n}` },
        go: { version: '1.20.2', name: 'go', ext: '.go', template: (code) => code.includes('func main') ? code : `package main\n\nimport "fmt"\n\nfunc main() {\n    ${code}\n}` }
    };

    try {
        const config = languageConfig[language];
        if (!config) {
            return res.status(400).json({ error: `Unsupported language: ${language}` });
        }
        
        // Apply language-specific template and prepare code
        const codeToExecute = config.template(code.trim());
        const fileName = `main${config.ext}`;
        
        console.log('[Execute] Prepared code:', {
            language: config.name,
            version: config.version,
            fileName
        });

        const response = await fetch('https://emkc.org/api/v2/piston/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                language: config.name,
                version: config.version,
                files: [{ 
                    content: codeToExecute,
                    name: fileName
                }],
                stdin: input,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('[Execute] Received response:', data);
        
        // Format the response in a consistent way
        const result = {
            success: data.run && !data.run.stderr && data.run.code === 0,
            output: data.run ? data.run.stdout || '' : '',
            error: data.run ? data.run.stderr || (data.run.code !== 0 ? 'Execution failed' : '') : 'Execution failed',
            exitCode: data.run ? data.run.code : -1,
            language,
            version: config.version
        };
        
        console.log('[Execute] Formatted response:', result);
        res.json(result);
    } catch (error) {
        console.error('Error executing code:', error);
        res.status(500).json({ 
            success: false,
            error: error.message || 'Failed to execute code',
            output: '',
            exitCode: -1,
            language,
            version: config?.version
        });
    }
});

const PORT = process.env.PORT || 5000;

// Start server without MongoDB dependency
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`WebSocket server is ready for connections`);
});

// Handle process termination
process.on('SIGINT', () => {
    mongoose.connection.close(() => {
        console.log('MongoDB connection closed through app termination');
        process.exit(0);
    });
});