export function getPocketCenters(table) {
    const w = table.width;
    const h = table.height;
    return [
        { x: 0, y: 0 },
        { x: w / 2, y: 0 },
        { x: w, y: 0 },
        { x: 0, y: h },
        { x: w / 2, y: h },
        { x: w, y: h }
    ];
}
//# sourceMappingURL=table.js.map