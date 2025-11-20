#!/usr/bin/env node

const http = require('http');
const net = require('net');
const { exec } = require('child_process');

const HOST = process.env.CHECK_HOST || '127.0.0.1';
const PORT = Number(process.env.CHECK_PORT || '3001');
const PATH = '/';
const TIMEOUT = 3000; // ms

function checkTcpConnect(host, port, timeout) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let called = false;

    const onDone = (ok, msg) => {
      if (called) return;
      called = true;
      try { socket.destroy(); } catch (e) {}
      resolve({ ok, msg });
    };

    socket.setTimeout(timeout, () => onDone(false, `TCP connect timed out after ${timeout}ms`));

    socket.once('error', (err) => onDone(false, `TCP error: ${err.message}`));
    socket.connect(port, host, () => onDone(true, 'TCP connect succeeded'));
  });
}

function checkHttp(host, port, path, timeout) {
  return new Promise((resolve) => {
    const options = {
      hostname: host,
      port,
      path,
      method: 'GET',
      timeout
    };

    const req = http.request(options, (res) => {
      const { statusCode } = res;
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ ok: statusCode >= 200 && statusCode < 400, statusCode, body }));
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, err: `HTTP request timed out after ${timeout}ms` });
    });

    req.on('error', (err) => resolve({ ok: false, err: err.message }));
    req.end();
  });
}

function runNetstat(port) {
  return new Promise((resolve) => {
    // On Windows, netstat is available
    exec('netstat -ano', { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, err: err.message });
      const lines = stdout.split(/\r?\n/).filter(Boolean);
      const matches = lines.filter(l => l.includes(':' + port));
      resolve({ ok: true, matches });
    });
  });
}

(async () => {
  console.log(`Checking server connectivity to http://${HOST}:${PORT}${PATH}`);

  const tcp = await checkTcpConnect(HOST, PORT, TIMEOUT);
  console.log('TCP check:', tcp.ok ? 'OK' : 'FAIL', tcp.msg || '');

  const httpRes = await checkHttp(HOST, PORT, PATH, TIMEOUT);
  if (httpRes.ok) {
    console.log(`HTTP GET / returned status ${httpRes.statusCode}`);
    const snippet = (httpRes.body || '').substring(0, 500).replace(/\n/g, '\\n');
    console.log('Response body (snippet):', snippet || '[empty]');
  } else {
    console.log('HTTP check failed:', httpRes.err || `status ${httpRes.statusCode}`);
  }

  const netstatRes = await runNetstat(PORT);
  if (netstatRes.ok) {
    console.log(`netstat lines containing :${PORT}:`);
    if (netstatRes.matches.length === 0) {
      console.log('[none found]');
    } else {
      netstatRes.matches.forEach(l => console.log(l));
    }
  } else {
    console.log('netstat failed:', netstatRes.err);
  }

  console.log('When running the real server, run it in one terminal and this script in another.');
  process.exit(0);
})();
