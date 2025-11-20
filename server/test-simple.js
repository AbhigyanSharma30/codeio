import http from 'http';

console.log('Creating server...');
const server = http.createServer((req, res) => {
    console.log('Request received:', req.url);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello World\n');
});

console.log('Starting to listen...');
server.listen(3001, '0.0.0.0', () => {
    console.log('Server is listening on port 3001');
    console.log('Address:', server.address());
});

server.on('error', (err) => {
    console.error('Server error:', err);
});

console.log('Script reached end');
