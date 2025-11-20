import express from 'express';
import http from 'http';

const app = express();

app.get('/', (req, res) => {
    res.json({ message: 'Test server is running!' });
});

const server = http.createServer(app);

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Test server running on port ${PORT}`);
    console.log('Server address:', server.address());
});

server.on('error', (err) => {
    console.error('Server error:', err);
});
