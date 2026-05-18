/** @typedef {import("../../docs/runtime-types/gameState.js").GameState} GameState */
/** @typedef {import("../../docs/runtime-types/focalPointHex.js").FocalPointHex} FocalPointHex */

import { getTopDie } from "./dice.js";
import { hexKey } from "./hex.js";

/**
 * Given a focal point group and an array of scored focal points, applies one rotation
 * sequentially per scored focal point: the scored FP becomes passive, then a randomly
 * chosen currently-passive FP (including previously-scored ones) becomes active.
 * This preserves the active count even in edge cases where passives are scarce — e.g.
 * two active FPs scored against one passive: after rotation 1 the scored FP joins the
 * passive pool and rotation 2 can re-promote it, keeping the active count stable.
 *
 * @param {FocalPointHex[]} group
 * @param {FocalPointHex[]} scoredFocalPoints - focal points that were scored this turn
 * @returns {FocalPointHex[]}
 */
export function rotateFocalGroup(group, scoredFocalPoints) {
    let current = group.map(fp => ({ ...fp }));
    for (const scored of scoredFocalPoints) {
        const key = hexKey(scored.coords);
        const passives = current.filter(fp => !fp.isActive);
        const chosen = passives.length > 0
            ? passives[Math.floor(Math.random() * passives.length)]
            : null;
        current = current.map(fp => {
            if (hexKey(fp.coords) === key) return { ...fp, isActive: false };
            if (chosen && hexKey(fp.coords) === hexKey(chosen.coords)) return { ...fp, isActive: true };
            return fp;
        });
    }
    return current;
}

/**
 * Evaluates focal points at the start of the active player's turn.
 * For each group: for every active focal point the active player controls, award 1 victory
 * point, reroll the top die (new value = min(roll, original - 1), minimum 1), then rotate
 * the group once per scored focal point.
 *
 * @param {GameState} state
 * @param {() => number} rollFunction - returns a random integer 1-6
 * @returns {{ newState: GameState, pointsScored: number }}
 */
export function evaluateFocalPoints(state, rollFunction) {
    const activePlayer = state.turnOrder[state.currentTurnIndex];
    let dice = state.dice;
    let players = state.players;
    let focalPointsGroups = state.focalPointsGroups;
    let pointsScored = 0;

    for (const [groupId, group] of Object.entries(focalPointsGroups)) {
        const scoredFocalPoints = [];

        for (const focalPoint of group) {
            if (!focalPoint.isActive) continue;
            const topDie = getTopDie(dice, focalPoint.coords);
            if (!topDie || topDie.owner !== activePlayer) continue;

            pointsScored += 1;
            players = { ...players, [activePlayer]: players[activePlayer] + 1 };

            const rerolled = Math.min(rollFunction(), Math.max(topDie.faceValue - 1, 1));
            dice = { ...dice, [topDie.id]: { ...topDie, faceValue: rerolled } };

            scoredFocalPoints.push(focalPoint);
        }

        if (scoredFocalPoints.length > 0) {
            focalPointsGroups = {
                ...focalPointsGroups,
                [groupId]: rotateFocalGroup(group, scoredFocalPoints),
            };
        }
    }

    return {
        newState: { ...state, dice, players, focalPointsGroups },
        pointsScored,
    };
}
