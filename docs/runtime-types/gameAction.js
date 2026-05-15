/** @import { HexCoords } from './hexCoords.js' */

/**
 * @typedef {(
 *   { type: 'MOVE_DIE', dieId: string, path: HexCoords[] } |
 *   { type: 'MOVE_TOWER', coords: HexCoords, path: HexCoords[] } |
 *   { type: 'TOWER_COLLAPSE', coords: HexCoords } |
 *   { type: 'REROLL', dieId: string }
 * )} GameAction
 */