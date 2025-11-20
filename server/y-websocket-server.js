import { WebSocketServer } from 'ws';
import http from 'http';
import * as Y from 'yjs';
import { setupWSConnection } from './node_modules/y-websocket/src/y-websocket.js';

const host = process.env.HOST || 'localhost'
const port = process.env.PORT || 3001

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('okay')
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req)
  console.log('[Y.js] New WebSocket connection')

  ws.on('close', () => {
    console.log('[Y.js] Connection closed')
  })

  ws.on('error', (err) => {
    console.error('[Y.js] Connection error:', err)
  })
})

server.listen(port, host, () => {
  console.log(`[Y.js] Collaboration server running at http://${host}:${port}`)
})