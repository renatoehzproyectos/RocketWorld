/**
 * CHUNK 08 + 18 — InputManager
 * Keyboard, gamepad, and mobile touch (virtual stick + buttons).
 */

export interface ControlState {
  throttle: number; // -1..1
  steer: number; // -1..1
  pitch: number; // -1..1
  yaw: number; // -1..1
  roll: number; // -1..1
  jump: boolean;
  boost: boolean;
  handbrake: boolean;
}

const DEADZONE = 0.12;

function applyDeadzone(v: number, dz = DEADZONE): number {
  if (Math.abs(v) < dz) return 0;
  const s = Math.sign(v);
  return s * ((Math.abs(v) - dz) / (1 - dz));
}

function isTouchDevice() {
  return (
    'ontouchstart' in window ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)
  );
}

export class InputManager {
  private keys: Record<string, boolean> = {};
  private readonly state: ControlState = {
    throttle: 0,
    steer: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    jump: false,
    boost: false,
    handbrake: false,
  };

  // Touch virtual controls
  private touchSteer = 0;
  private touchThrottle = 0;
  private touchJump = false;
  private touchBoost = false;
  private touchHandbrake = false;
  private stickTouchId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private readonly stickRadius = 52;
  private overlay: HTMLDivElement | null = null;
  private knob: HTMLDivElement | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (
        ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
          e.code
        )
      ) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    if (isTouchDevice()) {
      this.buildTouchUi();
    }
  }

  private buildTouchUi() {
    const root = document.createElement('div');
    root.id = 'touchControls';
    root.style.cssText = `
      position:fixed;inset:0;z-index:15;pointer-events:none;
      touch-action:none;user-select:none;
    `;

    // Left: virtual stick zone
    const stickZone = document.createElement('div');
    stickZone.style.cssText = `
      position:absolute;left:0;bottom:0;width:45%;height:55%;
      pointer-events:auto;
    `;
    const base = document.createElement('div');
    base.style.cssText = `
      position:absolute;left:28px;bottom:28px;width:110px;height:110px;
      border-radius:50%;background:rgba(255,255,255,0.12);
      border:2px solid rgba(255,255,255,0.25);
    `;
    const knob = document.createElement('div');
    knob.style.cssText = `
      position:absolute;left:50%;top:50%;width:48px;height:48px;
      margin:-24px 0 0 -24px;border-radius:50%;
      background:rgba(255,255,255,0.45);border:2px solid rgba(255,255,255,0.6);
      transition:none;
    `;
    base.appendChild(knob);
    stickZone.appendChild(base);
    this.knob = knob;

    const onStickStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.stickTouchId = t.identifier;
      const rect = base.getBoundingClientRect();
      this.stickOrigin.x = rect.left + rect.width / 2;
      this.stickOrigin.y = rect.top + rect.height / 2;
      this.updateStick(t.clientX, t.clientY);
    };
    const onStickMove = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.stickTouchId) {
          e.preventDefault();
          this.updateStick(t.clientX, t.clientY);
        }
      }
    };
    const onStickEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.stickTouchId) {
          this.stickTouchId = null;
          this.touchSteer = 0;
          this.touchThrottle = 0;
          if (this.knob) {
            this.knob.style.transform = 'translate(0,0)';
          }
        }
      }
    };
    stickZone.addEventListener('touchstart', onStickStart, { passive: false });
    stickZone.addEventListener('touchmove', onStickMove, { passive: false });
    stickZone.addEventListener('touchend', onStickEnd);
    stickZone.addEventListener('touchcancel', onStickEnd);

    // Right: buttons
    const btnZone = document.createElement('div');
    btnZone.style.cssText = `
      position:absolute;right:12px;bottom:24px;width:42%;height:50%;
      pointer-events:none;display:flex;flex-wrap:wrap;align-content:flex-end;
      justify-content:flex-end;gap:12px;
    `;

    const mkBtn = (
      label: string,
      color: string,
      on: () => void,
      off: () => void
    ) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `
        pointer-events:auto;width:72px;height:72px;border-radius:50%;
        border:2px solid ${color};background:rgba(0,0,0,0.35);
        color:#fff;font:700 13px system-ui;letter-spacing:0.02em;
        touch-action:none;-webkit-tap-highlight-color:transparent;
      `;
      const press = (e: Event) => {
        e.preventDefault();
        b.style.background = color;
        on();
      };
      const release = (e: Event) => {
        e.preventDefault();
        b.style.background = 'rgba(0,0,0,0.35)';
        off();
      };
      b.addEventListener('touchstart', press, { passive: false });
      b.addEventListener('touchend', release);
      b.addEventListener('touchcancel', release);
      // mouse for desktop testing
      b.addEventListener('mousedown', press);
      b.addEventListener('mouseup', release);
      b.addEventListener('mouseleave', release);
      return b;
    };

    btnZone.appendChild(
      mkBtn(
        'JUMP',
        'rgba(100,180,255,0.7)',
        () => {
          this.touchJump = true;
        },
        () => {
          this.touchJump = false;
        }
      )
    );
    btnZone.appendChild(
      mkBtn(
        'BOOST',
        'rgba(255,160,40,0.75)',
        () => {
          this.touchBoost = true;
        },
        () => {
          this.touchBoost = false;
        }
      )
    );
    btnZone.appendChild(
      mkBtn(
        'BRAKE',
        'rgba(220,80,80,0.7)',
        () => {
          this.touchHandbrake = true;
        },
        () => {
          this.touchHandbrake = false;
        }
      )
    );

    root.appendChild(stickZone);
    root.appendChild(btnZone);
    document.body.appendChild(root);
    this.overlay = root;
  }

  private updateStick(clientX: number, clientY: number) {
    let dx = clientX - this.stickOrigin.x;
    let dy = clientY - this.stickOrigin.y;
    const len = Math.hypot(dx, dy) || 1;
    const max = this.stickRadius;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.touchSteer = dx / max;
    this.touchThrottle = -dy / max; // up = forward
    if (this.knob) {
      this.knob.style.transform = `translate(${dx}px,${dy}px)`;
    }
  }

  /** Call once per frame; returns normalized control state */
  poll(): ControlState {
    let throttle =
      (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) -
      (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0);
    let steer =
      (this.keys['KeyA'] || this.keys['ArrowLeft'] ? -1 : 0) +
      (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0);
    let pitch = (this.keys['KeyI'] ? 1 : 0) - (this.keys['KeyK'] ? 1 : 0);
    let yaw = (this.keys['KeyJ'] ? -1 : 0) + (this.keys['KeyL'] ? 1 : 0);
    let roll = (this.keys['KeyQ'] ? -1 : 0) + (this.keys['KeyE'] ? 1 : 0);
    let jump = !!this.keys['Space'];
    let boost = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    let handbrake = !!this.keys['KeyX'];

    // Touch overrides / merges
    if (Math.abs(this.touchSteer) > Math.abs(steer)) steer = this.touchSteer;
    if (Math.abs(this.touchThrottle) > Math.abs(throttle))
      throttle = this.touchThrottle;
    if (this.touchJump) jump = true;
    if (this.touchBoost) boost = true;
    if (this.touchHandbrake) handbrake = true;

    // Gamepad (first pad)
    const pads = navigator.getGamepads?.() ?? [];
    const gp = pads[0];
    if (gp) {
      const lx = applyDeadzone(gp.axes[0] ?? 0);
      const ly = applyDeadzone(gp.axes[1] ?? 0);
      const rx = applyDeadzone(gp.axes[2] ?? 0);
      const ry = applyDeadzone(gp.axes[3] ?? 0);
      if (Math.abs(lx) > Math.abs(steer)) steer = lx;
      if (Math.abs(-ly) > Math.abs(throttle)) throttle = -ly;
      if (Math.abs(rx) > Math.abs(yaw)) yaw = rx;
      if (Math.abs(-ry) > Math.abs(pitch)) pitch = -ry;
      const lt = gp.buttons[6]?.value ?? 0;
      const rt = gp.buttons[7]?.value ?? 0;
      if (rt > 0.1) boost = true;
      if (lt > 0.1) handbrake = true;
      if (gp.buttons[0]?.pressed) jump = true;
      if (gp.buttons[4]?.pressed) roll = -1;
      if (gp.buttons[5]?.pressed) roll = 1;
    }

    this.state.throttle = Math.max(-1, Math.min(1, throttle));
    this.state.steer = Math.max(-1, Math.min(1, steer));
    this.state.pitch = Math.max(-1, Math.min(1, pitch));
    this.state.yaw = Math.max(-1, Math.min(1, yaw));
    this.state.roll = Math.max(-1, Math.min(1, roll));
    this.state.jump = jump;
    this.state.boost = boost;
    this.state.handbrake = handbrake;
    return this.state;
  }
}
