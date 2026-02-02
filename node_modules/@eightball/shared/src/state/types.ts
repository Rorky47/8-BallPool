import type { Vec2 } from "../math/vec2.js";

export type RoomId = string;
export type PlayerId = string;
export type PlayerIndex = 0 | 1;

export type BallId =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15;

export type BallState = {
  id: BallId;
  pos: Vec2;
  vel: Vec2;
  pocketed: boolean;
};

export type TableState = {
  // World units (we'll use meters-ish, but consistent units is what matters)
  width: number;
  height: number;
  ballRadius: number;
  pocketRadius: number;
};

export type GamePhase = "aim" | "simulating" | "ball_in_hand" | "game_over";

export type GameState = {
  tick: number;
  phase: GamePhase;
  currentPlayer: PlayerIndex;
  table: TableState;
  balls: BallState[];
};

export type GameSnapshot = {
  tick: number;
  serverTimeMs: number;
  state: GameState;
};

