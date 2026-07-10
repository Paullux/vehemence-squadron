// Clavier physique (e.code) : ZQSD sur AZERTY et WASD sur QWERTY
// correspondent aux mêmes codes physiques, donc les deux marchent d'office.

const DEADZONE = 0.15;
const MOUSE_SENSITIVITY = 0.0022;
// Certains navigateurs renvoient un premier `movementX/Y` énorme et parasite
// juste après l'acquisition du Pointer Lock (artefact du recentrage du
// curseur caché par l'OS) : ignorer tout mouvement pendant ce court délai
// évite un "saut" de cap incontrôlé au moment où le joueur capture la souris.
const POINTER_LOCK_SETTLE_MS = 150;
const deadzone = (v) => (Math.abs(v) > DEADZONE ? v : 0);
const clamp = (v) => Math.max(-1, Math.min(1, v));
const buttonPressed = (gp, i) => !!gp.buttons[i] && gp.buttons[i].pressed;

export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.pointer = { x: 0, y: 0 };
    this.buttons = new Set();
    this.pointerLocked = false;
    this._lockTarget = target instanceof Element ? target : document.body;
    // Deltas souris bruts (non bornés), pour le pilotage libre façon FPS
    // (mission 4) : contrairement à `pointer` (borné -1..1, réticule sur
    // rail), le cap doit pouvoir tourner sans butée. Consommés une fois par
    // frame via consumeMouseDelta() puis remis à zéro.
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;
    this._lockAcquiredAt = 0;

    addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
    });

    // Souris capturée façon FPS : hors capture, elle ne fait rien (ni visée,
    // ni clic sur la page) — un clic sur le jeu la capture, Échap la libère
    // (comportement natif du navigateur, rien à coder pour cette partie).
    target.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      if (performance.now() - this._lockAcquiredAt < POINTER_LOCK_SETTLE_MS) return;
      this.pointer.x = clamp(this.pointer.x + e.movementX * MOUSE_SENSITIVITY);
      this.pointer.y = clamp(this.pointer.y - e.movementY * MOUSE_SENSITIVITY);
      this._mouseDeltaX += e.movementX;
      this._mouseDeltaY += e.movementY;
    });
    target.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) {
        this._lockTarget.requestPointerLock?.();
        return; // le premier clic ne fait que capturer la souris, pas tirer
      }
      this.buttons.add(e.button);
      if (e.button === 2) e.preventDefault();
    });
    target.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    target.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this._lockTarget;
      if (this.pointerLocked) {
        this._lockAcquiredAt = performance.now();
        this._mouseDeltaX = 0;
        this._mouseDeltaY = 0;
      }
      if (!this.pointerLocked) this.buttons.clear();
    });
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

  // Pilotage libre (mission 4) : Z avance / S recule (accélération), Q/D
  // roulis + déplacement latéral. Indépendants de moveX/moveY (vol sur
  // rail) pour que Z/S signifient "avancer/reculer" et non "piquer/cabrer".
  // `code` reste bien la position physique de la touche (comme le
  // physical_keycode de Godot) — mais AZERTY et QWERTY intervertissent les
  // touches Z/W et Q/A, donc il faut lister les deux codes possibles, comme
  // moveX/moveY le font déjà plus haut. Sans ça, la touche "Z" d'un clavier
  // AZERTY (qui envoie le code 'KeyW') ne déclenchait rien.
  get throttle() {
    let v = (this.isDown('KeyZ', 'KeyW') ? 1 : 0) - (this.isDown('KeyS') ? 1 : 0);
    const gp = this.gamepad;
    if (gp) v -= deadzone(gp.axes[1]);
    return clamp(v);
  }

  get roll() {
    let v = (this.isDown('KeyD') ? 1 : 0) - (this.isDown('KeyQ', 'KeyA') ? 1 : 0);
    const gp = this.gamepad;
    if (gp) v += deadzone(gp.axes[0]);
    return clamp(v);
  }

  // Delta souris brut de la frame (non borné) — pilotage libre. À consommer
  // une fois par frame : le buffer est vidé après lecture.
  consumeMouseDelta() {
    const d = { x: this._mouseDeltaX, y: this._mouseDeltaY };
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;
    return d;
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
    if (this.pointerLocked && this.buttons.has(0)) return true;
    const gp = this.gamepad;
    return !!gp && (buttonPressed(gp, 7) || buttonPressed(gp, 0)); // RT ou A
  }

  get boost() {
    if (this.pointerLocked && this.buttons.has(2)) return true;
    if (this.isDown('ShiftLeft', 'ShiftRight')) return true;
    const gp = this.gamepad;
    return !!gp && (buttonPressed(gp, 6) || buttonPressed(gp, 4)); // LT ou LB
  }
}
