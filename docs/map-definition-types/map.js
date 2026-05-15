/** @import { Campaign } from './campaign.js' */
/** @import { Access } from './access.js' */
/** @import { HexCoords } from './hexCoords.js' */
/** @import { BaseGroup } from './baseGroup.js' */
/** @import { FocalPointsGroup } from './focalPointsGroup.js' */
/** @import { VictoryPointsTarget } from './victoryPointsTarget.js' */


/**
 * @typedef {object} Map
 * @property {string} id - Unique ID generated when map is loaded to the game
 * @property {string} name - Map name
 * @property {string[]} authors - author(s) IDs
 * @property {number} createdOn - timestamp of map creation, generated when map is given for approval
 * @property {string[]} [tags] - filtering
 * @property {Campaign} [campaign]
 * @property {Access} access
 * @property {HexCoords[]} hexes - array of ordinary hexes with no special function
 * @property {BaseGroup[]} baseGroups - base definitions for all number of players the map is suitable for (i.e. two
 * base groups for two player game, three base groups for three players game and so on)
 * @property {FocalPointsGroup[]} focalPointsGroups - focal points groups definitions for all number of players the map
 * is suitable for (i.e. one focal points group for two player game, two focal points groups for three player game and
 * so on)
 * @property {VictoryPointsTarget[]} victoryPointsTargets - victory points targets for all number of players the map is suitable for (i.e. five
 * points for two players game, four points for three players game and so on)
 */
