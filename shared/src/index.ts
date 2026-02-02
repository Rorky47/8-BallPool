export type { Vec2 } from "./math/vec2.js";
export { add, dot, len, lenSq, mul, norm, sub, v } from "./math/vec2.js";

export { PROTOCOL_VERSION } from "./protocol/messages.js";
export type { ClientToServer, ServerToClient } from "./protocol/messages.js";
export { isClientToServer } from "./protocol/guards.js";

export type {
  BallId,
  BallState,
  GamePhase,
  GameSnapshot,
  GameState,
  PlayerId,
  PlayerIndex,
  RoomId,
  TableState
} from "./state/types.js";

export { DEFAULT_PHYSICS_PARAMS } from "./physics/params.js";
export type { PhysicsParams } from "./physics/params.js";
export { getPocketCenters } from "./physics/table.js";
export { stepBallsInPlace } from "./physics/step.js";
export type { PhysicsEvent } from "./physics/step.js";

export type { BallGroup, EightBallRulesState, ShotAnalysis } from "./rules/eightBall.js";
export { analyzeShot, createInitialEightBallRulesState } from "./rules/eightBall.js";

