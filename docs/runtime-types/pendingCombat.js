/** @import { HexCoords } from './hexCoords.js' */

/**
 * Captured when a move action lands on an enemy hex, before the player has chosen
 * Push or Occupy. Holds everything needed to execute either resolution.
 * Cleared once combat is resolved or the turn ends.
 *
 * @typedef {object} PendingCombat
 * @property {string} attackerDieId - ID of the die (or tower top die) that initiated the attack
 * @property {HexCoords} attackerCoords - hex the attacker occupied before moving (not yet vacated)
 * @property {HexCoords} defenderCoords - hex the attacker is moving into (target of the attack)
 * @property {boolean} isTowerAttack - true when the attacker is a tower; Occupy is unavailable in that case
 */