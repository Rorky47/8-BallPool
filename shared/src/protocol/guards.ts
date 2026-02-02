import type { ClientToServer } from "./messages.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

export function isClientToServer(v: unknown): v is ClientToServer {
  if (!isRecord(v) || !isString(v.t)) return false;

  switch (v.t) {
    case "queue/join":
      return !("displayName" in v) || v.displayName === undefined || isString(v.displayName);
    case "queue/leave":
      return true;
    case "match/leave":
      return isString(v.roomId);
    case "match/rematch":
      return isString(v.roomId);
    case "game/aim":
      return (
        isString(v.roomId) &&
        isNumber(v.seq) &&
        isNumber(v.aimAngleRad) &&
        isNumber(v.power01)
      );
    case "game/place_cue":
      return isString(v.roomId) && isNumber(v.seq) && isNumber(v.x) && isNumber(v.y);
    case "game/shoot":
      return (
        isString(v.roomId) &&
        isNumber(v.seq) &&
        isString(v.clientShotId) &&
        isNumber(v.aimAngleRad) &&
        isNumber(v.power01)
      );
    case "ping":
      return isNumber(v.clientTimeMs);
    default:
      return false;
  }
}

