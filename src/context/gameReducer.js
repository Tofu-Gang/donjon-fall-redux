/** @typedef {import("../../docs/runtime-types/pendingCombat.js").PendingCombat} PendingCombat */
import { evaluateFocalPoints } from "../logic/focalPoints.js";
import { getDiceAtHex, getNextStackIndex, getTopDie } from "../logic/dice.js";
import { buildJumpContextAlongPath, resolveCombatOccupy, resolveCombatPhase1, resolveCombatPush } from "../logic/combat.js";
import { hexKey } from "../logic/hex.js";
import { isGameOver } from "../logic/actions.js";
import mapDataDefault from "../maps/default.json";

/**
 * Returns a fair d6 roll in [1, 6]. Extracted so tests can inject a deterministic rollFn.
 *
 * @returns {number} Integer from 1 to 6 inclusive.
 */
export function rollD6() {
    return Math.floor(Math.random() * 6) + 1;
}

/**
 * Builds a Set of all valid hex keys on the map: plain hexes + every base + every focal point.
 * Used by the reducer and legal-action logic to cheaply check hex membership.
 *
 * @param {object} mapData - Map definition (hexes, baseGroups, focalPointsGroups).
 * @returns {Set<string>} Set of hex keys, one per hex on the board.
 */
export function buildMapHexSet(mapData) {
    const set = new Set();
    for (const hex of mapData.hexes) set.add(hexKey(hex));
    for (const baseGroup of mapData.baseGroups) {
        for (const baseHex of baseGroup.hexes) set.add(hexKey(baseHex.coords));
    }
    for (const focalPointsGroup of mapData.focalPointsGroups) {
        for (const focalPointHex of focalPointsGroup.hexes) {
            set.add(hexKey(focalPointHex.coords));
        }
    }
    return set;
}

/**
 * Builds the initial game state from a map definition. When randomizeDice is true,
 * each base die is rolled fresh; otherwise its starting face value comes from the map.
 * rollFn is injectable so tests can pin the initial dice values.
 *
 * @param {object} mapData - Map definition.
 * @param {boolean} randomizeDice - When true, dice start with random face values instead of map defaults.
 * @param {() => number} [rollFn=rollD6] - Injectable RNG used when randomizeDice is true.
 * @returns {object} The initial state object.
 */
export function buildInitialState(mapData, randomizeDice, rollFn = rollD6) {
    const playerCount = 2;
    // Two-player setup: take only the base/focal/target groups declared for 2 players.
    const baseGroups = mapData.baseGroups.filter(
        baseGroup => baseGroup.forPlayersCount === playerCount);
    const firstBaseHexes = baseGroups[0].hexes;
    const secondBaseHexes = baseGroups[1].hexes;

    const firstFaceValues = firstBaseHexes.map(baseHex =>
        randomizeDice ?
            baseHex.dice.map(() => rollFn()) :
            baseHex.dice.map(dieOrTower => dieOrTower.faceValue)
    );

    const dice = {};

    // Player 1 (red) — place each die at its base hex with its configured stack index.
    for (let hexIdx = 0; hexIdx < firstBaseHexes.length; hexIdx++) {
        const baseHex = firstBaseHexes[hexIdx];
        for (let dieIdx = 0; dieIdx < baseHex.dice.length; dieIdx++) {
            const id = `red-${hexIdx}-${dieIdx}`;
            dice[id] = {
                id,
                owner: "red",
                faceValue: firstFaceValues[hexIdx][dieIdx],
                coords: baseHex.coords,
                stackIndex: baseHex.dice[dieIdx].stackIndex,
            };
        }
    }

    // Player 2 (blue) — same shape as red, but uses the static face values from the map.
    // (Blue's starting faces are not rolled even when randomizeDice is true; that's intentional.)
    for (let hexIdx = 0; hexIdx < secondBaseHexes.length; hexIdx++) {
        const baseHex = secondBaseHexes[hexIdx];
        for (let dieIdx = 0; dieIdx < baseHex.dice.length; dieIdx++) {
            const id = `blue-${hexIdx}-${dieIdx}`;
            dice[id] = {
                id,
                owner: "blue",
                faceValue: firstFaceValues[hexIdx][dieIdx],
                coords: baseHex.coords,
                stackIndex: baseHex.dice[dieIdx].stackIndex,
            };
        }
    }

    // Focal-point groups are keyed by group index (string) so the lookup in Board.jsx can use Object.values.
    const mapFocalPointsGroups = mapData.focalPointsGroups.filter(
        focalPointsGroup => focalPointsGroup.forPlayersCount === playerCount);
    const focalPointsGroups = {};
    mapFocalPointsGroups.forEach((focalPointsGroup, index) => {
        focalPointsGroups[String(index)] = focalPointsGroup.hexes.map(focalPointHex => ({
            coords: focalPointHex.coords,
            isActive: focalPointHex.isActive,
        }));
    });

    // VP target defaults to 5 when the map doesn't specify one for 2 players.
    const victoryPointsTargets = mapData.victoryPointsTargets.filter(
        victoryPointsTarget => victoryPointsTarget.forPlayersCount === playerCount);
    const victoryPointsTarget = victoryPointsTargets[0]?.target ?? 5;

    return {
        dice,
        players: { red: 0, blue: 0 },
        turnOrder: ["red", "blue"],
        currentTurnIndex: 0,
        turnNumber: 1,
        turnPhase: "FOCAL",
        focalPointsGroups,
        turnContext: null,
        pendingCombat: null,
        actionTaken: false,
        victoryPointsTarget,
        // Ephemeral DieFace chrome: dieId → "rerolled" | "damaged". Cleared at
        // the start of each FOCAL evaluation (next turn).
        dieVisualById: {},
    };
}

/**
 * Marks dice whose faceValue dropped between two dice maps.
 *
 * @param {object} prevDice
 * @param {object} nextDice
 * @param {"rerolled"|"damaged"} visual
 * @param {object} [base={}] - Existing hints to merge into.
 * @returns {object}
 */
function faceDropHints(prevDice, nextDice, visual, base = {}) {
    const hints = { ...base };
    for (const [id, die] of Object.entries(nextDice)) {
        const prev = prevDice[id];
        if (prev && die.faceValue < prev.faceValue) {
            hints[id] = visual;
        }
    }
    return hints;
}

/**
 * Dispatches a player action (REROLL / TOWER_COLLAPSE / MOVE_DIE / MOVE_TOWER) and returns the new state.
 * Moving into an enemy-occupied hex transitions the turn into the COMBAT phase instead of moving immediately.
 *
 * @param {object} state - Current game state.
 * @param {object} gameAction - Action to apply (typed by `type`).
 * @param {() => number} [rollFn=rollD6] - Injectable RNG used for REROLL.
 * @returns {object} Next game state (or the input state unchanged for unknown actions).
 */
export function applyGameAction(state, gameAction, rollFn = rollD6) {
    const { dice } = state;
    const activePlayer = state.turnOrder[state.currentTurnIndex];

    // REROLL: re-roll the chosen die but keep whichever face is higher (never makes a die worse).
    if (gameAction.type === "REROLL") {
        const die = dice[gameAction.dieId];
        const newValue = Math.max(rollFn(), die.faceValue);
        return {
            ...state,
            dice: { ...dice, [die.id]: { ...die, faceValue: newValue } },
            actionTaken: true,
            dieVisualById: { ...state.dieVisualById, [die.id]: "rerolled" },
        };
    }

    // TOWER_COLLAPSE: removes the bottom die of the stack and awards a VP if it was an enemy die.
    if (gameAction.type === "TOWER_COLLAPSE") {
        const stack = getDiceAtHex(dice, gameAction.coords);
        const bottomDie = stack[0];
        const newDice = { ...dice };
        delete newDice[bottomDie.id];
        const isEnemy = bottomDie.owner !== activePlayer;
        const players = isEnemy
            ? { ...state.players, [activePlayer]: state.players[activePlayer] + 1 }
            : state.players;
        return { ...state, dice: newDice, players, actionTaken: true };
    }

    // MOVE_DIE: walks the die along its path; entering an enemy hex opens combat instead of completing the move.
    if (gameAction.type === "MOVE_DIE") {
        const { dieId, path } = gameAction;
        const die = dice[dieId];
        const targetCoords = path[path.length - 1];
        const targetTop = getTopDie(dice, targetCoords);
        const isCombatTarget = targetTop !== null && targetTop.owner !== activePlayer;
        const turnContext = buildJumpContextAlongPath(dice, dieId, path, activePlayer);

        if (isCombatTarget) {
            // Park in COMBAT phase with the pending combat describing attacker/defender coords.
            // Jump bonuses are kept for the remainder of the turn (cleared on END_TURN).
            return {
                ...state,
                turnPhase: "COMBAT",
                pendingCombat: {
                    attackerDieId: dieId,
                    attackerCoords: die.coords,
                    defenderCoords: targetCoords,
                    isTowerAttack: false,
                },
                turnContext,
                actionTaken: true,
            };
        }

        // Peaceful move: place the die on top of whatever is at the destination.
        const newStackIndex = getNextStackIndex(dice, targetCoords);
        const newDice = { ...dice, [dieId]: { ...die, coords: targetCoords, stackIndex: newStackIndex } };
        return {
            ...state,
            dice: newDice,
            turnContext,
            actionTaken: true,
        };
    }

    // MOVE_TOWER: like MOVE_DIE, but moves the entire stack in one shot.
    if (gameAction.type === "MOVE_TOWER") {
        const { coords, path } = gameAction;
        const targetCoords = path[path.length - 1];
        const stack = getDiceAtHex(dice, coords);
        const targetTop = getTopDie(dice, targetCoords);
        const isCombatTarget = targetTop !== null && targetTop.owner !== activePlayer;

        if (isCombatTarget) {
            // For tower attacks, the attacker is the top die of the moving stack.
            const topDie = stack[stack.length - 1];
            return {
                ...state,
                turnPhase: "COMBAT",
                pendingCombat: {
                    attackerDieId: topDie.id,
                    attackerCoords: coords,
                    defenderCoords: targetCoords,
                    isTowerAttack: true,
                },
                actionTaken: true,
            };
        }

        // Peaceful tower move: relocate every die in the stack to the new hex, preserving relative order.
        const newDice = { ...dice };
        for (const die of stack) {
            newDice[die.id] = { ...die, coords: targetCoords };
        }
        return { ...state, dice: newDice, actionTaken: true };
    }

    // Unknown action type is a no-op; the UI is the source of truth for valid actions.
    return state;
}

/**
 * Resolves a pending combat by applying either PUSH or OCCUPY, then returns to the ACTION phase.
 * PUSH may yield bonus VP for pushing a defender off the board; OCCUPY swaps ownership of the destination hex.
 *
 * @param {object} state - Current game state (must have a pendingCombat).
 * @param {"PUSH" | "OCCUPY"} resolution - Chosen combat outcome.
 * @param {Set<string>} mapHexSet - Set of valid hex keys, used to detect push-off-board.
 * @param {() => number} [rollFn=rollD6] - Injectable RNG used during combat.
 * @returns {object} Next game state with the combat cleared and phase back to ACTION.
 */
export function applyCombatResolution(state, resolution, mapHexSet, rollFn = rollD6) {
    const { pendingCombat, dice } = state;
    const { attackerDieId, attackerCoords, defenderCoords } = pendingCombat;
    const activePlayer = state.turnOrder[state.currentTurnIndex];

    // Phase 1 (combat dice rolling, etc.) runs for both resolutions before branching.
    let newDice = resolveCombatPhase1(dice, attackerCoords);
    let extraPoints = 0;

    if (resolution === "PUSH") {
        const { dice: pushedDice, pointsScored } = resolveCombatPush(
            newDice, mapHexSet, attackerCoords, defenderCoords, rollFn
        );
        newDice = pushedDice;
        extraPoints = pointsScored;
    } else {
        newDice = resolveCombatOccupy(newDice, attackerDieId, attackerCoords, defenderCoords);
    }

    // Award any extra VP earned from the push; OCCUPY never awards points directly here.
    const players = extraPoints > 0
        ? { ...state.players, [activePlayer]: state.players[activePlayer] + extraPoints }
        : state.players;

    // Defender face drops from the push reroll → DieFace "damaged" chrome.
    const dieVisualById = faceDropHints(dice, newDice, "damaged", state.dieVisualById);

    return {
        ...state,
        dice: newDice,
        players,
        turnPhase: "ACTION",
        pendingCombat: null,
        // Jump bonuses persist until END_TURN (effective CP filtered by distance).
        turnContext: state.turnContext,
        dieVisualById,
    };
}

/**
 * Creates a reducer bound to a specific map (for hex membership checks) and an optional RNG.
 *
 * @param {Set<string>} mapHexSet - Valid hex keys, used by combat resolution.
 * @param {() => number} [rollFn=rollD6] - Injectable RNG shared across the reducer.
 * @returns {(state: object, action: object) => object} Pure reducer for the game state.
 */
export function createReducer(mapHexSet, rollFn = rollD6) {
    return function reducer(state, action) {
        switch (action.type) {
            // Run focal-point scoring at the start of each turn, then drop back into ACTION.
            case "EVALUATE_FOCAL_POINTS": {
                // Ignore duplicate dispatches (React StrictMode remount / overlapping FX).
                if (state.turnPhase !== "FOCAL") return state;
                const { newState } = evaluateFocalPoints(state, rollFn);
                // Reset prior-turn chrome; mark dice weakened by focal scoring as rerolled.
                const dieVisualById = faceDropHints(state.dice, newState.dice, "rerolled");
                return { ...newState, turnPhase: "ACTION", actionTaken: false, dieVisualById };
            }
            // Forward player actions to the pure applyGameAction helper.
            case "PERFORM_ACTION":
                return applyGameAction(state, action.gameAction, rollFn);
            // Resolve a pending combat (PUSH or OCCUPY) using the bound map + RNG.
            case "RESOLVE_COMBAT":
                return applyCombatResolution(state, action.resolution, mapHexSet, rollFn);
            // Advance to the next player in turn order; reset per-turn state and start a new FOCAL phase.
            case "END_TURN": {
                const nextIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
                return {
                    ...state,
                    currentTurnIndex: nextIndex,
                    turnNumber: state.turnNumber + 1,
                    turnPhase: "FOCAL",
                    turnContext: null,
                    pendingCombat: null,
                    actionTaken: false,
                };
            }
            // Unknown actions are ignored — keeps the reducer pure and easy to extend.
            default:
                return state;
        }
    };
}

/**
 * Re-exported so consumers can `import { isGameOver, mapDataDefault } from "...gameReducer"`.
 * mapDataDefault powers the no-args form of GameProvider; isGameOver is the canonical win check.
 */
export { isGameOver, mapDataDefault };