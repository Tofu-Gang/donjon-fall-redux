import { useCallback, useEffect, useState } from "react";
import { useGame } from "../context/useGame.js";
import { getLegalActions } from "../logic/actions.js";
import { hexKey } from "../logic/hex.js";
import { getTopDie } from "../logic/dice.js";
import mapData from "../maps/default.json";
import Board from "./Board.jsx";
import ActionPanel from "./ActionPanel.jsx";

export default function GameView() {
    const {
        state,
        mapHexSet,
        winner,
        reason,
        evaluateFocalPoints,
        performAction,
        resolveCombat,
        endTurn,
    } = useGame();

    const [selectedDieId, setSelectedDieId] = useState(null);
    const [towerMoveMode, setTowerMoveMode] = useState(false);

    const activePlayer = state.turnOrder[state.currentTurnIndex];

    useEffect(() => {
        if (winner) return;
        if (state.turnPhase === "FOCAL") {
            evaluateFocalPoints();
        }
    }, [state.turnPhase, state.currentTurnIndex, winner, evaluateFocalPoints]);

    const handleSelectDie = useCallback((dieId) => {
        const die = state.dice[dieId];
        if (!die || die.owner !== activePlayer) return;
        const top = getTopDie(state.dice, die.coords);
        if (!top || top.id !== dieId) return;
        setSelectedDieId(dieId);
        setTowerMoveMode(false);
    }, [state.dice, activePlayer]);

    const handleHexClick = useCallback((key, coords) => {
        if (state.turnPhase !== "ACTION" || state.actionTaken) return;

        const legal = getLegalActions(state, mapHexSet);
        const selectedDie = selectedDieId ? state.dice[selectedDieId] : null;

        for (const action of legal) {
            if (towerMoveMode) {
                if (action.type !== "MOVE_TOWER") continue;
                if (!selectedDie || hexKey(action.coords) !== hexKey(selectedDie.coords)) continue;
            } else if (action.type === "MOVE_DIE") {
                if (action.dieId !== selectedDieId) continue;
            } else {
                continue;
            }
            const destKey = hexKey(action.path[action.path.length - 1]);
            if (destKey !== key) continue;
            performAction(action);
            setSelectedDieId(null);
            setTowerMoveMode(false);
            return;
        }

        const top = getTopDie(state.dice, coords);
        if (top && top.owner === activePlayer) {
            handleSelectDie(top.id);
        }
    }, [
        state,
        mapHexSet,
        selectedDieId,
        towerMoveMode,
        activePlayer,
        performAction,
        handleSelectDie,
    ]);

    const handleReroll = useCallback(() => {
        if (!selectedDieId) return;
        performAction({ type: "REROLL", dieId: selectedDieId });
        setSelectedDieId(null);
    }, [selectedDieId, performAction]);

    const handleTowerCollapse = useCallback(() => {
        const die = selectedDieId ? state.dice[selectedDieId] : null;
        if (!die) return;
        performAction({ type: "TOWER_COLLAPSE", coords: die.coords });
        setSelectedDieId(null);
        setTowerMoveMode(false);
    }, [selectedDieId, state.dice, performAction]);

    return (
        <div className="flex min-h-screen flex-col items-center gap-6 p-4">
            <ActionPanel
                state={state}
                mapHexSet={mapHexSet}
                winner={winner}
                reason={reason}
                selectedDieId={selectedDieId}
                towerMoveMode={towerMoveMode}
                onTowerMoveModeChange={setTowerMoveMode}
                onReroll={handleReroll}
                onTowerCollapse={handleTowerCollapse}
                onPush={() => resolveCombat("PUSH")}
                onOccupy={() => resolveCombat("OCCUPY")}
                onEndTurn={() => {
                    setSelectedDieId(null);
                    setTowerMoveMode(false);
                    endTurn();
                }}
            />
            <Board
                mapData={mapData}
                state={state}
                mapHexSet={mapHexSet}
                selectedDieId={selectedDieId}
                towerMoveMode={towerMoveMode}
                onSelectDie={handleSelectDie}
                onHexClick={handleHexClick}
            />
        </div>
    );
}
