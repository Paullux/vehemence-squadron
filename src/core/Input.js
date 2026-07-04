// Clavier physique (e.code) : ZQSD sur AZERTY et WASD sur QWERTY
// correspondent aux mêmes codes physiques, donc les deux marchent d'office.

const DEADZONE = 0.15;
const deadzone = (v) => (Math.abs(v) > DEADZONE ? v : 0);
const clamp = (v) => Math.max(-1, Math.min(1, v));
const buttonPressed = (gp, i) => !!gp.buttons[i] && gp.buttons[i].pressed;

export class Input {
  constructor() {
    this.keys = new Set();
    addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  isDown(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  // Première manette connectée (Xbox : mapping "standard" du Gamepad API)
  get gamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (p && p.connected) return p;
    }
    return null;
  }

  get moveX() {
    let v = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    const gp = this.gamepad;
    if (gp) v += deadzone(gp.axes[0]);
    return clamp(v);
  }

  // Axe inversé façon aviation : haut / stick poussé = piquer, bas / stick tiré = cabrer
  get moveY() {
    let v = (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'ArrowUp') ? 1 : 0);
    const gp = this.gamepad;
    if (gp) v += deadzone(gp.axes[1]);
    return clamp(v);
  }

  get fire() {
    if (this.isDown('Space')) return true;
    const gp = this.gamepad;
    return !!gp && (buttonPressed(gp, 7) || buttonPressed(gp, 0)); // RT ou A
  }

  get boost() {
    if (this.isDown('ShiftLeft', 'ShiftRight')) return true;
    const gp = this.gamepad;
    return !!gp && (buttonPressed(gp, 6) || buttonPressed(gp, 4)); // LT ou LB
  }
}
