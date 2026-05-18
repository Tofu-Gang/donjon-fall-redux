import {describe, it, expect} from "vitest";
import {getDiceAtHex, getTopDie, isTower, getNextStackIndex, isTowerCollapsible, getDieById} from "./dice.js";

const coords0 = {q: 0, r: 0, s: 0};
const coords1 = {q: 1, r: -1, s: 0};

function makeDice(...entries) {
    return Object.fromEntries(entries.map(([id, q, r, s, stackIndex, owner]) => [
        id,
        {id, coords: {q, r, s}, stackIndex, owner},
    ]));
}

describe("getDiceAtHex", () => {
    it("returns empty array for an unoccupied hex", () => {
        const dice = makeDice(["a", 1, -1, 0, 0, "red"]);
        expect(getDiceAtHex(dice, coords0)).toEqual([]);
    });

    it("returns the single die at an occupied hex", () => {
        const dice = makeDice(["a", 0, 0, 0, 0, "red"]);
        const result = getDiceAtHex(dice, coords0);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("a");
    });

    it("returns multiple dice at the same hex", () => {
        const dice = makeDice(
            ["a", 0, 0, 0, 0, "red"],
            ["b", 0, 0, 0, 1, "blue"],
        );
        expect(getDiceAtHex(dice, coords0)).toHaveLength(2);
    });

    it("sorts dice by stackIndex ascending (bottom first)", () => {
        const dice = makeDice(
            ["top", 0, 0, 0, 2, "red"],
            ["mid", 0, 0, 0, 1, "blue"],
            ["bot", 0, 0, 0, 0, "red"],
        );
        const result = getDiceAtHex(dice, coords0);
        expect(result.map(d => d.id)).toEqual(["bot", "mid", "top"]);
    });

    it("excludes dice at other hexes", () => {
        const dice = makeDice(
            ["a", 0, 0, 0, 0, "red"],
            ["b", 1, -1, 0, 0, "blue"],
        );
        expect(getDiceAtHex(dice, coords0)).toHaveLength(1);
        expect(getDiceAtHex(dice, coords1)).toHaveLength(1);
    });
});

describe("getTopDie", () => {
    it("returns null for an empty hex", () => {
        expect(getTopDie({}, coords0)).toBeNull();
    });

    it("returns the only die on a lone-die hex", () => {
        const dice = makeDice(["a", 0, 0, 0, 0, "red"]);
        expect(getTopDie(dice, coords0).id).toBe("a");
    });

    it("returns the die with the highest stackIndex", () => {
        const dice = makeDice(
            ["bot", 0, 0, 0, 0, "red"],
            ["top", 0, 0, 0, 1, "blue"],
        );
        expect(getTopDie(dice, coords0).id).toBe("top");
    });
});

describe("isTower", () => {
    it("returns false for an empty hex", () => {
        expect(isTower({}, coords0)).toBe(false);
    });

    it("returns false for a single die", () => {
        const dice = makeDice(["a", 0, 0, 0, 0, "red"]);
        expect(isTower(dice, coords0)).toBe(false);
    });

    it("returns true for two dice at the same hex", () => {
        const dice = makeDice(
            ["a", 0, 0, 0, 0, "red"],
            ["b", 0, 0, 0, 1, "blue"],
        );
        expect(isTower(dice, coords0)).toBe(true);
    });

    it("returns true for three or more dice", () => {
        const dice = makeDice(
            ["a", 0, 0, 0, 0, "red"],
            ["b", 0, 0, 0, 1, "blue"],
            ["c", 0, 0, 0, 2, "red"],
        );
        expect(isTower(dice, coords0)).toBe(true);
    });
});

describe("getNextStackIndex", () => {
    it("returns 0 for an empty hex", () => {
        expect(getNextStackIndex({}, coords0)).toBe(0);
    });

    it("returns 1 for a hex with a single die at stackIndex 0", () => {
        const dice = makeDice(["a", 0, 0, 0, 0, "red"]);
        expect(getNextStackIndex(dice, coords0)).toBe(1);
    });

    it("returns one above the highest stackIndex", () => {
        const dice = makeDice(
            ["a", 0, 0, 0, 0, "red"],
            ["b", 0, 0, 0, 1, "blue"],
            ["c", 0, 0, 0, 2, "red"],
        );
        expect(getNextStackIndex(dice, coords0)).toBe(3);
    });

    it("returns one above the highest stackIndex when indices are non-contiguous", () => {
        const dice = makeDice(
            ["a", 0, 0, 0, 0, "red"],
            ["b", 0, 0, 0, 5, "blue"],
        );
        expect(getNextStackIndex(dice, coords0)).toBe(6);
    });
});

describe("isTowerCollapsible", () => {
    it("returns false for an empty hex", () => {
        expect(isTowerCollapsible({}, coords0)).toBe(false);
    });

    it("returns false for one die", () => {
        const dice = makeDice(["a", 0, 0, 0, 0, "red"]);
        expect(isTowerCollapsible(dice, coords0)).toBe(false);
    });

    it("returns false for two dice", () => {
        const dice = makeDice(
            ["a", 0, 0, 0, 0, "red"],
            ["b", 0, 0, 0, 1, "blue"],
        );
        expect(isTowerCollapsible(dice, coords0)).toBe(false);
    });

    it("returns true for exactly three dice", () => {
        const dice = makeDice(
            ["a", 0, 0, 0, 0, "red"],
            ["b", 0, 0, 0, 1, "blue"],
            ["c", 0, 0, 0, 2, "red"],
        );
        expect(isTowerCollapsible(dice, coords0)).toBe(true);
    });

    it("returns true for more than three dice", () => {
        const dice = makeDice(
            ["a", 0, 0, 0, 0, "red"],
            ["b", 0, 0, 0, 1, "blue"],
            ["c", 0, 0, 0, 2, "red"],
            ["d", 0, 0, 0, 3, "blue"],
        );
        expect(isTowerCollapsible(dice, coords0)).toBe(true);
    });
});

describe("getDieById", () => {
    it("returns null for an unknown id", () => {
        expect(getDieById({}, "missing")).toBeNull();
    });

    it("returns the die when the id exists", () => {
        const dice = makeDice(["a", 0, 0, 0, 0, "red"]);
        const die = getDieById(dice, "a");
        expect(die).not.toBeNull();
        expect(die.id).toBe("a");
    });

    it("returns the correct die among multiple dice", () => {
        const dice = makeDice(
            ["a", 0, 0, 0, 0, "red"],
            ["b", 1, -1, 0, 0, "blue"],
        );
        expect(getDieById(dice, "b").id).toBe("b");
    });
});
