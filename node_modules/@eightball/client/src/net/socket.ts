import { io, type Socket } from "socket.io-client";
import type { ClientToServer, ServerToClient } from "@eightball/shared";

const TOKEN_KEY = "eightball.playerToken";
const DEFAULT_SERVER_URL = "http://localhost:3001";
const EVENT = "msg";

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

let socketSingleton: Socket | null = null;

export function getSocket(): Socket {
  if (socketSingleton) return socketSingleton;

  const serverUrl = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? DEFAULT_SERVER_URL;
  const token = loadToken();

  const s = io(serverUrl, {
    autoConnect: false,
    transports: ["websocket"],
    auth: token ? { token } : {}
  });

  s.on(EVENT, (msg: ServerToClient) => {
    if (msg.t === "hello" && typeof msg.playerToken === "string") {
      saveToken(msg.playerToken);
      // Ensure future reconnects use the latest token.
      s.auth = { token: msg.playerToken };
    }
  });

  socketSingleton = s;
  return s;
}

export function onServerMessage(handler: (msg: ServerToClient) => void): () => void {
  const s = getSocket();
  const listener = (msg: ServerToClient) => handler(msg);
  s.on(EVENT, listener);
  return () => {
    s.off(EVENT, listener);
  };
}

export function send(msg: ClientToServer) {
  getSocket().emit(EVENT, msg);
}

