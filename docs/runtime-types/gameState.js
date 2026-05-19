/** @import { DiceMap } from './diceMap.js' */
/** @import { TurnContext } from './turnContext.js' */
/** @import { FocalPointHex } from './focalPointHex.js' */
/** @import { TurnPhase } from './turnPhase.js' */
/** @import { PendingCombat } from './pendingCombat.js' */

/**
 * @typedef {object} GameState
 * @property {DiceMap} dice
 * @property {Object.<string, number>} players - keyed by player ID; value is accumulated victory points
 * @property {string[]} turnOrder - fixed turn sequence; first entry starts the game
 * @property {number} currentTurnIndex - index into turnOrder
 * @property {TurnPhase} turnPhase
 * @property {Object.<string, FocalPointHex[]>} focalPointsGroups - keyed by group ID
 * @property {TurnContext | null} turnContext - null when no special state is active
 * @property {PendingCombat | null} pendingCombat - set when a move lands on an enemy hex and the player must choose Push or Occupy; null otherwise
 * @property {boolean} actionTaken - true once the active player has used their action this turn; controls End Turn availability
 * @property {number} victoryPointsTarget - score a player must reach to win; sourced from the map at game start
 */