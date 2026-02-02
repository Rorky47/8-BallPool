import type { KeyBindings } from "./keybindings";

export type AimState = {
  seq: number;
  aimAngleRad: number;
  power01: number;
};

export type ControlSettings = {
  snapAngles: boolean;
  bindings: KeyBindings;
};

export type ControlsOptions = {
  element: HTMLElement;
  getCueBallWorldPos: () => { x: number; y: number } | null;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  enabled: boolean;
  mode: "aim" | "ball_in_hand";
  settings: ControlSettings;
  initial: AimState;
  onAimChange: (next: AimState) => void;
  onPlaceCue?: (pos: { x: number; y: number }, seq: number) => void;
  onShoot: (shot: AimState) => void;
};

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function wrapAngleRad(a: number): number {
  const twoPi = Math.PI * 2;
  let x = a % twoPi;
  if (x < -Math.PI) x += twoPi;
  if (x > Math.PI) x -= twoPi;
  return x;
}

function maybeSnapAngle(a: number, enabled: boolean): number {
  if (!enabled) return a;
  // Snap to common angles (every 15°) when within ~1.2°
  const step = (15 * Math.PI) / 180;
  const threshold = (1.2 * Math.PI) / 180;
  const snapped = Math.round(a / step) * step;
  return Math.abs(snapped - a) <= threshold ? snapped : a;
}

export function attachControls(opts: ControlsOptions): () => void {
  let state: AimState = { ...opts.initial };

  const emit = () => {
    opts.onAimChange(state);
  };

  const setAimFromPointer = (clientX: number, clientY: number) => {
    if (!opts.enabled) return;
    if (opts.mode !== "aim") return;
    const cue = opts.getCueBallWorldPos();
    if (!cue) return;
    const w = opts.screenToWorld(clientX, clientY);
    const a = Math.atan2(w.y - cue.y, w.x - cue.x);
    state = { ...state, seq: state.seq + 1, aimAngleRad: maybeSnapAngle(a, opts.settings.snapAngles) };
    emit();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!opts.enabled) return;
    if (opts.mode === "aim") {
      setAimFromPointer(e.clientX, e.clientY);
      return;
    }
    if (opts.mode === "ball_in_hand") {
      if ((e.buttons & 1) === 0) return; // only while left mouse is held
      const w = opts.screenToWorld(e.clientX, e.clientY);
      const nextSeq = state.seq + 1;
      state = { ...state, seq: nextSeq };
      opts.onPlaceCue?.(w, nextSeq);
    }
  };

  const onWheel = (e: WheelEvent) => {
    if (!opts.enabled) return;
    if (opts.mode !== "aim") return;
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const step = e.shiftKey ? 0.01 : 0.03;
    state = { ...state, seq: state.seq + 1, power01: clamp01(state.power01 - delta * step) };
    emit();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!opts.enabled) return;

    if (opts.mode !== "aim") {
      if (e.code === opts.settings.bindings.shoot || e.code === "Enter") {
        opts.onShoot(state);
        e.preventDefault();
      }
      return;
    }

    const fine = e.shiftKey ? 0.005 : 0.02;
    const powStep = e.shiftKey ? 0.01 : 0.03;

    if (e.code === "ArrowLeft" || e.code === opts.settings.bindings.aimLeft) {
      state = { ...state, seq: state.seq + 1, aimAngleRad: wrapAngleRad(state.aimAngleRad - fine) };
      emit();
      e.preventDefault();
      return;
    }
    if (e.code === "ArrowRight" || e.code === opts.settings.bindings.aimRight) {
      state = { ...state, seq: state.seq + 1, aimAngleRad: wrapAngleRad(state.aimAngleRad + fine) };
      emit();
      e.preventDefault();
      return;
    }

    if (e.code === "ArrowUp" || e.code === opts.settings.bindings.powerUp) {
      state = { ...state, seq: state.seq + 1, power01: clamp01(state.power01 + powStep) };
      emit();
      e.preventDefault();
      return;
    }
    if (e.code === "ArrowDown" || e.code === opts.settings.bindings.powerDown) {
      state = { ...state, seq: state.seq + 1, power01: clamp01(state.power01 - powStep) };
      emit();
      e.preventDefault();
      return;
    }

    if (e.code === opts.settings.bindings.shoot || e.code === "Enter") {
      opts.onShoot(state);
      e.preventDefault();
      return;
    }
  };

  opts.element.addEventListener("pointermove", onPointerMove);
  opts.element.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);

  return () => {
    opts.element.removeEventListener("pointermove", onPointerMove);
    opts.element.removeEventListener("wheel", onWheel as EventListener);
    window.removeEventListener("keydown", onKeyDown);
  };
}

