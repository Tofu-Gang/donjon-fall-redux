import { describe, it, expect, vi } from "vitest";
import {
    buildInitialState,
    buildMapHexSet,
    applyGameAction,
    applyCombatResolution,
    createReducer,
} from "./gameReducer.js";
import mapDataDefault from "../maps/default.json";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeDie(id, q, r, s, stackIndex, owner, faceValue = 3) {
    return { id, coords: { q, r, s }, stackIndex, owner, faceValue };
}

function makeDice(...dies) {
    return Object.fromEntries(dies.map(d => [d.id, d]));
}

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
        pendingCombat: null,
        actionTaken: false,
        victoryPointsTarget: 5,
        ...overrides,
    };
}

const SMALL_MAP = makeMapHexSet([
    [0, 0, 0],
    [1, -1, 0], [1, 0, -1], [0, 1, -1],
    [-1, 1, 0], [-1, 0, 1], [0, -1, 1],
]);

// ─── buildMapHexSet ──────────────────────────────────────────────────────────

describe("buildMapHexSet", () => {
    it("includes all traversable, base, and focal point hexes", () => {
        const set = buildMapHexSet(mapDataDefault);
        // default map is a radius-4 hexagon: 61 traversable + base + focal hexes
        expect(set.size).toBeGreaterThan(60);
    });

    it("returns hex keys in q,r,s format", () => {
        const set = buildMapHexSet(mapDataDefault);
        const firstKey = [...set][0];
        expect(firstKey).toMatch(/^-?\d+,-?\d+,-?\d+$/);
    });
});

// ─── buildInitialState ───────────────────────────────────────────────────────

describe("buildInitialState", () => {
    it("starts with correct players and score", () => {
        const state = buildInitialState(mapDataDefault, false);
        expect(state.players).toEqual({ red: 0, blue: 0 });
    });

    it("starts in FOCAL phase", () => {
        const state = buildInitialState(mapDataDefault, false);
        expect(state.turnPhase).toBe("FOCAL");
    });

    it("places dice for both players", () => {
        const state = buildInitialState(mapDataDefault, false);
        const ids = Object.keys(state.dice);
        expect(ids.some(id => id.startsWith("red-"))).toBe(true);
        expect(ids.some(id => id.startsWith("blue-"))).toBe(true);
    });

    it("mirrors face values between red and blue", () => {
        const state = buildInitialState(mapDataDefault, false);
        const redDice = Object.values(state.dice).filter(d => d.owner === "red");
        const blueDice = Object.values(state.dice).filter(d => d.owner === "blue");
        // Sorted by their hex index suffix so we compare matching positions
        redDice.sort((a, b) => a.id.localeCompare(b.id));
        blueDice.sort((a, b) => a.id.localeCompare(b.id));
        expect(redDice.length).toBe(blueDice.length);
        redDice.forEach((red, i) => {
            expect(red.faceValue).toBe(blueDice[i].faceValue);
        });
    });

    it("uses rollFn when randomizeDice is true", () => {
        const rollFn = vi.fn().mockReturnValue(6);
        const state = buildInitialState(mapDataDefault, true, rollFn);
        expect(rollFn).toHaveBeenCalled();
        const redDice = Object.values(state.dice).filter(d => d.owner === "red");
        redDice.forEach(d => expect(d.faceValue).toBe(6));
    });

    it("uses preset face values when randomizeDice is false", () => {
        const rollFn = vi.fn();
        buildInitialState(mapDataDefault, false, rollFn);
        expect(rollFn).not.toHaveBeenCalled();
    });
});

// ─── applyGameAction ─────────────────────────────────────────────────────────

describe("applyGameAction — REROLL", () => {
    it("keeps higher of rolled and original value", () => {
        const dice = makeDice(makeDie("r1", 0, 0, 0, 0, "red", 4));
        const state = makeState({ dice });
        // roll returns 2 → max(2, 4) = 4 (no change)
        const next = applyGameAction(state, { type: "REROLL", dieId: "r1" }, () => 2);
        expect(next.dice["r1"].faceValue).toBe(4);
        expect(next.actionTaken).toBe(true);
    });

    it("updates face value when roll is higher", () => {
        const dice = makeDice(makeDie("r1", 0, 0, 0, 0, "red", 2));
        const state = makeState({ dice });
        const next = applyGameAction(state, { type: "REROLL", dieId: "r1" }, () => 5);
        expect(next.dice["r1"].faceValue).toBe(5);
    });
});

describe("applyGameAction — TOWER_COLLAPSE", () => {
    it("removes the bottom die from the stack", () => {
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 3),
        );
        const state = makeState({ dice });
        const next = applyGameAction(state, { type: "TOWER_COLLAPSE", coords: { q: 0, r: 0, s: 0 } });
        expect(next.dice["r1"]).toBeUndefined();
        expect(next.dice["r2"]).toBeDefined();
    });

    it("awards 1 point for destroying an enemy bottom die", () => {
        const dice = makeDice(
            makeDie("b1", 0, 0, 0, 0, "blue", 3),
            makeDie("r1", 0, 0, 0, 1, "red", 3),
        );
        const state = makeState({ dice });
        const next = applyGameAction(state, { type: "TOWER_COLLAPSE", coords: { q: 0, r: 0, s: 0 } });
        expect(next.players.red).toBe(1);
        expect(next.dice["b1"]).toBeUndefined();
    });

    it("does not award points for destroying own bottom die", () => {
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 3),
        );
        const state = makeState({ dice });
        const next = applyGameAction(state, { type: "TOWER_COLLAPSE", coords: { q: 0, r: 0, s: 0 } });
        expect(next.players.red).toBe(0);
    });
});

describe("applyGameAction — MOVE_DIE", () => {
    it("moves a lone die to an empty target hex", () => {
        const dice = makeDice(makeDie("r1", 0, 0, 0, 0, "red", 3));
        const state = makeState({ dice });
        const next = applyGameAction(state, {
            type: "MOVE_DIE",
            dieId: "r1",
            path: [{ q: 0, r: 0, s: 0 }, { q: 1, r: -1, s: 0 }],
        });
        expect(next.dice["r1"].coords).toEqual({ q: 1, r: -1, s: 0 });
        expect(next.actionTaken).toBe(true);
    });

    it("transitions to COMBAT phase when moving into an enemy hex", () => {
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("b1", 1, -1, 0, 0, "blue", 3),
        );
        const state = makeState({ dice });
        const next = applyGameAction(state, {
            type: "MOVE_DIE",
            dieId: "r1",
            path: [{ q: 0, r: 0, s: 0 }, { q: 1, r: -1, s: 0 }],
        });
        expect(next.turnPhase).toBe("COMBAT");
        expect(next.pendingCombat).toMatchObject({
            attackerDieId: "r1",
            defenderCoords: { q: 1, r: -1, s: 0 },
            isTowerAttack: false,
        });
        // Attacker has NOT moved yet
        expect(next.dice["r1"].coords).toEqual({ q: 0, r: 0, s: 0 });
    });
});

describe("applyGameAction — MOVE_TOWER", () => {
    it("moves all dice in the tower to the target hex", () => {
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 4),
        );
        const state = makeState({ dice });
        const next = applyGameAction(state, {
            type: "MOVE_TOWER",
            coords: { q: 0, r: 0, s: 0 },
            path: [{ q: 0, r: 0, s: 0 }, { q: 1, r: -1, s: 0 }],
        });
        expect(next.dice["r1"].coords).toEqual({ q: 1, r: -1, s: 0 });
        expect(next.dice["r2"].coords).toEqual({ q: 1, r: -1, s: 0 });
    });

    it("transitions to COMBAT with isTowerAttack:true when moving into an enemy hex", () => {
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 4),
            makeDie("b1", 1, -1, 0, 0, "blue", 3),
        );
        const state = makeState({ dice });
        const next = applyGameAction(state, {
            type: "MOVE_TOWER",
            coords: { q: 0, r: 0, s: 0 },
            path: [{ q: 0, r: 0, s: 0 }, { q: 1, r: -1, s: 0 }],
        });
        expect(next.turnPhase).toBe("COMBAT");
        expect(next.pendingCombat.isTowerAttack).toBe(true);
    });
});

// ─── applyCombatResolution ───────────────────────────────────────────────────

describe("applyCombatResolution — OCCUPY", () => {
    it("places the attacker on top of the defender stack and clears pendingCombat", () => {
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("b1", 1, -1, 0, 0, "blue", 3),
        );
        const state = makeState({
            dice,
            turnPhase: "COMBAT",
            pendingCombat: {
                attackerDieId: "r1",
                attackerCoords: { q: 0, r: 0, s: 0 },
                defenderCoords: { q: 1, r: -1, s: 0 },
                isTowerAttack: false,
            },
        });
        const next = applyCombatResolution(state, "OCCUPY", SMALL_MAP, () => 3);
        expect(next.turnPhase).toBe("ACTION");
        expect(next.pendingCombat).toBeNull();
        expect(next.dice["r1"].coords).toEqual({ q: 1, r: -1, s: 0 });
        expect(next.dice["r1"].stackIndex).toBeGreaterThan(next.dice["b1"].stackIndex);
    });
});

describe("applyCombatResolution — PUSH", () => {
    it("clears pendingCombat and returns to ACTION phase", () => {
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("b1", 1, -1, 0, 0, "blue", 3),
        );
        const state = makeState({
            dice,
            turnPhase: "COMBAT",
            pendingCombat: {
                attackerDieId: "r1",
                attackerCoords: { q: 0, r: 0, s: 0 },
                defenderCoords: { q: 1, r: -1, s: 0 },
                isTowerAttack: false,
            },
        });
        const next = applyCombatResolution(state, "PUSH", SMALL_MAP, () => 3);
        expect(next.turnPhase).toBe("ACTION");
        expect(next.pendingCombat).toBeNull();
    });

    it("scores a point when the pushed die goes off the map", () => {
        // b1 is at the edge — push direction takes it off the map
        const dice = makeDice(
            makeDie("r1", 0, -1, 1, 0, "red", 3),
            makeDie("b1", 0, 0, 0, 0, "blue", 3),
        );
        // Map only contains these two hexes, so b1 gets pushed off
        const tinyMap = makeMapHexSet([[0, -1, 1], [0, 0, 0]]);
        const state = makeState({
            dice,
            turnPhase: "COMBAT",
            pendingCombat: {
                attackerDieId: "r1",
                attackerCoords: { q: 0, r: -1, s: 1 },
                defenderCoords: { q: 0, r: 0, s: 0 },
                isTowerAttack: false,
            },
        });
        const next = applyCombatResolution(state, "PUSH", tinyMap, () => 3);
        expect(next.players.red).toBe(1);
        expect(next.dice["b1"]).toBeUndefined();
    });
});

// ─── createReducer ───────────────────────────────────────────────────────────

describe("createReducer — END_TURN", () => {
    it("advances currentTurnIndex and resets turnPhase to FOCAL", () => {
        const reducer = createReducer(SMALL_MAP);
        const state = makeState({ currentTurnIndex: 0, turnPhase: "ACTION", actionTaken: true });
        const next = reducer(state, { type: "END_TURN" });
        expect(next.currentTurnIndex).toBe(1);
        expect(next.turnPhase).toBe("FOCAL");
        expect(next.actionTaken).toBe(false);
    });

    it("wraps turn index back to 0 after the last player", () => {
        const reducer = createReducer(SMALL_MAP);
        const state = makeState({ currentTurnIndex: 1, turnPhase: "ACTION" });
        const next = reducer(state, { type: "END_TURN" });
        expect(next.currentTurnIndex).toBe(0);
    });
});

describe("createReducer — unknown action", () => {
    it("returns state unchanged", () => {
        const reducer = createReducer(SMALL_MAP);
        const state = makeState();
        expect(reducer(state, { type: "UNKNOWN" })).toBe(state);
    });
});