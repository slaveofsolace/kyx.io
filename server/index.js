import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

// LEGACY COMPARISON FIXTURE ONLY.
//
// This process deliberately preserves the original relay protocol so its
// client-trusting behavior can be inspected while an authoritative runtime is
// developed. It does not simulate or validate movement, collision, weapons,
// damage, kills, or scoring. A client can claim a kill, so none of the state
// emitted here is authoritative multiplayer state.
//
// Containment is enforced by binding only to IPv4 loopback. Do not proxy,
// tunnel, expose, or deploy this process.

const HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const MATCH_DURATION_MS = 8 * 60 * 1000;
const MAX_NAME_LEN = 24;
const KILL_RATE_LIMIT_MS = 150;
const MAX_MESSAGE_BYTES = 8 * 1024;

function readPort(value) {
  if (value === undefined || value === '') return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('LEGACY_RELAY_PORT must be an integer from 1 through 65535');
  }
  return port;
}

const port = readPort(process.env.LEGACY_RELAY_PORT);
let matchStart = Date.now();
/** @type {Map<import('ws').WebSocket, {id:number, name:string, kills:number, score:number, lastKillAt:number}>} */
const players = new Map();
let nextId = 1;

function sanitizeName(name) {
  const clean = String(name ?? '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, MAX_NAME_LEN);
  return clean || 'Recruit';
}

function rosterPayload() {
  return Array.from(players.values()).map(({ id, name, kills, score }) => ({ id, name, kills, score }));
}

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const socket of players.keys()) {
    if (socket.readyState === socket.OPEN) socket.send(data);
  }
}

function broadcastState() {
  broadcast({ type: 'state', matchStart, matchDurationMs: MATCH_DURATION_MS, players: rosterPayload() });
}

const matchCycle = setInterval(() => {
  if (Date.now() - matchStart < MATCH_DURATION_MS) return;

  matchStart = Date.now();
  for (const player of players.values()) {
    player.kills = 0;
    player.score = 0;
  }
  broadcastState();
}, 1000);

const heartbeat = setInterval(broadcastState, 5000);

const httpServer = createServer((request, response) => {
  response.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end('KYX legacy relay - loopback comparison fixture only\n');
});

const webSocketServer = new WebSocketServer({
  server: httpServer,
  maxPayload: MAX_MESSAGE_BYTES,
});

webSocketServer.on('connection', (socket) => {
  const player = { id: nextId++, name: 'Recruit', kills: 0, score: 0, lastKillAt: 0 };
  players.set(socket, player);

  socket.send(JSON.stringify({
    type: 'welcome',
    id: player.id,
    matchStart,
    matchDurationMs: MATCH_DURATION_MS,
    players: rosterPayload(),
  }));

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'hello') {
      player.name = sanitizeName(message.name);
      broadcast({ type: 'joined', name: player.name });
      broadcastState();
      return;
    }

    // Preserved only to demonstrate why the old protocol is non-authoritative:
    // the relay accepts a client's claim instead of validating a combat event.
    if (message.type === 'kill') {
      const now = Date.now();
      if (now - player.lastKillAt < KILL_RATE_LIMIT_MS) return;
      player.lastKillAt = now;
      player.kills += 1;
      player.score += 100;
      broadcast({ type: 'kill_feed', name: player.name });
      broadcastState();
    }
  });

  socket.on('close', () => {
    players.delete(socket);
    broadcast({ type: 'left', name: player.name });
    broadcastState();
  });
});

function shutdown() {
  clearInterval(matchCycle);
  clearInterval(heartbeat);
  webSocketServer.close(() => httpServer.close());
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

httpServer.listen(port, HOST, () => {
  console.log(`[kyx-legacy-relay] comparison fixture listening at ws://${HOST}:${port}`);
  console.log('[kyx-legacy-relay] non-authoritative; loopback only; do not expose or deploy');
});
