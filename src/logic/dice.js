/** @typedef {import("../../docs/runtime-types/diceMap.js").DiceMap} DiceMap */
/** @typedef {import("../../docs/runtime-types/die.js").Die} Die */
/** @typedef {import("../../docs/runtime-types/hexCoords.js").HexCoords} HexCoords */

import { hexKey } from "./hex.js";

/**
 * Returns all dice located at a given hex position, sorted by stackIndex ascending (bottom first).
 * A hex can hold multiple dice when a tower has formed. Sorting ensures index 0 is always
 * the bottom die, and the last element is always the top die.
 *
 * @param {DiceMap} dice - the full dice map from game state
 * @param {HexCoords} coords - the hex position to look up
 * @returns {Die[]} array of dice at the position, sorted by stackIndex; empty if the hex is unoccupied
 */
export function getDiceAtHex(dice, coords) {
    const key = hexKey(coords);
    return Object.values(dice)
        .filter(die => hexKey(die.coords) === key)
        .sort((a, b) => a.stackIndex - b.stackIndex);
}

/**
 * Returns the topmost die at a given hex position — the die with the highest stackIndex.
 * For a lone die, this is the only die at that hex. For a tower, this is the die that
 * participates in combat and blocks movement. Returns null if the hex is empty.
 *
 * @param {DiceMap} dice - the full dice map from game state
 * @param {HexCoords} coords - the hex position to look up
 * @returns {Die | null} the top die, or null if the hex is unoccupied
 */
export function getTopDie(dice, coords) {
    const stack = getDiceAtHex(dice, coords);
    return stack.length > 0 ? stack[stack.length - 1] : null;
}

/**
 * Returns true if a hex contains two or more dice (i.e. a tower has formed there).
 * Used to determine which movement and combat rules apply: towers move and fight differently
 * from lone dice, and towers can potentially be collapsed.
 *
 * @param {DiceMap} dice - the full dice map from game state
 * @param {HexCoords} coords - the hex position to check
 * @returns {boolean} true if 2 or more dice occupy the hex
 */
export function isTower(dice, coords) {
    return getDiceAtHex(dice, coords).length >= 2;
}

/**
 * Returns the next available stackIndex for a hex — one higher than the current maximum.
 * Used when placing a new die on top of an existing stack (tower formation or push resolution).
 * Returns 0 for an empty hex, which is the correct stackIndex for a lone die.
 *
 * @param {DiceMap} dice - the full dice map from game state
 * @param {HexCoords} coords - the hex position to query
 * @returns {number} the stackIndex to assign to the next die placed at this position
 */
export function getNextStackIndex(dice, coords) {
    const stack = getDiceAtHex(dice, coords);
    if (stack.length === 0) return 0;
    return stack[stack.length - 1].stackIndex + 1;
}

/**
 * Returns true if the tower at a given hex can be collapsed by the owning player.
 * A tower is collapsible when it holds 3 or more dice. Collapsing splits the tower
 * into separate pieces that are then relocated. Lone dice and two-die towers cannot
 * be collapsed.
 *
 * @param {DiceMap} dice - the full dice map from game state
 * @param {HexCoords} coords - the hex position of the tower
 * @returns {boolean} true if the tower has 3 or more dice
 */
export function isTowerCollapsible(dice, coords) {
    return getDiceAtHex(dice, coords).length >= 3;
}

/**
 * Looks up a single die by its unique ID.
 * Die IDs are stable across the entire game session and are used throughout the action
 * and combat systems to refer to specific dice regardless of where they currently are.
 * Returns null if no die with that ID exists (e.g. it was removed from the game).
 *
 * @param {DiceMap} dice - the full dice map from game state
 * @param {string} dieId - the unique die identifier to look up
 * @returns {Die | null} the die entry, or null if not found
 */
export function getDieById(dice, dieId) {
    return dice[dieId] ?? null;
}
