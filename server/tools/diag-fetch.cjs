const dns = require('dns');
const net = require('net');
const https = require('https');
const url = require('url');
const tls = require('tls');

function dnsLookup(hostname) {
  return new Promise((resolve) => {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) return resolve({ ok: false, error: err.message });
      return resolve({ ok: true, addresses });
    });
  });
}

function tcpConnect(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    socket.setTimeout(timeout);
    socket.once('connect', () => {
      done = true;
      socket.destroy();
      resolve({ ok: true });
    });
    socket.once('error', (err) => {
      if (done) return;
      done = true;
      resolve({ ok: false, error: err.message });
    });
    socket.once('timeout', () => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    socket.connect(port, host);
  });
}

function httpsGet(rawUrl, timeout = 10000) {
  return new Promise((resolve) => {
    const parsed = url.parse(rawUrl);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.path || '/',
      method: 'GET',
      port: parsed.port || 443,
      rejectUnauthorized: true,
      timeout,
      headers: { 'User-Agent': 'diag-fetch/1.0' }
    };

    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({ ok: true, statusCode: res.statusCode, headers: res.headers, bodySnippet: Buffer.concat(chunks).slice(0, 500).toString('utf8') });
      });
    });
    req.on('error', (err) => {
      resolve({ ok: false, error: err.message, code: err.code });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    req.end();
  });
}

async function runOne(hostname) {
  console.log('=== DIAG for', hostname, '===');
  console.log('\n1) DNS lookup');
  const d = await dnsLookup(hostname);
  console.log(JSON.stringify(d, null, 2));

  if (!d.ok) return;
  const addr = d.addresses && d.addresses[0] && d.addresses[0].address;
  console.log('\n2) TCP connect to', addr || hostname, ':443');
  const t = await tcpConnect(addr || hostname, 443, 8000);
  console.log(JSON.stringify(t, null, 2));

  console.log('\n2b) TLS handshake (raw) to ' + (addr || hostname) + ':443');
  const tlsResult = await new Promise((resolve) => {
    const socket = tls.connect({ host: addr || hostname, port: 443, servername: hostname, rejectUnauthorized: false, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate(true) || null;
      const cipher = socket.getCipher && socket.getCipher();
      socket.end();
      resolve({ ok: true, authorized: socket.authorized, authorizationError: socket.authorizationError, cipher, cert });
    });
    socket.on('error', (err) => {
      resolve({ ok: false, error: err.message, code: err.code });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
  });
  console.log(JSON.stringify(tlsResult, null, 2));

  console.log('\n3) HTTPS GET https://' + hostname + '/ (TLS/HTTP test)');
  const h = await httpsGet('https://' + hostname + '/auth');
  console.log(JSON.stringify(h, null, 2));
}

(async function main() {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error('Usage: node diag-fetch.cjs <host1> [host2] ...');
    process.exit(2);
  }
  for (const t of targets) {
    await runOne(t);
    console.log('\n');
  }
})();
