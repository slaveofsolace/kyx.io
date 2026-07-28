import type { SnapshotEntity } from '../src/net';

export const MAXIMUM_SNAPSHOT_BASELINES = 64 as const;

export interface SnapshotDelta {
  readonly baseSnapshotBaselineId: string;
  readonly snapshotBaselineId: string;
  readonly baseTick: number;
  readonly serverTick: number;
  readonly entities: readonly SnapshotEntity[];
  readonly removedEntityIds: readonly string[];
}

interface SnapshotBaseline {
  readonly id: string;
  readonly serverTick: number;
  readonly entitiesById: ReadonlyMap<string, SnapshotEntity>;
}

function sameEntityMap(
  left: ReadonlyMap<string, SnapshotEntity>,
  right: ReadonlyMap<string, SnapshotEntity>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [id, entity] of left) {
    const candidate = right.get(id);
    if (candidate === undefined || !sameEntity(entity, candidate)) return false;
  }
  return true;
}

function copyEntity(entity: SnapshotEntity): SnapshotEntity {
  return Object.freeze({
    ...entity,
    ...(entity.movement === undefined
      ? {}
      : { movement: Object.freeze({ ...entity.movement }) }),
  });
}

function sameMovement(left: SnapshotEntity, right: SnapshotEntity): boolean {
  if (left.movement === undefined || right.movement === undefined) {
    return left.movement === right.movement;
  }
  return left.movement.schemaVersion === right.movement.schemaVersion
    && left.movement.grounded === right.movement.grounded
    && left.movement.stance === right.movement.stance
    && left.movement.locomotion === right.movement.locomotion;
}

function sameEntity(left: SnapshotEntity, right: SnapshotEntity): boolean {
  return left.id === right.id
    && left.kind === right.kind
    && left.xMillimeters === right.xMillimeters
    && left.yMillimeters === right.yMillimeters
    && left.zMillimeters === right.zMillimeters
    && left.velocityXMillimetersPerSecond === right.velocityXMillimetersPerSecond
    && left.velocityYMillimetersPerSecond === right.velocityYMillimetersPerSecond
    && left.velocityZMillimetersPerSecond === right.velocityZMillimetersPerSecond
    && left.yawMilliDegrees === right.yawMilliDegrees
    && left.pitchMilliDegrees === right.pitchMilliDegrees
    && left.healthPoints === right.healthPoints
    && left.shieldPoints === right.shieldPoints
    && sameMovement(left, right);
}

function entityMap(entities: readonly SnapshotEntity[]): ReadonlyMap<string, SnapshotEntity> {
  const mapped = new Map<string, SnapshotEntity>();
  for (const entity of entities) {
    if (mapped.has(entity.id)) throw new Error(`duplicate snapshot entity id: ${entity.id}`);
    mapped.set(entity.id, copyEntity(entity));
  }
  return mapped;
}

/**
 * Bounded, in-memory snapshot history for one Durable Object incarnation.
 * A delta is produced only from an exact retained client-acknowledged ID and
 * tick pair. The opaque ID prevents two different membership states created
 * between simulation ticks from aliasing the same numeric tick.
 */
export class SnapshotBaselineStore {
  private readonly capacity: number;
  private readonly baselines = new Map<string, SnapshotBaseline>();
  private nextBaselineSequence = 1;

  constructor(capacity: number = MAXIMUM_SNAPSHOT_BASELINES) {
    if (!Number.isSafeInteger(capacity) || capacity < 2) {
      throw new RangeError('snapshot baseline capacity must be a safe integer of at least two');
    }
    this.capacity = capacity;
  }

  remember(serverTick: number, entities: readonly SnapshotEntity[]): string {
    if (!Number.isSafeInteger(serverTick) || serverTick < 0) {
      throw new RangeError('snapshot baseline tick must be a non-negative safe integer');
    }
    const latest = this.latest;
    const latestTick = latest?.serverTick ?? null;
    if (latestTick !== null && serverTick < latestTick) {
      throw new Error('snapshot baselines must be remembered in non-decreasing tick order');
    }
    const mapped = entityMap(entities);
    if (
      latest !== null
      && latest.serverTick === serverTick
      && sameEntityMap(latest.entitiesById, mapped)
    ) return latest.id;
    const id = `baseline.${serverTick}.${this.nextBaselineSequence}`;
    this.nextBaselineSequence += 1;
    this.baselines.set(id, Object.freeze({
      id,
      serverTick,
      entitiesById: mapped,
    }));
    while (this.baselines.size > this.capacity) {
      const oldestId = this.baselines.keys().next().value as string | undefined;
      if (oldestId === undefined) break;
      this.baselines.delete(oldestId);
    }
    return id;
  }

  has(id: string, serverTick: number): boolean {
    return this.baselines.get(id)?.serverTick === serverTick;
  }

  get latestTick(): number | null {
    return this.latest?.serverTick ?? null;
  }

  get latestId(): string | null {
    return this.latest?.id ?? null;
  }

  get oldestTick(): number | null {
    const oldestId = this.baselines.keys().next().value as string | undefined;
    return oldestId === undefined ? null : this.baselines.get(oldestId)?.serverTick ?? null;
  }

  deltaFrom(
    baseSnapshotBaselineId: string,
    baseTick: number,
    snapshotBaselineId: string,
    serverTick: number,
  ): SnapshotDelta | null {
    if (!Number.isSafeInteger(serverTick) || serverTick <= baseTick) return null;
    const baseline = this.baselines.get(baseSnapshotBaselineId);
    const currentBaseline = this.baselines.get(snapshotBaselineId);
    if (
      baseline === undefined
      || baseline.serverTick !== baseTick
      || currentBaseline === undefined
      || currentBaseline.serverTick !== serverTick
    ) return null;
    const current = currentBaseline.entitiesById;
    const changed: SnapshotEntity[] = [];
    for (const [id, entity] of [...current.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const previous = baseline.entitiesById.get(id);
      if (previous === undefined || !sameEntity(previous, entity)) changed.push(entity);
    }
    const removed = [...baseline.entitiesById.keys()]
      .filter((id) => !current.has(id))
      .sort();
    return Object.freeze({
      baseSnapshotBaselineId,
      snapshotBaselineId,
      baseTick,
      serverTick,
      entities: Object.freeze(changed),
      removedEntityIds: Object.freeze(removed),
    });
  }

  private get latest(): SnapshotBaseline | null {
    let latest: SnapshotBaseline | null = null;
    for (const baseline of this.baselines.values()) latest = baseline;
    return latest;
  }
}
