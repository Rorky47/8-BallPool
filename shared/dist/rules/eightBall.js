function isSolid(id) {
    return id >= 1 && id <= 7;
}
function isStripe(id) {
    return id >= 9 && id <= 15;
}
function groupOf(id) {
    if (isSolid(id))
        return "solids";
    if (isStripe(id))
        return "stripes";
    return null;
}
function remainingOfGroup(balls, group) {
    return balls.filter((b) => !b.pocketed && groupOf(b.id) === group).length;
}
export function createInitialEightBallRulesState() {
    return {
        groups: [null, null],
        winner: null,
        ballInHandFor: null
    };
}
export function analyzeShot(rules, pre, post, shooter, events) {
    const pocketed = [];
    let firstCueContact = null;
    let anyRail = false;
    for (const e of events) {
        if (e.kind === "ball_pocket")
            pocketed.push(e.ball);
        if (e.kind === "ball_rail")
            anyRail = true;
        if (e.kind === "ball_ball" && firstCueContact === null) {
            if (e.a === 0 && e.b !== 0)
                firstCueContact = e.b;
            else if (e.b === 0 && e.a !== 0)
                firstCueContact = e.a;
        }
    }
    const cuePocketed = pocketed.includes(0);
    const eightPocketed = pocketed.includes(8);
    const myGroup = rules.groups[shooter];
    const opp = shooter === 0 ? 1 : 0;
    const oppGroup = rules.groups[opp];
    let foul = false;
    let foulReason = null;
    // Must contact something (and not the cue itself).
    if (firstCueContact === null) {
        foul = true;
        foulReason = "no_contact";
    }
    // Scratch
    if (!foul && cuePocketed) {
        foul = true;
        foulReason = "scratch";
    }
    // Open table: first contact cannot be the 8.
    if (!foul && myGroup === null && firstCueContact === 8) {
        foul = true;
        foulReason = "hit_8_on_open";
    }
    // Assigned groups: first contact must be your group (or 8 only after you clear).
    if (!foul && myGroup !== null && firstCueContact !== null) {
        const firstGroup = groupOf(firstCueContact);
        const myRemaining = remainingOfGroup(post.balls, myGroup);
        const canHit8 = myRemaining === 0;
        if (firstCueContact === 8 && !canHit8) {
            foul = true;
            foulReason = "hit_8_early";
        }
        else if (firstCueContact !== 8 && firstGroup !== myGroup) {
            foul = true;
            foulReason = "wrong_first_contact";
        }
    }
    // “No rail after contact” approximation: if nothing was pocketed (besides cue) and no rail happened.
    // This is intentionally simplified (we don't currently know timing relative to first contact).
    if (!foul) {
        const pocketedNonCue = pocketed.filter((id) => id !== 0).length;
        if (pocketedNonCue === 0 && !anyRail) {
            foul = true;
            foulReason = "no_rail";
        }
    }
    // Group assignment (if open table and a non-8 ball was pocketed)
    let groupsAfter = rules.groups;
    if (!foul && myGroup === null && oppGroup === null) {
        const firstAssigned = pocketed.find((id) => id !== 0 && id !== 8 && groupOf(id) !== null) ?? null;
        if (firstAssigned !== null) {
            const g = groupOf(firstAssigned);
            groupsAfter = shooter === 0 ? [g, g === "solids" ? "stripes" : "solids"] : [g === "solids" ? "stripes" : "solids", g];
        }
    }
    // 8-ball outcome
    let winner = rules.winner;
    if (!winner && eightPocketed) {
        const g = groupsAfter[shooter];
        const canWin = g !== null && remainingOfGroup(post.balls, g) === 0;
        if (!foul && canWin)
            winner = shooter;
        else
            winner = opp;
    }
    const pocketedAnyObjectBall = pocketed.some((id) => id !== 0);
    const keepTurn = !foul && pocketedAnyObjectBall;
    const nextPlayer = foul || !keepTurn ? opp : shooter;
    const ballInHandFor = foul ? opp : null;
    return {
        shooter,
        foul,
        foulReason,
        firstCueContact,
        pocketed,
        nextPlayer,
        keepTurn,
        groupsAfter,
        winner,
        ballInHandFor
    };
}
//# sourceMappingURL=eightBall.js.map