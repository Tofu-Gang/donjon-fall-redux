/** @typedef {import("../../docs/runtime-types/pendingCombat.js").PendingCombat} PendingCombat */
import { evaluateFocalPoints } from "../logic/focalPoints.js";
import { getDiceAtHex, getNextStackIndex, getTopDie } from "../logic/dice.js";
import { resolveCombatOccupy, resolveCombatPhase1, resolveCombatPush } from "../logic/combat.js";
import { hexKey } from "../logic/hex.js";
import { isGameOver } from "../logic/actions.js";
import mapDataDefault from "../maps/default.json";

export function rollD6() {
    return Math.floor(Math.random() * 6) + 1;
}

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

export function buildInitialState(mapData, randomizeDice, rollFn = rollD6) {
    const playerCount = 2;
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
                faceValue: firstFaceValues[hexIdx][dieIdx],
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
    const victoryPointsTarget = victoryPointsTargets[0]?.target ?? 5;

    return {
        dice,
        players: { red: 0, blue: 0 },
        turnOrder: ["red", "blue"],
        currentTurnIndex: 0,
        turnPhase: "FOCAL",
        focalPointsGroups,
        turnContext: null,
        pendingCombat: null,
        actionTaken: false,
        victoryPointsTarget,
    };
}

export function applyGameAction(state, gameAction, rollFn = rollD6) {
    const { dice } = state;
    const activePlayer = state.turnOrder[state.currentTurnIndex];

    if (gameAction.type === "REROLL") {
        const die = dice[gameAction.dieId];
        const newValue = Math.max(rollFn(), die.faceValue);
        return {
            ...state,
            dice: { ...dice, [die.id]: { ...die, faceValue: newValue } },
            actionTaken: true,
        };
    }

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

    if (gameAction.type === "MOVE_DIE") {
        const { dieId, path } = gameAction;
        const die = dice[dieId];
        const targetCoords = path[path.length - 1];
        const targetTop = getTopDie(dice, targetCoords);
        const isCombatTarget = targetTop !== null && targetTop.owner !== activePlayer;

        if (isCombatTarget) {
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

        const newDice = { ...dice };
        for (const die of stack) {
            newDice[die.id] = { ...die, coords: targetCoords };
        }
        return { ...state, dice: newDice, actionTaken: true };
    }

    return state;
}

export function applyCombatResolution(state, resolution, mapHexSet, rollFn = rollD6) {
    const { pendingCombat, dice } = state;
    const { attackerDieId, attackerCoords, defenderCoords } = pendingCombat;
    const activePlayer = state.turnOrder[state.currentTurnIndex];

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

export function createReducer(mapHexSet, rollFn = rollD6) {
    return function reducer(state, action) {
        switch (action.type) {
            case "EVALUATE_FOCAL_POINTS": {
                const { newState } = evaluateFocalPoints(state, rollFn);
                return { ...newState, turnPhase: "ACTION", actionTaken: false };
            }
            case "PERFORM_ACTION":
                return applyGameAction(state, action.gameAction, rollFn);
            case "RESOLVE_COMBAT":
                return applyCombatResolution(state, action.resolution, mapHexSet, rollFn);
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

export { isGameOver, mapDataDefault };