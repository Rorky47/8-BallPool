import { useEffect, useMemo, useRef, useState } from "react";
import type { GameSnapshot, GameState } from "@eightball/shared";
import { getPocketCenters } from "@eightball/shared";
import type { AimState, ControlSettings } from "./input/controls";
import { attachControls } from "./input/controls";

type SnapshotWithReceive = {
  receivedAtMs: number;
  snapshot: GameSnapshot;
};

export type GameCanvasProps = {
  snapshots: SnapshotWithReceive[];
  enabledControls: boolean;
  aim: AimState;
  onAimChange: (next: AimState) => void;
  onPlaceCue: (pos: { x: number; y: number }, seq: number) => void;
  onShoot: (shot: AimState) => void;
  settings: ControlSettings & {
    showAimGuide: boolean;
  };
};

type View = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function interpolateState(a: GameState, b: GameState, t: number): GameState {
  // Same table/currentPlayer/phase, just blend positions.
  return {
    ...b,
    balls: b.balls.map((bb) => {
      const aa = a.balls.find((x) => x.id === bb.id);
      if (!aa) return bb;
      if (aa.pocketed || bb.pocketed) return bb;
      return {
        ...bb,
        pos: { x: lerp(aa.pos.x, bb.pos.x, t), y: lerp(aa.pos.y, bb.pos.y, t) }
      };
    })
  };
}

function computeView(canvasW: number, canvasH: number, tableW: number, tableH: number): View {
  const margin = 24;
  const availW = Math.max(1, canvasW - margin * 2);
  const availH = Math.max(1, canvasH - margin * 2);
  const scale = Math.min(availW / tableW, availH / tableH);
  const offsetX = (canvasW - tableW * scale) / 2;
  const offsetY = (canvasH - tableH * scale) / 2;
  return { scale, offsetX, offsetY };
}

export function GameCanvas(props: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [size, setSize] = useState({ w: 900, h: 520 });
  const propsRef = useRef(props);
  const sizeRef = useRef(size);

  useEffect(() => {
    propsRef.current = props;
  }, [props]);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  const latest = props.snapshots[props.snapshots.length - 1]?.snapshot ?? null;

  const view = useMemo(() => {
    const table = latest?.state.table;
    if (!table) return { scale: 1, offsetX: 0, offsetY: 0 };
    return computeView(size.w, size.h, table.width, table.height);
  }, [latest?.state.table, size.h, size.w]);

  const screenToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - view.offsetX) / view.scale,
      y: (sy - view.offsetY) / view.scale
    };
  };

  const getCueBall = (state: GameState) => state.balls.find((b) => b.id === 0 && !b.pocketed) ?? null;

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(300, Math.floor(r.width)), h: Math.max(220, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!latest) return;
    const mode = latest.state.phase === "ball_in_hand" ? "ball_in_hand" : "aim";

    const cleanup = attachControls({
      element: el,
      enabled: props.enabledControls,
      mode,
      settings: props.settings,
      initial: props.aim,
      getCueBallWorldPos: () => {
        const s = latest.state;
        const cue = getCueBall(s);
        return cue ? cue.pos : null;
      },
      screenToWorld,
      onAimChange: props.onAimChange,
      onPlaceCue: props.onPlaceCue,
      onShoot: props.onShoot
    });

    return cleanup;
  }, [latest?.state.tick, props.enabledControls, props.settings.snapAngles, size.w, size.h, view.offsetX, view.offsetY, view.scale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = window.devicePixelRatio || 1;

    const loop = () => {
      raf = requestAnimationFrame(loop);

      const p = propsRef.current;
      const sz = sizeRef.current;
      const latestSnap = p.snapshots[p.snapshots.length - 1];
      if (!latestSnap) return;

      // Simple interpolation using receive timestamps
      const delayMs = 80;
      const renderAt = performance.now() - delayMs;
      const s1 = p.snapshots[p.snapshots.length - 1];
      let renderState = s1.snapshot.state;
      if (p.snapshots.length >= 2) {
        const a = p.snapshots[p.snapshots.length - 2]!;
        const b = s1;
        const span = Math.max(1, b.receivedAtMs - a.receivedAtMs);
        const t = clamp01((renderAt - a.receivedAtMs) / span);
        renderState = interpolateState(a.snapshot.state, b.snapshot.state, t);
      }

      const table = renderState.table;
      const viewNow = computeView(sz.w, sz.h, table.width, table.height);

      canvas.width = Math.floor(sz.w * dpr);
      canvas.height = Math.floor(sz.h * dpr);
      canvas.style.width = `${sz.w}px`;
      canvas.style.height = `${sz.h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      ctx.clearRect(0, 0, sz.w, sz.h);
      ctx.fillStyle = "#0b0f14";
      ctx.fillRect(0, 0, sz.w, sz.h);

      // Table felt
      ctx.fillStyle = "#0f6b3f";
      ctx.fillRect(
        viewNow.offsetX,
        viewNow.offsetY,
        table.width * viewNow.scale,
        table.height * viewNow.scale
      );

      // Pockets
      ctx.fillStyle = "#0a0a0a";
      for (const p of getPocketCenters(table)) {
        ctx.beginPath();
        ctx.arc(
          viewNow.offsetX + p.x * viewNow.scale,
          viewNow.offsetY + p.y * viewNow.scale,
          table.pocketRadius * viewNow.scale,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      // Balls
      for (const b of renderState.balls) {
        if (b.pocketed) continue;
        const x = viewNow.offsetX + b.pos.x * viewNow.scale;
        const y = viewNow.offsetY + b.pos.y * viewNow.scale;
        const r = table.ballRadius * viewNow.scale;

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = b.id === 0 ? "#f5f5f5" : b.id === 8 ? "#111111" : "#e0b84b";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Aim guide + simple shot preview
      if (p.settings.showAimGuide && renderState.phase === "aim") {
        const cue = getCueBall(renderState);
        if (cue) {
          const x = viewNow.offsetX + cue.pos.x * viewNow.scale;
          const y = viewNow.offsetY + cue.pos.y * viewNow.scale;
          const lenPx = 200;
          ctx.strokeStyle = "rgba(255,255,255,0.75)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(
            x + Math.cos(p.aim.aimAngleRad) * lenPx,
            y + Math.sin(p.aim.aimAngleRad) * lenPx
          );
          ctx.stroke();

          // Preview: ray to first ball/rail
          const dir = { x: Math.cos(p.aim.aimAngleRad), y: Math.sin(p.aim.aimAngleRad) };
          const r = table.ballRadius;
          let bestT = Number.POSITIVE_INFINITY;
          let hitBall: { x: number; y: number; id: number } | null = null;

          // Ball hits (t where cue center would be 2r from object center)
          for (const b of renderState.balls) {
            if (b.pocketed || b.id === 0) continue;
            const ocx = b.pos.x - cue.pos.x;
            const ocy = b.pos.y - cue.pos.y;
            const tca = ocx * dir.x + ocy * dir.y;
            if (tca <= 0) continue;
            const d2 = ocx * ocx + ocy * ocy - tca * tca;
            const R = 2 * r;
            const R2 = R * R;
            if (d2 > R2) continue;
            const thc = Math.sqrt(Math.max(0, R2 - d2));
            const tHit = tca - thc;
            if (tHit > 0 && tHit < bestT) {
              bestT = tHit;
              hitBall = { x: b.pos.x, y: b.pos.y, id: b.id };
            }
          }

          // Rail hits (to inner boundary)
          const xMin = r;
          const xMax = table.width - r;
          const yMin = r;
          const yMax = table.height - r;
          const tToX = (xWall: number) => (dir.x === 0 ? null : (xWall - cue.pos.x) / dir.x);
          const tToY = (yWall: number) => (dir.y === 0 ? null : (yWall - cue.pos.y) / dir.y);

          const candidates: number[] = [];
          const tx1 = tToX(xMin);
          const tx2 = tToX(xMax);
          const ty1 = tToY(yMin);
          const ty2 = tToY(yMax);
          if (tx1 && tx1 > 0) candidates.push(tx1);
          if (tx2 && tx2 > 0) candidates.push(tx2);
          if (ty1 && ty1 > 0) candidates.push(ty1);
          if (ty2 && ty2 > 0) candidates.push(ty2);

          const railT = candidates.length ? Math.min(...candidates) : Number.POSITIVE_INFINITY;
          const tHit = Math.min(bestT, railT);
          if (Number.isFinite(tHit)) {
            const hx = cue.pos.x + dir.x * tHit;
            const hy = cue.pos.y + dir.y * tHit;
            ctx.setLineDash([6, 6]);
            ctx.strokeStyle = "rgba(255,255,255,0.45)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(viewNow.offsetX + hx * viewNow.scale, viewNow.offsetY + hy * viewNow.scale);
            ctx.stroke();
            ctx.setLineDash([]);

            if (hitBall && bestT <= railT) {
              // Ghost ball center
              const gx = hitBall.x - dir.x * (2 * r);
              const gy = hitBall.y - dir.y * (2 * r);
              ctx.beginPath();
              ctx.arc(
                viewNow.offsetX + gx * viewNow.scale,
                viewNow.offsetY + gy * viewNow.scale,
                r * viewNow.scale,
                0,
                Math.PI * 2
              );
              ctx.strokeStyle = "rgba(255,255,255,0.5)";
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          }

          // Power bar
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.fillRect(16, sz.h - 24, sz.w - 32, 8);
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillRect(16, sz.h - 24, (sz.w - 32) * p.aim.power01, 8);
        }
      }

      if (renderState.phase === "ball_in_hand") {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(16, 16, 320, 48);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "14px system-ui, sans-serif";
        ctx.fillText("Ball in hand: hold left mouse and drag", 24, 36);
        ctx.fillText("the cue ball to place it.", 24, 54);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      style={{
        width: "100%",
        height: "100%",
        outline: "none",
        borderRadius: 12,
        overflow: "hidden"
      }}
      onPointerDown={(e) => {
        // Focus so keyboard controls work.
        (e.currentTarget as HTMLDivElement).focus();
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

