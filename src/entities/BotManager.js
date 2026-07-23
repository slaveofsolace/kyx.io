import { Bot } from './Bot.js';

export class BotManager {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.bots  = [];
  }

  // Spawn a fresh set of bots. noRespawn prevents auto-respawn (wave/elimination modes).
  // healthMult scales max HP (used by wave survival to ramp up difficulty).
  spawnAll(count = 7, noRespawn = false, healthMult = 1) {
    for (const bot of this.bots) this.scene.remove(bot.mesh);
    this.bots = [];
    for (let i = 0; i < count; i++) {
      this._spawnOne(noRespawn, healthMult);
    }
  }

  _spawnOne(noRespawn, healthMult) {
    const idx   = this.bots.length;
    const point = this.world.spawnPoints[idx % this.world.spawnPoints.length].clone();
    const bot   = new Bot(this.world, point);
    bot.noRespawn   = noRespawn;
    bot.maxHealth   = Math.round(100 * healthMult);
    bot.health      = bot.maxHealth;
    bot.displayName = `PRACTICE BOT ${String(idx + 1).padStart(2, '0')}`;
    this.scene.add(bot.mesh);
    this.bots.push(bot);
    return bot;
  }

  get count() { return this.bots.length; }

  // True when every bot in the current set is dead (useful for wave / elimination checks).
  allDead() {
    return this.bots.length > 0 && this.bots.every((b) => !b.alive);
  }

  update(dt, player, camera, onPlayerDamaged, world) {
    for (const bot of this.bots) {
      bot.update(dt, player, camera, onPlayerDamaged, world);
    }
  }

  getRaycastTargets() {
    return this.bots.filter((b) => b.alive).map((b) => b.mesh);
  }

  clear() {
    for (const bot of this.bots) this.scene.remove(bot.mesh);
    this.bots = [];
  }
}
