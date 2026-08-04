/** @typedef {import("../../docs/runtime-types/gameState.js").GameState} GameState */
/** @typedef {import("../../docs/runtime-types/gameAction.js").GameAction} GameAction */
/** @typedef {import("../../docs/runtime-types/hexCoords.js").HexCoords} HexCoords */
/** @typedef {import("../../docs/runtime-types/mapHexSet.js").MapHexSet} MapHexSet */

import { hexKey, hexNeighbors } from "./hex.js";
import { getTopDie, isTower, isTowerCollapsible } from "./dice.js";
import {
    getCombatPower,
    getMovementRange,
    effectiveJumpCombatPower,
    jumpBonusFromTowerTop,
    jumpBonusFromLanding,
} from "./combat.js";

/**
 * BFS to find all hexes a die can reach, respecting movement rules.
 *
 * Each queue entry carries the jump-bonus list accumulated so far (same model
 * as turnContext.jumpContext). Arrival CP at a neighbor is faceValue plus
 * bonuses still in hex-distance range. Landing on a friendly appends that
 * tower's S−E bonus for subsequent steps.
 *
 * @param {import("../../docs/runtime-types/diceMap.js").DiceMap} dice
 * @param {HexCoords} startCoords
 * @param {number} movingRange - movement range of the die (face value for lone/tower top)
 * @param {string} activePlayer
 * @param {MapHexSet} mapHexSet
 * @returns {Map<string, { coords: HexCoords, path: HexCoords[] }>}
 */
function bfsDie(dice, startCoords, movingRange, activePlayer, mapHexSet) {
    const startKey = hexKey(startCoords);
    const startDie = getTopDie(dice, startCoords);
    const faceValue = startDie ? startDie.faceValue : 0;

    /** @type {import("../../docs/runtime-types/jumpBonus.js").JumpBonus[]} */
    const startBonuses = [];
    if (isTower(dice, startCoords) && startDie) {
        const seed = jumpBonusFromTowerTop(dice, startCoords);
        if (seed) startBonuses.push(seed);
    }

    const reachable = new Map();
    // best[hexKey] = max stepsLeft seen at that hex; re-explore if we arrive with more steps
    const best = new Map([[startKey, movingRange]]);
    const queue = [{
        coords: startCoords,
        stepsLeft: movingRange,
        path: [startCoords],
        bonuses: startBonuses,
    }];

    while (queue.length > 0) {
        const { coords, stepsLeft, path, bonuses } = queue.shift();
        if (stepsLeft === 0) continue;

        for (const neighbor of hexNeighbors(coords)) {
            const nKey = hexKey(neighbor);
            if (!mapHexSet.has(nKey)) continue;

            const top = getTopDie(dice, neighbor);
            // Arrival CP before stacking onto a friendly at the neighbor.
            const neighborCp = effectiveJumpCombatPower(faceValue, bonuses, neighbor);

            let canStop = false;
            let canPass = false;
            /** @type {typeof bonuses} */
            let nextBonuses = bonuses;

            if (!top) {
                canStop = true;
                canPass = true;
            } else if (top.owner === activePlayer) {
                const friendlyCp = getCombatPower(dice, neighbor);
                if (neighborCp > friendlyCp) {
                    canStop = true;
                    canPass = true;
                    nextBonuses = [...bonuses, jumpBonusFromLanding(dice, neighbor, activePlayer)];
                }
            } else {
                const enemyCp = getCombatPower(dice, neighbor);
                if (neighborCp > enemyCp) {
                    canStop = true;
                }
            }

            const newPath = [...path, neighbor];

            // Keep the shortest path to each destination. Later BFS visits can otherwise
            // overwrite a direct adjacent attack with a long detour whose final step
            // approaches from the wrong direction (breaking push/encirclement).
            if (canStop && nKey !== startKey) {
                const existing = reachable.get(nKey);
                if (!existing || newPath.length < existing.path.length) {
                    reachable.set(nKey, { coords: neighbor, path: newPath });
                }
            }

            if (canPass) {
                const newStepsLeft = stepsLeft - 1;
                if (newStepsLeft > (best.get(nKey) ?? -1)) {
                    best.set(nKey, newStepsLeft);
                    queue.push({
                        coords: neighbor,
                        stepsLeft: newStepsLeft,
                        path: newPath,
                        bonuses: nextBonuses,
                    });
                }
            }
        }
    }

    return reachable;
}

/**
 * BFS to find all hexes a tower can reach, respecting tower movement rules.
 * Towers cannot pass through any dice (friendly or enemy); they can only move through empty hexes.
 *
 * @param {import("../../docs/runtime-types/diceMap.js").DiceMap} dice
 * @param {HexCoords} startCoords
 * @param {number} towerCp
 * @param {number} towerRange
 * @param {string} activePlayer
 * @param {MapHexSet} mapHexSet
 * @returns {Map<string, { coords: HexCoords, path: HexCoords[] }>}
 */
function bfsTower(dice, startCoords, towerCp, towerRange, activePlayer, mapHexSet) {
    const startKey = hexKey(startCoords);
    const reachable = new Map();
    const best = new Map([[startKey, towerRange]]);
    const queue = [{ coords: startCoords, stepsLeft: towerRange, path: [startCoords] }];

    while (queue.length > 0) {
        const { coords, stepsLeft, path } = queue.shift();
        if (stepsLeft === 0) continue;

        for (const neighbor of hexNeighbors(coords)) {
            const nKey = hexKey(neighbor);
            if (!mapHexSet.has(nKey)) continue;

            const top = getTopDie(dice, neighbor);
            let canStop = false;
            let canPass = false;

            if (!top) {
                canStop = true;
                canPass = true;
            } else if (top.owner !== activePlayer) {
                // Enemy: can attack (stop) if tower cp > enemy cp; cannot pass through
                const enemyCp = getCombatPower(dice, neighbor);
                if (towerCp > enemyCp) {
                    canStop = true;
                }
            }
            // Friendly dice/towers: towers cannot stop or pass through

            const newPath = [...path, neighbor];

            if (canStop && nKey !== startKey) {
                const existing = reachable.get(nKey);
                if (!existing || newPath.length < existing.path.length) {
                    reachable.set(nKey, { coords: neighbor, path: newPath });
                }
            }

            if (canPass) {
                const newStepsLeft = stepsLeft - 1;
                if (newStepsLeft > (best.get(nKey) ?? -1)) {
                    best.set(nKey, newStepsLeft);
                    queue.push({ coords: neighbor, stepsLeft: newStepsLeft, path: newPath });
                }
            }
        }
    }

    return reachable;
}

/**
 * Returns all legal actions the current player can take on their turn.
 * Only called during the ACTION turn phase, after focal point evaluation.
 * Each MOVE_DIE and MOVE_TOWER action provides a full path (start → destination).
 *
 * @param {GameState} state
 * @param {MapHexSet} mapHexSet
 * @returns {GameAction[]}
 */
export function getLegalActions(state, mapHexSet) {
    const { dice, turnOrder, currentTurnIndex } = state;
    const activePlayer = turnOrder[currentTurnIndex];
    const actions = [];

    for (const [dieId, die] of Object.entries(dice)) {
        if (die.owner !== activePlayer) continue;

        // Only process the top die of each hex (controlled dice only)
        const top = getTopDie(dice, die.coords);
        if (!top || top.id !== dieId) continue;

        // REROLL: always legal for any controlled die
        actions.push({ type: 'REROLL', dieId });

        // MOVE_DIE: die moves (or jumps off tower) using its face value as movement range
        const dieRange = die.faceValue; // movement range for a die (lone or jumping from tower)
        const dieReachable = bfsDie(dice, die.coords, dieRange, activePlayer, mapHexSet);
        for (const { path } of dieReachable.values()) {
            actions.push({ type: 'MOVE_DIE', dieId, path });
        }

        if (isTower(dice, die.coords)) {
            // MOVE_TOWER: the whole tower moves; cannot pass through any dice
            const towerCp = getCombatPower(dice, die.coords); // getCombatPower already covers tower formula
            const towerRange = getMovementRange(dice, die.coords); // max(O-E, 1)
            const towerReachable = bfsTower(dice, die.coords, towerCp, towerRange, activePlayer, mapHexSet);
            for (const { path } of towerReachable.values()) {
                actions.push({ type: 'MOVE_TOWER', coords: die.coords, path });
            }

            // TOWER_COLLAPSE: only when 3+ dice
            if (isTowerCollapsible(dice, die.coords)) {
                actions.push({ type: 'TOWER_COLLAPSE', coords: die.coords });
            }
        }
    }

    return actions;
}

/**
 * Checks end-game conditions.
 * Score win: any player at or above the victory point target wins immediately.
 * Sudden death: the current player has no legal actions and loses.
 * Capture the King is not currently modelled in the die type and is excluded.
 *
 * @param {GameState} state
 * @param {MapHexSet} mapHexSet
 * @param {number} victoryPointsTarget
 * @returns {{ winner: string | null, reason: 'SCORE' | 'SUDDEN_DEATH' | null }}
 */
export function isGameOver(state, mapHexSet, victoryPointsTarget) {
    const { players, turnOrder, currentTurnIndex } = state;

    for (const [playerId, points] of Object.entries(players)) {
        if (points >= victoryPointsTarget) {
            return { winner: playerId, reason: 'SCORE' };
        }
    }

    const legalActions = getLegalActions(state, mapHexSet);
    if (legalActions.length === 0) {
        const currentPlayer = turnOrder[currentTurnIndex];
        // The player with no legal actions loses; find any other player as winner
        const winner = turnOrder.find(p => p !== currentPlayer) ?? null;
        return { winner, reason: 'SUDDEN_DEATH' };
    }

    return { winner: null, reason: null };
}
