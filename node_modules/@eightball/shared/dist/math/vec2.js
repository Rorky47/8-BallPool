export function v(x, y) {
    return { x, y };
}
export function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
}
export function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
}
export function mul(a, s) {
    return { x: a.x * s, y: a.y * s };
}
export function dot(a, b) {
    return a.x * b.x + a.y * b.y;
}
export function lenSq(a) {
    return dot(a, a);
}
export function len(a) {
    return Math.sqrt(lenSq(a));
}
export function norm(a) {
    const l = len(a);
    if (l === 0)
        return { x: 0, y: 0 };
    return { x: a.x / l, y: a.y / l };
}
//# sourceMappingURL=vec2.js.map