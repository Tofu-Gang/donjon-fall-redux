/** @import { HexCoords } from './hexCoords.js' */

/**
 * @typedef {object} Die
 * @property {string} owner - player ID (never changes)
 * @property {string} type - die type (e.g. "D6", "D12"); determines the upper bound for face value; never changes
 * @property {number} faceValue
 * @property {HexCoords} coords
 * @property {number} stackIndex - 0 = bottom of stack; lone die is always 0
 */
