import type { GameSnapshot, PlayerIndex, RoomId } from "../state/types.js";

export const PROTOCOL_VERSION = 1 as const;

export type ClientToServer =
  | {
      t: "queue/join";
      displayName?: string;
    }
  | {
      t: "queue/leave";
    }
  | {
      t: "match/leave";
      roomId: RoomId;
    }
  | {
      t: "match/rematch";
      roomId: RoomId;
    }
  | {
      t: "game/aim";
      roomId: RoomId;
      seq: number;
      aimAngleRad: number;
      power01: number;
    }
  | {
      t: "game/place_cue";
      roomId: RoomId;
      seq: number;
      x: number;
      y: number;
    }
  | {
      t: "game/shoot";
      roomId: RoomId;
      seq: number;
      clientShotId: string;
      aimAngleRad: number;
      power01: number;
    }
  | {
      t: "ping";
      clientTimeMs: number;
    };

export type ServerToClient =
  | {
      t: "hello";
      protocol: typeof PROTOCOL_VERSION;
      sid: string;
      playerToken: string;
    }
  | {
      t: "queue/status";
      inQueue: boolean;
      position?: number;
    }
  | {
      t: "match/found";
      roomId: RoomId;
      playerIndex: PlayerIndex;
    }
  | {
      t: "match/ended";
      roomId: RoomId;
      winner: PlayerIndex | null;
      reason: "game_over" | "forfeit";
    }
  | {
      t: "game/snapshot";
      roomId: RoomId;
      snapshot: GameSnapshot;
    }
  | {
      t: "pong";
      clientTimeMs: number;
      serverTimeMs: number;
    }
  | {
      t: "error";
      code: string;
      message: string;
    };

