import { describe, expect, it } from 'vitest';

import type { NetworkImpairmentConfig } from '../../../src/client/netcode/networkImpairment';
import {
  AUTHORITY_EVIDENCE_IMPAIRMENT_PROFILE_NAMES,
  createAuthorityEvidenceImpairmentPolicy,
  createImpairedAuthorityEvidenceTransport,
  parseAuthorityEvidenceImpairmentProfile,
  requireAuthorityEvidenceImpairmentPolicy,
} from '../../../src/dev/authorityEvidenceImpairment';
import type {
  AuthorityEvidenceConnection,
  AuthorityEvidenceScheduler,
  AuthorityEvidenceTransport,
  AuthorityEvidenceTransportCallbacks,
  AuthorityEvidenceTransportPayload,
} from '../../../src/dev/authorityEvidenceTransport';

interface ScheduledCallback {
  readonly handle: number;
  readonly dueAtMilliseconds: number;
  readonly callback: () => void;
}

class ManualScheduler implements AuthorityEvidenceScheduler {
  now = 0;
  private nextHandle = 1;
  private readonly delayed = new Map<number, ScheduledCallback>();

  nowMilliseconds(): number {
    return this.now;
  }

  repeat(): unknown {
    return 0;
  }

  stopRepeating(): void {}

  after(callback: () => void, delayMilliseconds: number): unknown {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.delayed.set(handle, {
      handle,
      dueAtMilliseconds: this.now + delayMilliseconds,
      callback,
    });
    return handle;
  }

  stopAfter(handle: unknown): void {
    if (typeof handle === 'number') this.delayed.delete(handle);
  }

  advanceTo(targetMilliseconds: number): void {
    if (targetMilliseconds < this.now) throw new RangeError('manual clock cannot go backward');
    while (true) {
      const next = [...this.delayed.values()].sort((left, right) => (
        left.dueAtMilliseconds - right.dueAtMilliseconds || left.handle - right.handle
      ))[0];
      if (next === undefined || next.dueAtMilliseconds > targetMilliseconds) break;
      this.delayed.delete(next.handle);
      this.now = next.dueAtMilliseconds;
      next.callback();
    }
    this.now = targetMilliseconds;
  }
}

class RawConnection implements AuthorityEvidenceConnection {
  socketState: ReturnType<AuthorityEvidenceConnection['state']> = 'connecting';
  readonly sent: string[] = [];

  constructor(private readonly callbacks: AuthorityEvidenceTransportCallbacks) {}

  state(): ReturnType<AuthorityEvidenceConnection['state']> {
    return this.socketState;
  }

  send(payload: string): void {
    if (this.socketState !== 'open') throw new Error('raw test socket is not open');
    this.sent.push(payload);
  }

  close(code = 1000, reason = ''): void {
    if (this.socketState === 'closed') return;
    this.socketState = 'closed';
    this.callbacks.onClose(code, reason);
  }

  open(): void {
    this.socketState = 'open';
    this.callbacks.onOpen();
  }

  receive(payload: AuthorityEvidenceTransportPayload): void {
    this.callbacks.onMessage(payload);
  }
}

class RawTransport implements AuthorityEvidenceTransport {
  readonly connections: RawConnection[] = [];

  connect(_url: string, callbacks: AuthorityEvidenceTransportCallbacks): AuthorityEvidenceConnection {
    const connection = new RawConnection(callbacks);
    this.connections.push(connection);
    return connection;
  }
}

function directive(
  latencyMilliseconds: number,
  overrides: Partial<{
    drop: boolean;
    duplicateDelayMilliseconds: number | null;
    reorderDelayMilliseconds: number;
  }> = {},
) {
  return {
    latencyMilliseconds,
    drop: false,
    duplicateDelayMilliseconds: null,
    reorderDelayMilliseconds: 0,
    ...overrides,
  };
}

function scripted(schedule: readonly ReturnType<typeof directive>[]): NetworkImpairmentConfig {
  return {
    kind: 'scripted',
    startingClockMilliseconds: 0,
    maximumQueueDepth: 32,
    schedule,
  };
}

function frame(type: string, label: string): string {
  return JSON.stringify({ protocolVersion: 2, type, label });
}

describe('authority evidence named impairment profiles', () => {
  it('accepts only the finite query names and deeply freezes exact directional configs', () => {
    expect(AUTHORITY_EVIDENCE_IMPAIRMENT_PROFILE_NAMES).toEqual([
      'nominal',
      'latency-jitter',
      'loss',
      'reorder-duplicate',
      'combined-stress',
      'matrix-rtt-0',
      'matrix-rtt-50',
      'matrix-rtt-100',
      'matrix-rtt-200',
      'matrix-rtt-350',
      'matrix-jitter-15',
      'matrix-jitter-50',
      'matrix-loss-1',
      'matrix-loss-3',
      'matrix-loss-8',
      'matrix-duplicate-1',
      'matrix-duplicate-5',
      'matrix-targeted-reorder',
      'matrix-outage-recovery',
    ]);
    expect(parseAuthorityEvidenceImpairmentProfile(null)).toBe('nominal');
    expect(parseAuthorityEvidenceImpairmentProfile('latency-jitter')).toBe('latency-jitter');
    expect(() => parseAuthorityEvidenceImpairmentProfile('Latency-Jitter')).toThrow(
      /must be one of/u,
    );
    expect(() => parseAuthorityEvidenceImpairmentProfile('custom')).toThrow(/must be one of/u);

    const stress = requireAuthorityEvidenceImpairmentPolicy('combined-stress');
    expect(stress.enabled).toBe(true);
    expect(stress.inbound).toMatchObject({
      kind: 'seeded',
      baseLatencyMilliseconds: 110,
      jitterMilliseconds: 50,
      lossRatePermille: 80,
      duplicateRatePermille: 120,
      reorderRatePermille: 180,
    });
    expect(Object.isFrozen(stress)).toBe(true);
    expect(Object.isFrozen(stress.inbound)).toBe(true);
    expect(requireAuthorityEvidenceImpairmentPolicy('nominal').enabled).toBe(false);

    const rtt350 = requireAuthorityEvidenceImpairmentPolicy('matrix-rtt-350');
    expect(rtt350.inbound).toMatchObject({
      kind: 'seeded',
      baseLatencyMilliseconds: 175,
      jitterMilliseconds: 0,
    });
    expect(rtt350.outbound).toMatchObject({
      kind: 'seeded',
      baseLatencyMilliseconds: 175,
      jitterMilliseconds: 0,
    });
    expect(requireAuthorityEvidenceImpairmentPolicy('matrix-jitter-50').inbound)
      .toMatchObject({ kind: 'seeded', baseLatencyMilliseconds: 60, jitterMilliseconds: 50 });
    expect(requireAuthorityEvidenceImpairmentPolicy('matrix-loss-1').inbound)
      .toMatchObject({ kind: 'seeded', lossRatePermille: 10 });
    expect(requireAuthorityEvidenceImpairmentPolicy('matrix-duplicate-5').outbound)
      .toMatchObject({ kind: 'seeded', duplicateRatePermille: 50 });
    const targeted = requireAuthorityEvidenceImpairmentPolicy('matrix-targeted-reorder');
    expect(targeted.inbound.kind).toBe('scripted');
    if (targeted.inbound.kind === 'scripted') {
      expect(targeted.inbound.schedule).toHaveLength(512);
      expect(targeted.inbound.schedule[4]).toMatchObject({
        latencyMilliseconds: 20,
        reorderDelayMilliseconds: 140,
      });
      expect(Object.isFrozen(targeted.inbound.schedule)).toBe(true);
    }
    const outage = requireAuthorityEvidenceImpairmentPolicy('matrix-outage-recovery');
    expect(outage.inbound.kind).toBe('scripted');
    if (outage.inbound.kind === 'scripted') {
      expect(outage.inbound.schedule.slice(24, 42).every(({ drop }) => drop)).toBe(true);
      expect(outage.inbound.schedule[42]?.drop).toBe(false);
    }
  });

  it('fails closed while resolving malformed policy configs', () => {
    expect(() => createAuthorityEvidenceImpairmentPolicy({
      profile: 'bad profile',
      inbound: scripted([directive(0)]),
      outbound: scripted([directive(0)]),
    })).toThrow(/profile name is invalid/u);
    expect(() => createAuthorityEvidenceImpairmentPolicy({
      profile: 'invalid-config',
      inbound: {
        ...scripted([directive(0)]),
        unsupported: true,
      } as unknown as NetworkImpairmentConfig,
      outbound: scripted([directive(0)]),
    })).toThrow(/unsupported key/u);
  });
});

describe('authority evidence impairment transport wrapper', () => {
  it('delivers separate inbound and outbound loss, duplicates, and overtaking deterministically', () => {
    const scheduler = new ManualScheduler();
    const rawTransport = new RawTransport();
    const policy = createAuthorityEvidenceImpairmentPolicy({
      profile: 'scripted-test',
      outbound: scripted([
        directive(0, { reorderDelayMilliseconds: 50 }),
        directive(0),
        directive(0, { duplicateDelayMilliseconds: 5 }),
        directive(0, { drop: true }),
      ]),
      inbound: scripted([
        directive(0, { reorderDelayMilliseconds: 50 }),
        directive(0, { duplicateDelayMilliseconds: 5 }),
        directive(0, { drop: true }),
      ]),
    });
    const transport = createImpairedAuthorityEvidenceTransport({
      baseTransport: rawTransport,
      scheduler,
      policy,
    });
    const inbound: AuthorityEvidenceTransportPayload[] = [];
    const errors: string[] = [];
    const connection = transport.connect('ws://authority.test/socket', {
      onOpen: () => undefined,
      onMessage: (payload) => inbound.push(payload),
      onClose: () => undefined,
      onError: (message) => errors.push(message),
    });
    const raw = rawTransport.connections[0]!;
    raw.open();

    raw.receive(frame('welcome', 'reliable-control'));
    raw.receive(frame('fullSnapshot', 'bootstrap'));
    expect(inbound).toEqual([
      frame('welcome', 'reliable-control'),
      frame('fullSnapshot', 'bootstrap'),
    ]);
    inbound.length = 0;
    const explicitResync = JSON.stringify({
      protocolVersion: 2,
      type: 'fullSnapshot',
      resyncRequestId: 'request.resync.1',
    });
    raw.receive(explicitResync);
    expect(inbound).toEqual([explicitResync]);
    inbound.length = 0;

    connection.send(frame('inputBatch', 'out.delayed'));
    scheduler.advanceTo(1);
    connection.send(frame('inputBatch', 'out.overtaker'));
    connection.send(frame('inputBatch', 'out.duplicate'));
    connection.send(frame('inputBatch', 'out.dropped'));
    expect(raw.sent).toEqual([
      frame('inputBatch', 'out.overtaker'),
      frame('inputBatch', 'out.duplicate'),
    ]);
    scheduler.advanceTo(6);
    expect(raw.sent).toEqual([
      frame('inputBatch', 'out.overtaker'),
      frame('inputBatch', 'out.duplicate'),
      frame('inputBatch', 'out.duplicate'),
    ]);
    scheduler.advanceTo(50);
    expect(raw.sent).toEqual([
      frame('inputBatch', 'out.overtaker'),
      frame('inputBatch', 'out.duplicate'),
      frame('inputBatch', 'out.duplicate'),
      frame('inputBatch', 'out.delayed'),
    ]);

    raw.receive(frame('fullSnapshot', 'in.delayed'));
    scheduler.advanceTo(51);
    raw.receive(frame('fullSnapshot', 'in.duplicate'));
    raw.receive(frame('fullSnapshot', 'in.dropped'));
    expect(inbound).toEqual([frame('fullSnapshot', 'in.duplicate')]);
    scheduler.advanceTo(56);
    expect(inbound).toEqual([
      frame('fullSnapshot', 'in.duplicate'),
      frame('fullSnapshot', 'in.duplicate'),
    ]);
    scheduler.advanceTo(100);
    expect(inbound).toEqual([
      frame('fullSnapshot', 'in.duplicate'),
      frame('fullSnapshot', 'in.duplicate'),
      frame('fullSnapshot', 'in.delayed'),
    ]);

    const diagnostics = transport.impairmentDiagnostics?.();
    expect(diagnostics?.outbound.metrics).toMatchObject({
      sentPackets: 4,
      droppedPackets: 1,
      duplicatedPackets: 1,
      reorderImpairedPackets: 1,
      reorderedPackets: 1,
      deliveredCopies: 4,
    });
    expect(diagnostics?.inbound.metrics).toMatchObject({
      sentPackets: 3,
      droppedPackets: 1,
      duplicatedPackets: 1,
      reorderImpairedPackets: 1,
      reorderedPackets: 1,
      deliveredCopies: 3,
    });
    expect(diagnostics).toMatchObject({
      reliableControlFramesBypassedInbound: 2,
      bootstrapGameplayFramesBypassedInbound: 1,
      sessions: [{ gameplayImpairmentActive: true }],
    });
    expect(errors).toEqual([]);
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics?.sessions)).toBe(true);
  });

  it('wraps every resume connection freshly while retaining aggregate metrics without payloads', () => {
    const scheduler = new ManualScheduler();
    const rawTransport = new RawTransport();
    const transport = createImpairedAuthorityEvidenceTransport({
      baseTransport: rawTransport,
      scheduler,
      policy: 'nominal',
    });
    const callbacks = {
      onOpen: () => undefined,
      onMessage: () => undefined,
      onClose: () => undefined,
      onError: () => undefined,
    };

    const first = transport.connect('ws://authority.test/socket', callbacks);
    rawTransport.connections[0]!.open();
    first.send(JSON.stringify({
      protocolVersion: 2,
      type: 'resumeRoom',
      resumeToken: 'A'.repeat(43),
    }));
    first.close(4000, 'resume');
    const second = transport.connect('ws://authority.test/socket', callbacks);
    rawTransport.connections[1]!.open();
    second.send(JSON.stringify({
      protocolVersion: 2,
      type: 'resumeRoom',
      resumeToken: 'B'.repeat(43),
    }));

    const diagnostics = transport.impairmentDiagnostics?.();
    expect(rawTransport.connections).toHaveLength(2);
    expect(diagnostics).toMatchObject({
      profile: 'nominal',
      connectionsCreated: 2,
      activeConnectionOrdinal: 2,
      policy: {
        socketWrapping: 'fresh_per_connect',
        harnessLifecycle: 'fresh_inbound_and_outbound_per_connection',
        metricsRetention: 'transport_lifetime_aggregate_and_per_connection',
      },
      reliableControlFramesBypassedOutbound: 2,
      outbound: { metrics: { sentPackets: 0, deliveredPackets: 0 } },
      sessions: [
        {
          connectionOrdinal: 1,
          socketState: 'closed',
          reliableControlFramesBypassedOutbound: 1,
          outbound: { metrics: { sentPackets: 0 } },
        },
        {
          connectionOrdinal: 2,
          socketState: 'open',
          reliableControlFramesBypassedOutbound: 1,
          outbound: { metrics: { sentPackets: 0 } },
        },
      ],
    });
    expect(JSON.stringify(diagnostics)).not.toContain('A'.repeat(43));
    expect(JSON.stringify(diagnostics)).not.toContain('B'.repeat(43));
    expect(Object.isFrozen(diagnostics?.sessions[0]?.outbound.metrics)).toBe(true);
  });
});
