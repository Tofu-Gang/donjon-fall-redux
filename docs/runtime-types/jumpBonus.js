/** @import { HexCoords } from './hexCoords.js' */

/**
 * One tower's retained combat-power bonus for a jumping die.
 * Created when the die jumps off (or leaves) a tower; applies while the die
 * stays within `retainedRange` hexes of `originCoords` (hex distance).
 *
 * @typedef {object} JumpBonus
 * @property {HexCoords} originCoords - hex of the tower that granted this bonus
 * @property {number} bonus - S − E of the dice under the mover at jump time
 * @property {number} retainedRange - that tower's max(O − E, 1) before the die left
 */
