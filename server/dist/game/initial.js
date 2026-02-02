export const DEFAULT_TABLE = {
    width: 2.84,
    height: 1.42,
    ballRadius: 0.028575,
    pocketRadius: 0.11
};
export function createInitialBalls(table = DEFAULT_TABLE) {
    const r = table.ballRadius;
    const eps = 0.0001;
    const balls = [];
    // Cue ball (0)
    balls.push({
        id: 0,
        pos: { x: table.width * 0.25, y: table.height / 2 },
        vel: { x: 0, y: 0 },
        pocketed: false
    });
    // Triangle rack apex (closest to cue ball)
    const apex = { x: table.width * 0.72, y: table.height / 2 };
    const dx = Math.sqrt(3) * r + eps; // spacing between rows
    const dy = 2 * r + eps; // spacing within row
    const ids = [
        1, 2, 3, 4, 5,
        6, 7, 8, 9,
        10, 11, 12,
        13, 14,
        15
    ];
    let idx = 0;
    for (let row = 0; row < 5; row++) {
        for (let k = 0; k <= row; k++) {
            const y = apex.y + (k - row / 2) * dy;
            const x = apex.x + row * dx;
            balls.push({
                id: ids[idx++],
                pos: { x, y },
                vel: { x: 0, y: 0 },
                pocketed: false
            });
        }
    }
    return balls;
}
export function createInitialGameState(table = DEFAULT_TABLE) {
    return {
        tick: 0,
        phase: "aim",
        currentPlayer: 0,
        table,
        balls: createInitialBalls(table)
    };
}
//# sourceMappingURL=initial.js.map