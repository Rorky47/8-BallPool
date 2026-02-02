import type { Socket } from "socket.io";

export type QueuedPlayer = {
  token: string;
  socket: Socket;
  joinedAtMs: number;
};

export class Matchmaker {
  private queue: QueuedPlayer[] = [];

  join(token: string, socket: Socket): number {
    // If already queued, update socket reference and return position.
    const existing = this.queue.find((p) => p.token === token);
    if (existing) {
      existing.socket = socket;
      return this.queue.indexOf(existing) + 1;
    }
    this.queue.push({ token, socket, joinedAtMs: Date.now() });
    return this.queue.length;
  }

  leave(token: string) {
    this.queue = this.queue.filter((p) => p.token !== token);
  }

  onDisconnect(token: string) {
    // If a queued player disconnects, remove them.
    this.leave(token);
  }

  tryPopMatch(): [QueuedPlayer, QueuedPlayer] | null {
    if (this.queue.length < 2) return null;
    const a = this.queue.shift()!;
    const b = this.queue.shift()!;
    return [a, b];
  }

  position(token: string): number | null {
    const idx = this.queue.findIndex((p) => p.token === token);
    return idx >= 0 ? idx + 1 : null;
  }
}

