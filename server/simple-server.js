import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();

// Enhanced CORS configuration
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Code execution endpoint
app.post('/api/execute', async (req, res) => {
    console.log('[Execute] Received request:', {
        language: req.body.language,
        codeLength: req.body.code?.length
    });

    const { code, language = 'python' } = req.body;

    if (!code) {
        console.log('[Execute] No code provided');
        return res.status(400).json({ error: 'No code provided' });
    }

    try {
        // Use Piston API for code execution
        const response = await fetch('https://emkc.org/api/v2/piston/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                language: 'python',
                version: '3.10.0',
                files: [{
                    content: code
                }]
            })
        });

        const result = await response.json();
        
        // Check for compilation or runtime errors
        if (result.run?.stderr) {
            return res.json({ error: result.run.stderr });
        }

        // Return successful output
        return res.json({ output: result.run?.stdout || 'No output' });

    } catch (error) {
        console.error('Code execution error:', error);
        return res.status(500).json({ error: 'Failed to execute code' });
    }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});