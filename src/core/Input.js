// Clavier physique (e.code) : ZQSD sur AZERTY et WASD sur QWERTY
// correspondent aux mêmes codes physiques, donc les deux marchent d'office.

const DEADZONE = 0.15;
const deadzone = (v) => (Math.abs(v) > DEADZONE ? v : 0);
const clamp = (v) => Math.max(-1, Math.min(1, v));
const buttonPressed = (gp, i) => !!gp.buttons[i] && gp.buttons[i].pressed;

export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.pointer = { x: 0, y: 0 };
    this.buttons = new Set();
    addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
    });
    target.addEventListener('mousemove', (e) => {
      const rect = target === window ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : target.getBoundingClientRect();
      this.pointer.x = clamp(((e.clientX - rect.left) / rect.width) * 2 - 1);
      this.pointer.y = clamp(-(((e.clientY - rect.top) / rect.height) * 2 - 1));
    });
    target.addEventListener('mousedown', (e) => {
      this.buttons.add(e.button);
      if (e.button === 2) e.preventDefault();
    });
    target.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    target.addEventListener('contextmenu', (e) => e.preventDefault());
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
    let v = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'KeyQ', 'ArrowLeft') ? 1 : 0);
    const gp = this.gamepad;
    if (gp) v += deadzone(gp.axes[0]);
    return clamp(v);
  }

  // Axe inversé façon aviation : haut / stick poussé = piquer, bas / stick tiré = cabrer
  get moveY() {
    let v = (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'KeyZ', 'ArrowUp') ? 1 : 0);
    const gp = this.gamepad;
    if (gp) v += deadzone(gp.axes[1]);
    return clamp(v);
  }

  get aimX() {
    const gp = this.gamepad;
    return clamp(this.pointer.x + (gp ? deadzone(gp.axes[2] || 0) * 0.45 : 0));
  }

  get aimY() {
    const gp = this.gamepad;
    return clamp(this.pointer.y - (gp ? deadzone(gp.axes[3] || 0) * 0.45 : 0));
  }

  get fire() {
    if (this.buttons.has(0)) return true;
    if (this.isDown('Space')) return true;
    const gp = this.gamepad;
    return !!gp && (buttonPressed(gp, 7) || buttonPressed(gp, 0)); // RT ou A
  }

  get boost() {
    if (this.buttons.has(2)) return true;
    if (this.isDown('ShiftLeft', 'ShiftRight')) return true;
    const gp = this.gamepad;
    return !!gp && (buttonPressed(gp, 6) || buttonPressed(gp, 4)); // LT ou LB
  }
}
