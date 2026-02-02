import type { Server as SocketIOServer, Socket } from "socket.io";
import {
  DEFAULT_PHYSICS_PARAMS,
  analyzeShot,
  createInitialEightBallRulesState,
  stepBallsInPlace,
  type ClientToServer,
  type EightBallRulesState,
  type GameSnapshot,
  type GameState,
  type PhysicsEvent,
  type PlayerIndex,
  type ServerToClient
} from "@eightball/shared";
import { createInitialGameState } from "../game/initial.js";
import { SOCKET_EVENT } from "../net/events.js";

type PlayerSlot = {
  token: string;
  socket: Socket | null;
  disconnectedAtMs: number | null;
  lastAim: { seq: number; aimAngleRad: number; power01: number } | null;
};

export class GameRoom {
  readonly id: string;
  private readonly io: SocketIOServer;
  private readonly players: [PlayerSlot, PlayerSlot];
  private readonly onEnd: (info: { roomId: string; reason: "game_over" | "forfeit"; winner: PlayerIndex | null }) => void;
  private ended = false;

  private state: GameState;
  private rules: EightBallRulesState = createInitialEightBallRulesState();
  private shot:
    | {
        shooter: PlayerIndex;
        preState: GameState;
        events: PhysicsEvent[];
      }
    | null = null;
  private interval: NodeJS.Timeout | null = null;

  private readonly dt = 1 / 120;
  private readonly tickEveryMs = 8;
  private readonly reconnectWindowMs = 20_000;

  constructor(
    io: SocketIOServer,
    id: string,
    p0Token: string,
    p1Token: string,
    onEnd: (info: { roomId: string; reason: "game_over" | "forfeit"; winner: PlayerIndex | null }) => void = () => {}
  ) {
    this.io = io;
    this.id = id;
    this.onEnd = onEnd;
    this.players = [
      { token: p0Token, socket: null, disconnectedAtMs: null, lastAim: null },
      { token: p1Token, socket: null, disconnectedAtMs: null, lastAim: null }
    ];
    this.state = createInitialGameState();
  }

  start() {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), this.tickEveryMs);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  attachSocket(token: string, socket: Socket) {
    const idx = this.playerIndexOf(token);
    if (idx === null) return;

    const slot = this.players[idx];
    slot.socket = socket;
    slot.disconnectedAtMs = null;
    socket.join(this.id);

    // Send an immediate snapshot so the client can render instantly.
    this.emitTo(socket, {
      t: "game/snapshot",
      roomId: this.id,
      snapshot: this.makeSnapshot()
    });
  }

  handleDisconnect(token: string) {
    const idx = this.playerIndexOf(token);
    if (idx === null) return;
    const slot = this.players[idx];
    if (slot.socket?.id === null) return;
    slot.socket = null;
    slot.disconnectedAtMs = Date.now();
  }

  handleCommand(token: string, msg: ClientToServer) {
    const idx = this.playerIndexOf(token);
    if (idx === null) return;

    if (msg.t === "game/aim") {
      if (this.state.phase !== "aim" && this.state.phase !== "ball_in_hand") return;
      if (idx !== this.state.currentPlayer) return;
      this.players[idx].lastAim = {
        seq: msg.seq,
        aimAngleRad: msg.aimAngleRad,
        power01: msg.power01
      };
      return;
    }

    if (msg.t === "game/place_cue") {
      if (this.state.phase !== "ball_in_hand") return;
      if (idx !== this.state.currentPlayer) return;

      const cue = this.state.balls.find((b) => b.id === 0);
      if (!cue) return;
      const r = this.state.table.ballRadius;
      const xMin = r;
      const xMax = this.state.table.width - r;
      const yMin = r;
      const yMax = this.state.table.height - r;

      const next = {
        x: Math.min(xMax, Math.max(xMin, msg.x)),
        y: Math.min(yMax, Math.max(yMin, msg.y))
      };

      // Must not overlap any other ball.
      const minD2 = (2 * r) * (2 * r);
      for (const b of this.state.balls) {
        if (b.id === 0 || b.pocketed) continue;
        const dx = b.pos.x - next.x;
        const dy = b.pos.y - next.y;
        if (dx * dx + dy * dy < minD2) return;
      }

      cue.pocketed = false;
      cue.vel = { x: 0, y: 0 };
      cue.pos = next;

      this.broadcast({
        t: "game/snapshot",
        roomId: this.id,
        snapshot: this.makeSnapshot()
      });
      return;
    }

    if (msg.t === "game/shoot") {
      if (this.state.phase !== "aim" && this.state.phase !== "ball_in_hand") return;
      if (idx !== this.state.currentPlayer) return;
      if (msg.power01 <= 0) return;

      const cue = this.state.balls.find((b) => b.id === 0);
      if (!cue || cue.pocketed) return;

      const maxSpeed = 7.0;
      cue.vel = {
        x: Math.cos(msg.aimAngleRad) * msg.power01 * maxSpeed,
        y: Math.sin(msg.aimAngleRad) * msg.power01 * maxSpeed
      };
      this.state.phase = "simulating";
      this.shot = {
        shooter: idx,
        preState: structuredClone(this.state),
        events: []
      };
      return;
    }
  }

  isPlayer(token: string): boolean {
    return this.playerIndexOf(token) !== null;
  }

  getPlayerIndex(token: string): PlayerIndex | null {
    return this.playerIndexOf(token);
  }

  getPlayerTokens(): [string, string] {
    return [this.players[0].token, this.players[1].token];
  }

  playerLeft(token: string) {
    const idx = this.playerIndexOf(token);
    if (idx === null) return;
    const winner: PlayerIndex = idx === 0 ? 1 : 0;
    this.endMatch("forfeit", winner);
  }

  private playerIndexOf(token: string): PlayerIndex | null {
    if (this.players[0].token === token) return 0;
    if (this.players[1].token === token) return 1;
    return null;
  }

  private tick() {
    const now = Date.now();

    // Reconnect window enforcement
    for (let i = 0 as PlayerIndex; i < 2; i = (i + 1) as PlayerIndex) {
      const slot = this.players[i];
      if (slot.socket) continue;
      if (slot.disconnectedAtMs === null) continue;
      if (now - slot.disconnectedAtMs > this.reconnectWindowMs) {
        const other: PlayerIndex = i === 0 ? 1 : 0;
        const winner = this.players[other].socket ? other : null;
        this.endMatch("forfeit", winner);
        return;
      }
    }

    if (this.state.phase === "simulating") {
      const shot = this.shot;
      const res = stepBallsInPlace(
        this.state.balls,
        this.state.table,
        this.dt,
        DEFAULT_PHYSICS_PARAMS
      );
      if (shot) shot.events.push(...res.events);
      this.state.tick++;

      if (!res.anyMoving) {
        const shooter = shot?.shooter ?? this.state.currentPlayer;
        const preState = shot?.preState ?? structuredClone(this.state);
        const analysis = analyzeShot(this.rules, preState, this.state, shooter, shot?.events ?? []);

        this.rules = {
          groups: analysis.groupsAfter,
          winner: analysis.winner,
          ballInHandFor: analysis.ballInHandFor
        };

        this.state.currentPlayer = analysis.nextPlayer;

        if (analysis.winner !== null) {
          this.state.phase = "game_over";
        } else if (analysis.ballInHandFor !== null) {
          this.state.phase = "ball_in_hand";

          // Ensure the cue ball is back on the table and stopped.
          const cue = this.state.balls.find((b) => b.id === 0);
          if (cue) {
            cue.pocketed = false;
            cue.vel = { x: 0, y: 0 };
            cue.pos = { x: this.state.table.width * 0.25, y: this.state.table.height / 2 };
          }
        } else {
          this.state.phase = "aim";
        }

        this.shot = null;
      }

      this.broadcast({
        t: "game/snapshot",
        roomId: this.id,
        snapshot: this.makeSnapshot()
      });

      if (this.state.phase === "game_over" && !this.ended) {
        this.endMatch("game_over", this.rules.winner);
      }
    }
  }

  private makeSnapshot(): GameSnapshot {
    return {
      tick: this.state.tick,
      serverTimeMs: Date.now(),
      state: this.state
    };
  }

  private broadcast(msg: ServerToClient) {
    this.io.to(this.id).emit(SOCKET_EVENT, msg);
  }

  private emitTo(socket: Socket, msg: ServerToClient) {
    socket.emit(SOCKET_EVENT, msg);
  }

  private endMatch(reason: "game_over" | "forfeit", winner: PlayerIndex | null) {
    if (this.ended) return;
    this.ended = true;

    this.broadcast({
      t: "match/ended",
      roomId: this.id,
      reason,
      winner
    });

    this.stop();
    this.onEnd({ roomId: this.id, reason, winner });
  }
}

