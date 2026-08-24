import {
  createResumeToken,
  digestResumeToken,
  isResumeToken,
} from './resumeToken';
import { RESUME_GRACE_MILLISECONDS } from './resumeSessions';

const ACTIVE_SESSION_EXPIRY = Number.MAX_SAFE_INTEGER;

interface SpectatorResumeSessionRow {
  readonly [column: string]: string | number | ArrayBuffer | null;
  readonly spectator_id: string;
  readonly room_id: string;
  readonly match_id: string;
  readonly token_digest: string;
  readonly generation: number;
  readonly expires_at: number;
}

export interface SpectatorResumeSession {
  readonly spectatorId: string;
  readonly roomId: string;
  readonly matchId: string;
  readonly tokenDigest: string;
  readonly generation: number;
  readonly expiresAt: number;
}

export interface IssuedSpectatorResumeSession {
  readonly resumeToken: string;
  readonly session: SpectatorResumeSession;
}

export interface PreparedSpectatorResumeRotation {
  readonly presentedTokenDigest: string;
  readonly rotatedResumeToken: string;
  readonly rotatedTokenDigest: string;
}

function sessionFromRow(row: SpectatorResumeSessionRow): SpectatorResumeSession {
  return Object.freeze({
    spectatorId: row.spectator_id,
    roomId: row.room_id,
    matchId: row.match_id,
    tokenDigest: row.token_digest,
    generation: row.generation,
    expiresAt: row.expires_at,
  });
}

/**
 * Independent spectator credentials. Keeping this table separate prevents a
 * spectator from satisfying player lobby-checkpoint or gameplay-session joins.
 */
export class SpectatorResumeSessionRegistry {
  constructor(private readonly storage: DurableObjectStorage) {}

  ensureSchema(): void {
    this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS spectator_resume_sessions (
        spectator_id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        match_id TEXT NOT NULL,
        token_digest TEXT NOT NULL UNIQUE,
        generation INTEGER NOT NULL CHECK (generation >= 1),
        expires_at INTEGER NOT NULL
      )
    `);
    this.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS spectator_resume_sessions_expiry
      ON spectator_resume_sessions (expires_at)
    `);
  }

  async issue(
    spectatorId: string,
    roomId: string,
    matchId: string,
  ): Promise<IssuedSpectatorResumeSession> {
    const resumeToken = createResumeToken();
    const tokenDigest = await digestResumeToken(resumeToken);
    const session = Object.freeze({
      spectatorId,
      roomId,
      matchId,
      tokenDigest,
      generation: 1,
      expiresAt: ACTIVE_SESSION_EXPIRY,
    });
    this.storage.transactionSync(() => {
      this.storage.sql.exec(
        `INSERT INTO spectator_resume_sessions
          (spectator_id, room_id, match_id, token_digest, generation, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        session.spectatorId,
        session.roomId,
        session.matchId,
        session.tokenDigest,
        session.generation,
        session.expiresAt,
      );
    });
    return Object.freeze({ resumeToken, session });
  }

  async prepareRotation(
    resumeToken: string,
  ): Promise<PreparedSpectatorResumeRotation | null> {
    if (!isResumeToken(resumeToken)) return null;
    const rotatedResumeToken = createResumeToken();
    const [presentedTokenDigest, rotatedTokenDigest] = await Promise.all([
      digestResumeToken(resumeToken),
      digestResumeToken(rotatedResumeToken),
    ]);
    return Object.freeze({ presentedTokenDigest, rotatedResumeToken, rotatedTokenDigest });
  }

  lookup(
    prepared: PreparedSpectatorResumeRotation,
    roomId: string,
    matchId: string,
    nowMilliseconds: number,
  ): SpectatorResumeSession | null {
    const row = [...this.storage.sql.exec<SpectatorResumeSessionRow>(
      `SELECT spectator_id, room_id, match_id, token_digest, generation, expires_at
       FROM spectator_resume_sessions
       WHERE token_digest = ? AND room_id = ? AND match_id = ?
       LIMIT 1`,
      prepared.presentedTokenDigest,
      roomId,
      matchId,
    )][0];
    if (row === undefined || row.expires_at < nowMilliseconds) return null;
    return sessionFromRow(row);
  }

  isCurrentGeneration(
    spectatorId: string,
    roomId: string,
    matchId: string,
    generation: number,
    nowMilliseconds: number,
  ): boolean {
    const rows = [...this.storage.sql.exec<Record<string, number>>(
      `SELECT 1 AS current
       FROM spectator_resume_sessions
       WHERE spectator_id = ? AND room_id = ? AND match_id = ?
         AND generation = ? AND expires_at >= ?
       LIMIT 1`,
      spectatorId,
      roomId,
      matchId,
      generation,
      nowMilliseconds,
    )];
    return rows.length === 1;
  }

  commitRotation(
    current: SpectatorResumeSession,
    prepared: PreparedSpectatorResumeRotation,
    nowMilliseconds: number,
  ): SpectatorResumeSession | null {
    const generation = current.generation + 1;
    return this.storage.transactionSync(() => {
      const updated = this.storage.sql.exec(
        `UPDATE spectator_resume_sessions
         SET token_digest = ?, generation = ?, expires_at = ?
         WHERE spectator_id = ? AND room_id = ? AND match_id = ?
           AND token_digest = ? AND generation = ? AND expires_at >= ?`,
        prepared.rotatedTokenDigest,
        generation,
        ACTIVE_SESSION_EXPIRY,
        current.spectatorId,
        current.roomId,
        current.matchId,
        prepared.presentedTokenDigest,
        current.generation,
        nowMilliseconds,
      );
      if (updated.rowsWritten < 1) return null;
      return Object.freeze({
        ...current,
        tokenDigest: prepared.rotatedTokenDigest,
        generation,
        expiresAt: ACTIVE_SESSION_EXPIRY,
      });
    });
  }

  revokeSpectator(spectatorId: string, roomId: string, matchId: string): boolean {
    const deleted = this.storage.sql.exec(
      `DELETE FROM spectator_resume_sessions
       WHERE spectator_id = ? AND room_id = ? AND match_id = ?`,
      spectatorId,
      roomId,
      matchId,
    );
    return deleted.rowsWritten >= 1;
  }

  armDisconnectGrace(
    spectatorId: string,
    roomId: string,
    matchId: string,
    generation: number,
    nowMilliseconds: number,
  ): boolean {
    const updated = this.storage.sql.exec(
      `UPDATE spectator_resume_sessions
       SET expires_at = ?
       WHERE spectator_id = ? AND room_id = ? AND match_id = ? AND generation = ?`,
      nowMilliseconds + RESUME_GRACE_MILLISECONDS,
      spectatorId,
      roomId,
      matchId,
      generation,
    );
    return updated.rowsWritten >= 1;
  }

  pruneExpired(nowMilliseconds: number): readonly string[] {
    const spectatorIds = [...this.storage.sql.exec<Record<string, string>>(
      `SELECT spectator_id FROM spectator_resume_sessions
       WHERE expires_at < ? ORDER BY spectator_id`,
      nowMilliseconds,
    )].map((row) => row.spectator_id);
    this.storage.sql.exec(
      'DELETE FROM spectator_resume_sessions WHERE expires_at < ?',
      nowMilliseconds,
    );
    return Object.freeze(spectatorIds);
  }
}
