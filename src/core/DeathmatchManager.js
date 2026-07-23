// Tracks local practice kill streaks. It never grants currency, progression,
// inventory, or any fact that could be mistaken for server authority.

const STREAK_RESET = 10; // seconds without a kill before streak resets

export class DeathmatchManager {
  constructor() {
    this.killStreak  = 0;
    this.streakTimer = 0;
  }

  reset() {
    this.killStreak  = 0;
    this.streakTimer = 0;
  }

  // Call on each locally confirmed practice kill.
  onKill() {
    this.killStreak++;
    this.streakTimer = STREAK_RESET;
    return { streak: this.killStreak };
  }

  update(dt) {
    if (this.killStreak > 0) {
      this.streakTimer -= dt;
      if (this.streakTimer <= 0) this.killStreak = 0;
    }
  }
}
