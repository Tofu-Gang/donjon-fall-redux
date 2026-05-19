/** @typedef {import("../../docs/runtime-types/pendingCombat.js").PendingCombat} PendingCombat */
import { useMemo, useReducer } from "react";
import { GameContext } from "./gameContext.js";
import { evaluateFocalPoints } from "../logic/focalPoints.js";
import { getDiceAtHex, getNextStackIndex, getTopDie } from "../logic/dice.js";
import { resolveCombatOccupy, resolveCombatPhase1, resolveCombatPush } from "../logic/combat.js";
import { hexKey } from "../logic/hex.js";
import { isGameOver } from "../logic/actions.js";
import mapDataDefault from "../maps/default.json";

/**
 * Returns a random integer in the range [1, 6] inclusive.
 * Used as the rollFunction argument wherever the logic layer asks for a die roll.
 *
 * @returns {number}
 */
function rollD6() {
    return Math.floor(Math.random() * 6) + 1;
}

/**
 * Builds the full set of valid hex keys for a given map.
 *
 * The map JSON splits hexes into three separate arrays: regular traversable hexes,
 * base hexes (inside baseGroups), and focal point hexes (inside focalPointsGroups).
 * All three must be included so that movement and push logic can correctly determine
 * whether a coordinate is on the map.
 *
 * @param {object} mapData - the raw map JSON (e.g. default.json)
 * @returns {Set<string>} set of "q,r,s" hex key strings covering every hex on the map
 */
function buildMapHexSet(mapData) {
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
 * Constructs the initial GameState from map data.
 *
 * Called once by useReducer's initializer argument so it only runs on mount.
 * Player count (2), player IDs ("red", "blue"), and turn order are hardcoded for this phase.
 *
 * Dice positions and preset face values are read from the map's baseGroups, so they vary
 * by map. Each base hex in the map JSON can define one or more dice (a starting tower),
 * and all of them are placed with their stackIndex values preserved.
 *
 * Face value mirroring: the first player's face values are generated first (either from the
 * map's preset values or randomly), then copied to the second player so both sides start
 * symmetrically. Mirroring is done per die within each hex, preserving tower structure.
 *
 * @param {object} mapData - the raw map JSON
 * @param {boolean} randomizeDice - when true, face values are rolled randomly (1–6) and
 *   mirrored to the second player; when false, the map's preset faceValue fields are used
 * @returns {object} the full initial game state
 */
function buildInitialState(mapData, randomizeDice) {
    // TODO: derive playerCount from the map or a parameter instead of hardcoding 2
    const playerCount = 2;

    // Pick the base groups intended for a 2-player game.
    // TODO: iterate over all base groups dynamically instead of hardcoding index 0 and 1
    const baseGroups = mapData.baseGroups.filter(
        baseGroup => baseGroup.forPlayersCount === playerCount);
    const firstBaseHexes = baseGroups[0].hexes;
    const secondBaseHexes = baseGroups[1].hexes;

    // Build per-hex, per-die face value arrays for the first player.
    // Each entry is an array of face values matching the dice defined on that base hex.
    const firstFaceValues = firstBaseHexes.map(baseHex =>
        randomizeDice ?
            baseHex.dice.map(() => rollD6()) :
            baseHex.dice.map(dieOrTower => dieOrTower.faceValue)
    );

    const dice = {};

    // TODO: derive player IDs ("red", "blue") from the map or a parameter instead of hardcoding
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

    for (let hexIdx = 0; hexIdx < secondBaseHexes.length; hexIdx++) {
        const baseHex = secondBaseHexes[hexIdx];
        for (let dieIdx = 0; dieIdx < baseHex.dice.length; dieIdx++) {
            const id = `blue-${hexIdx}-${dieIdx}`;
            dice[id] = {
                id,
                owner: "blue",
                faceValue: firstFaceValues[hexIdx][dieIdx],  // mirrored from the first player so both sides start equal
                coords: baseHex.coords,
                stackIndex: baseHex.dice[dieIdx].stackIndex,
            };
        }
    }

    const mapFocalPointsGroups = mapData.focalPointsGroups.filter(
        focalPointsGroup => focalPointsGroup.forPlayersCount === playerCount);
    const focalPointsGroups = {};
    mapFocalPointsGroups.forEach((focalPointsGroup, index) => {
        focalPointsGroups[String(index)] = focalPointsGroup.hexes.map(focalPointHex => ({
            coords: focalPointHex.coords,
            isActive: focalPointHex.isActive,
        }));
    });

    const victoryPointsTargets = mapData.victoryPointsTargets.filter(
        victoryPointsTarget => victoryPointsTarget.forPlayersCount === playerCount);
    // TODO: hardcoded fallback of 5 — should be derived from the map without a magic default
    const victoryPointsTarget = victoryPointsTargets[0]?.target ?? 5;

    return {
        dice,
        // TODO: derive players and turnOrder from the map or a parameter instead of hardcoding
        players: { red: 0, blue: 0 },
        turnOrder: ["red", "blue"],
        currentTurnIndex: 0,
        turnPhase: "FOCAL",
        focalPointsGroups,
        turnContext: null,
        pendingCombat: null,   // { attackerDieId, attackerCoords, defenderCoords, isTowerAttack }
        actionTaken: false,    // true once the player has used their action this turn
        victoryPointsTarget,
    };
}

/**
 * Applies a single GameAction to the state and returns the next state.
 *
 * Handles all four action types defined by the logic layer:
 *   - REROLL: rerolls a die, keeping the result only if it is higher than the current value.
 *   - TOWER_COLLAPSE: removes the bottom die from a tower; awards 1 point if it was an enemy die.
 *   - MOVE_DIE: moves a lone die or the top die of a tower to the target hex.
 *     If the target is occupied by an enemy, transitions to the COMBAT phase instead of moving.
 *   - MOVE_TOWER: moves the entire tower stack to the target hex.
 *     If the target is occupied by an enemy, transitions to the COMBAT phase instead of moving.
 *
 * In the COMBAT cases the die/tower has NOT moved yet — the actual position change happens
 * in applyCombatResolution after the player chooses Push or Occupy.
 *
 * Called by the reducer's PERFORM_ACTION case. Not called directly by components;
 * components call the performAction() helper exposed on the context value.
 *
 * @param {object} state - current game state
 * @param {object} gameAction - a GameAction object from getLegalActions (logic/actions.js)
 * @returns {object} next game state
 */
function applyGameAction(state, gameAction) {
    const { dice } = state;
    const activePlayer = state.turnOrder[state.currentTurnIndex];

    if (gameAction.type === "REROLL") {
        const die = dice[gameAction.dieId];
        // Rule: reroll keeps the higher of the new roll and the original value,
        // so the face value can only stay the same or increase.
        const newValue = Math.max(rollD6(), die.faceValue);
        return {
            ...state,
            dice: { ...dice, [die.id]: { ...die, faceValue: newValue } },
            actionTaken: true,
        };
    }

    if (gameAction.type === "TOWER_COLLAPSE") {
        // getDiceAtHex returns the stack sorted by stackIndex ascending, so index 0 is the bottom die.
        const stack = getDiceAtHex(dice, gameAction.coords);
        const bottomDie = stack[0];
        const newDice = { ...dice };
        delete newDice[bottomDie.id];
        // Destroying an enemy die scores 1 point for the active player.
        const isEnemy = bottomDie.owner !== activePlayer;
        const players = isEnemy
            ? { ...state.players, [activePlayer]: state.players[activePlayer] + 1 }
            : state.players;
        return { ...state, dice: newDice, players, actionTaken: true };
    }

    if (gameAction.type === "MOVE_DIE") {
        const { dieId, path } = gameAction;
        const die = dice[dieId];
        const targetCoords = path[path.length - 1];
        const targetTop = getTopDie(dice, targetCoords);
        const isCombatTarget = targetTop !== null && targetTop.owner !== activePlayer;

        if (isCombatTarget) {
            // Don't move the die yet — record the pending combat and wait for the player
            // to choose Push or Occupy before committing any position changes.
            return {
                ...state,
                turnPhase: "COMBAT",
                pendingCombat: {
                    attackerDieId: dieId,
                    attackerCoords: die.coords,
                    defenderCoords: targetCoords,
                    isTowerAttack: false,
                },
                actionTaken: true,
            };
        }

        // Non-combat move: stack on top of any friendly die already there, or land on empty hex.
        const newStackIndex = getNextStackIndex(dice, targetCoords);
        return {
            ...state,
            dice: { ...dice, [dieId]: { ...die, coords: targetCoords, stackIndex: newStackIndex } },
            actionTaken: true,
        };
    }

    if (gameAction.type === "MOVE_TOWER") {
        const { coords, path } = gameAction;
        const targetCoords = path[path.length - 1];
        const stack = getDiceAtHex(dice, coords);
        const targetTop = getTopDie(dice, targetCoords);
        const isCombatTarget = targetTop !== null && targetTop.owner !== activePlayer;

        if (isCombatTarget) {
            // Same as MOVE_DIE combat case: record pending combat, don't move yet.
            // isTowerAttack: true signals that only Push is available (towers cannot Occupy).
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

        // Non-combat tower move: relocate every die in the stack to the target hex.
        // stackIndex values are preserved so the tower order stays intact.
        const newDice = { ...dice };
        for (const die of stack) {
            newDice[die.id] = { ...die, coords: targetCoords };
        }
        return { ...state, dice: newDice, actionTaken: true };
    }

    return state;
}

/**
 * Resolves a pending combat after the player has chosen Push or Occupy.
 *
 * Both resolutions share Phase 1: the attacker's face value decreases by 1 (floor 1).
 *
 * Phase 2 differs by choice:
 *   - "PUSH": calls resolveCombatPush, which rerolls the first defender, shifts the
 *     enemy formation one hex in the attack direction, and may destroy the last formation
 *     member if pushed off the map or into encirclement. Destroyed dice score 1 point each.
 *   - "OCCUPY": calls resolveCombatOccupy, which places the attacker on top of the
 *     defender's stack, forming a mixed tower. Only legal when the attacker is a lone die
 *     (not a tower); callers are responsible for enforcing this before dispatching.
 *
 * After resolution, turnPhase returns to "ACTION" so the player can press End Turn.
 * pendingCombat is cleared.
 *
 * Called by the reducer's RESOLVE_COMBAT case. Components call resolveCombat() on the
 * context value, which dispatches { type: "RESOLVE_COMBAT", resolution: "PUSH"|"OCCUPY" }.
 *
 * @param {object} state - current game state (must have a non-null pendingCombat)
 * @param {"PUSH"|"OCCUPY"} resolution - which combat option the player chose
 * @param {Set<string>} mapHexSet - full set of valid hex keys, needed by resolveCombatPush
 * @returns {object} next game state
 */
function applyCombatResolution(state, resolution, mapHexSet) {
    const { pendingCombat, dice } = state;
    const { attackerDieId, attackerCoords, defenderCoords } = pendingCombat;
    const activePlayer = state.turnOrder[state.currentTurnIndex];

    // Phase 1: attacker's face value decreases by 1, minimum 1.
    let newDice = resolveCombatPhase1(dice, attackerCoords);
    let extraPoints = 0;

    if (resolution === "PUSH") {
        const { dice: pushedDice, pointsScored } = resolveCombatPush(
            newDice, mapHexSet, attackerCoords, defenderCoords, rollD6
        );
        newDice = pushedDice;
        extraPoints = pointsScored;
    } else {
        // OCCUPY: attacker lands on top of the defender stack.
        newDice = resolveCombatOccupy(newDice, attackerDieId, attackerCoords, defenderCoords);
    }

    const players = extraPoints > 0
        ? { ...state.players, [activePlayer]: state.players[activePlayer] + extraPoints }
        : state.players;

    return {
        ...state,
        dice: newDice,
        players,
        turnPhase: "ACTION",
        pendingCombat: null,
    };
}

/**
 * Factory that creates the useReducer reducer function with mapHexSet captured in its closure.
 *
 * mapHexSet is static for a given map, but reducers in React must be pure functions with
 * no outside dependencies injected at call time. Creating the reducer inside the provider
 * (via useMemo) lets us close over mapHexSet without passing it through every action payload.
 *
 * Handled action types:
 *   - EVALUATE_FOCAL_POINTS: runs focal point scoring for the active player, then advances
 *     turnPhase to "ACTION" so the player can take their action.
 *   - PERFORM_ACTION: delegates to applyGameAction with action.gameAction.
 *   - RESOLVE_COMBAT: delegates to applyCombatResolution with action.resolution.
 *   - END_TURN: advances currentTurnIndex, resets turnPhase to "FOCAL" for the next player,
 *     and clears all per-turn context.
 *
 * @param {Set<string>} mapHexSet - full set of valid hex keys for the current map
 * @returns {function} a reducer function suitable for useReducer
 */
function createReducer(mapHexSet) {
    return function reducer(state, action) {
        switch (action.type) {
            case "EVALUATE_FOCAL_POINTS": {
                const { newState } = evaluateFocalPoints(state, rollD6);
                return { ...newState, turnPhase: "ACTION", actionTaken: false };
            }
            case "PERFORM_ACTION":
                return applyGameAction(state, action.gameAction);
            case "RESOLVE_COMBAT":
                return applyCombatResolution(state, action.resolution, mapHexSet);
            case "END_TURN": {
                const nextIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
                return {
                    ...state,
                    currentTurnIndex: nextIndex,
                    turnPhase: "FOCAL",
                    turnContext: null,
                    pendingCombat: null,
                    actionTaken: false,
                };
            }
            default:
                return state;
        }
    };
}

/**
 * Provides the game state and all dispatch helpers to the component tree.
 *
 * Wrap the entire app in GameProvider so that Board, ActionPanel, and any other
 * game-aware component can call useGame() to access state and actions.
 *
 * The provider also computes winner/reason as derived state after every state change,
 * so consumers never need to call isGameOver themselves.
 *
 * Context value shape:
 *   - state {object}              full GameState (plus pendingCombat, actionTaken, victoryPointsTarget)
 *   - mapHexSet {Set<string>}     set of all valid hex keys; pass to logic functions that need it
 *   - winner {string|null}        player ID of the winner, or null if the game is still ongoing
 *   - reason {string|null}        "SCORE" | "SUDDEN_DEATH" | null
 *   - evaluateFocalPoints()       call at the start of the FOCAL phase to score and rotate focal points
 *   - performAction(gameAction)   call with a GameAction from getLegalActions to take the turn action
 *   - resolveCombat(resolution)   call with "PUSH" or "OCCUPY" during the COMBAT phase
 *   - endTurn()                   call after the action (and optional combat) to advance to the next turn
 *
 * @param {object} [mapData=mapDataDefault] - raw map JSON; defaults to the built-in default map
 * @param {boolean} [randomizeDice=false] - when true, starting face values are randomized and mirrored
 * @param {React.ReactNode} children - the component subtree that can call useGame()
 */
export function GameProvider({ mapData = mapDataDefault, randomizeDice = false, children }) {
    const mapHexSet = useMemo(() => buildMapHexSet(mapData), [mapData]);
    const reducer = useMemo(() => createReducer(mapHexSet), [mapHexSet]);
    const [state, dispatch] = useReducer(reducer, null, () => buildInitialState(mapData, randomizeDice));

    const { winner, reason } = useMemo(
        () => isGameOver(state, mapHexSet, state.victoryPointsTarget),
        [state, mapHexSet]
    );

    const value = useMemo(() => ({
        state,
        mapHexSet,
        winner,
        reason,
        evaluateFocalPoints: () => dispatch({ type: "EVALUATE_FOCAL_POINTS" }),
        performAction: (gameAction) => dispatch({ type: "PERFORM_ACTION", gameAction }),
        resolveCombat: (resolution) => dispatch({ type: "RESOLVE_COMBAT", resolution }),
        endTurn: () => dispatch({ type: "END_TURN" }),
    }), [state, mapHexSet, winner, reason]);

    return (
        <GameContext.Provider value={value}>
            {children}
        </GameContext.Provider>
    );
}
