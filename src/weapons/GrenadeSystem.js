import * as THREE from 'three';

import {
  ABILITY_ID,
  ABILITY_PRESENTATION,
  DEFAULT_ABILITY_LOADOUT,
  assertAbilityLoadout,
} from '../abilities/abilityLoadout.ts';
import {
  ABILITY_PRESENTATION_AUTHORITY_HZ,
  SMOKE_PRESENTATION_RULES,
  smokePuffExpansion,
} from '../abilities/abilityPresentationSemantics.ts';
import {
  AUTHORITY_THROWABLE_RULES,
} from '../authority/combat/abilityLoadoutRuntime.ts';
import {
  IMPULSE_GRENADE_RULES_V2,
} from '../authority/combat/impulseGrenade.ts';

const MAX_PHYSICS_STEP = 1 / 120;
const MAX_PHYSICS_SUBSTEPS = 12;
const THROW_ORIGIN_DROP = 0.15;
const SMOKE_AUTHORITY_RULES = AUTHORITY_THROWABLE_RULES[ABILITY_ID.smoke];
const SMOKE_RADIUS = SMOKE_AUTHORITY_RULES.areaRadiusMillimeters / 1_000;
const SMOKE_LIFETIME_SECONDS = SMOKE_AUTHORITY_RULES.effectDurationTicks
  / ABILITY_PRESENTATION_AUTHORITY_HZ;

function projectileRules(abilityId, type, color, visualRadius) {
  const authority = AUTHORITY_THROWABLE_RULES[abilityId];
  return Object.freeze({
    type,
    throwSpeed: authority.speedMillimetersPerSecond / 1_000,
    throwArc: authority.upwardSpeedMillimetersPerSecond / 1_000,
    gravity: authority.gravityMillimetersPerSecondSquared / 1_000,
    restitution: authority.restitutionPermille / 1_000,
    friction: authority.frictionPermille / 1_000,
    fuseSeconds: authority.fuseTicks / ABILITY_PRESENTATION_AUTHORITY_HZ,
    maximumLifetimeSeconds:
      authority.lifetimeTicks / ABILITY_PRESENTATION_AUTHORITY_HZ,
    radius: visualRadius,
    collisionRadius: authority.radiusMillimeters / 1_000,
    maximumBounces: authority.maximumBounces,
    fuseStartsOnCollision: authority.fuseStartsOnCollision,
    color,
  });
}

const PROJECTILE_RULES = Object.freeze({
  [ABILITY_ID.launch]: projectileRules(
    ABILITY_ID.launch, 'launch', 0x27d3c2, 0.075,
  ),
  [ABILITY_ID.frag]: projectileRules(
    ABILITY_ID.frag, 'frag', 0x5b6d38, 0.07,
  ),
  [ABILITY_ID.smoke]: projectileRules(
    ABILITY_ID.smoke, 'smoke', 0x526a7d, 0.065,
  ),
  [ABILITY_ID.sticky]: projectileRules(
    ABILITY_ID.sticky, 'sticky', 0xf3c94d, 0.065,
  ),
  [ABILITY_ID.flash]: projectileRules(
    ABILITY_ID.flash, 'flash', 0xe8f2f8, 0.065,
  ),
});

const DEFAULT_CHARGES = Object.freeze({
  [ABILITY_ID.launch]: 2,
  [ABILITY_ID.frag]: 2,
  [ABILITY_ID.smoke]: 2,
  [ABILITY_ID.sticky]: 2,
  [ABILITY_ID.flash]: 2,
});

const _scratchDirection = new THREE.Vector3();
const _scratchPrevious = new THREE.Vector3();
const _scratchNext = new THREE.Vector3();
const _scratchDelta = new THREE.Vector3();
const _scratchNormal = new THREE.Vector3();
const _scratchClosest = new THREE.Vector3();
const _scratchActorCenter = new THREE.Vector3();
const _scratchRay = new THREE.Raycaster();

function smooth01(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function disposeObject(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose?.();
  });
}

function actorPosition(actor) {
  return actor?.position?.isVector3 ? actor.position : null;
}

function actorAlive(actor) {
  return actor && actor.isDead !== true && actor.alive !== false;
}

export function resolveLaunchImpulseVector(source, target, relation = 'enemy') {
  const delta = new THREE.Vector3().copy(target).sub(source);
  const distance = delta.length();
  const radius = IMPULSE_GRENADE_RULES_V2.areaRadiusMillimeters / 1_000;
  if (distance >= radius) return new THREE.Vector3();
  const impulseCap = (
    relation === 'self'
      ? IMPULSE_GRENADE_RULES_V2.selfImpulseMillimetersPerSecond
      : IMPULSE_GRENADE_RULES_V2.enemyImpulseMillimetersPerSecond
  ) / 1_000;
  const magnitude = impulseCap * (1 - distance / radius);
  if (distance <= 1e-6) return new THREE.Vector3(0, magnitude, 0);
  delta.multiplyScalar(magnitude / distance);
  const verticalCap = (
    IMPULSE_GRENADE_RULES_V2.verticalImpulseCapMillimetersPerSecond / 1_000
  );
  delta.y = THREE.MathUtils.clamp(delta.y, -verticalCap, verticalCap);
  return delta;
}

export class GrenadeSystem {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.throwables = [];
    this.smokeClouds = [];
    this.explosions = [];
    this._collisionMeshes = options.collisionMeshes || [];
    this._loadout = DEFAULT_ABILITY_LOADOUT;
    this._charges = new Map();
    this._cooldowns = new Map();
    this._throwOrdinal = 0;

    this.onExplode = null;
    this.onImpulse = null;
    this.onFlash = null;
    this.onDamagePlayer = null;
    this.onProjectileEvent = null;

    this.reset();
  }

  get frags() {
    return this._charges.get(ABILITY_ID.frag) || 0;
  }

  get smokes() {
    return this._charges.get(ABILITY_ID.smoke) || 0;
  }

  setCollisionMeshes(meshes) {
    this._collisionMeshes = Array.isArray(meshes) ? meshes.filter(Boolean) : [];
  }

  setLoadout(loadout) {
    this._loadout = assertAbilityLoadout(loadout);
    this.reset();
    return this._loadout;
  }

  getLoadout() {
    return this._loadout;
  }

  throwAbility(abilityId, camera) {
    const rules = PROJECTILE_RULES[abilityId];
    if (!rules || !this._loadout.slots.includes(abilityId)) return false;
    const remaining = this._charges.get(abilityId) || 0;
    if (remaining <= 0) return false;
    const nextChargeCount = remaining - 1;
    this._charges.set(abilityId, nextChargeCount);
    if (
      nextChargeCount < (DEFAULT_CHARGES[abilityId] || 0)
      && (this._cooldowns.get(abilityId) || 0) <= 0
    ) {
      this._cooldowns.set(
        abilityId,
        ABILITY_PRESENTATION[abilityId]?.cooldownSeconds || 0,
      );
    }
    this._spawn(camera, abilityId, rules);
    return true;
  }

  throwLaunch(camera) {
    return this.throwAbility(ABILITY_ID.launch, camera);
  }

  throwFrag(camera) {
    return this.throwAbility(ABILITY_ID.frag, camera);
  }

  throwSmoke(camera) {
    return this.throwAbility(ABILITY_ID.smoke, camera);
  }

  throwSticky(camera) {
    return this.throwAbility(ABILITY_ID.sticky, camera);
  }

  throwFlash(camera) {
    return this.throwAbility(ABILITY_ID.flash, camera);
  }

  _spawn(camera, abilityId, rules) {
    const pos = new THREE.Vector3();
    camera.getWorldPosition(pos);
    pos.y -= THROW_ORIGIN_DROP;

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    const velocity = direction.multiplyScalar(rules.throwSpeed);
    velocity.y += rules.throwArc;

    const mesh = this._buildMesh(abilityId, rules);
    mesh.position.copy(pos);
    this.scene.add(mesh);

    const projectileId = `offline_ability_${++this._throwOrdinal}`;
    this.throwables.push({
      projectileId,
      abilityId,
      rules,
      mesh,
      pos: pos.clone(),
      vel: velocity,
      elapsed: 0,
      fuseRemaining: rules.fuseSeconds,
      fuseStarted: !rules.fuseStartsOnCollision,
      bounceCount: 0,
      settled: false,
      attachedTarget: null,
      attachedOffset: new THREE.Vector3(),
    });
    this._emitProjectileEvent('ability_throw', {
      projectileId,
      abilityId,
      position: pos,
      velocity,
      audioCue: 'throw',
    });
  }

  _buildMesh(abilityId, rules) {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: rules.color,
      roughness: rules.type === 'flash' ? 0.28 : 0.58,
      metalness: rules.type === 'smoke' ? 0.38 : 0.68,
      emissive: rules.type === 'launch' ? 0x063b39 : 0x000000,
      emissiveIntensity: rules.type === 'launch' ? 0.8 : 0,
    });
    const body = new THREE.Mesh(
      rules.type === 'smoke'
        ? new THREE.CylinderGeometry(0.05, 0.05, 0.15, 12)
        : rules.type === 'sticky'
          ? new THREE.CylinderGeometry(0.06, 0.075, 0.09, 12)
          : new THREE.SphereGeometry(rules.radius, 12, 9),
      bodyMaterial,
    );
    group.add(body);

    const bandMaterial = new THREE.MeshStandardMaterial({
      color: rules.type === 'flash' ? 0x14202a : 0x101a22,
      roughness: 0.45,
      metalness: 0.75,
    });
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(Math.max(0.04, rules.radius * 0.94), 0.008, 6, 16),
      bandMaterial,
    );
    band.rotation.x = Math.PI / 2;
    group.add(band);

    if (rules.type === 'launch') {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.033, 10, 7),
        new THREE.MeshBasicMaterial({ color: 0x9fffee }),
      );
      group.add(core);
    } else if (rules.type === 'sticky') {
      const contact = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.055, 0.025, 12),
        new THREE.MeshStandardMaterial({ color: 0x161b20, roughness: 0.65, metalness: 0.75 }),
      );
      contact.position.y = -0.055;
      group.add(contact);
    }

    group.traverse((object) => {
      if (object.isMesh) object.castShadow = true;
    });
    return group;
  }

  update(dt, playerOrContext) {
    const elapsed = THREE.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    const context = playerOrContext && Object.prototype.hasOwnProperty.call(playerOrContext, 'player')
      ? playerOrContext
      : { player: playerOrContext, targets: [] };
    const targets = Array.isArray(context.targets) ? context.targets.filter(actorAlive) : [];
    const colliders = Array.isArray(context.collisionMeshes)
      ? context.collisionMeshes.filter(Boolean)
      : this._collisionMeshes;
    const substepCount = Math.max(
      1,
      Math.min(MAX_PHYSICS_SUBSTEPS, Math.ceil(elapsed / MAX_PHYSICS_STEP)),
    );
    const stepSeconds = substepCount > 0 ? elapsed / substepCount : 0;

    this._updateCooldowns(elapsed);

    for (let i = this.throwables.length - 1; i >= 0; i -= 1) {
      const projectile = this.throwables[i];
      projectile.elapsed += elapsed;
      for (let step = 0; step < substepCount && !projectile.detonated; step += 1) {
        this._stepProjectile(projectile, stepSeconds, targets, colliders);
      }
      if (projectile.fuseStarted) projectile.fuseRemaining -= elapsed;
      projectile.mesh.position.copy(projectile.pos);
      if (!projectile.settled && projectile.attachedTarget === null) {
        projectile.mesh.rotation.x += elapsed * 6;
        projectile.mesh.rotation.z += elapsed * 4.2;
      }

      if (
        (projectile.fuseStarted && projectile.fuseRemaining <= 0)
        || projectile.elapsed >= projectile.rules.maximumLifetimeSeconds
      ) {
        this._detonate(projectile, context);
        this._removeThrowable(i);
      }
    }

    this._updateSmokeClouds(elapsed);
    this._updateExplosions(elapsed);
  }

  _stepProjectile(projectile, dt, targets, colliders) {
    if (projectile.attachedTarget) {
      const targetPosition = actorPosition(projectile.attachedTarget);
      if (targetPosition) projectile.pos.copy(targetPosition).add(projectile.attachedOffset);
      return;
    }
    if (projectile.settled || dt <= 0) return;

    _scratchPrevious.copy(projectile.pos);
    projectile.vel.y += projectile.rules.gravity * dt;
    _scratchNext.copy(projectile.pos).addScaledVector(projectile.vel, dt);
    const collision = this._findEarliestCollision(
      projectile,
      _scratchPrevious,
      _scratchNext,
      targets,
      colliders,
    );
    if (!collision) {
      projectile.pos.copy(_scratchNext);
      return;
    }

    projectile.pos.copy(collision.point).addScaledVector(collision.normal, 0.002);
    if (projectile.abilityId === ABILITY_ID.sticky) {
      projectile.vel.set(0, 0, 0);
      projectile.settled = true;
      projectile.fuseStarted = true;
      projectile.attachedTarget = collision.target || null;
      if (collision.target && actorPosition(collision.target)) {
        projectile.attachedOffset.copy(projectile.pos).sub(actorPosition(collision.target));
      }
      projectile.mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, -1, 0),
        collision.normal,
      );
      this._emitProjectileEvent('ability_stuck', {
        projectileId: projectile.projectileId,
        abilityId: projectile.abilityId,
        position: projectile.pos,
        targetId: collision.target?.id || collision.target?.name || null,
        colliderId: collision.colliderId,
        audioCue: 'adhere',
      });
      return;
    }

    if (projectile.abilityId === ABILITY_ID.launch) {
      projectile.vel.set(0, 0, 0);
      projectile.settled = true;
      projectile.fuseStarted = true;
      projectile.fuseRemaining = 0;
      this._emitProjectileEvent('ability_contact', {
        projectileId: projectile.projectileId,
        abilityId: projectile.abilityId,
        position: projectile.pos,
        colliderId: collision.colliderId,
        bounceCount: 0,
        settled: true,
        reason: 'first_world_contact',
        audioCue: 'contact',
      });
      return;
    }
    projectile.fuseStarted = true;
    projectile.bounceCount += 1;
    const incomingSpeed = projectile.vel.length();
    const normalVelocity = projectile.vel.dot(collision.normal);
    projectile.vel.addScaledVector(collision.normal, -2 * normalVelocity);
    const normalComponent = collision.normal.clone().multiplyScalar(projectile.vel.dot(collision.normal));
    const tangent = projectile.vel.clone().sub(normalComponent)
      .multiplyScalar(1 - projectile.rules.friction);
    projectile.vel.copy(tangent).addScaledVector(
      normalComponent,
      projectile.rules.restitution,
    );
    const outgoingSpeed = projectile.vel.length();
    if (
      projectile.bounceCount >= projectile.rules.maximumBounces
      || outgoingSpeed < 1.15
    ) {
      projectile.vel.set(0, 0, 0);
      projectile.settled = true;
      if (!projectile.fuseStarted) projectile.fuseStarted = true;
    }
    this._emitProjectileEvent('ability_bounce', {
      projectileId: projectile.projectileId,
      abilityId: projectile.abilityId,
      position: projectile.pos,
      colliderId: collision.colliderId,
      bounceCount: projectile.bounceCount,
      incomingSpeed,
      outgoingSpeed,
      settled: projectile.settled,
      audioCue: outgoingSpeed > 4 ? 'bounce_hard' : 'bounce_soft',
    });
  }

  _findEarliestCollision(projectile, start, end, targets, colliders) {
    _scratchDelta.copy(end).sub(start);
    const distance = _scratchDelta.length();
    let best = null;

    for (const target of projectile.abilityId === ABILITY_ID.sticky ? targets : []) {
      const position = actorPosition(target);
      if (!position) continue;
      _scratchActorCenter.copy(position);
      _scratchActorCenter.y += Number.isFinite(target.height) ? target.height * 0.5 : 0.85;
      const segment = new THREE.Line3(start, end);
      segment.closestPointToPoint(_scratchActorCenter, true, _scratchClosest);
      const targetRadius = Number.isFinite(target.radius) ? target.radius : 0.45;
      const separation = _scratchClosest.distanceTo(_scratchActorCenter);
      if (separation > projectile.rules.collisionRadius + targetRadius) continue;
      const along = distance > 0 ? start.distanceTo(_scratchClosest) / distance : 0;
      _scratchNormal.copy(_scratchClosest).sub(_scratchActorCenter);
      if (_scratchNormal.lengthSq() < 1e-6) _scratchNormal.copy(_scratchDelta).normalize().negate();
      else _scratchNormal.normalize();
      if (!best || along < best.fraction) {
        best = {
          fraction: along,
          point: _scratchClosest.clone(),
          normal: _scratchNormal.clone(),
          target,
          colliderId: target.id || target.name || 'offline_target',
        };
      }
    }

    if (distance > 1e-6 && colliders.length > 0) {
      _scratchDirection.copy(_scratchDelta).normalize();
      _scratchRay.set(start, _scratchDirection);
      _scratchRay.near = 0;
      _scratchRay.far = distance + projectile.rules.collisionRadius;
      const hit = _scratchRay.intersectObjects(colliders, true)[0];
      if (hit) {
        const fraction = THREE.MathUtils.clamp(
          Math.max(0, hit.distance - projectile.rules.collisionRadius) / distance,
          0,
          1,
        );
        if (!best || fraction < best.fraction) {
          const normal = hit.face?.normal?.clone() || _scratchDirection.clone().negate();
          if (hit.object?.matrixWorld) normal.transformDirection(hit.object.matrixWorld);
          best = {
            fraction,
            point: start.clone().addScaledVector(_scratchDelta, fraction),
            normal,
            target: null,
            colliderId: hit.object?.name || hit.object?.uuid || 'world',
          };
        }
      }
    }

    const groundFraction = (
      end.y < projectile.rules.collisionRadius
      && start.y >= projectile.rules.collisionRadius
      && Math.abs(start.y - end.y) > 1e-6
    )
      ? (start.y - projectile.rules.collisionRadius) / (start.y - end.y)
      : null;
    if (groundFraction !== null && (!best || groundFraction < best.fraction)) {
      best = {
        fraction: groundFraction,
        point: start.clone().addScaledVector(_scratchDelta, groundFraction),
        normal: new THREE.Vector3(0, 1, 0),
        target: null,
        colliderId: 'offline_ground',
      };
    }
    return best;
  }

  _detonate(projectile, context) {
    const point = projectile.pos.clone();
    this._emitProjectileEvent('ability_detonated', {
      projectileId: projectile.projectileId,
      abilityId: projectile.abilityId,
      position: point,
      audioCue: projectile.rules.type === 'flash' ? 'flash' : 'detonation',
    });
    if (projectile.abilityId === ABILITY_ID.launch) {
      this._launchExplode(point, context, projectile);
    } else if (projectile.abilityId === ABILITY_ID.smoke) {
      this._smokeExplode(point);
    } else if (projectile.abilityId === ABILITY_ID.flash) {
      this._flashExplode(point, context, projectile);
    } else {
      this._fragExplode(
        point,
        context.player,
        projectile.abilityId === ABILITY_ID.sticky ? 4.5 : 5,
        projectile.abilityId === ABILITY_ID.sticky ? 90 : 80,
        projectile.abilityId,
      );
    }
  }

  _fragExplode(point, player, radius, damage, abilityId) {
    this._spawnExplosionVisual(point, abilityId === ABILITY_ID.sticky ? 0xffcc42 : 0xff7a1a);
    this.onExplode?.(point, radius, damage, { abilityId });

    if (player && actorPosition(player)) {
      const distance = player.position.distanceTo(point);
      if (distance <= radius) {
        const falloff = THREE.MathUtils.lerp(
          1,
          0.1,
          THREE.MathUtils.clamp(distance / radius, 0, 1),
        );
        const appliedDamage = damage * falloff;
        if (this.onDamagePlayer) this.onDamagePlayer(appliedDamage, point, { abilityId });
        else player.takeDamage?.(appliedDamage);
      }
    }
  }

  _launchExplode(point, context, projectile) {
    const radius = IMPULSE_GRENADE_RULES_V2.areaRadiusMillimeters / 1_000;
    const maximumSelfImpulse = (
      IMPULSE_GRENADE_RULES_V2.selfImpulseMillimetersPerSecond / 1_000
    );
    const maximumTargetImpulse = (
      IMPULSE_GRENADE_RULES_V2.enemyImpulseMillimetersPerSecond / 1_000
    );
    this._spawnExplosionVisual(point, 0x4fffe1, 0.7);
    const actors = [context.player, ...(Array.isArray(context.targets) ? context.targets : [])]
      .filter(actorAlive);
    const applied = [];
    for (const actor of actors) {
      const position = actorPosition(actor);
      if (!position) continue;
      const relation = actor === context.player ? 'self' : 'enemy';
      if (
        relation === 'enemy'
        && context.player?.teamId !== undefined
        && context.player.teamId !== null
        && actor.teamId === context.player.teamId
      ) continue;
      _scratchActorCenter.copy(position);
      _scratchActorCenter.y += Number.isFinite(actor.height) ? actor.height * 0.5 : 0.85;
      const distance = _scratchActorCenter.distanceTo(point);
      if (distance >= radius) continue;
      _scratchDirection.copy(_scratchActorCenter).sub(point);
      if (_scratchDirection.lengthSq() > 1e-6 && this._collisionMeshes.length > 0) {
        _scratchDirection.normalize();
        _scratchRay.set(point, _scratchDirection);
        _scratchRay.near = 0.04;
        _scratchRay.far = Math.max(0.04, distance - 0.08);
        if (_scratchRay.intersectObjects(this._collisionMeshes, true)[0]) continue;
      }
      const impulse = resolveLaunchImpulseVector(
        point,
        _scratchActorCenter,
        relation,
      );
      if (actor.velocity?.isVector3) actor.velocity.add(impulse);
      else actor.applyAbilityImpulse?.(impulse, {
        abilityId: projectile.abilityId,
        projectileId: projectile.projectileId,
        relation,
      });
      applied.push(Object.freeze({
        actorId: actor.id || actor.name || (actor === context.player ? 'local_player' : 'target'),
        relation,
        distance,
        impulse: impulse.clone(),
      }));
    }
    this.onImpulse?.(point, radius, maximumSelfImpulse, {
      abilityId: projectile.abilityId,
      projectileId: projectile.projectileId,
      applied,
      maximumSelfImpulseMetersPerSecond: maximumSelfImpulse,
      maximumTargetImpulseMetersPerSecond: maximumTargetImpulse,
      verticalImpulseCapMetersPerSecond:
        IMPULSE_GRENADE_RULES_V2.verticalImpulseCapMillimetersPerSecond / 1_000,
      radialFalloff: IMPULSE_GRENADE_RULES_V2.radialFalloff,
    });
  }

  _flashExplode(point, context, projectile) {
    const radius = 12;
    const durationSeconds = 2.25;
    this._spawnExplosionVisual(point, 0xf7fbff, 0.35);
    const actors = [context.player, ...(Array.isArray(context.targets) ? context.targets : [])]
      .filter(actorAlive);
    const affected = [];
    for (const actor of actors) {
      const position = actorPosition(actor);
      if (!position) continue;
      _scratchActorCenter.copy(position);
      _scratchActorCenter.y += actor === context.player ? 1.55 : 0.85;
      _scratchDelta.copy(_scratchActorCenter).sub(point);
      const distance = _scratchDelta.length();
      if (distance >= radius || distance <= 1e-4) continue;
      _scratchDirection.copy(_scratchDelta).normalize();
      _scratchRay.set(point, _scratchDirection);
      _scratchRay.near = 0.04;
      _scratchRay.far = Math.max(0.04, distance - 0.08);
      const blocker = this._collisionMeshes.length > 0
        ? _scratchRay.intersectObjects(this._collisionMeshes, true)[0]
        : null;
      if (blocker) continue;
      const intensity = smooth01(1 - distance / radius);
      const affectedDuration = durationSeconds * (0.45 + intensity * 0.55);
      actor.applyFlash?.(affectedDuration, intensity);
      affected.push(Object.freeze({
        actorId: actor === context.player
          ? 'local_player'
          : actor.id || actor.name || 'target',
        distance,
        intensity,
        durationSeconds: affectedDuration,
      }));
    }
    this.onFlash?.(point, radius, durationSeconds, {
      abilityId: projectile.abilityId,
      projectileId: projectile.projectileId,
      affected,
      authorityPolicy: 'presentation_only_no_damage_authority',
    });
  }

  _smokeExplode(point) {
    const puffs = [];
    const puffCount = SMOKE_PRESENTATION_RULES.puffCount;
    for (let i = 0; i < puffCount; i += 1) {
      const angle = i * Math.PI * (3 - Math.sqrt(5));
      const ring = Math.sqrt((i + 0.5) / puffCount);
      const horizontal = SMOKE_RADIUS * 0.38 * ring;
      const offset = new THREE.Vector3(
        Math.cos(angle) * horizontal,
        0.25 + SMOKE_RADIUS * (0.08 + (i % 4) * 0.07),
        Math.sin(angle) * horizontal,
      );
      const radius = SMOKE_RADIUS * (0.46 + (i % 3) * 0.035);
      const material = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xb8c0c6 : 0x9ca8b1,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 9), material);
      mesh.position.copy(point).add(offset);
      mesh.scale.setScalar(0.03);
      this.scene.add(mesh);
      puffs.push({ mesh, baseRadius: radius, phase: i / puffCount });
    }
    this.smokeClouds.push({
      puffs,
      origin: point.clone(),
      elapsed: 0,
      life: SMOKE_LIFETIME_SECONDS,
      radius: SMOKE_RADIUS,
    });
  }

  _updateSmokeClouds(dt) {
    for (let i = this.smokeClouds.length - 1; i >= 0; i -= 1) {
      const cloud = this.smokeClouds[i];
      cloud.elapsed += dt;
      if (cloud.elapsed >= cloud.life) {
        for (const puff of cloud.puffs) {
          this.scene.remove(puff.mesh);
          puff.mesh.geometry.dispose();
          puff.mesh.material.dispose();
        }
        this.smokeClouds.splice(i, 1);
        continue;
      }

      const ageTicks = cloud.elapsed * ABILITY_PRESENTATION_AUTHORITY_HZ;
      const expansion = smokePuffExpansion(ageTicks, 0);
      const fade = cloud.elapsed > cloud.life - 2.4
        ? smooth01((cloud.life - cloud.elapsed) / 2.4)
        : 1;
      for (const puff of cloud.puffs) {
        const delayedExpansion = smokePuffExpansion(ageTicks, puff.phase);
        puff.mesh.scale.setScalar(0.03 + delayedExpansion * 0.97);
        puff.mesh.material.opacity = 0.56 * expansion * fade;
        puff.mesh.position.y += dt * (0.025 + puff.phase * 0.018);
      }
    }
  }

  _updateCooldowns(dt) {
    if (dt <= 0) return;
    for (const [abilityId, cooldown] of this._cooldowns) {
      const nextCooldown = cooldown - dt;
      if (nextCooldown > 0) {
        this._cooldowns.set(abilityId, nextCooldown);
        continue;
      }
      const maximumCharges = DEFAULT_CHARGES[abilityId] || 0;
      const nextChargeCount = Math.min(
        maximumCharges,
        (this._charges.get(abilityId) || 0) + 1,
      );
      this._charges.set(abilityId, nextChargeCount);
      this._cooldowns.set(
        abilityId,
        nextChargeCount < maximumCharges
          ? ABILITY_PRESENTATION[abilityId]?.cooldownSeconds || 0
          : 0,
      );
    }
  }

  getActiveSmokeVolumes() {
    return this.smokeClouds.map((cloud) => Object.freeze({
      center: cloud.origin.clone().add(new THREE.Vector3(0, cloud.radius * 0.22, 0)),
      radius: cloud.radius * smokePuffExpansion(
        cloud.elapsed * ABILITY_PRESENTATION_AUTHORITY_HZ,
        0,
      ),
      expiresInSeconds: Math.max(0, cloud.life - cloud.elapsed),
    }));
  }

  isLineObscured(start, end) {
    if (!start?.isVector3 || !end?.isVector3) return false;
    _scratchDelta.copy(end).sub(start);
    const segmentLengthSq = _scratchDelta.lengthSq();
    if (segmentLengthSq <= 1e-6) return false;
    for (const cloud of this.smokeClouds) {
      const radius = cloud.radius * smokePuffExpansion(
        cloud.elapsed * ABILITY_PRESENTATION_AUTHORITY_HZ,
        0,
      );
      if (radius < 0.35) continue;
      _scratchActorCenter.copy(cloud.origin);
      _scratchActorCenter.y += cloud.radius * 0.22;
      const t = THREE.MathUtils.clamp(
        _scratchActorCenter.clone().sub(start).dot(_scratchDelta) / segmentLengthSq,
        0,
        1,
      );
      _scratchClosest.copy(start).addScaledVector(_scratchDelta, t);
      if (_scratchClosest.distanceToSquared(_scratchActorCenter) <= radius * radius) {
        return true;
      }
    }
    return false;
  }

  _spawnExplosionVisual(point, color, lifetime = 0.5) {
    const fireball = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 14, 10),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      }),
    );
    fireball.position.copy(point);
    this.scene.add(fireball);
    this.explosions.push({ mesh: fireball, elapsed: 0, life: lifetime });
  }

  _updateExplosions(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i -= 1) {
      const explosion = this.explosions[i];
      explosion.elapsed += dt;
      const progress = explosion.elapsed / explosion.life;
      if (progress >= 1) {
        this.scene.remove(explosion.mesh);
        explosion.mesh.geometry.dispose();
        explosion.mesh.material.dispose();
        this.explosions.splice(i, 1);
        continue;
      }
      explosion.mesh.scale.setScalar(THREE.MathUtils.lerp(0.3, 4, smooth01(progress)));
      explosion.mesh.material.opacity = 0.9 * (1 - smooth01(progress));
    }
  }

  _emitProjectileEvent(kind, payload) {
    this.onProjectileEvent?.(Object.freeze({
      schemaVersion: 1,
      kind,
      ...payload,
      position: payload.position?.clone?.() || payload.position,
      velocity: payload.velocity?.clone?.() || payload.velocity,
    }));
  }

  _removeThrowable(index) {
    const projectile = this.throwables[index];
    this.scene.remove(projectile.mesh);
    disposeObject(projectile.mesh);
    this.throwables.splice(index, 1);
  }

  getHudInfo() {
    return {
      frags: this.frags,
      smokes: this.smokes,
      slots: this._loadout.slots.map((abilityId, slot) => ({
        slot,
        abilityId,
        count: abilityId === ABILITY_ID.blink
          ? null
          : this._charges.get(abilityId) || 0,
        cooldownSeconds: abilityId === ABILITY_ID.blink
          ? 0
          : Math.max(0, this._cooldowns.get(abilityId) || 0),
        metadata: ABILITY_PRESENTATION[abilityId],
      })),
    };
  }

  reset() {
    for (let i = this.throwables.length - 1; i >= 0; i -= 1) this._removeThrowable(i);
    for (const cloud of this.smokeClouds) {
      for (const puff of cloud.puffs) {
        this.scene.remove(puff.mesh);
        puff.mesh.geometry.dispose();
        puff.mesh.material.dispose();
      }
    }
    this.smokeClouds.length = 0;
    for (const explosion of this.explosions) {
      this.scene.remove(explosion.mesh);
      explosion.mesh.geometry.dispose();
      explosion.mesh.material.dispose();
    }
    this.explosions.length = 0;
    this._charges.clear();
    this._cooldowns.clear();
    for (const id of this._loadout.slots.slice(1)) {
      this._charges.set(id, DEFAULT_CHARGES[id] || 0);
      this._cooldowns.set(id, 0);
    }
  }
}
