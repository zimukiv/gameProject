'use strict';
// Unity samples input independently of the slower canvas/PNG round trip.
// Keep press events ordered even when more than one arrives in one command
// or before the next 120 Hz physics step.
class InputSteps {
  constructor() { this.reset(); }
  reset() { this.acc = 0; this.edges = []; }
  advance(game, command) {
    if (game.mode !== 'playing') { this.reset(); return; }
    const samples = Array.isArray(command.samples) ? command.samples : [command];
    for (const sample of samples) {
      const input = sample.input || {};
      if (game.respawnRemaining > 0) this.edges.length = 0;
      else if (input.jumpPressed || input.dashPressed) this.edges.push({ ...input });
      this.acc += Math.max(0, Math.min(sample.dt || 0, .05));
      while (this.acc >= 1 / 120) {
        const edge = this.edges.shift();
        game.update(1 / 120, { ...input, jumpPressed: false, dashPressed: false, ...edge });
        this.acc -= 1 / 120;
        if (game.mode !== 'playing' || game.respawnRemaining > 0) this.edges.length = 0;
        if (game.mode !== 'playing') { this.reset(); return; }
      }
    }
  }
}
module.exports = { InputSteps };
