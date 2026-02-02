import { add, dot, len, lenSq, mul, norm, sub } from "../math/vec2.js";
import { DEFAULT_PHYSICS_PARAMS } from "./params.js";
import { getPocketCenters } from "./table.js";
function clamp01(x) {
    if (x < 0)
        return 0;
    if (x > 1)
        return 1;
    return x;
}
function applyRollingFriction(v, dt, kPerSec) {
    const k = clamp01(1 - kPerSec * dt);
    return { x: v.x * k, y: v.y * k };
}
function reflectVelocity(v, nInward, restitution) {
    const vn = dot(v, nInward);
    if (vn >= 0)
        return v; // moving away from rail already
    // v' = v - (1+e) * (v·n) * n
    return sub(v, mul(nInward, (1 + restitution) * vn));
}
function pocketAtPoint(p, pocketCenters, pocketRadius) {
    const pr2 = pocketRadius * pocketRadius;
    for (const c of pocketCenters) {
        const d2 = lenSq(sub(p, c));
        if (d2 <= pr2)
            return true;
    }
    return false;
}
function timeOfImpactBallBall(a, b, r, maxT) {
    const dp = sub(b.pos, a.pos);
    const dv = sub(b.vel, a.vel);
    const R = 2 * r;
    const c = dot(dp, dp) - R * R;
    if (c <= 0) {
        // Touching/overlapping at t=0. Only treat as a collision if they are moving toward each other.
        // Otherwise, we'd get endless t=0 "collisions" between stationary touching balls (rack),
        // which prevents time from advancing and looks like balls stick together.
        const n = norm(dp);
        if (n.x === 0 && n.y === 0)
            return null;
        const rel = dot(dv, n); // relative speed along the normal
        if (rel >= 0)
            return null; // separating or stationary along the normal
        return { kind: "ball_ball", t: 0, a: -1, b: -1, n };
    }
    const aQ = dot(dv, dv);
    if (aQ === 0)
        return null;
    const bQ = 2 * dot(dp, dv);
    const disc = bQ * bQ - 4 * aQ * c;
    if (disc < 0)
        return null;
    const sqrtDisc = Math.sqrt(disc);
    const t = (-bQ - sqrtDisc) / (2 * aQ);
    if (t < 0 || t > maxT)
        return null;
    const dpAt = add(dp, mul(dv, t));
    const n = norm(dpAt);
    // Must be approaching along the normal
    const rel = dot(dv, n);
    if (rel >= 0)
        return null;
    return { kind: "ball_ball", t, a: -1, b: -1, n };
}
function findEarliestEvent(balls, table, dt) {
    const r = table.ballRadius;
    const xMin = r;
    const xMax = table.width - r;
    const yMin = r;
    const yMax = table.height - r;
    const pocketCenters = getPocketCenters(table);
    let best = null;
    const consider = (e) => {
        if (e.t < 0 || e.t > dt)
            return;
        if (!best || e.t < best.t)
            best = e;
    };
    // Ball-ball
    for (let i = 0; i < balls.length; i++) {
        const bi = balls[i];
        if (bi.pocketed)
            continue;
        for (let j = i + 1; j < balls.length; j++) {
            const bj = balls[j];
            if (bj.pocketed)
                continue;
            const ev = timeOfImpactBallBall(bi, bj, r, dt);
            if (!ev)
                continue;
            // Fill indices
            consider({ ...ev, a: i, b: j });
        }
    }
    // Ball-rail (with pocket capture at the rail contact point)
    for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (b.pocketed)
            continue;
        // Vertical rails
        if (b.vel.x < 0) {
            const t = (xMin - b.pos.x) / b.vel.x;
            if (t >= 0 && t <= dt) {
                const p = add(b.pos, mul(b.vel, t));
                if (pocketAtPoint(p, pocketCenters, table.pocketRadius)) {
                    consider({ kind: "ball_pocket", t, i });
                }
                else {
                    consider({ kind: "ball_rail", t, i, n: { x: 1, y: 0 } });
                }
            }
        }
        else if (b.vel.x > 0) {
            const t = (xMax - b.pos.x) / b.vel.x;
            if (t >= 0 && t <= dt) {
                const p = add(b.pos, mul(b.vel, t));
                if (pocketAtPoint(p, pocketCenters, table.pocketRadius)) {
                    consider({ kind: "ball_pocket", t, i });
                }
                else {
                    consider({ kind: "ball_rail", t, i, n: { x: -1, y: 0 } });
                }
            }
        }
        // Horizontal rails
        if (b.vel.y < 0) {
            const t = (yMin - b.pos.y) / b.vel.y;
            if (t >= 0 && t <= dt) {
                const p = add(b.pos, mul(b.vel, t));
                if (pocketAtPoint(p, pocketCenters, table.pocketRadius)) {
                    consider({ kind: "ball_pocket", t, i });
                }
                else {
                    consider({ kind: "ball_rail", t, i, n: { x: 0, y: 1 } });
                }
            }
        }
        else if (b.vel.y > 0) {
            const t = (yMax - b.pos.y) / b.vel.y;
            if (t >= 0 && t <= dt) {
                const p = add(b.pos, mul(b.vel, t));
                if (pocketAtPoint(p, pocketCenters, table.pocketRadius)) {
                    consider({ kind: "ball_pocket", t, i });
                }
                else {
                    consider({ kind: "ball_rail", t, i, n: { x: 0, y: -1 } });
                }
            }
        }
    }
    return best;
}
function clampBallToTable(b, table) {
    const r = table.ballRadius;
    const xMin = r;
    const xMax = table.width - r;
    const yMin = r;
    const yMax = table.height - r;
    if (b.pos.x < xMin)
        b.pos.x = xMin;
    if (b.pos.x > xMax)
        b.pos.x = xMax;
    if (b.pos.y < yMin)
        b.pos.y = yMin;
    if (b.pos.y > yMax)
        b.pos.y = yMax;
}
export function stepBallsInPlace(balls, table, dt, params = DEFAULT_PHYSICS_PARAMS) {
    let remaining = dt;
    let collided = false;
    let pocketedAny = false;
    const events = [];
    for (let iter = 0; iter < params.maxSubsteps && remaining > 0; iter++) {
        const ev = findEarliestEvent(balls, table, remaining);
        const t = ev ? ev.t : remaining;
        // Advance all balls
        for (const b of balls) {
            if (b.pocketed)
                continue;
            b.pos = add(b.pos, mul(b.vel, t));
            b.vel = applyRollingFriction(b.vel, t, params.rollingFrictionPerSec);
        }
        remaining -= t;
        if (!ev)
            break;
        collided = true;
        if (ev.kind === "ball_pocket") {
            const b = balls[ev.i];
            b.pocketed = true;
            b.vel = { x: 0, y: 0 };
            pocketedAny = true;
            events.push({ kind: "ball_pocket", ball: b.id });
            continue;
        }
        if (ev.kind === "ball_rail") {
            const b = balls[ev.i];
            b.vel = reflectVelocity(b.vel, ev.n, params.restitutionRail);
            clampBallToTable(b, table);
            events.push({ kind: "ball_rail", ball: b.id });
            continue;
        }
        // ball_ball
        const A = balls[ev.a];
        const B = balls[ev.b];
        events.push({ kind: "ball_ball", a: A.id, b: B.id });
        const n = ev.n;
        const rel = dot(sub(B.vel, A.vel), n);
        if (rel < 0) {
            const j = -0.5 * (1 + params.restitutionBall) * rel; // m=1 for both
            A.vel = sub(A.vel, mul(n, j));
            B.vel = add(B.vel, mul(n, j));
        }
        // Positional correction (tiny) to prevent sticking
        const r = table.ballRadius;
        const dp = sub(B.pos, A.pos);
        const d = len(dp);
        const target = 2 * r;
        if (d > 0 && d < target) {
            const push = (target - d) / 2;
            const nn = mul(dp, 1 / d);
            A.pos = sub(A.pos, mul(nn, push));
            B.pos = add(B.pos, mul(nn, push