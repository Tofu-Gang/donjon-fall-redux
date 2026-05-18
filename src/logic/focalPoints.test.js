import { describe, it, expect } from "vitest";
import { evaluateFocalPoints, rotateFocalGroup } from "./focalPoints.js";

// ─── helpers ───────────────────────────────────────────────────────────────

function makeDie(id, q, r, s, stackIndex, owner, faceValue = 3) {
    return { id, coords: { q, r, s }, stackIndex, owner, faceValue, type: "D6" };
}

function makeDice(...dies) {
    return Object.fromEntries(dies.map(d => [d.id, d]));
}

function makeFP(q, r, s, isActive) {
    return { coords: { q, r, s }, isActive };
}

function makeState(overrides = {}) {
    return {
        dice: {},
        players: { red: 0, blue: 0 },
        turnOrder: ["red", "blue"],
        currentTurnIndex: 0,
        turnPhase: "FOCAL",
        focalPointsGroups: {},
        turnContext: null,
        ...overrides,
    };
}

const roll = val => () => val;

// ─── rotateFocalGroup ──────────────────────────────────────────────────────

describe("rotateFocalGroup", () => {
    it("scored focal point becomes passive and one passive becomes active", () => {
        const group = [
            makeFP(-3, 0, 3, false),
            makeFP(0, 0, 0, true),
            makeFP(3, 0, -3, false),
        ];
        const rotated = rotateFocalGroup(group, [group[1]]);
        expect(rotated.filter(fp => fp.isActive)).toHaveLength(1);
        expect(rotated.filter(fp => !fp.isActive)).toHaveLength(2);
        expect(rotated[1].isActive).toBe(false);
        expect(rotated[0].isActive || rotated[2].isActive).toBe(true);
    });

    it("works with two-element group", () => {
        const group = [makeFP(0, 0, 0, true), makeFP(1, 0, -1, false)];
        const rotated = rotateFocalGroup(group, [group[0]]);
        expect(rotated[0].isActive).toBe(false);
        expect(rotated[1].isActive).toBe(true);
    });

    it("only deactivates the scored focal point when multiple are active", () => {
        const group = [
            makeFP(-3, 0, 3, true),
            makeFP(0, 0, 0, true),
            makeFP(3, 0, -3, false),
        ];
        const rotated = rotateFocalGroup(group, [group[0]]);
        expect(rotated[0].isActive).toBe(false);
        expect(rotated[1].isActive).toBe(true);
        expect(rotated[2].isActive).toBe(true);
    });

    it("applies rotations sequentially when multiple are scored — active count preserved", () => {
        // group: FP0(active), FP1(active), FP2(passive), FP3(passive)
        // Net result: still 2 active; at least one of FP2/FP3 must be active.
        const group = [
            makeFP(0, 0, 0, true),
            makeFP(1, 0, -1, true),
            makeFP(2, 0, -2, false),
            makeFP(3, 0, -3, false),
        ];
        const rotated = rotateFocalGroup(group, [group[0], group[1]]);
        expect(rotated.filter(fp => fp.isActive)).toHaveLength(2);
        expect(rotated[2].isActive || rotated[3].isActive).toBe(true);
    });

    it("preserves active count when passives are scarce (sequential re-promotion)", () => {
        // group: FP0(active), FP1(active), FP2(passive) — only one passive available.
        // Rotation 1: FP0 → passive, FP2 → active. Pool now: [FP0].
        // Rotation 2: FP1 → passive, FP0 re-promoted → active. Active count stays at 2.
        const group = [
            makeFP(0, 0, 0, true),
            makeFP(1, 0, -1, true),
            makeFP(2, 0, -2, false),
        ];
        const rotated = rotateFocalGroup(group, [group[0], group[1]]);
        expect(rotated.filter(fp => fp.isActive)).toHaveLength(2);
        expect(rotated[2].isActive).toBe(true);
    });

    it("deactivates scored focal point without replacement when no passives are available", () => {
        // All focal points are active; scoring one leaves no passive to promote.
        const group = [makeFP(0, 0, 0, true), makeFP(1, 0, -1, true)];
        const rotated = rotateFocalGroup(group, [group[0]]);
        expect(rotated[0].isActive).toBe(false);
        expect(rotated[1].isActive).toBe(true);
    });

    it("does not mutate the original group", () => {
        const group = [makeFP(0, 0, 0, true), makeFP(1, 0, -1, false)];
        rotateFocalGroup(group, [group[0]]);
        expect(group[0].isActive).toBe(true);
    });
});

// ─── evaluateFocalPoints ───────────────────────────────────────────────────

describe("evaluateFocalPoints", () => {
    it("awards a point when active player controls an active focal point", () => {
        const die = makeDie("r1", 0, 0, 0, 0, "red", 4);
        const state = makeState({
            dice: makeDice(die),
            focalPointsGroups: {
                g1: [makeFP(-3, 0, 3, false), makeFP(0, 0, 0, true), makeFP(3, 0, -3, false)],
            },
        });
        const { newState, pointsScored } = evaluateFocalPoints(state, roll(3));
        expect(pointsScored).toBe(1);
        expect(newState.players.red).toBe(1);
    });

    it("rerolls the top die with min(roll, original - 1)", () => {
        const die = makeDie("r1", 0, 0, 0, 0, "red", 4);
        const state = makeState({
            dice: makeDice(die),
            focalPointsGroups: { g1: [makeFP(0, 0, 0, true), makeFP(1, 0, -1, false)] },
        });
        // roll returns 5 but original - 1 = 3, so result should be min(5, 3) = 3.
        const { newState } = evaluateFocalPoints(state, roll(5));
        expect(newState.dice["r1"].faceValue).toBe(3);
    });

    it("reroll cannot reduce below 1 when original face value is 1", () => {
        const die = makeDie("r1", 0, 0, 0, 0, "red", 1);
        const state = makeState({
            dice: makeDice(die),
            focalPointsGroups: { g1: [makeFP(0, 0, 0, true), makeFP(1, 0, -1, false)] },
        });
        // original - 1 would be 0, clamped to 1; min(roll, 1) = 1.
        const { newState } = evaluateFocalPoints(state, roll(4));
        expect(newState.dice["r1"].faceValue).toBe(1);
    });

    it("rotates the focal group after scoring", () => {
        const die = makeDie("r1", 0, 0, 0, 0, "red", 4);
        const state = makeState({
            dice: makeDice(die),
            focalPointsGroups: {
                g1: [makeFP(-3, 0, 3, false), makeFP(0, 0, 0, true), makeFP(3, 0, -3, false)],
            },
        });
        const { newState } = evaluateFocalPoints(state, roll(2));
        const group = newState.focalPointsGroups.g1;
        expect(group.find(fp => fp.coords.q === 0 && fp.coords.r === 0).isActive).toBe(false);
    });

    it("does not award a point when enemy controls the active focal point", () => {
        const die = makeDie("b1", 0, 0, 0, 0, "blue", 4);
        const state = makeState({
            dice: makeDice(die),
            focalPointsGroups: { g1: [makeFP(0, 0, 0, true), makeFP(1, 0, -1, false)] },
        });
        const { newState, pointsScored } = evaluateFocalPoints(state, roll(3));
        expect(pointsScored).toBe(0);
        expect(newState.players.red).toBe(0);
    });

    it("does not award a point when the active focal point is unoccupied", () => {
        const state = makeState({
            dice: {},
            focalPointsGroups: { g1: [makeFP(0, 0, 0, true), makeFP(1, 0, -1, false)] },
        });
        const { newState, pointsScored } = evaluateFocalPoints(state, roll(3));
        expect(pointsScored).toBe(0);
        expect(newState.players.red).toBe(0);
    });

    it("does not award a point for a passive focal point", () => {
        const die = makeDie("r1", -3, 0, 3, 0, "red", 4);
        const state = makeState({
            dice: makeDice(die),
            focalPointsGroups: {
                g1: [makeFP(-3, 0, 3, false), makeFP(0, 0, 0, true), makeFP(3, 0, -3, false)],
            },
        });
        const { pointsScored } = evaluateFocalPoints(state, roll(3));
        expect(pointsScored).toBe(0);
    });

    it("scores multiple groups independently", () => {
        const die1 = makeDie("r1", 0, 0, 0, 0, "red", 4);
        const die2 = makeDie("r2", 5, 0, -5, 0, "red", 3);
        const state = makeState({
            dice: makeDice(die1, die2),
            focalPointsGroups: {
                g1: [makeFP(0, 0, 0, true), makeFP(1, 0, -1, false)],
                g2: [makeFP(5, 0, -5, true), makeFP(6, 0, -6, false)],
            },
        });
        const { newState, pointsScored } = evaluateFocalPoints(state, roll(2));
        expect(pointsScored).toBe(2);
        expect(newState.players.red).toBe(2);
    });

    it("scores the one controlled active focal point when multiple are active but only one is controlled", () => {
        const die = makeDie("r1", 0, 0, 0, 0, "red", 4);
        const state = makeState({
            dice: makeDice(die),
            focalPointsGroups: {
                g1: [makeFP(0, 0, 0, true), makeFP(1, 0, -1, true), makeFP(2, 0, -2, false)],
            },
        });
        const { newState, pointsScored } = evaluateFocalPoints(state, roll(2));
        expect(pointsScored).toBe(1);
        expect(newState.players.red).toBe(1);
    });

    it("scores all controlled active focal points in the same group", () => {
        const die1 = makeDie("r1", 0, 0, 0, 0, "red", 4);
        const die2 = makeDie("r2", 1, 0, -1, 0, "red", 3);
        const state = makeState({
            dice: makeDice(die1, die2),
            focalPointsGroups: {
                g1: [makeFP(0, 0, 0, true), makeFP(1, 0, -1, true), makeFP(2, 0, -2, false), makeFP(3, 0, -3, false)],
            },
        });
        const { newState, pointsScored } = evaluateFocalPoints(state, roll(2));
        expect(pointsScored).toBe(2);
        expect(newState.players.red).toBe(2);
        // Active count preserved; at least one original passive is now active.
        const group = newState.focalPointsGroups.g1;
        expect(group.filter(fp => fp.isActive)).toHaveLength(2);
        expect(group.find(fp => fp.coords.q === 2).isActive || group.find(fp => fp.coords.q === 3).isActive).toBe(true);
    });

    it("uses the top die of a tower for ownership check", () => {
        const bottom = makeDie("b1", 0, 0, 0, 0, "blue", 3);
        const top = makeDie("r1", 0, 0, 0, 1, "red", 4);
        const state = makeState({
            dice: makeDice(bottom, top),
            focalPointsGroups: { g1: [makeFP(0, 0, 0, true), makeFP(1, 0, -1, false)] },
        });
        const { pointsScored, newState } = evaluateFocalPoints(state, roll(2));
        expect(pointsScored).toBe(1);
        expect(newState.players.red).toBe(1);
        expect(newState.dice["b1"].faceValue).toBe(3);
    });
});