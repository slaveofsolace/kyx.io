import { describe, expect, it, vi } from 'vitest';

import { KyxRoom } from '../../worker/room';

interface WebSocketCloseHarness {
  webSocketClose(
    webSocket: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void>;
  readSocketAttachment(webSocket: WebSocket): null;
}

describe('KyxRoom hibernation WebSocket close boundary', () => {
  it('does not echo reserved abnormal close code 1006 to an already closed socket', async () => {
    const room = Object.create(KyxRoom.prototype) as WebSocketCloseHarness;
    room.readSocketAttachment = () => null;
    const close = vi.fn();
    const webSocket = { close } as unknown as WebSocket;

    await expect(room.webSocketClose(
      webSocket,
      1006,
      'abnormal closure',
      false,
    )).resolves.toBeUndefined();

    expect(close).not.toHaveBeenCalled();
  });
});
