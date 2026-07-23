import {
  createResumeToken,
  digestResumeToken,
  isResumeToken,
} from './resumeToken';

export const RESUME_GRACE_MILLISECONDS = 10_000 as const;
const ACTIVE_SESSION_EXPIRY = Number.MAX_SAFE_INTEGER;

interface ResumeSessionRow {
  readonly [column: string]: string | number | ArrayBuffer | null;
  readonly player_id: string;
  readonly room_id: string;
  readonly match_id: string;
  readonly token_digest: string;
  readonly generation: number;
  readonly expires_at: number;
}

export interface ResumeSession {
  readonly playerId: string;
  readonly roomId: string;
  readonly matchId: string;
  readonly tokenDigest: string;
  readonly generation: number;
  readonly expiresAt: number;
}

export interface IssuedResumeSession {
  readonly resumeToken: string;
  readonly session: ResumeSession;
}

export interface PreparedResumeRotation {
  readonly presentedTokenDigest: string;
  readonly rotatedResumeToken: string;
  readonly rotatedTokenDigest: string;
}

function sessionFromRow(row: ResumeSessionRow): ResumeSession {
  return Object.freeze({
    playerId: row.player_id,
    roomId: row.room_id,
    matchId: row.match_id,
    tokenDigest: row.token_digest,
    generation: row.generation,
    expiresAt: row.expires_at,
  });
}

export class ResumeSessionRegistry {
  constructor(private readonly storage: DurableObjectStorage) {}

  ensureSchema(): void {
    this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS resume_sessions (
        player_id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        match_id TEXT NOT NULL,
        token_digest TEXT NOT NULL UNIQUE,
        generation INTEGER NOT NULL CHECK (generation >= 1),
        expires_at INTEGER NOT NULL
      )
    `);
    this.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS resume_sessions_expiry
      ON resume_sessions (expires_at)
    `);
  }

  async issue(
    playerId: string,
    roomId: string,
    matchId: string,
  ): Promise<IssuedResumeSession> {
    const resumeToken = createResumeToken();
    const tokenDigest = await digestResumeToken(resumeToken);
    const session = Object.freeze({
      playerId,
      roomId,
      matchId,
      tokenDigest,
      generation: 1,
      expiresAt: ACTIVE_SESSION_EXPIRY,
    });
    this.storage.transactionSync(() => {
      this.storage.sql.exec(
        `INSERT INTO resume_sessions
          (player_id, room_id, match_id, token_digest, generation, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        session.playerId,
        session.roomId,
        session.matchId,
        session.tokenDigest,
        session.generation,
        session.expiresAt,
      );
    });
    return Object.freeze({ resumeToken, session });
  }

  async prepareRotation(resumeToken: string): Promise<PreparedResumeRotation | null> {
    if (!isResumeToken(resumeToken)) return null;
    const rotatedResumeToken = createResumeToken();
    const [presentedTokenDigest, rotatedTokenDigest] = await Promise.all([
      digestResumeToken(resumeToken),
      digestResumeToken(rotatedResumeToken),
    ]);
    return Object.freeze({ presentedTokenDigest, rotatedResumeToken, rotatedTokenDigest });
  }

  lookup(
    prepared: PreparedResumeRotation,
    roomId: string,
    matchId: string,
    nowMilliseconds: number,
  ): ResumeSession | null {
    const rows = [...this.storage.sql.exec<ResumeSessionRow>(
      `SELECT player_id, room_id, match_id, token_digest, generation, expires_at
       FROM resume_sessions
       WHERE token_digest = ? AND room_id = ? AND match_id = ?
       LIMIT 1`,
      prepared.presentedTokenDigest,
      roomId,
      matchId,
    )];
    const row = rows[0];
    if (!row || row.expires_at < nowMilliseconds) return null;
    return sessionFromRow(row);
  }

  isCurrentGeneration(
    playerId: string,
    roomId: string,
    matchId: string,
    generation: number,
    nowMilliseconds: number,
  ): boolean {
    const rows = [...this.storage.sql.exec<Record<string, number>>(
      `SELECT 1 AS current
       FROM resume_sessions
       WHERE player_id = ? AND room_id = ? AND match_id = ?
         AND generation = ? AND expires_at >= ?
       LIMIT 1`,
      playerId,
      roomId,
      matchId,
      generation,
      nowMilliseconds,
    )];
    return rows.length === 1;
  }

  commitRotation(
    current: ResumeSession,
    prepared: PreparedResumeRotation,
    nowMilliseconds: number,
  ): ResumeSession | null {
    const expiresAt = ACTIVE_SESSION_EXPIRY;
    const generation = current.generation + 1;
    return this.storage.transactionSync(() => {
      const updated = this.storage.sql.exec(
        `UPDATE resume_sessions
         SET token_digest = ?, generation = ?, expires_at = ?
         WHERE player_id = ? AND room_id = ? AND match_id = ?
           AND token_digest = ? AND generation = ? AND expires_at >= ?`,
        prepared.rotatedTokenDigest,
        generation,
        expiresAt,
        current.playerId,
        current.roomId,
        current.matchId,
        prepared.presentedTokenDigest,
        current.generation,
        nowMilliseconds,
      );
      // SqlStorage counts index maintenance as writes, so a single logical row
      // update may report more than one physical write.
      if (updated.rowsWritten < 1) return null;
      return Object.freeze({
        ...current,
        tokenDigest: prepared.rotatedTokenDigest,
        generation,
        expiresAt,
      });
    });
  }

  revokePlayer(playerId: string, roomId: string, matchId: string): boolean {
    const deleted = this.storage.sql.exec(
      'DELETE FROM resume_sessions WHERE player_id = ? AND room_id = ? AND match_id = ?',
      playerId,
      roomId,
      matchId,
    );
    return deleted.rowsWritten >= 1;
  }

  armDisconnectGrace(
    playerId: string,
    roomId: string,
    matchId: string,
    generation: number,
    nowMilliseconds: number,
  ): boolean {
    const updated = this.storage.sql.exec(
      `UPDATE resume_sessions
       SET expires_at = ?
       WHERE player_id = ? AND room_id = ? AND match_id = ? AND generation = ?`,
      nowMilliseconds + RESUME_GRACE_MILLISECONDS,
      playerId,
      roomId,
      matchId,
      generation,
    );
    return updated.rowsWritten >= 1;
  }

  pruneExpired(nowMilliseconds: number): readonly string[] {
    const playerIds = [...this.storage.sql.exec<Record<string, string>>(
      'SELECT player_id FROM resume_sessions WHERE expires_at < ? ORDER BY player_id',
      nowMilliseconds,
    )].map((row) => row.player_id);
    this.storage.sql.exec(
      'DELETE FROM resume_sessions WHERE expires_at < ?',
      nowMilliseconds,
    );
    return Object.freeze(playerIds);
  }
}
