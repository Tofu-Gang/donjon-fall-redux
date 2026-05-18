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
