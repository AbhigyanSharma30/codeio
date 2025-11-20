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

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3001',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
}));

// WebSocket setup for collaborative editing
wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');
    setupWSConnection(ws, req);
    
    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});

// Code execution endpoint with detailed logging
app.post('/api/execute', async (req, res) => {
    const { code, language, input } = req.body;
    console.log(`[${new Date().toISOString()}] Executing ${language} code:`, {
        code: code.slice(0, 100) + (code.length > 100 ? '...' : ''),
        input: input || 'No input'
    });

    try {
        // Language configuration
        const languageConfig = {
            python: { version: '3.10.0', name: 'python' },
            javascript: { version: '18.15.0', name: 'nodejs' },
            typescript: { version: '5.0.3', name: 'typescript' },
            java: { version: '15.0.2', name: 'java' },
            cpp: { version: '10.2.0', name: 'cpp' },
            rust: { version: '1.68.2', name: 'rust' },
            go: { version: '1.20.2', name: 'go' }
        };

        const config = languageConfig[language];
        if (!config) {
            console.error(`Unsupported language: ${language}`);
            return res.status(400).json({
                success: false,
                error: `Unsupported language: ${language}`
            });
        }

        // Language-specific code wrapping
        let codeToExecute = code;
        const fileName = `main${language === 'java' ? '.java' : ''}`;

        if (language === 'java' && !code.includes('class Main')) {
            codeToExecute = `public class Main {\n    public static void main(String[] args) {\n        ${code}\n    }\n}`;
        }
        else if (language === 'cpp' && !code.includes('main(')) {
            codeToExecute = `#include <iostream>\nusing namespace std;\n\nint main() {\n    ${code}\n    return 0;\n}`;
        }
        else if (language === 'rust' && !code.includes('fn main')) {
            codeToExecute = `fn main() {\n    ${code}\n}`;
        }
        else if (language === 'go' && !code.includes('func main')) {
            codeToExecute = `package main\n\nimport "fmt"\n\nfunc main() {\n    ${code}\n}`;
        }

        console.log(`Sending request to Piston API for ${language} execution`);
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

        const result = await response.json();
        console.log('Execution result:', result);

        const formattedResponse = {
            success: !result.run.stderr && result.run.code === 0,
            output: result.run.stdout || '',
            error: result.run.stderr || '',
            exitCode: result.run.code
        };

        res.json(formattedResponse);
    } catch (error) {
        console.error('Code execution error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to execute code: ' + error.message
        });
    }
});

// WebSocket setup for collaboration
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    setupWSConnection(ws);
    console.log('New WebSocket connection established');
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/collaborative-editor';

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        server.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('MongoDB connection error:', error);
    });

// Graceful shutdown
process.on('SIGINT', () => {
    mongoose.connection.close(() => {
        console.log('MongoDB connection closed through app termination');
        process.exit(0);
    });
});

const app = express();
app.use(express.json());
app.use(cors());

// Enable CORS with specific options
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3001',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
}));

// Code execution endpoint
app.post('/api/execute', async (req, res) => {
    const { code, language, input } = req.body;
    
    console.log('Executing code:', { language, code: code.slice(0, 100) + '...', input });

    try {

        const response = await fetch('https://emkc.org/api/v2/piston/execute', {app.post('/api/execute', async (req, res) => {

            method: 'POST',  const { code, language, input } = req.body;

            headers: {

                'Content-Type': 'application/json',  let version;

            },  switch (language) {

            body: JSON.stringify({    case 'python':

                language,      version = '3.10.0';

                version: '3.10.0',      break;

                files: [{ content: code }],    case 'java':

                stdin: input,      version = '15.0.2';

            }),      break;

        });    case 'c':

      version = '10.2.0';

        if (!response.ok) {      break;

            throw new Error(`HTTP error! status: ${response.status}`);    case 'cpp':

        }      version = '10.2.0';

      break;

        const data = await response.json();    default:

        res.json(data);      version = '3.10.0'; // Default to Python if language is not recognized

    } catch (error) {  }

        console.error('Error executing code:', error);

        res.status(500).json({ error: 'Failed to execute code' });  console.log('Received code for execution:', code);

    }  console.log('Language:', language);

});  console.log('Version:', version);



const server = http.createServer(app);  try {

    const response = await fetch('https://emkc.org/api/v2/piston/execute', {

// Set up WebSocket server      method: 'POST',

const wss = new WebSocket.Server({ server });      headers: {

        'Content-Type': 'application/json',

wss.on('connection', (ws) => {      },

    console.log('New WebSocket connection');      body: JSON.stringify({

        language: language,

    ws.on('message', (message) => {        version: version,

        // Broadcast to all clients except sender        files: [

        wss.clients.forEach((client) => {          {

            if (client !== ws && client.readyState === WebSocket.OPEN) {            content: code,

                client.send(message.toString());          },

            }        ],

        });      }),

    });    });

});

    if (!response.ok) {

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/collaborative-editor';      throw new Error(`HTTP error! status: ${response.status}`);

    }

mongoose.connect(MONGODB_URI)

    .then(() => {    const data = await response.json();

        console.log("Connected to MongoDB");    res.json(data);

        server.listen(5000, () => {  } catch (error) {

            console.log('Server is running on port 5000');    console.error('Error executing code:', error);

        });    res.status(500).json({ error: 'Failed to execute code' });

    })  }

    .catch((error) => {});

        console.error("Error connecting to MongoDB:", error);

    });const server = http.createServer(app);

// Set up WebSocket server for YJS

// Handle process terminationconst wss = new WebSocketServer({ server, path: '/shared-docs/' });

process.on('SIGINT', () => {

    mongoose.connection.close(() => {wss.on('connection', (ws, req) => {

        console.log('MongoDB connection closed through app termination');    setupWSConnection(ws, req);

        process.exit(0);    console.log('New YJS WebSocket connection');

    });});

});
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log("Connected to MongoDB");
        server.listen(5000, () => {
            console.log('Server is running on port 5000');
        });
    })
    .catch((error) => {
        console.error("Error connecting to MongoDB:", error);
    });


io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('get-document', async (docIdFromClient) => {
    const document = await findOrCreateDocument(docIdFromClient);
    const actualDocumentId = document._id;
    socket.join(actualDocumentId);
    socket.emit('load-document', document.content);

    socket.on('send-changes', (delta) => {
      socket.broadcast.to(actualDocumentId).emit('receive-changes', delta);
    });

    socket.on('save-document', async (data) => {
      await Document.findByIdAndUpdate(actualDocumentId, { content: data });
    });

    socket.on('cursor-move', (cursorData) => {
      socket.broadcast.to(actualDocumentId).emit('update-cursor', cursorData);
    });
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

async function findOrCreateDocument(id) {
  if (id == null) return;

  if (id === "new") {
    return await Document.create({ content: "" });
  }

  const document = await Document.findById(id);
  if (document) return document;
  return await Document.create({ _id: id, content: "" });
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));