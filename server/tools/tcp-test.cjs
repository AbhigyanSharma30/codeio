#!/usr/bin/env node

const net = require('net');

const port = Number(process.env.TEST_PORT || process.argv[2] || 4001);
const host = process.env.TEST_HOST || '127.0.0.1';

const server = net.createServer((socket) => {
  socket.write('Hello from tcp-test');
  socket.end();
});

server.on('error', (err) => {
  console.error('[tcp-test] Server error:', err && err.message ? err.message : err);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`[tcp-test] Listening on ${host}:${port} (pid ${process.pid})`);
  console.log(`[tcp-test] Press Ctrl+C to exit`);
});

// Keep process alive
process.stdin.resume();
