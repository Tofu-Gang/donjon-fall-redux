import { useMemo, useReducer } from "react";
import { GameContext } from "./gameContext.js";
import { buildInitialState, buildMapHexSet, createReducer, isGameOver, mapDataDefault } from "./gameReducer.js";

/**
 * Root provider that owns all game state and exposes it (plus action dispatchers) to the tree.
 *
 * @param {object} props
 * @param {object} [props.mapData] - Map layout (hexes, bases, focal points, VP targets).
 * @param {boolean} [props.randomizeDice] - When true, dice start with random face values instead of map defaults.
 * @param {React.ReactNode} props.children - Subtree that can consume GameContext.
 */
export function GameProvider({ mapData = mapDataDefault, randomizeDice = false, children }) {
    // Set of valid hex keys on the board; derived once per map and passed to the reducer.
    const mapHexSet = useMemo(() => buildMapHexSet(mapData), [mapData]);
    // Reducer is scoped to this map's hex set so move/combat validation stays map-aware.
    const reducer = useMemo(() => createReducer(mapHexSet), [mapHexSet]);
    // Lazy init: buildInitialState runs only on mount, not on every render.
    const [state, dispatch] = useReducer(reducer, null, () => buildInitialState(mapData, randomizeDice));

    // Recompute win condition whenever state or the board changes.
    const { winner, reason } = useMemo(
        () => isGameOver(state, mapHexSet, state.victoryPointsTarget),
        [state, mapHexSet]
    );

    // Stable context value: state snapshot, derived data, and thin wrappers around dispatch.
    const value = useMemo(() => ({
        state,
        mapHexSet,
        winner,
        reason,
        evaluateFocalPoints: () => dispatch({ type: "EVALUATE_FOCAL_POINTS" }),
        performAction: (gameAction) => dispatch({ type: "PERFORM_ACTION", gameAction }),
        resolveCombat: (resolution) => dispatch({ type: "RESOLVE_COMBAT", resolution }),
        endTurn: () => dispatch({ type: "END_TURN" }),
        logGameOver: (winner, reason) => dispatch({ type: "LOG_GAME_OVER", winner, reason }),
    }), [state, mapHexSet, winner, reason]);

    return (
        <GameContext.Provider value={value}>
            {children}
        </GameContext.Provider>
    );
}
