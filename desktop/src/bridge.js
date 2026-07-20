const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = 19283;

function startBridge({ onNowPlaying, onConnectionChange }) {
  const clients = new Set();
  let lastSeenAt = 0;

  const server = http.createServer((req, res) => {
    // Chrome extension talks here — more reliable than WS in MV3 service workers.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      lastSeenAt = Date.now();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          clients: clients.size,
          lastSeenAt,
        })
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/now-playing') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1_000_000) req.destroy();
      });
      req.on('end', () => {
        try {
          const msg = JSON.parse(body || '{}');
          const payload = msg.payload !== undefined ? msg.payload : msg;
          lastSeenAt = Date.now();
          onNowPlaying?.(payload || null);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (socket) => {
    clients.add(socket);
    lastSeenAt = Date.now();
    onConnectionChange?.();

    socket.send(
      JSON.stringify({
        type: 'HELLO',
        message: 'lyrics-overlay bridge ready',
      })
    );

    socket.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (msg?.type === 'NOW_PLAYING') {
        lastSeenAt = Date.now();
        onNowPlaying?.(msg.payload || null);
      }

      if (msg?.type === 'PING') {
        socket.send(JSON.stringify({ type: 'PONG' }));
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
      onConnectionChange?.();
    });
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[bridge] http://127.0.0.1:${PORT}  (also ws)`);
  });

  server.on('error', (err) => {
    console.error('[bridge] error', err.message);
  });

  return {
    clientCount: () => clients.size,
    lastSeenAt: () => lastSeenAt,
    // Treat recent HTTP posts as "connected" even without WS clients.
    isLinked: () => clients.size > 0 || Date.now() - lastSeenAt < 5000,
    close: () => {
      for (const client of clients) {
        try {
          client.close();
        } catch {
          /* ignore */
        }
      }
      wss.close();
      server.close();
    },
  };
}

module.exports = { startBridge, PORT };
