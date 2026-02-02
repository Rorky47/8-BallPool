import type { BallId, BallState, TableState } from "../state/types.js";
import { type PhysicsParams } from "./params.js";
export type PhysicsEvent = {
    kind: "ball_ball";
    a: BallId;
    b: BallId;
} | {
    kind: "ball_rail";
    ball: BallId;
} | {
    kind: "ball_pocket";
    ball: BallId;
};
export type StepResult = {
    anyMoving: boolean;
    collided: boolean;
    pocketedAny: boolean;
    events: PhysicsEvent[];
};
export declare function stepBallsInPlace(balls: BallState[], table: TableState, dt: number, params?: PhysicsParams): StepResult;
//# sourceMappingURL=step.d.ts.map