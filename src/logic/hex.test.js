import {describe, it, expect} from "vitest";
import {
    hexKey,
    hexCoords,
    hexNeighbors,
    hexDistance,
    hexesInRange,
    hexLine,
    hexDirection,
    hexToPixel,
} from "./hex.js";

describe("hexKey", () => {
    it("serializes positive coordinates", () => {
        expect(hexKey({q: 1, r: -1, s: 0})).toBe("1,-1,0");
    });

    it("serializes the origin", () => {
        expect(hexKey({q: 0, r: 0, s: 0})).toBe("0,0,0");
    });

    it("serializes negative coordinates", () => {
        expect(hexKey({q: -3, r: 2, s: 1})).toBe("-3,2,1");
    });
});

describe("hexCoords", () => {
    it("parses a key back into coords", () => {
        expect(hexCoords("1,-1,0")).toEqual({q: 1, r: -1, s: 0});
    });

    it("round-trips through hexKey", () => {
        const original = {q: -2, r: 3, s: -1};
        expect(hexCoords(hexKey(original))).toEqual(original);
    });
});

describe("hexNeighbors", () => {
    it("returns exactly 6 neighbors", () => {
        expect(hexNeighbors({q: 0, r: 0, s: 0})).toHaveLength(6);
    });

    it("all neighbors are distance 1 from center", () => {
        const center = {q: 0, r: 0, s: 0};
        hexNeighbors(center).forEach(n => {
            expect(hexDistance(center, n)).toBe(1);
        });
    });

    it("neighbors are correct for a non-origin hex", () => {
        const center = {q: 1, r: -1, s: 0};
        hexNeighbors(center).forEach(n => {
            expect(hexDistance(center, n)).toBe(1);
        });
    });
});

describe("hexDistance", () => {
    it("returns 0 for the same hex", () => {
        expect(hexDistance({q: 1, r: -1, s: 0}, {q: 1, r: -1, s: 0})).toBe(0);
    });

    it("returns 1 for adjacent hexes", () => {
        expect(hexDistance({q: 0, r: 0, s: 0}, {q: 1, r: -1, s: 0})).toBe(1);
    });

    it("is symmetric", () => {
        const a = {q: 2, r: -3, s: 1};
        const b = {q: -1, r: 2, s: -1};
        expect(hexDistance(a, b)).toBe(hexDistance(b, a));
    });

    it("returns correct distance for non-adjacent hexes", () => {
        expect(hexDistance({q: 0, r: 0, s: 0}, {q: 3, r: -3, s: 0})).toBe(3);
    });
});

describe("hexesInRange", () => {
    it("returns only the center for range 0", () => {
        const center = {q: 0, r: 0, s: 0};
        expect(hexesInRange(center, 0)).toEqual([center]);
    });

    it("returns 7 hexes for range 1 (center + 6 neighbors)", () => {
        expect(hexesInRange({q: 0, r: 0, s: 0}, 1)).toHaveLength(7);
    });

    it("returns 19 hexes for range 2", () => {
        expect(hexesInRange({q: 0, r: 0, s: 0}, 2)).toHaveLength(19);
    });

    it("all returned hexes are within the given range", () => {
        const center = {q: 1, r: -1, s: 0};
        const range = 3;
        hexesInRange(center, range).forEach(h => {
            expect(hexDistance(center, h)).toBeLessThanOrEqual(range);
        });
    });
});

describe("hexLine", () => {
    it("returns just the single hex for distance 0", () => {
        const h = {q: 1, r: -1, s: 0};
        expect(hexLine(h, h)).toEqual([h]);
    });

    it("includes both endpoints", () => {
        const one = {q: 0, r: 0, s: 0};
        const other = {q: 3, r: -3, s: 0};
        const line = hexLine(one, other);
        expect(line[0]).toEqual(one);
        expect(line[line.length - 1]).toEqual(other);
    });

    it("returns distance + 1 hexes", () => {
        const one = {q: 0, r: 0, s: 0};
        const other = {q: 4, r: -2, s: -2};
        const dist = hexDistance(one, other);
        expect(hexLine(one, other)).toHaveLength(dist + 1);
    });

    it("each step in the line is adjacent to the next", () => {
        const one = {q: 0, r: 0, s: 0};
        const other = {q: 3, r: -1, s: -2};
        const line = hexLine(one, other);
        for (let i = 0; i < line.length - 1; i++) {
            expect(hexDistance(line[i], line[i + 1])).toBe(1);
        }
    });

    it("returns the correct intermediate hexes along a straight axis", () => {
        // Straight line along the q axis: (0,0,0) → (3,-3,0)
        const line = hexLine({q: 0, r: 0, s: 0}, {q: 3, r: -3, s: 0});
        expect(line).toEqual([
            {q: 0, r:  0, s:  0},
            {q: 1, r: -1, s:  0},
            {q: 2, r: -2, s:  0},
            {q: 3, r: -3, s:  0},
        ]);
    });
});

describe("hexDirection", () => {
    it("returns the raw delta vector from one to other", () => {
        const one = {q: 1, r: -1, s: 0};
        const other = {q: 3, r: -3, s: 0};
        expect(hexDirection(one, other)).toEqual({q: 2, r: -2, s: 0});
    });

    it("returns zero vector for identical hexes", () => {
        const h = {q: 2, r: -1, s: -1};
        expect(hexDirection(h, h)).toEqual({q: 0, r: 0, s: 0});
    });
});

describe("hexToPixel", () => {
    it("maps the origin to pixel (0, 0)", () => {
        const {x, y} = hexToPixel({q: 0, r: 0, s: 0}, 40);
        expect(x).toBeCloseTo(0);
        expect(y).toBeCloseTo(0);
    });

    it("scales with size", () => {
        const small = hexToPixel({q: 1, r: -1, s: 0}, 20);
        const large = hexToPixel({q: 1, r: -1, s: 0}, 40);
        expect(large.x).toBeCloseTo(small.x * 2);
        expect(large.y).toBeCloseTo(small.y * 2);
    });

    it("returns distinct pixel positions for distinct hexes", () => {
        const a = hexToPixel({q: 1, r: 0, s: -1}, 40);
        const b = hexToPixel({q: 0, r: 1, s: -1}, 40);
        expect(a).not.toEqual(b);
    });

    it("returns correct pixel coords for a known pointy-top hex position", () => {
        // For pointy-top layout: x = size*(sqrt(3)*q + sqrt(3)/2*r), y = size*(3/2)*r
        // At q=1, r=0: x = size*sqrt(3), y = 0
        const size = 40;
        const {x, y} = hexToPixel({q: 1, r: 0, s: -1}, size);
        expect(x).toBeCloseTo(size * Math.sqrt(3));
        expect(y).toBeCloseTo(0);
    });
});
