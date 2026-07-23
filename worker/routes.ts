import { normalizeRoomCode } from './security';

const ROOM_ROUTE = /^\/api\/rooms\/([^/]+)(?:\/(socket|metrics))?$/u;

export interface RoomRoute {
  readonly roomCode: string;
  readonly resource: 'room' | 'socket' | 'metrics';
}

export function parseRoomRoute(pathname: string): RoomRoute | null {
  const match = ROOM_ROUTE.exec(pathname);
  if (!match) return null;
  const roomCode = normalizeRoomCode(match[1]);
  if (roomCode === null) return null;
  const resource = match[2] === 'socket'
    ? 'socket'
    : match[2] === 'metrics'
      ? 'metrics'
      : 'room';
  return Object.freeze({ roomCode, resource });
}
