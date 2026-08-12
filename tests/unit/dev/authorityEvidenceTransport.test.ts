import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrowserAuthorityEvidenceTransport } from '../../../src/dev/authorityEvidenceTransport';

class FakeBrowserWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static readonly instances: FakeBrowserWebSocket[] = [];

  readonly url: string;
  readyState = FakeBrowserWebSocket.CONNECTING;
  binaryType: BinaryType = 'blob';

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    FakeBrowserWebSocket.instances.push(this);
  }

  send(): void {}

  close(): void {
    this.readyState = FakeBrowserWebSocket.CLOSED;
  }

  open(): void {
    this.readyState = FakeBrowserWebSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  failThenClose(code: number, reason: string): void {
    this.dispatchEvent(new Event('error'));
    this.readyState = FakeBrowserWebSocket.CLOSED;
    const event = new Event('close');
    Object.defineProperties(event, {
      code: { value: code },
      reason: { value: reason },
    });
    this.dispatchEvent(event);
  }

  receiveUnsupportedPayload(): void {
    this.dispatchEvent(new MessageEvent('message', { data: new Blob(['unsupported']) }));
  }
}

afterEach(() => {
  FakeBrowserWebSocket.instances.length = 0;
  vi.unstubAllGlobals();
});

describe('browser authority evidence transport', () => {
  it('lets the informative close event own a generic browser socket failure', () => {
    vi.stubGlobal('WebSocket', FakeBrowserWebSocket as unknown as typeof WebSocket);
    const errors: string[] = [];
    const closes: Array<Readonly<{ code: number; reason: string }>> = [];
    const transport = createBrowserAuthorityEvidenceTransport();

    transport.connect('wss://authority.example.test/room/KYX-234567', {
      onOpen: () => undefined,
      onMessage: () => undefined,
      onClose: (code, reason) => closes.push({ code, reason }),
      onError: (message) => errors.push(message),
    });
    const socket = FakeBrowserWebSocket.instances[0]!;
    socket.open();
    socket.failThenClose(1012, 'service restart');

    expect(errors).toEqual([]);
    expect(closes).toEqual([{ code: 1012, reason: 'service restart' }]);
  });

  it('still fails closed for an unsupported browser payload type', () => {
    vi.stubGlobal('WebSocket', FakeBrowserWebSocket as unknown as typeof WebSocket);
    const errors: string[] = [];
    const transport = createBrowserAuthorityEvidenceTransport();

    transport.connect('wss://authority.example.test/room/KYX-234567', {
      onOpen: () => undefined,
      onMessage: () => undefined,
      onClose: () => undefined,
      onError: (message) => errors.push(message),
    });
    FakeBrowserWebSocket.instances[0]!.receiveUnsupportedPayload();

    expect(errors).toEqual(['authority socket delivered an unsupported payload type']);
  });
});
