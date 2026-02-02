import { describe, expect, it } from "vitest";
import type { BallState, TableState } from "../src/state/types.js";
import { stepBallsInPlace } from "../src/physics/step.js";

function table(): TableState {
  return {
    width: 1,
    height: 0.5,
    ballRadius: 0.05,
    pocketRadius: 0.12
  };
}

describe("physics step", () => {
  it("does not stall on stationary touching balls", () => {
    const t = table();
    const r = t.ballRadius;
    const balls: BallState[] = [
      { id: 0, pos: { x: 0.3, y: 0.25 }, vel: { x: 0, y: 0 }, pocketed: false },
      { id: 1, pos: { x: 0.3 + 2 * r, y: 0.25 }, vel: { x: 0, y: 0 }, pocketed: false }
    ];

    const res = stepBallsInPlace(balls, t, 1 / 60, {
      restitutionBall: 0.93,
      restitutionRail: 0.85,
      rollingFrictionPerSec: 0,
      stopSpeed: 0,
      maxSubsteps: 24
    });

    expect(res.anyMoving).toBe(false);
    expect(res.events.length).toBe(0);
  });

  it("handles fast ball-ball collision (no tunneling)", () => {
    const t = table();
    const r = t.ballRadius;
    const balls: BallState[] = [
      { id: 0, pos: { x: 0.2, y: 0.25 }, vel: { x: 10, y: 0 }, pocketed: false },
      {
        id: 1,
        pos: { x: 0.2 + 2 * r + 0.01, y: 0.25 },
        vel: { x: 0, y: 0 },
        pocketed: false
      }
    ];

    stepBallsInPlace(balls, t, 1 / 60, {
      restitutionBall: 0.93,
      restitutionRail: 0.85,
      rollingFrictionPerSec: 0,
      stopSpeed: 0,
      maxSubsteps: 24
    });

    expect(balls[1]!.vel.x).toBeGreaterThan(0.1);
    expect(balls[0]!.vel.x).toBeLessThan(10);
  });

  it("reflects off rails with restitution", () => {
    const t = table();
    const balls: BallState[] = [
      { id: 0, pos: { x: 0.5, y: 0.25 }, vel: { x: 1, y: 0 }, pocketed: false }
    ];

    stepBallsInPlace(balls, t, 1, {
      restitutionBall: 0.93,
      restitutionRail: 0.85,
      rollingFrictionPerSec: 0,
      stopSpeed: 0,
      maxSubsteps: 24
    });

    expect(balls[0]!.vel.x).toBeLessThan(0);
    expect(Math.abs(balls[0]!.vel.x)).toBeCloseTo(0.85, 3);
  });

  it("applies rolling friction", () => {
    const t = table();
    const balls: BallState[] = [
      { id: 0, pos: { x: 0.5, y: 0.25 }, vel: { x: 0.5, y: 0 }, pocketed: false }
    ];

    stepBallsInPlace(balls, t, 0.5, {
      restitutionBall: 0.93,
      restitutionRail: 0.85,
      rollingFrictionPerSec: 1,
      stopSpeed: 0,
      maxSubstep