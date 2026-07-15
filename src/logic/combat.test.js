import {describe, it, expect} from "vitest";
import {
    getCombatPower,
    getMovementRange,
    effectiveJumpCombatPower,
    buildJumpContextAlongPath,
    resolveCombatPhase1,
    resolveCombatPush,
    resolveCombatOccupy,
} from "./combat.js";

// ─── helpers ───────────────────────────────────────────────────────────────

function makeDie(id, q, r, s, stackIndex, owner, faceValue = 3) {
    return {id, coords: {q, r, s}, stackIndex, owner, faceValue, type: "D6"};
}

function makeDice(...dies) {
    return Object.fromEntries(dies.map(d => [d.id, d]));
}

/** Builds a MapHexSet from an array of {q,r,s} objects. */
function makeMap(...hexes) {
    return new Set(hexes.map(({q, r, s}) => `${q},${r},${s}`));
}

/** Roll function that always returns a fixed value. */
const roll = val => () => val;

// A horizontal row of hexes: (0,0,0) → (1,-1,0) → (2,-2,0)
const H0 = {q: 0, r: 0, s: 0};
const H1 = {q: 1, r: -1, s: 0};
const H2 = {q: 2, r: -2, s: 0};
const H3 = {q: 3, r: -3, s: 0};

// ─── getCombatPower ─────────────────────────────────────────────────────────

describe("getCombatPower", () => {
    it("returns 0 for an empty hex", () => {
        expect(getCombatPower({}, H0)).toBe(0);
    });

    it("returns face value for a lone die", () => {
        const dice = makeDice(makeDie("a", 0, 0, 0, 0, "red", 4));
        expect(getCombatPower(dice, H0)).toBe(4);
    });

    it("adds supporting dice of the same owner", () => {
        // top=4, one supporter (red) → 4 + 1 - 0 = 5
        const dice = makeDice(
            makeDie("bot", 0, 0, 0, 0, "red", 2),
            makeDie("top", 0, 0, 0, 1, "red", 4),
        );
        expect(getCombatPower(dice, H0)).toBe(5);
    });

    it("subtracts enemy dice in the tower", () => {
        // top=4, one enemy below → 4 + 0 - 1 = 3
        const dice = makeDice(
            makeDie("bot", 0, 0, 0, 0, "blue", 2),
            makeDie("top", 0, 0, 0, 1, "red", 4),
        );
        expect(getCombatPower(dice, H0)).toBe(3);
    });

    it("handles mixed tower with supporters and enemies", () => {
        // top(red)=3, supporter(red), enemy(blue) → 3 + 1 - 1 = 3
        const dice = makeDice(
            makeDie("bot", 0, 0, 0, 0, "red", 1),
            makeDie("mid", 0, 0, 0, 1, "blue", 2),
            makeDie("top", 0, 0, 0, 2, "red", 3),
        );
        expect(getCombatPower(dice, H0)).toBe(3);
    });

    it("combat power can be zero when enemies outnumber supporters and face value", () => {
        // top(red)=1, two enemies → 1 + 0 - 2 = -1
        const dice = makeDice(
            makeDie("e1", 0, 0, 0, 0, "blue", 5),
            makeDie("e2", 0, 0, 0, 1, "blue", 5),
            makeDie("top", 0, 0, 0, 2, "red", 1),
        );
        expect(getCombatPower(dice, H0)).toBe(-1);
    });

    it("returns face + active bonuses for a jumping die within retained range", () => {
        // Tower bonus +1, range 2 from H0; face 4 → CP 5 at H1 and H2.
        const dice = makeDice(makeDie("r2", 1, -1, 0, 0, "red", 4));
        const turnContext = {
            jumpContext: {
                dieId: "r2",
                bonuses: [{ originCoords: H0, bonus: 1, retainedRange: 2 }],
            },
        };
        const atH2 = { ...dice, r2: { ...dice.r2, coords: H2 } };
        expect(getCombatPower(dice, H1, turnContext)).toBe(5);
        expect(getCombatPower(atH2, H2, turnContext)).toBe(5);
    });

    it("reverts to face value when a jumping die exits all retained ranges", () => {
        const dice = makeDice(makeDie("r2", 3, -3, 0, 0, "red", 4));
        const turnContext = {
            jumpContext: {
                dieId: "r2",
                bonuses: [{ originCoords: H0, bonus: 1, retainedRange: 2 }],
            },
        };
        expect(getCombatPower(dice, H3, turnContext)).toBe(4);
    });

    it("stacks multiple bonuses and drops them independently by distance", () => {
        // T1 at H1 (+3, range 4); T2 at H2 (+1, range 2). Face 6.
        // H4: both → 10; H5: only T1 → 9; H6: none → 6.
        const H4 = { q: 4, r: -4, s: 0 };
        const H5 = { q: 5, r: -5, s: 0 };
        const H6 = { q: 6, r: -6, s: 0 };
        const bonuses = [
            { originCoords: H1, bonus: 3, retainedRange: 4 },
            { originCoords: H2, bonus: 1, retainedRange: 2 },
        ];
        expect(effectiveJumpCombatPower(6, bonuses, H4)).toBe(10);
        expect(effectiveJumpCombatPower(6, bonuses, H5)).toBe(9);
        expect(effectiveJumpCombatPower(6, bonuses, H6)).toBe(6);
    });

    it("ignores jumpContext for a die that is not the jumping one", () => {
        const dice = makeDice(
            makeDie("bot",  0, 0, 0, 0, "red", 2),
            makeDie("r2",   0, 0, 0, 1, "red", 4),
            makeDie("other", 0, 0, 0, 2, "red", 1),
        );
        const turnContext = {
            jumpContext: {
                dieId: "r2",
                bonuses: [{ originCoords: H0, bonus: 1, retainedRange: 2 }],
            },
        };
        // top is "other" → normal tower 1+2 = 3
        expect(getCombatPower(dice, H0, turnContext)).toBe(3);
    });

    it("ignores jumpContext when the jumping die is top of a multi-die stack", () => {
        // r2 stopped on a friendly: normal F+S−E, not jump formula.
        const dice = makeDice(
            makeDie("bot", 1, -1, 0, 0, "red", 1),
            makeDie("r2",  1, -1, 0, 1, "red", 4),
        );
        const turnContext = {
            jumpContext: {
                dieId: "r2",
                bonuses: [{ originCoords: H0, bonus: 1, retainedRange: 2 }],
            },
        };
        expect(getCombatPower(dice, H1, turnContext)).toBe(5);
    });

    it("ignores jumpContext when turnContext is null (default behavior)", () => {
        const dice = makeDice(
            makeDie("bot", 0, 0, 0, 0, "red", 2),
            makeDie("r2",  0, 0, 0, 1, "red", 4),
        );
        expect(getCombatPower(dice, H0)).toBe(5);
    });

    it("buildJumpContextAlongPath seeds start tower and appends landings", () => {
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 4),
            makeDie("r3", 1, -1, 0, 0, "red", 1),
        );
        const ctx = buildJumpContextAlongPath(
            dice,
            "r2",
            [H0, H1, H2],
            "red",
        );
        expect(ctx?.jumpContext?.dieId).toBe("r2");
        expect(ctx?.jumpContext?.bonuses).toEqual([
            { originCoords: H0, bonus: 1, retainedRange: 2 },
            { originCoords: H1, bonus: 1, retainedRange: 2 },
        ]);
    });
});

// ─── getMovementRange ───────────────────────────────────────────────────────

describe("getMovementRange", () => {
    it("returns 0 for an empty hex", () => {
        expect(getMovementRange({}, H0)).toBe(0);
    });

    it("returns face value for a lone die", () => {
        const dice = makeDice(makeDie("a", 0, 0, 0, 0, "red", 5));
        expect(getMovementRange(dice, H0)).toBe(5);
    });

    it("returns max(O - E, 1) for a tower — own dice majority", () => {
        // 3 red, 1 blue → max(3 - 1, 1) = 2
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("b1", 0, 0, 0, 1, "blue", 3),
            makeDie("r2", 0, 0, 0, 2, "red", 3),
            makeDie("r3", 0, 0, 0, 3, "red", 3),
        );
        expect(getMovementRange(dice, H0)).toBe(2);
    });

    it("returns 1 as the minimum for a tower where enemies match own dice", () => {
        // 1 red top, 1 blue → max(1 - 1, 1) = 1
        const dice = makeDice(
            makeDie("bot", 0, 0, 0, 0, "blue", 3),
            makeDie("top", 0, 0, 0, 1, "red", 3),
        );
        expect(getMovementRange(dice, H0)).toBe(1);
    });

    it("returns 1 as the minimum for a tower where enemies outnumber own dice", () => {
        // 1 red top, 2 blue → max(1 - 2, 1) = 1
        const dice = makeDice(
            makeDie("b1", 0, 0, 0, 0, "blue", 3),
            makeDie("b2", 0, 0, 0, 1, "blue", 3),
            makeDie("top", 0, 0, 0, 2, "red", 3),
        );
        expect(getMovementRange(dice, H0)).toBe(1);
    });

    it("returns O for a pure own-dice tower with no enemies", () => {
        // 3 red dice, 0 blue → max(3 - 0, 1) = 3
        const dice = makeDice(
            makeDie("r1", 0, 0, 0, 0, "red", 3),
            makeDie("r2", 0, 0, 0, 1, "red", 3),
            makeDie("r3", 0, 0, 0, 2, "red", 3),
        );
        expect(getMovementRange(dice, H0)).toBe(3);
    });
});

// ─── resolveCombatPhase1 ────────────────────────────────────────────────────

describe("resolveCombatPhase1", () => {
    it("decreases top die face value by 1", () => {
        const dice = makeDice(makeDie("a", 0, 0, 0, 0, "red", 4));
        const result = resolveCombatPhase1(dice, H0);
        expect(result["a"].faceValue).toBe(3);
    });

    it("does not decrease face value below 1", () => {
        const dice = makeDice(makeDie("a", 0, 0, 0, 0, "red", 1));
        const result = resolveCombatPhase1(dice, H0);
        expect(result["a"].faceValue).toBe(1);
    });

    it("only modifies the top die of a tower", () => {
        const dice = makeDice(
            makeDie("bot", 0, 0, 0, 0, "red", 3),
            makeDie("top", 0, 0, 0, 1, "red", 5),
        );
        const result = resolveCombatPhase1(dice, H0);
        expect(result["top"].faceValue).toBe(4);
        expect(result["bot"].faceValue).toBe(3);
    });

    it("does not mutate the original dice map", () => {
        const dice = makeDice(makeDie("a", 0, 0, 0, 0, "red", 4));
        resolveCombatPhase1(dice, H0);
        expect(dice["a"].faceValue).toBe(4);
    });

    it("leaves unrelated dice untouched", () => {
        const dice = makeDice(
            makeDie("a", 0, 0, 0, 0, "red", 4),
            makeDie("b", 1, -1, 0, 0, "blue", 3),
        );
        const result = resolveCombatPhase1(dice, H0);
        expect(result["b"].faceValue).toBe(3);
    });
});

// ─── resolveCombatPush ──────────────────────────────────────────────────────

describe("resolveCombatPush", () => {
    // Map covers H0 through H3 in a horizontal row.
    const map3 = makeMap(H0, H1, H2, H3);

    it("rerolls the defender's top die with min(roll, original)", () => {
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red", 4),
            makeDie("def", 1, -1, 0, 0, "blue", 5),
        );
        // roll = 3, original = 5 → min(3, 5) = 3
        const {dice: result} = resolveCombatPush(dice, map3, H0, H1, roll(3));
        expect(result["def"].faceValue).toBe(3);
    });

    it("defender does not become stronger — roll capped at original", () => {
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red", 4),
            makeDie("def", 1, -1, 0, 0, "blue", 2),
        );
        // roll = 6, original = 2 → min(6, 2) = 2
        const {dice: result} = resolveCombatPush(dice, map3, H0, H1, roll(6));
        expect(result["def"].faceValue).toBe(2);
    });

    it("moves the defender one hex in the attack direction", () => {
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red", 4),
            makeDie("def", 1, -1, 0, 0, "blue", 3),
        );
        const {dice: result} = resolveCombatPush(dice, map3, H0, H1, roll(3));
        expect(result["def"].coords).toEqual(H2);
    });

    it("moves the attacker to defenderCoords", () => {
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red", 4),
            makeDie("def", 1, -1, 0, 0, "blue", 3),
        );
        const {dice: result} = resolveCombatPush(dice, map3, H0, H1, roll(3));
        expect(result["att"].coords).toEqual(H1);
    });

    it("scores 0 points on a push into free space", () => {
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red", 4),
            makeDie("def", 1, -1, 0, 0, "blue", 3),
        );
        const {pointsScored} = resolveCombatPush(dice, map3, H0, H1, roll(3));
        expect(pointsScored).toBe(0);
    });

    it("pushes a chain of consecutive enemy dice/towers as a formation", () => {
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red", 5),
            makeDie("d1",  1, -1, 0, 0, "blue", 3),
            makeDie("d2",  2, -2, 0, 0, "blue", 3),
        );
        // d1 and d2 are both enemy — formation = [H1, H2]; both shift to H2, H3
        const {dice: result} = resolveCombatPush(dice, map3, H0, H1, roll(3));
        expect(result["d1"].coords).toEqual(H2);
        expect(result["d2"].coords).toEqual(H3);
        expect(result["att"].coords).toEqual(H1);
    });

    it("stops the formation at an own die in the chain — own die triggers encirclement", () => {
        // att at H0 (red), d1 at H1 (blue), own2 at H2 (red).
        // Formation = [H1] only (own2 is not an enemy so it is excluded).
        // beyondHex for d1 is H2 which holds own2 → encirclement: d1 is destroyed.
        const dice = makeDice(
            makeDie("att",  0, 0, 0, 0, "red", 5),
            makeDie("d1",   1, -1, 0, 0, "blue", 3),
            makeDie("own2", 2, -2, 0, 0, "red", 3),
        );
        const {dice: result, pointsScored} = resolveCombatPush(dice, map3, H0, H1, roll(3));
        expect(result["d1"]).toBeUndefined();
        expect(result["own2"].coords).toEqual(H2); // own2 is unaffected
        expect(pointsScored).toBe(1);
    });

    it("destroys the last formation member and scores points when pushed off the map border", () => {
        // map covers only H0 and H1; defender at H1 has nowhere to go
        const tinyMap = makeMap(H0, H1);
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red", 4),
            makeDie("def", 1, -1, 0, 0, "blue", 3),
        );
        const {dice: result, pointsScored} = resolveCombatPush(dice, tinyMap, H0, H1, roll(3));
        expect(result["def"]).toBeUndefined();
        expect(pointsScored).toBe(1);
        expect(result["att"].coords).toEqual(H1);
    });

    it("destroys all dice in a tower pushed off the map border and scores one point per die", () => {
        const tinyMap = makeMap(H0, H1);
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red",  4),
            makeDie("d1",  1, -1, 0, 0, "blue", 3),
            makeDie("d2",  1, -1, 0, 1, "blue", 2),
        );
        const {dice: result, pointsScored} = resolveCombatPush(dice, tinyMap, H0, H1, roll(3));
        expect(result["d1"]).toBeUndefined();
        expect(result["d2"]).toBeUndefined();
        expect(pointsScored).toBe(2);
    });

    it("triggers encirclement when own die/tower is directly behind the formation", () => {
        // att at H0, def at H1, own2 at H2 — def would be pushed into own2
        const dice = makeDice(
            makeDie("att",  0, 0, 0, 0, "red", 4),
            makeDie("def",  1, -1, 0, 0, "blue", 3),
            makeDie("own2", 2, -2, 0, 0, "red", 3),
        );
        const {dice: result, pointsScored} = resolveCombatPush(dice, map3, H0, H1, roll(3));
        expect(result["def"]).toBeUndefined();
        expect(pointsScored).toBe(1);
    });

    it("only destroys the last formation member on encirclement, not earlier ones", () => {
        // formation = [H1, H2]; own die at H3 → only d2 (at H2) is encircled
        const dice = makeDice(
            makeDie("att",  0, 0, 0, 0, "red",  5),
            makeDie("d1",   1, -1, 0, 0, "blue", 3),
            makeDie("d2",   2, -2, 0, 0, "blue", 3),
            makeDie("own3", 3, -3, 0, 0, "red",  3),
        );
        const {dice: result, pointsScored} = resolveCombatPush(dice, map3, H0, H1, roll(3));
        expect(result["d1"]).toBeDefined();
        expect(result["d1"].coords).toEqual(H2);
        expect(result["d2"]).toBeUndefined();
        expect(pointsScored).toBe(1);
    });

    it("moves all dice of a tower attacker to defenderCoords", () => {
        // Attacker is a tower at H0 (a1 idx 0, a2 idx 1); both should move to H1.
        const dice = makeDice(
            makeDie("a1",  0, 0, 0, 0, "red",  3),
            makeDie("a2",  0, 0, 0, 1, "red",  4),
            makeDie("def", 1, -1, 0, 0, "blue", 2),
        );
        const {dice: result} = resolveCombatPush(dice, map3, H0, H1, roll(2));
        expect(result["a1"].coords).toEqual(H1);
        expect(result["a2"].coords).toEqual(H1);
        expect(result["a1"].stackIndex).toBe(0);
        expect(result["a2"].stackIndex).toBe(1);
        expect(result["def"].coords).toEqual(H2);
    });

    it("rerolls only the top die of the first formation tower, not all dice", () => {
        // First formation hex is a tower: d1 (idx 0, fv=5) and d2 (idx 1, fv=4).
        // Only d2 (top) should be rerolled with min(roll, 4). d1 stays at fv=5.
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red",  5),
            makeDie("d1",  1, -1, 0, 0, "blue", 5),
            makeDie("d2",  1, -1, 0, 1, "blue", 4),
        );
        const {dice: result} = resolveCombatPush(dice, map3, H0, H1, roll(2));
        expect(result["d2"].faceValue).toBe(2); // min(2, 4)
        expect(result["d1"].faceValue).toBe(5); // untouched
    });

    it("shifts all dice of a mid-formation tower forward", () => {
        // Formation = [H1 (tower: d1+d2), H2 (d3)]; all three should move one step.
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red",  5),
            makeDie("d1",  1, -1, 0, 0, "blue", 3),
            makeDie("d2",  1, -1, 0, 1, "blue", 2),
            makeDie("d3",  2, -2, 0, 0, "blue", 3),
        );
        const {dice: result} = resolveCombatPush(dice, map3, H0, H1, roll(3));
        expect(result["d1"].coords).toEqual(H2);
        expect(result["d2"].coords).toEqual(H2);
        expect(result["d3"].coords).toEqual(H3);
        expect(result["d1"].stackIndex).toBe(0);
        expect(result["d2"].stackIndex).toBe(1);
    });

    it("does not mutate the original dice map", () => {
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red",  4),
            makeDie("def", 1, -1, 0, 0, "blue", 3),
        );
        const originalCoords = {...dice["att"].coords};
        resolveCombatPush(dice, map3, H0, H1, roll(3));
        expect(dice["att"].coords).toEqual(originalCoords);
    });
});

// ─── resolveCombatOccupy ────────────────────────────────────────────────────

describe("resolveCombatOccupy", () => {
    it("moves the attacker die to defenderCoords", () => {
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red",  4),
            makeDie("def", 1, -1, 0, 0, "blue", 3),
        );
        const result = resolveCombatOccupy(dice, "att", H0, H1);
        expect(result["att"].coords).toEqual(H1);
    });

    it("places the attacker on top of the defender stack", () => {
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red",  4),
            makeDie("def", 1, -1, 0, 0, "blue", 3),
        );
        const result = resolveCombatOccupy(dice, "att", H0, H1);
        // Defender was at stackIndex 0; attacker should be at stackIndex 1.
        expect(result["att"].stackIndex).toBe(1);
        expect(result["def"].stackIndex).toBe(0);
    });

    it("places the attacker on top of a multi-die tower", () => {
        // Tower at H1: def0 (idx 0), def1 (idx 1); attacker should land at idx 2.
        const dice = makeDice(
            makeDie("att",  0, 0, 0, 0, "red",  4),
            makeDie("def0", 1, -1, 0, 0, "blue", 3),
            makeDie("def1", 1, -1, 0, 1, "blue", 2),
        );
        const result = resolveCombatOccupy(dice, "att", H0, H1);
        expect(result["att"].stackIndex).toBe(2);
    });

    it("does not change the defender's faceValue or stackIndex", () => {
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red",  4),
            makeDie("def", 1, -1, 0, 0, "blue", 3),
        );
        const result = resolveCombatOccupy(dice, "att", H0, H1);
        expect(result["def"].faceValue).toBe(3);
        expect(result["def"].stackIndex).toBe(0);
    });

    it("removes the attacker from its original coords", () => {
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red",  4),
            makeDie("def", 1, -1, 0, 0, "blue", 3),
        );
        const result = resolveCombatOccupy(dice, "att", H0, H1);
        // att is no longer at H0
        const atH0 = Object.values(result).filter(
            d => d.coords.q === 0 && d.coords.r === 0 && d.coords.s === 0
        );
        expect(atH0).toHaveLength(0);
    });

    it("does not mutate the original dice map", () => {
        const dice = makeDice(
            makeDie("att", 0, 0, 0, 0, "red",  4),
            makeDie("def", 1, -1, 0, 0, "blue", 3),
        );
        resolveCombatOccupy(dice, "att", H0, H1);
        expect(dice["att"].coords).toEqual(H0);
    });
});