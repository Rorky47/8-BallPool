export class Matchmaker {
    queue = [];
    join(token, socket) {
        // If already queued, update socket reference and return position.
        const existing = this.queue.find((p) => p.token === token);
        if (existing) {
            existing.socket = socket;
            return this.queue.indexOf(existing) + 1;
        }
        this.queue.push({ token, socket, joinedAtMs: Date.now() });
        return this.queue.length;
    }
    leave(token) {
        this.queue = this.queue.filter((p) => p.token !== token);
    }
    onDisconnect(token) {
        // If a queued player disconnects, remove them.
        this.leave(token);
    }
    tryPopMatch() {
        if (this.queue.length < 2)
            return null;
        const a = this.queue.shift();
        const b = this.queue.shift();
        return [a, b];
    }
    position(token) {
        const idx = this.queue.findIndex((p) => p.token === token);
        return idx >= 0 ? idx + 1 : null;
    }
}
//# sourceMappingURL=matchmaker.js.map