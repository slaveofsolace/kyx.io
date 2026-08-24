import { describe, expect, it } from 'vitest';

import {
  PROTOCOL_VERSION,
  validateClientMessage,
  validateServerMessage,
} from '../../../src/net';
import { validClientMessages, validServerMessages } from '../../fixtures/protocol/validMessages';

describe('spectator and rematch protocol authority boundary', () => {
  it('keeps spectator identity and target state off the join request', () => {
    const join = validClientMessages.find(({ type }) => type === 'joinSpectator');
    expect(join?.type).toBe('joinSpectator');
    if (join?.type !== 'joinSpectator') return;

    expect(validateClientMessage({
      ...join,
      spectatorId: 'spectator.client-authored',
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_UNKNOWN_FIELD',
        path: '$.spectatorId',
      }),
    });
    expect(validateClientMessage({
      ...join,
      targetPlayerId: 'player.client-authored',
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_UNKNOWN_FIELD',
        path: '$.targetPlayerId',
      }),
    });
  });

  it('resumes a spectator without accepting client-authored identity', () => {
    const resume = validClientMessages.find(({ type }) => type === 'resumeSpectator');
    expect(resume?.type).toBe('resumeSpectator');
    if (resume?.type !== 'resumeSpectator') return;

    expect(validateClientMessage({ ...resume, spectatorId: 'spectator.1' })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_UNKNOWN_FIELD',
        path: '$.spectatorId',
      }),
    });
  });

  it('allows target intent but rejects camera and movement facts', () => {
    const select = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'selectSpectatorTarget',
      requestId: 'req.spectator.target.detach',
      targetPlayerId: null,
    } as const;
    expect(validateClientMessage(select)).toEqual({ ok: true, value: select });
    expect(validateClientMessage({ ...select, xMillimeters: 99 })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_UNKNOWN_FIELD',
        path: '$.xMillimeters',
      }),
    });
  });

  it('rejects a spectator target absent from the server roster', () => {
    const state = validServerMessages.find(({ type }) => type === 'spectatorState');
    expect(state?.type).toBe('spectatorState');
    if (state?.type !== 'spectatorState') return;

    expect(validateServerMessage({
      ...state,
      targetPlayerId: 'player.missing',
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_INVALID_FIELD_VALUE',
        path: '$.targetPlayerId',
      }),
    });
    expect(validateServerMessage({
      ...state,
      targets: [state.targets[0], state.targets[0]],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_DUPLICATE_ID',
        path: '$.targets',
      }),
    });
  });

  it('keeps player identity and consensus outcome off rematch votes', () => {
    const vote = validClientMessages.find(({ type }) => type === 'rematchVote');
    expect(vote?.type).toBe('rematchVote');
    if (vote?.type !== 'rematchVote') return;

    expect(validateClientMessage({ ...vote, playerId: 'player.1' })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_UNKNOWN_FIELD',
        path: '$.playerId',
      }),
    });
    expect(validateClientMessage({ ...vote, status: 'accepted' })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_UNKNOWN_FIELD',
        path: '$.status',
      }),
    });
  });

  it('rejects ineligible rematch voters and inconsistent timing', () => {
    const state = validServerMessages.find(({ type }) => type === 'rematchState');
    expect(state?.type).toBe('rematchState');
    if (state?.type !== 'rematchState') return;

    expect(validateServerMessage({
      ...state,
      votes: [{ playerId: 'player.3', decision: 'accept', authorityTick: state.serverTick }],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_INVALID_FIELD_VALUE',
        path: '$.votes[0].playerId',
      }),
    });
    expect(validateServerMessage({ ...state, expiresAtTick: state.openedAtTick })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_INVALID_FIELD_VALUE',
        path: '$.expiresAtTick',
      }),
    });
  });
});
