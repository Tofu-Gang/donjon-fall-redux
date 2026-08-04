import { describe, it, expect } from "vitest";
import { buildInitialState, buildMapHexSet, applyGameAction, applyCombatResolution } from "./gameReducer.js";
import { getLegalActions } from "../logic/actions.js";

/** Compact triangle used to regression-test shortest-path attack approach. */
const TRIANGLE_MAP = {
    hexes: [
        { q: 0, r: 0, s: 0 },
        { q: -1, r: 1, s: 0 },
        { q: 0, r: 1, s: -1 },
        { q: -2, r: 2, s: 0 },
        { q: -1, r: 2, s: -1 },
        { q: 0, r: 2, s: -2 },
        { q: -3, r: 3, s: 0 },
        { q: -2, r: 3, s: -1 },
        { q: -1, r: 3, s: -2 },
        { q: 0, r: 3, s: -3 },
    ],
    baseGroups: [
        {
            forPlayersCount: 2,
            hexes: [{
                coords: { q: 0, r: 0, s: 0 },
                dice: [{ type: "D6", faceValue: 5, stackIndex: 0 }],
            }],
        },
        {
            forPlayersCount: 2,
            hexes: [
                {
                    coords: { q: -1, r: 3, s: -2 },
                    dice: [{ type: "D6", faceValue: 3, stackIndex: 0 }],
                },
                {
                    coords: { q: -1, r: 2, s: -1 },
                    dice: [{ type: "D6", faceValue: 2, stackIndex: 0 }],
                },
            ],
        },
    ],
    focalPointsGroups: [{ forPlayersCount: 2, hexes: [] }],
    victoryPointsTargets: [{ forPlayersCount: 2, target: 5 }],
};

describe("shortest-path combat approach", () => {
    it("uses the short adjacent approach so a side push is not treated as encirclement", () => {
        const mapHexSet = buildMapHexSet(TRIANGLE_MAP);
        let state = buildInitialState(TRIANGLE_MAP, false);
        state = { ...state, turnPhase: "ACTION", actionTaken: false };

        state = applyGameAction(state, {
            type: "MOVE_DIE",
            dieId: "red-0-0",
            path: [
                { q: 0, r: 0, s: 0 },
                { q: -1, r: 1, s: 0 },
                { q: -2, r: 2, s: 0 },
            ],
        });

        state = {
            ...state,
            currentTurnIndex: 0,
            turnPhase: "ACTION",
            actionTaken: false,
            turnContext: null,
        };

        const attack = getLegalActions(state, mapHexSet).find(a =>
            a.type === "MOVE_DIE"
            && a.dieId === "red-0-0"
            && a.path[a.path.length - 1].q === -1
            && a.path[a.path.length - 1].r === 2
        );
        expect(attack).toBeDefined();
        expect(attack.path).toEqual([
            { q: -2, r: 2, s: 0 },
            { q: -1, r: 2, s: -1 },
        ]);

        state = applyGameAction(state, attack);
        expect(state.pendingCombat.attackDirection).toEqual({ q: 1, r: 0, s: -1 });

        state = applyCombatResolution(state, "PUSH", mapHexSet, () => 2);

        expect(state.dice["blue-1-0"]).toBeDefined();
        expect(state.dice["blue-1-0"].coords).toEqual({ q: 0, r: 2, s: -2 });
        expect(state.dice["red-0-0"].coords).toEqual({ q: -1, r: 2, s: -1 });
        expect(state.players.red).toBe(0);
    });
});
