import type { BallId, GameState, PlayerIndex } from "../state/types.js";
import type { PhysicsEvent } from "../physics/step.js";
export type BallGroup = "solids" | "stripes";
export type EightBallRulesState = {
    groups: [BallGroup | null, BallGroup | null];
    winner: PlayerIndex | null;
    ballInHandFor: PlayerIndex | null;
};
export type ShotAnalysis = {
    shooter: PlayerIndex;
    foul: boolean;
    foulReason: string | null;
    firstCueContact: BallId | null;
    pocketed: BallId[];
    nextPlayer: PlayerIndex;
    keepTurn: boolean;
    groupsAfter: EightBallRulesState["groups"];
    winner: PlayerIndex | null;
    ballInHandFor: PlayerIndex | null;
};
export declare function createInitialEightBallRulesState(): EightBallRulesState;
export declare function analyzeShot(rules: EightBallRulesState, pre: GameState, post: GameState, shooter: PlayerIndex, events: PhysicsEvent[]): ShotAnalysis;
//# sourceMappingURL=eightBall.d.ts.map