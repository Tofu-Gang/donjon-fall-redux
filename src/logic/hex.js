/** @typedef {import("../../docs/runtime-types/hexCoords.js").HexCoords} HexCoords */

/**
 * Converts cube coordinates into a stable string key for use in Maps, Sets, and plain objects.
 * All game state that indexes hexes by position (DiceMap, MapHexSet) uses this format.
 *
 * @param {HexCoords} coords
 * @returns {string} e.g. "0,1,-1"
 */
export function hexKey({q, r, s}) {
    return `${q},${r},${s}`;
}

/**
 * Parses a hex key string back into a HexCoords object.
 * Used whenever you have a key from a Map/Set and need to do geometric operations on it.
 *
 * @param {string} key - a string produced by hexKey(), e.g. "0,1,-1"
 * @returns {HexCoords}
 */
export function hexCoords(key) {
    const [q, r, s] = key.split(",").map(Number);
    return {q, r, s};
}

/**
 * Returns the 6 immediate neighbors of a hex in cube coordinate space.
 * The 6 directions correspond to the 6 edges of a pointy-top hexagon.
 * Used for movement validation, adjacency checks, and push-target resolution.
 *
 * @param {HexCoords} coords
 * @returns {HexCoords[]} exactly 6 neighbors (some may be off-map)
 */
export function hexNeighbors({q, r, s}) {
    return [
        {q: q + 1, r: r - 1, s: s},
        {q: q + 1, r: r, s: s - 1},
        {q: q, r: r + 1, s: s - 1},
        {q: q - 1, r: r + 1, s: s},
        {q: q - 1, r: r, s: s + 1},
        {q: q, r: r - 1, s: s + 1},
    ];
}

/**
 * Computes the shortest path distance between two hexes in cube coordinates.
 * In a cube grid, the distance equals the largest absolute difference across all three axes.
 * Used to check movement range, formation range, and push distance.
 *
 * @param {HexCoords} one
 * @param {HexCoords} other
 * @returns {number} integer number of steps between the two hexes
 */
export function hexDistance(one, other) {
    return Math.max(
        Math.abs(one.q - other.q),
        Math.abs(one.r - other.r),
        Math.abs(one.s - other.s)
    );
}

/**
 * Returns all hexes within a given number of steps from a center hex, including the center itself.
 * Used to compute movement candidates before filtering by passability, and for focal point proximity checks.
 *
 * @param {HexCoords} center
 * @param {number} range - maximum number of steps from center
 * @returns {HexCoords[]} all hexes within range (unfiltered — includes off-map positions)
 */
export function hexesInRange(center, range) {
    const results = [];
    for (let q = -range; q <= range; q++) {
        for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
            const s = -q - r;
            results.push({q: center.q + q, r: center.r + r, s: center.s + s});
        }
    }
    return results;
}

/**
 * Returns the ordered sequence of hexes along the straight line between two hexes, inclusive of both endpoints.
 * Uses cube-coordinate linear interpolation with rounding to stay on valid hex grid positions.
 * Used for push resolution (determining what's in the push path) and formation detection.
 *
 * @param {HexCoords} one - start hex
 * @param {HexCoords} other - end hex
 * @returns {HexCoords[]} ordered array from one to other, length = hexDistance(one, other) + 1
 */
export function hexLine(one, other) {
    const distance = hexDistance(one, other);
    if (distance === 0) return [one];
    const results = [];
    for (let i = 0; i <= distance; i++) {
        const t = i / distance;
        results.push({
            q: Math.round(one.q + (other.q - one.q) * t),
            r: Math.round(one.r + (other.r - one.r) * t),
            s: Math.round(one.s + (other.s - one.s) * t),
        });
    }
    return results;
}

/**
 * Returns a unit direction vector pointing from one hex toward another.
 * The hexes must be colinear on the cube grid (always true for adjacent hexes).
 * Used for push direction: one step along the attack line.
 *
 * @param {HexCoords} one - origin hex (e.g. last hex before the attack target)
 * @param {HexCoords} other - target hex (e.g. defending die position)
 * @returns {HexCoords} unit step { q, r, s }, or zeros when one === other
 */
export function hexDirection(one, other) {
    const dist = hexDistance(one, other);
    if (dist === 0) return {q: 0, r: 0, s: 0};
    return {
        q: (other.q - one.q) / dist,
        r: (other.r - one.r) / dist,
        s: (other.s - one.s) / dist,
    };
}

/**
 * Converts cube coordinates to pixel coordinates for pointy-top hex layout.
 * Returns the pixel center of the hex, offset from a (0,0) world origin.
 * Used by Board.jsx to position hex cells and die tokens in SVG space.
 *
 * @param {HexCoords} coords
 * @param {number} size - hex size in pixels (center to vertex distance)
 * @returns {{ x: number, y: number }} pixel center of the hex
 */
export function hexToPixel({q, r}, size) {
    const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
    const y = size * (3 / 2) * r;
    return {x, y};
}
