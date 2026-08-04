/** @typedef {import("../../docs/runtime-types/diceMap.js").DiceMap} DiceMap */
/** @typedef {import("../../docs/runtime-types/hexCoords.js").HexCoords} HexCoords */
/** @typedef {import("../../docs/runtime-types/mapHexSet.js").MapHexSet} MapHexSet */
/** @typedef {import("../../docs/runtime-types/jumpBonus.js").JumpBonus} JumpBonus */
/** @typedef {import("../../docs/runtime-types/jumpContext.js").JumpContext} JumpContext */
/** @typedef {import("../../docs/runtime-types/turnContext.js").TurnContext} TurnContext */

import { hexKey, hexDirection, hexDistance } from "./hex.js";
import { getDiceAtHex, getTopDie, getNextStackIndex } from "./dice.js";

/**
 * Effective combat power for a jumping die: face value plus every bonus still
 * in range at `coords` (hex distance from that bonus's origin).
 *
 * @param {number} faceValue
 * @param {JumpBonus[] | null | undefined} bonuses
 * @param {HexCoords} coords
 * @returns {number}
 */
export function effectiveJumpCombatPower(faceValue, bonuses, coords) {
    let cp = faceValue;
    for (const b of bonuses ?? []) {
        if (hexDistance(b.originCoords, coords) <= b.retainedRange) {
            cp += b.bonus;
        }
    }
    return cp;
}

/**
 * Bonus granted when the moving die leaves a tower where it is already on top.
 * Returns null if the hex is not a tower.
 *
 * @param {DiceMap} dice
 * @param {HexCoords} coords
 * @returns {JumpBonus | null}
 */
export function jumpBonusFromTowerTop(dice, coords) {
    const stack = getDiceAtHex(dice, coords);
    if (stack.length < 2) return null;
    const top = stack[stack.length - 1];
    const below = stack.slice(0, -1);
    const supporting = below.filter(d => d.owner === top.owner).length;
    const enemyBelow = below.filter(d => d.owner !== top.owner).length;
    const ownCount = stack.filter(d => d.owner === top.owner).length;
    const enemyCount = stack.filter(d => d.owner !== top.owner).length;
    return {
        originCoords: { q: coords.q, r: coords.r, s: coords.s },
        bonus: supporting - enemyBelow,
        retainedRange: Math.max(ownCount - enemyCount, 1),
    };
}

/**
 * Bonus granted when the moving die stacks onto dice already at `coords`
 * (those dice become the supports/enemies under the mover).
 *
 * @param {DiceMap} dice
 * @param {HexCoords} coords
 * @param {string} movingOwner
 * @returns {JumpBonus}
 */
export function jumpBonusFromLanding(dice, coords, movingOwner) {
    const stack = getDiceAtHex(dice, coords);
    const supporting = stack.filter(d => d.owner === movingOwner).length;
    const enemy = stack.filter(d => d.owner !== movingOwner).length;
    return {
        originCoords: { q: coords.q, r: coords.r, s: coords.s },
        bonus: supporting - enemy,
        retainedRange: Math.max(supporting + 1 - enemy, 1),
    };
}

/**
 * Walks a MOVE_DIE path and builds turnContext.jumpContext from every tower
 * left along the way (starting tower and/or friendlies landed on).
 * Returns null when no bonuses were created.
 *
 * @param {DiceMap} dice
 * @param {string} dieId
 * @param {HexCoords[]} path
 * @param {string} activePlayer
 * @returns {TurnContext | null}
 */
export function buildJumpContextAlongPath(dice, dieId, path, activePlayer) {
    if (!path.length || !dice[dieId]) return null;

    /** @type {JumpBonus[]} */
    const bonuses = [];
    const start = path[0];
    const startTop = getTopDie(dice, start);
    if (startTop?.id === dieId) {
        const fromStart = jumpBonusFromTowerTop(dice, start);
        if (fromStart) bonuses.push(fromStart);
    }

    for (let i = 1; i < path.length; i++) {
        const hex = path[i];
        const top = getTopDie(dice, hex);
        if (top && top.owner === activePlayer) {
            bonuses.push(jumpBonusFromLanding(dice, hex, activePlayer));
        }
    }

    if (bonuses.length === 0) return null;
    return { jumpContext: { dieId, bonuses } };
}

/**
 * Returns the combat power of the die or tower currently at the given hex.
 * For a lone die the combat power equals its face value.
 * For a tower: F + S - E, where F is the top die face value, S is the number of
 * supporting dice (same owner as top die, not the top die itself), and E is the
 * number of enemy dice (different owner than top die).
 * For a jumping die alone on a hex: if turnContext.jumpContext matches that die,
 * returns faceValue + Σ bonuses still in range; otherwise face value.
 * Returns 0 for an empty hex.
 *
 * @param {DiceMap} dice
 * @param {HexCoords} coords
 * @param {TurnContext | null} [turnContext=null]
 * @returns {number}
 */
export function getCombatPower(dice, coords, turnContext = null) {
    const stack = getDiceAtHex(dice, coords);
    if (stack.length === 0) return 0;
    const topDie = stack[stack.length - 1];

    // Jump retention applies only while the die is alone (not tower top).
    const jumpContext = turnContext?.jumpContext;
    if (
        jumpContext
        && jumpContext.dieId === topDie.id
        && stack.length === 1
    ) {
        return effectiveJumpCombatPower(topDie.faceValue, jumpContext.bonuses, coords);
    }

    if (stack.length === 1) return topDie.faceValue;
    const rest = stack.slice(0, -1);
    const supporting = rest.filter(d => d.owner === topDie.owner).length;
    const enemy = rest.filter(die => die.owner !== topDie.owner).length;
    return topDie.faceValue + supporting - enemy;
}

/**
 * Returns the movement range of the die or tower at the given hex.
 * For a lone die the movement range equals its face value (same as combat power for a lone die).
 * For a die on top of a tower the movement range equals that die's face value alone.
 * For a tower (when the entire tower moves) the movement range is max(O - E, 1), where O is
 * the number of own dice and E is the number of enemy dice in the tower.
 * Returns 0 for an empty hex.
 *
 * This function returns the tower's movement range when the tower moves as a whole.
 * When a die jumps off a tower the caller is responsible for applying the die's face value
 * as its movement range and providing the tower's pre-jump movement range for the retained
 * combat-power zone.
 *
 * @param {DiceMap} dice
 * @param {HexCoords} coords
 * @returns {number}
 */
export function getMovementRange(dice, coords) {
    const stack = getDiceAtHex(dice, coords);
    if (stack.length === 0) return 0;
    if (stack.length === 1) return stack[0].faceValue;
    const topDie = stack[stack.length - 1];
    const ownDice = stack.filter(d => d.owner === topDie.owner).length;
    const enemyDice = stack.filter(d => d.owner !== topDie.owner).length;
    return Math.max(ownDice - enemyDice, 1);
}

/**
 * Resolves Phase 1 of combat: the attacking die's face value decreases by 1, floor 1.
 * The top die at attackerCoords is the attacking die (lone die or tower top).
 * Returns an updated DiceMap with only that die's faceValue modified.
 *
 * At the time this is called the attacker has not yet moved to defenderCoords — it still
 * sits at attackerCoords so the top die there is unambiguously the attacking die.
 *
 * @param {DiceMap} dice
 * @param {HexCoords} attackerCoords
 * @returns {DiceMap}
 */
export function resolveCombatPhase1(dice, attackerCoords) {
    const topDie = getTopDie(dice, attackerCoords);
    return {
        ...dice,
        [topDie.id]: {...topDie, faceValue: Math.max(topDie.faceValue - 1, 1)},
    };
}

/**
 * Collects the enemy formation for a push.
 * Starts at defenderCoords and follows the attack direction, collecting every consecutive
 * hex that is occupied by at least one die whose top die belongs to an enemy (any player
 * other than attackerOwner).
 *
 * @param {DiceMap} dice
 * @param {MapHexSet} mapHexSet
 * @param {string} attackerOwner
 * @param {HexCoords} defenderCoords
 * @param {HexCoords} direction - unit step in the attack direction
 * @returns {HexCoords[]} ordered formation hexes, first = defender hex
 */
function collectFormation(dice, mapHexSet, attackerOwner, defenderCoords, direction) {
    const formation = [];
    let currentCoords = defenderCoords;
    while (true) {
        if (!mapHexSet.has(hexKey(currentCoords))) break;
        const topDie = getTopDie(dice, currentCoords);
        if (!topDie || topDie.owner === attackerOwner) break;
        formation.push(currentCoords);
        currentCoords = {q: currentCoords.q + direction.q, r: currentCoords.r + direction.r, s: currentCoords.s + direction.s};
    }
    return formation;
}

/**
 * Resolves Phase 2 Push combat.
 *
 * Steps:
 * 1. The enemy formation is identified: defenderCoords and every consecutive enemy hex
 *    beyond it in the attack direction.
 * 2. The top die of the first formation hex (the direct defender) is rerolled:
 *    new face value = min(rollFn(), original).
 * 3. All dice in the formation are moved one hex in the attack direction.
 * 4. The attacker is moved from attackerCoords to defenderCoords (where the formation was).
 * 5. If the hex the last formation member would move into is off-map (border) or occupied
 *    by the attacker's own die/tower (encirclement), every die in the last formation hex is
 *    removed from the game and the caller scores one point per die destroyed.
 *
 * At the time this is called the attacker has not yet moved to defenderCoords.
 *
 * @param {DiceMap} dice
 * @param {MapHexSet} mapHexSet
 * @param {HexCoords} attackerCoords
 * @param {HexCoords} defenderCoords
 * @param {() => number} rollFn - returns a random face value within the die's valid range
 * @param {HexCoords | null} [attackDirection=null] - unit step into the defender; derived from
 *   attacker→defender when omitted (requires those hexes to be colinear)
 * @returns {{ dice: DiceMap, pointsScored: number }}
 */
export function resolveCombatPush(dice, mapHexSet, attackerCoords, defenderCoords, rollFn, attackDirection = null) {
    const attackerTopDie = getTopDie(dice, attackerCoords);
    const attackerOwner = attackerTopDie.owner;
    const direction = attackDirection ?? hexDirection(attackerCoords, defenderCoords);
    const formation = collectFormation(dice, mapHexSet, attackerOwner, defenderCoords, direction);

    // Reroll the first formation member's top die: min(roll, original).
    const defenderTopDie = getTopDie(dice, formation[0]);
    const rerolledValue = Math.min(rollFn(), defenderTopDie.faceValue);
    let updatedDice = {
        ...dice,
        [defenderTopDie.id]: {...defenderTopDie, faceValue: rerolledValue},
    };

    // Determine whether the last formation member is destroyed.
    const lastHex = formation[formation.length - 1];
    const beyondHex = {q: lastHex.q + direction.q, r: lastHex.r + direction.r, s: lastHex.s + direction.s};
    const beyondKey = hexKey(beyondHex);
    const isBeyondKeyOffMap = !mapHexSet.has(beyondKey);
    const beyondTopDie = isBeyondKeyOffMap ? null : getTopDie(updatedDice, beyondHex);
    const isFormationEncircled = !isBeyondKeyOffMap && beyondTopDie !== null && beyondTopDie.owner === attackerOwner;
    const shouldDestroyLast = isBeyondKeyOffMap || isFormationEncircled;

    // Collect IDs of dice to destroy (all dice at the last formation hex).
    const destroyIds = new Set(
        shouldDestroyLast ? getDiceAtHex(updatedDice, lastHex).map(die => die.id) : []
    );

    // Build the new formation key set for bulk movement.
    const formationKeySet = new Set(formation.map(coords => hexKey(coords)));

    // Rebuild the dice map: move formation dice, remove destroyed dice, move attacker.
    const result = {};
    for (const [id, die] of Object.entries(updatedDice)) {
        if (destroyIds.has(id)) continue;

        if (hexKey(die.coords) === hexKey(attackerCoords)) {
            // Attacker moves to defenderCoords.
            result[id] = {...die, coords: defenderCoords};
        } else if (formationKeySet.has(hexKey(die.coords))) {
            // Formation die moves one step forward.
            result[id] = {
                ...die,
                coords: {q: die.coords.q + direction.q, r: die.coords.r + direction.r, s: die.coords.s + direction.s},
            };
        } else {
            result[id] = die;
        }
    }

    return {dice: result, pointsScored: destroyIds.size};
}

/**
 * Resolves Phase 2 Occupy combat.
 * Only legal when the attacker is a lone die (not a tower) — callers must enforce this.
 * The attacking die is placed on top of the defender's stack at defenderCoords, forming a
 * mixed tower. The defender does not reroll.
 *
 * At the time this is called the attacker has not yet moved to defenderCoords.
 *
 * @param {DiceMap} dice
 * @param {string} attackerDieId
 * @param {HexCoords} attackerCoords - current attacker position (not defenderCoords yet)
 * @param {HexCoords} defenderCoords
 * @returns {DiceMap}
 */
export function resolveCombatOccupy(dice, attackerDieId, attackerCoords, defenderCoords) {
    const attacker = dice[attackerDieId];
    const newStackIndex = getNextStackIndex(dice, defenderCoords);
    return {
        ...dice,
        [attackerDieId]: {
            ...attacker,
            coords: defenderCoords,
            stackIndex: newStackIndex,
        },
    };
}
