import { useMemo, useReducer } from "react";
import { GameContext } from "./gameContext.js";
import {
    buildInitialState,
    buildMapHexSet,
    createReducer,
    isGameOver,
    mapDataDefault,
} from "./gameReducer.js";

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