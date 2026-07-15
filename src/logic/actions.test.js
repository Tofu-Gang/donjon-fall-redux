import { describe, it, expect } from "vitest";
import { getLegalActions, isGameOver } from "./actions.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeDie(id, q, r, s, stackIndex, owner, faceValue = 3) {
    return { id, coords: { q, r, s }, stackIndex, owner, faceValue, type: "D6" };
}

function makeDice(...dies) {
    return Object.fromEntries(dies.map(d => [d.id, d]));
}

/** Builds a MapHexSet from an array of [q,r,s] tuples. */
function makeMapHexSet(hexes) {
    return new Set(hexes.map(([q, r, s]) => `${q},${r},${s}`));
}

function makeState(overrides = {}) {
    return {
        dice: {},
        players: { red: 0, blue: 0 },
        turnOrder: ["red", "blue"],
        currentTurnIndex: 0,
        turnPhase: "ACTION",
        focalPointsGroups: {},
        turnContext: null,
        ...overrides,
    };
}

// Small 7-hex map: center + 6 neighbors
const CENTER_HEX = [0, 0, 0];
const CENTER_NEIGHBORS = [
    [1, -1, 0], [1, 0, -1], [0, 1, -1],
    [-1, 1, 0], [-1, 0, 1], [0, -1, 1],
];
const SMALL_MAP = makeMapHexSet([CENTER_HEX, ...CENTER_NEIGHBORS]);

// ─── getLegalActions ─────────────────────────────────────────────────────────

describe("getLegalActions", () => {
    it("always includes REROLL for each controlled die", () => {
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 2),
        );
        const actions = getLegalActions(makeState({ dice }), SMALL_MAP);
        const rerolls = actions.filter(a => a.type === "REROLL");
        expect(rerolls).toHaveLength(1);
        expect(rerolls[0].dieId).toBe("r1");
    });

    it("lone die can move to reachable empty hexes within its face value range", () => {
        // Red die at center with faceValue 1 can reach all 6 neighbors (1 step each)
        const dice = makeDice(makeDie("r1", 0, 0, 0, 0, "red", 1));
        const actions = getLegalActions(makeState({ dice }), SMALL_MAP);
        const moves = actions.filter(a => a.type === "MOVE_DIE" && a.dieId === "r1");
        expect(moves).toHaveLength(6);
        expect(moves.every(m => m.path.length === 2)).toBe(true);
        expect(moves.every(m => m.path[0].q === 0)).toBe(true);
    });

    it("die cannot move to hexes beyond its range", () => {
        // Die at center with faceValue 1 in a larger map; only immediate neighbors reachable
        const largeMap = makeMapHexSet([
            CENTER_HEX, ...CENTER_NEIGHBORS,
            [2, -2, 0], [2, -1, -1], [2, 0, -2],
        ]);
        const dice = makeDice(makeDie("r1", 0, 0, 0, 0, "red", 1));
        const actions = getLegalActions(makeState({ dice }), largeMap);
        const moves = actions.filter(a => a.type === "MOVE_DIE");
        expect(moves.every(m => m.path.length === 2)).toBe(true);
    });

    it("die can attack enemy if its combat power exceeds enemy combat power", () => {
        // Red die (faceValue 3, cp 3) at center; blue die (faceValue 2, cp 2) at neighbor
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("b1", 1, -1, 0, 0, "blue", 2),
        );
        const actions = getLegalActions(makeState({ dice }), SMALL_MAP);
        const attack = actions.filter(a => a.type === "MOVE_DIE" && a.dieId === "r1")
            .find(a => a.path[a.path.length - 1].q === 1);
        expect(attack).toBeDefined();
    });

    it("die cannot attack enemy with equal or greater combat power", () => {
        // Red (cp 2) cannot attack blue (cp 3)
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 2),
            makeDie("b1", 1, -1, 0, 0, "blue", 3),
        );
        const actions = getLegalActions(makeState({ dice }), SMALL_MAP);
        const attack = actions.filter(a => a.type === "MOVE_DIE" && a.dieId === "r1")
            .find(a => {
                const dest = a.path[a.path.length - 1];
                return dest.q === 1 && dest.r === -1 && dest.s === 0;
            });
        expect(attack).toBeUndefined();
    });

    it("die cannot pass through enemy dice", () => {
        // Red (faceValue 6) at center; blue at [1,-1,0]; can red reach [2,-2,0]?
        const map = makeMapHexSet([CENTER_HEX, ...CENTER_NEIGHBORS, [2, -2, 0]]);
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 6),
            makeDie("b1", 1, -1, 0, 0, "blue", 2),
        );
        const actions = getLegalActions(makeState({ dice }), map);
        const moves = actions.filter(a => a.type === "MOVE_DIE" && a.dieId === "r1");
        const canReach = moves.some(m => {
            const dest = m.path[m.path.length - 1];
            return dest.q === 2 && dest.r === -2;
        });
        expect(canReach).toBe(false);
    });

    it("die can pass through weaker friendly die/tower", () => {
        // Red (faceValue 4, cp 4) at center; friendly red (faceValue 2) at [1,-1,0]
        // The passing die cp (4) > friendly cp (2), so can pass through to [2,-2,0]
        const map = makeMapHexSet([CENTER_HEX, ...CENTER_NEIGHBORS, [2, -2, 0]]);
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 4),
            makeDie("r2", 1, -1, 0, 0, "red", 2),
        );
        const actions = getLegalActions(makeState({ dice }), map);
        const moves = actions.filter(a => a.type === "MOVE_DIE" && a.dieId === "r1");
        const canReach = moves.some(m => {
            const dest = m.path[m.path.length - 1];
            return dest.q === 2 && dest.r === -2;
        });
        expect(canReach).toBe(true);
    });

    it("die cannot pass through stronger friendly die/tower", () => {
        const map = makeMapHexSet([CENTER_HEX, ...CENTER_NEIGHBORS, [2, -2, 0]]);
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 2),
            makeDie("r2", 1, -1, 0, 0, "red", 4),
        );
        const actions = getLegalActions(makeState({ dice }), map);
        const moves = actions.filter(a => a.type === "MOVE_DIE" && a.dieId === "r1");
        const canReach = moves.some(m => {
            const dest = m.path[m.path.length - 1];
            return dest.q === 2 && dest.r === -2;
        });
        expect(canReach).toBe(false);
    });

    it("tower top die uses face value (not combat power) as movement range", () => {
        // Red tower: faceValue 1 on top (combat power = 1+1=2 with 1 support)
        // Movement range for jumping = face value = 1, not combat power 2
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3), // bottom (support)
            makeDie("r2", 0, 0, 0, 1, "red", 1), // top: faceValue 1
        );
        const map = makeMapHexSet([CENTER_HEX, ...CENTER_NEIGHBORS, [2, -2, 0]]);
        const actions = getLegalActions(makeState({ dice }), map);
        const moves = actions.filter(a => a.type === "MOVE_DIE" && a.dieId === "r2");
        // With range 1, can only reach immediate neighbors
        expect(moves.every(m => m.path.length === 2)).toBe(true);
        const canReach2 = moves.some(m => {
            const dest = m.path[m.path.length - 1];
            return dest.q === 2 && dest.r === -2;
        });
        expect(canReach2).toBe(false);
    });

    it("generates MOVE_TOWER for a tower with correct range", () => {
        // Red tower: 2 own dice, 0 enemy → tower range = max(2-0,1) = 2
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 3),
        );
        const actions = getLegalActions(makeState({ dice }), SMALL_MAP);
        const towerMoves = actions.filter(a => a.type === "MOVE_TOWER");
        expect(towerMoves.length).toBeGreaterThan(0);
        // All tower moves should start from the tower hex
        expect(towerMoves.every(m => m.coords.q === 0 && m.coords.r === 0)).toBe(true);
    });

    it("tower cannot pass through friendly dice", () => {
        // Red tower at center; friendly red die at [1,-1,0]; can tower reach [2,-2,0]?
        const map = makeMapHexSet([CENTER_HEX, ...CENTER_NEIGHBORS, [2, -2, 0]]);
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 3),
            makeDie("r3", 1, -1, 0, 0, "red", 1),
        );
        const actions = getLegalActions(makeState({ dice }), map);
        const towerMoves = actions.filter(a => a.type === "MOVE_TOWER");
        const canReach = towerMoves.some(m => {
            const dest = m.path[m.path.length - 1];
            return dest.q === 2 && dest.r === -2;
        });
        expect(canReach).toBe(false);
    });

    it("generates TOWER_COLLAPSE only for towers with 3+ dice", () => {
        const dice2 = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 3),
        );
        const dice3 = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 3),
            makeDie("r3", 0, 0, 0, 2, "red", 3),
        );
        const actions2 = getLegalActions(makeState({ dice: dice2 }), SMALL_MAP);
        const actions3 = getLegalActions(makeState({ dice: dice3 }), SMALL_MAP);
        expect(actions2.filter(a => a.type === "TOWER_COLLAPSE")).toHaveLength(0);
        expect(actions3.filter(a => a.type === "TOWER_COLLAPSE")).toHaveLength(1);
    });

    it("only includes actions for the current player's controlled dice", () => {
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("b1", 1, -1, 0, 0, "blue", 3),
        );
        // red's turn
        const actions = getLegalActions(makeState({ dice, currentTurnIndex: 0 }), SMALL_MAP);
        expect(actions.filter(a => a.dieId === "b1" || (a.coords && a.coords.q === 1))).toHaveLength(0);
    });

    it("non-top tower dice generate no actions", () => {
        // r1 is bottom of tower (not controlled), r2 is top
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 3),
        );
        const actions = getLegalActions(makeState({ dice }), SMALL_MAP);
        expect(actions.some(a => a.dieId === "r1")).toBe(false);
    });

    // ─── jump-from-tower: per-destination combat power rule ─────────────────

    function hasMoveTo(actions, dieId, target) {
        return actions.some(a =>
            a.type === "MOVE_DIE" && a.dieId === dieId
            && a.path[a.path.length - 1].q === target.q
            && a.path[a.path.length - 1].r === target.r
            && a.path[a.path.length - 1].s === target.s
        );
    }

    it("jump from tower: uses tower CP for attacks within the tower's retained range", () => {
        // Red tower: r1 (face 3) below, r2 (face 4) on top → tower CP = 4+1 = 5, tower range = 2.
        // Blue lone die (face 3) at H1: distance 1 ≤ tower range 2, effective CP = 5 > 3 → attack legal.
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 4),
            makeDie("b1", 1, -1, 0, 0, "blue", 3),
        );
        const actions = getLegalActions(makeState({ dice }), SMALL_MAP);
        expect(hasMoveTo(actions, "r2", { q: 1, r: -1, s: 0 })).toBe(true);
    });

    it("jump from tower: reverts to face value CP once path leaves the retained range", () => {
        // Red tower: 2 dice, top face 4 → tower CP = 5, tower range = 2.
        // Blue lone die (face 4) at H3: distance 3 > tower range 2, effective CP = 4 = 4 → no attack.
        // A linear path H0 → H1 → H2 → H3 needs only 3 hexes, all on the same map.
        const map = makeMapHexSet([CENTER_HEX, ...CENTER_NEIGHBORS,
            [2, -2, 0], [3, -3, 0]]);
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 4),
            makeDie("b1", 3, -3, 0, 0, "blue", 4),
        );
        const actions = getLegalActions(makeState({ dice }), map);
        // The die has movement range 4 (face value), so it can reach H3 by distance, but the
        // attack is illegal because effective CP outside tower range = face value 4, not tower CP 5.
        expect(hasMoveTo(actions, "r2", { q: 3, r: -3, s: 0 })).toBe(false);
    });

    it("jump from tower: can attack weaker enemy beyond retained range when face value still wins", () => {
        // Same setup, but blue die (face 3) at H3: effective CP = 4 > 3 → attack legal.
        const map = makeMapHexSet([CENTER_HEX, ...CENTER_NEIGHBORS,
            [2, -2, 0], [3, -3, 0]]);
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 4),
            makeDie("b1", 3, -3, 0, 0, "blue", 3),
        );
        const actions = getLegalActions(makeState({ dice }), map);
        expect(hasMoveTo(actions, "r2", { q: 3, r: -3, s: 0 })).toBe(true);
    });

    it("jump from tower: attack within retained range still works (no regression)", () => {
        // Red tower: 2 dice, top face 5 → tower CP = 5+1 = 6, tower range = 2.
        // Blue (face 4) at H2: distance 2 = tower range 2, effective CP = 6 > 4 → attack legal.
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 5),
            makeDie("b1", 2, -2, 0, 0, "blue", 4),
        );
        const actions = getLegalActions(makeState({ dice }), makeMapHexSet([CENTER_HEX, ...CENTER_NEIGHBORS, [2, -2, 0]]));
        expect(hasMoveTo(actions, "r2", { q: 2, r: -2, s: 0 })).toBe(true);
    });

    it("lone die jump: equal face values cannot attack at distance 4", () => {
        // Lone red die (face 4); blue die (face 4) at H4 → 4 vs 4 → no attack.
        const map = makeMapHexSet([
            [0, 0, 0], [1, -1, 0], [2, -2, 0], [3, -3, 0], [4, -4, 0],
        ]);
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 4),
            makeDie("b1", 4, -4, 0, 0, "blue", 4),
        );
        const actions = getLegalActions(makeState({ dice }), map);
        expect(hasMoveTo(actions, "r1", { q: 4, r: -4, s: 0 })).toBe(false);
    });

    it("passing through friendly mid-move: stacks landing bonus for later attacks", () => {
        // Lone red (face 4) at H0; friendly (face 2) at H1; enemy (face 3) at H2.
        // Arrive H1 with CP 4 > 2; append bonus +1 range 2. At H2: CP 5 > 3 → attack legal.
        const map = makeMapHexSet([CENTER_HEX, [1, -1, 0], [2, -2, 0]]);
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 4),
            makeDie("r2", 1, -1, 0, 0, "red", 2),
            makeDie("b1", 2, -2, 0, 0, "blue", 3),
        );
        const actions = getLegalActions(makeState({ dice }), map);
        expect(hasMoveTo(actions, "r1", { q: 2, r: -2, s: 0 })).toBe(true);
    });

    it("passing through friendly mid-move: stacked bonus can enable an otherwise illegal attack", () => {
        // Face 3 cannot beat enemy 3 alone; after stacking on friendly face 1 → CP 4 > 3.
        const map = makeMapHexSet([CENTER_HEX, [1, -1, 0], [2, -2, 0]]);
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 1, -1, 0, 0, "red", 1),
            makeDie("b1", 2, -2, 0, 0, "blue", 3),
        );
        const actions = getLegalActions(makeState({ dice }), map);
        expect(hasMoveTo(actions, "r1", { q: 2, r: -2, s: 0 })).toBe(true);
    });

    it("chained towers: partial range falloff keeps earlier tower bonus", () => {
        // H0:[6] H1:[1,1,1] H2:[1] then empty. At H5 only T1 (+3) remains → CP 9.
        // Enemy face 8 at H5 → 9 > 8 attack legal; at H6 CP 6 → 6 > 8 false.
        const map = makeMapHexSet([
            [0, 0, 0], [1, -1, 0], [2, -2, 0], [3, -3, 0],
            [4, -4, 0], [5, -5, 0], [6, -6, 0],
        ]);
        const diceNear = makeDice(
            makeDie("r6", 0, 0, 0, 0, "red", 6),
            makeDie("t1", 1, -1, 0, 0, "red", 1),
            makeDie("t2", 1, -1, 0, 1, "red", 1),
            makeDie("t3", 1, -1, 0, 2, "red", 1),
            makeDie("t4", 2, -2, 0, 0, "red", 1),
            makeDie("b1", 5, -5, 0, 0, "blue", 8),
        );
        expect(hasMoveTo(getLegalActions(makeState({ dice: diceNear }), map), "r6", { q: 5, r: -5, s: 0 })).toBe(true);

        const diceFar = makeDice(
            makeDie("r6", 0, 0, 0, 0, "red", 6),
            makeDie("t1", 1, -1, 0, 0, "red", 1),
            makeDie("t2", 1, -1, 0, 1, "red", 1),
            makeDie("t3", 1, -1, 0, 2, "red", 1),
            makeDie("t4", 2, -2, 0, 0, "red", 1),
            makeDie("b1", 6, -6, 0, 0, "blue", 8),
        );
        expect(hasMoveTo(getLegalActions(makeState({ dice: diceFar }), map), "r6", { q: 6, r: -6, s: 0 })).toBe(false);
    });

    it("can pass through a friendly tower using retained starting-tower CP", () => {
        // Red tower CP 5 at H0; friendly tower CP 3 at H1; need 5 > 3 to pass.
        const map = makeMapHexSet([CENTER_HEX, [1, -1, 0], [2, -2, 0]]);
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 4),
            makeDie("f1", 1, -1, 0, 0, "red", 1),
            makeDie("f2", 1, -1, 0, 1, "red", 2),
        );
        // Friendly tower top face 2 + 1 support = 3. Arrive with CP 5 > 3.
        const actions = getLegalActions(makeState({ dice }), map);
        expect(hasMoveTo(actions, "r2", { q: 1, r: -1, s: 0 })).toBe(true);
        expect(hasMoveTo(actions, "r2", { q: 2, r: -2, s: 0 })).toBe(true);
    });

    it("stacked bonuses required: face / single-tower alone cannot beat blue CP 7", () => {
        // H0:[4] H1:[1,1,1](+3,r4) H2:[1](+1,r2) H3:blue[1,1,5] CP 7.
        // Both in range → 4+3+1 = 8 > 7.
        // Face 4, T1-only 7, T2-only 5 — none beat 7.
        const map = makeMapHexSet([
            [0, 0, 0], [1, -1, 0], [2, -2, 0], [3, -3, 0],
        ]);
        const dice = makeDice(
            makeDie("r4", 0, 0, 0, 0, "red", 4),
            makeDie("t1", 1, -1, 0, 0, "red", 1),
            makeDie("t2", 1, -1, 0, 1, "red", 1),
            makeDie("t3", 1, -1, 0, 2, "red", 1),
            makeDie("t4", 2, -2, 0, 0, "red", 1),
            makeDie("b1", 3, -3, 0, 0, "blue", 1),
            makeDie("b2", 3, -3, 0, 1, "blue", 1),
            makeDie("b3", 3, -3, 0, 2, "blue", 5),
        );
        const actions = getLegalActions(makeState({ dice }), map);
        expect(hasMoveTo(actions, "r4", { q: 3, r: -3, s: 0 })).toBe(true);

        // No second pass-through: only T1 → CP 7, 7 > 7 is false.
        const diceNoSecond = makeDice(
            makeDie("r4", 0, 0, 0, 0, "red", 4),
            makeDie("t1", 1, -1, 0, 0, "red", 1),
            makeDie("t2", 1, -1, 0, 1, "red", 1),
            makeDie("t3", 1, -1, 0, 2, "red", 1),
            makeDie("b1", 3, -3, 0, 0, "blue", 1),
            makeDie("b2", 3, -3, 0, 1, "blue", 1),
            makeDie("b3", 3, -3, 0, 2, "blue", 5),
        );
        const withoutStack = getLegalActions(makeState({ dice: diceNoSecond }), map);
        expect(hasMoveTo(withoutStack, "r4", { q: 3, r: -3, s: 0 })).toBe(false);
    });
});

// ─── isGameOver ──────────────────────────────────────────────────────────────

describe("isGameOver", () => {
    it("returns no winner when game is not over", () => {
        const dice = makeDice(makeDie("r1", 0, 0, 0, 0, "red", 3));
        const state = makeState({ dice, players: { red: 2, blue: 1 } });
        const result = isGameOver(state, SMALL_MAP, 5);
        expect(result.winner).toBeNull();
        expect(result.reason).toBeNull();
    });

    it("detects score win when a player reaches the target", () => {
        const dice = makeDice(makeDie("r1", 0, 0, 0, 0, "red", 3));
        const state = makeState({ dice, players: { red: 5, blue: 2 } });
        const result = isGameOver(state, SMALL_MAP, 5);
        expect(result.winner).toBe("red");
        expect(result.reason).toBe("SCORE");
    });

    it("detects sudden death when current player has no legal actions", () => {
        // Red die surrounded on all sides by stronger blue dice — cannot move or attack
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 1),
            ...CENTER_NEIGHBORS.map(([q, r, s], i) =>
                makeDie(`b${i}`, q, r, s, 0, "blue", 6)
            ),
        );
        const state = makeState({ dice });
        const result = isGameOver(state, SMALL_MAP, 5);
        // Red can still reroll, so not sudden death
        expect(result.reason).not.toBe("SUDDEN_DEATH");
    });

    it("detects sudden death only when truly no actions exist", () => {
        // Empty dice for red player on their turn → no controlled dice → no actions
        const state = makeState({ dice: {}, players: { red: 0, blue: 0 } });
        const result = isGameOver(state, SMALL_MAP, 5);
        expect(result.reason).toBe("SUDDEN_DEATH");
        expect(result.winner).toBe("blue");
    });
});
