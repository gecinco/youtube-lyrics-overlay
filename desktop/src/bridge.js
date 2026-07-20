const { WebSocketServer } = require('ws');

const PORT = 19283;

function startBridge({ onNowPlaying, onConnectionChange }) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });
  const clients = new Set();

  wss.on('connection', (socket) => {
    clients.add(socket);
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

  wss.on('listening', () => {
    console.log(`[bridge] listening on ws://127.0.0.1:${PORT}`);
  });

  wss.on('error', (err) => {
    console.error('[bridge] error', err.message);
  });

  return {
    clientCount: () => clients.size,
    close: () => {
      for (const client of clients) {
        try {
          client.close();
        } catch {
          /* ignore */
        }
      }
      wss.close();
    },
  };
}

module.exports = { startBridge, PORT };
