/** @import { JumpBonus } from './jumpBonus.js' */

/**
 * Captures jump-off bonuses for a die that has left one or more towers during
 * the current turn (starting tower and/or friendlies passed through mid-move).
 *
 * Effective combat power at a hex is:
 *   faceValue + Σ bonusᵢ for every bonus still in range at that hex
 * (hex distance from each bonus's originCoords ≤ that bonus's retainedRange).
 * Leaving one tower's range drops only that tower's bonus; others may remain.
 *
 * Cleared only at END_TURN.
 *
 * @typedef {object} JumpContext
 * @property {string} dieId - the die currently retaining jump bonuses
 * @property {JumpBonus[]} bonuses - ordered list of tower bonuses acquired this move
 */
