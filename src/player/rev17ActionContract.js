const freezeMarkers = (markers) => Object.freeze(
  markers.map((marker) => Object.freeze(marker)),
);

/**
 * This is a presentation contract. Marker crossings may drive animation,
 * audio, VFX, and HUD cues, but never ammo, damage, cooldown, or movement.
 *
 * Rev17 currently contains authored clips only for fire and reload. The named
 * equip/melee/ability fallbacks are deliberately explicit so runtime evidence
 * cannot accidentally describe them as authored clips.
 */
export const REV17_SEMANTIC_ACTION_CONTRACT = Object.freeze({
  equip: Object.freeze({
    kind: 'equip',
    authoredClipKey: null,
    fallback: 'procedural_equip_accent',
    defaultDurationSeconds: 0.34,
    markers: freezeMarkers([
      { id: 'equip_ready', normalizedTime: 1, role: 'presentation' },
    ]),
  }),
  fire: Object.freeze({
    kind: 'fire',
    authoredClipKey: 'fire',
    fallback: null,
    defaultDurationSeconds: 0.458333,
    markers: freezeMarkers([
      { id: 'muzzle', normalizedTime: 0, role: 'presentation' },
      { id: 'casing_eject', normalizedTime: 0.12, role: 'presentation' },
    ]),
  }),
  reload: Object.freeze({
    kind: 'reload',
    authoredClipKey: 'reload',
    fallback: null,
    defaultDurationSeconds: 2,
    markers: freezeMarkers([
      { id: 'mag_detach', normalizedTime: 0, role: 'presentation' },
      { id: 'mag_out', normalizedTime: 0.2, role: 'presentation' },
      { id: 'mag_in', normalizedTime: 0.55, role: 'presentation' },
      { id: 'mag_seat', normalizedTime: 0.72, role: 'presentation' },
      { id: 'bolt', normalizedTime: 0.88, role: 'presentation' },
    ]),
  }),
  melee: Object.freeze({
    kind: 'melee',
    authoredClipKey: null,
    fallback: 'procedural_melee_accent',
    defaultDurationSeconds: 0.55,
    markers: freezeMarkers([
      { id: 'melee_open', normalizedTime: 0.22, role: 'presentation' },
      { id: 'melee_close', normalizedTime: 0.5, role: 'presentation' },
    ]),
  }),
  ability: Object.freeze({
    kind: 'ability',
    authoredClipKey: null,
    fallback: 'procedural_ability_throw_accent',
    defaultDurationSeconds: 0.65,
    markers: freezeMarkers([
      { id: 'throw_release', normalizedTime: 0.44, role: 'presentation' },
      { id: 'ability_commit', normalizedTime: 0.44, role: 'presentation' },
    ]),
  }),
});

export function getRev17SemanticActionProfile(kind) {
  return REV17_SEMANTIC_ACTION_CONTRACT[kind] ?? null;
}

function finiteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number`);
  }
  return value;
}

export function startRev17SemanticAction(kind, durationSeconds) {
  const profile = getRev17SemanticActionProfile(kind);
  if (!profile) throw new RangeError(`Unsupported Rev17 semantic action: ${kind}`);
  const duration = durationSeconds === undefined
    ? profile.defaultDurationSeconds
    : finiteNonNegative(durationSeconds, 'action duration');
  if (duration === 0) throw new RangeError('action duration must be greater than zero');
  return Object.freeze({
    kind,
    durationSeconds: duration,
    elapsedSeconds: 0,
    nextMarkerIndex: 0,
    completed: false,
  });
}

/**
 * Advance an immutable action clock and return each marker crossed exactly
 * once. Passing zero seconds intentionally emits markers authored at time zero.
 */
export function advanceRev17SemanticAction(action, deltaSeconds) {
  if (!action || action.completed) {
    return Object.freeze({
      action,
      markers: Object.freeze([]),
    });
  }
  const delta = finiteNonNegative(deltaSeconds, 'action delta');
  const profile = getRev17SemanticActionProfile(action.kind);
  if (!profile) throw new RangeError(`Unsupported Rev17 semantic action: ${action.kind}`);

  const elapsedSeconds = Math.min(
    action.durationSeconds,
    action.elapsedSeconds + delta,
  );
  const normalizedTime = elapsedSeconds / action.durationSeconds;
  let nextMarkerIndex = action.nextMarkerIndex;
  const crossed = [];
  while (
    nextMarkerIndex < profile.markers.length
    && profile.markers[nextMarkerIndex].normalizedTime <= normalizedTime + Number.EPSILON
  ) {
    crossed.push(profile.markers[nextMarkerIndex]);
    nextMarkerIndex += 1;
  }
  const completed = elapsedSeconds >= action.durationSeconds;
  return Object.freeze({
    action: Object.freeze({
      ...action,
      elapsedSeconds,
      nextMarkerIndex,
      completed,
    }),
    markers: Object.freeze(crossed),
  });
}

export function rev17SemanticActionProgress(action) {
  if (!action) return 0;
  return Math.min(1, Math.max(0, action.elapsedSeconds / action.durationSeconds));
}

/**
 * @param {string} playerId
 * @param {readonly any[]} recentEvents
 * @param {number} estimatedServerTick
 */
function recentAuthorityAction(playerId, recentEvents, estimatedServerTick) {
  let newest = null;
  for (const event of recentEvents ?? []) {
    if (event.actorId !== playerId && event.subjectId !== playerId) continue;
    const ageTicks = estimatedServerTick - event.serverTick;
    if (ageTicks < 0 || ageTicks > 12) continue;
    const kind = event.kind === 'shotAccepted'
      ? 'fire'
      : event.kind === 'abilityActivated'
        ? 'ability'
        : event.kind === 'loadoutAccepted'
          ? 'equip'
          : null;
    if (!kind || (newest && newest.serverTick > event.serverTick)) continue;
    newest = { kind, serverTick: event.serverTick, ageTicks };
  }
  return newest;
}

/**
 * Derive a remote presentation action exclusively from validated authority
 * snapshot/event data. The current wire contract carries no melee phase, so
 * this function deliberately never guesses a remote melee action.
 *
 * @param {any} player
 * @param {readonly any[]} recentEvents
 * @param {number} estimatedServerTick
 */
export function deriveRev17AuthorityAction(
  player,
  recentEvents = [],
  estimatedServerTick = 0,
) {
  if (!player) return Object.freeze({ kind: 'idle', source: 'authority_absent' });
  if (player.lifePhase === 'dead') {
    return Object.freeze({ kind: 'death', source: 'authority_snapshot' });
  }
  if (player.riflePhase === 'reloading') {
    return Object.freeze({ kind: 'reload', source: 'authority_snapshot' });
  }
  if (player.riflePhase === 'equipping') {
    return Object.freeze({ kind: 'equip', source: 'authority_snapshot' });
  }

  const eventAction = recentAuthorityAction(
    player.playerId,
    recentEvents,
    estimatedServerTick,
  );
  if (eventAction) {
    return Object.freeze({
      kind: eventAction.kind,
      source: 'authority_event',
      serverTick: eventAction.serverTick,
      ageTicks: eventAction.ageTicks,
    });
  }
  if (player.riflePhase === 'firing' || player.riflePhase === 'recovering') {
    return Object.freeze({ kind: 'fire', source: 'authority_snapshot' });
  }
  return Object.freeze({ kind: 'idle', source: 'authority_snapshot' });
}
