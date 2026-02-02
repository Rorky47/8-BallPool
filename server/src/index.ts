import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import { randomUUID } from "node:crypto";
import {
  PROTOCOL_VERSION,
  isClientToServer,
  type ServerToClient
} from "@eightball/shared";
import { Matchmaker } from "./matchmaking/matchmaker.js";
import { GameRoom } from "./rooms/GameRoom.js";
import { SOCKET_EVENT } from "./net/events.js";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true
  });

  app.get("/health", async () => ({ ok: true }));

  const io = new SocketIOServer(app.server, {
    cors: {
      origin: true,
      methods: ["GET", "POST"]
    }
  });

  const matchmaker = new Matchmaker();
  const rooms = new Map<string, GameRoom>();
  const playerToRoom = new Map<string, string>(); // token -> roomId

  const emit = (socketId: string, msg: ServerToClient) => {
    io.to(socketId).emit(SOCKET_EVENT, msg);
  };

  io.on("connection", (socket) => {
    const auth = socket.handshake.auth as unknown;
    const token =
      typeof auth === "object" &&
      auth !== null &&
      "token" in auth &&
      typeof (auth as { token?: unknown }).token === "string"
        ? (auth as { token: string }).token
        : randomUUID();

    app.log.info({ sid: socket.id, token }, "socket connected");

    socket.emit(SOCKET_EVENT, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      sid: socket.id,
      playerToken: token
    } satisfies ServerToClient);

    // Re-attach to an existing room if present (reconnect).
    const existingRoomId = playerToRoom.get(token);
    if (existingRoomId) {
      const room = rooms.get(existingRoomId);
      if (!room) {
        playerToRoom.delete(token);
      }
      if (room && room.isPlayer(token)) {
        const playerIndex = room.getPlayerIndex(token);
        if (playerIndex !== null) {
          socket.emit(SOCKET_EVENT, {
            t: "match/found",
            roomId: existingRoomId,
            playerIndex
          } satisfies ServerToClient);
        }
        // Attach after match/found so client doesn't miss the initial snapshot.
        room.attachSocket(token, socket);
      }
    }

    socket.on(SOCKET_EVENT, (raw: unknown) => {
      if (!isClientToServer(raw)) {
        socket.emit(SOCKET_EVENT, {
          t: "error",
          code: "bad_message",
          message: "Unrecognized message."
        } satisfies ServerToClient);
        return;
      }

      if (raw.t === "ping") {
        socket.emit(SOCKET_EVENT, {
          t: "pong",
          clientTimeMs: raw.clientTimeMs,
          serverTimeMs: Date.now()
        } satisfies ServerToClient);
        return;
      }

      if (raw.t === "queue/leave") {
        matchmaker.leave(token);
        socket.emit(SOCKET_EVENT, { t: "queue/status", inQueue: false } satisfies ServerToClient);
        return;
      }

      if (raw.t === "queue/join") {
        // Can't queue if already in a room.
        const rid = playerToRoom.get(token);
        if (rid && rooms.has(rid)) {
          const room = rooms.get(rid)!;
          room.attachSocket(token, socket);
          const playerIndex = room.getPlayerIndex(token);
          if (playerIndex !== null) {
            socket.emit(SOCKET_EVENT, {
              t: "match/found",
              roomId: rid,
              playerIndex
            } satisfies ServerToClient);
          }
          return;
        } else if (rid && !rooms.has(rid)) {
          playerToRoom.delete(token);
        }

        const pos = matchmaker.join(token, socket);
        socket.emit(SOCKET_EVENT, { t: "queue/status", inQueue: true, position: pos } satisfies ServerToClient);

        const match = matchmaker.tryPopMatch();
        if (match) {
          const [a, b] = match;
          const roomId = randomUUID();
          const aToken = a.token;
          const bToken = b.token;
          const room = new GameRoom(io, roomId, aToken, bToken, (info) => {
            rooms.delete(info.roomId);
            playerToRoom.delete(aToken);
            playerToRoom.delete(bToken);
            io.in(info.roomId).socketsLeave(info.roomId);
          });
          rooms.set(roomId, room);
          playerToRoom.set(aToken, roomId);
          playerToRoom.set(bToken, roomId);
          room.start();

          emit(a.socket.id, { t: "match/found", roomId, playerIndex: 0 } satisfies ServerToClient);
          emit(b.socket.id, { t: "match/found", roomId, playerIndex: 1 } satisfies ServerToClient);

          // Attach after match/found so the first snapshot arrives after the room is known client-side.
          room.attachSocket(aToken, a.socket);
          room.attachSocket(bToken, b.socket);
        }
        return;
      }

      if (raw.t === "match/leave") {
        const rid = playerToRoom.get(token);
        if (!rid || rid !== raw.roomId) return;
        const room = rooms.get(rid);
        room?.playerLeft(token);
        return;
      }

      if (raw.t === "match/rematch") {
        socket.emit(SOCKET_EVENT, {
          t: "error",
          code: "not_implemented",
          message: "Rematch is not implemented yet."
        } satisfies ServerToClient);
        return;
      }

      // Game commands
      if (raw.t === "game/aim" || raw.t === "game/place_cue" || raw.t === "game/shoot") {
        const roomId = playerToRoom.get(token);
        if (!roomId || roomId !== raw.roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        room.handleCommand(token, raw);
        return;
      }
    });

    socket.on("disconnect", () => {
      app.log.info({ sid: socket.id, token }, "socket disconnected");
      matchmaker.onDisconnect(token);
      const roomId = playerToRoom.get(token);
      const room = roomId ? rooms.get(roomId) : undefined;
      room?.handleDisconnect(token);
    });
  });

  