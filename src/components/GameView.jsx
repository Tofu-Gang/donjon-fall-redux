import { useCallback, useEffect, useState } from "react";
import { useGame } from "../context/useGame.js";
import { getLegalActions } from "../logic/actions.js";
import { hexKey } from "../logic/hex.js";
import { getTopDie } from "../logic/dice.js";
import mapData from "../maps/default.json";
import Board from "./Board.jsx";
import ActionPanel from "./ActionPanel.jsx";

/**
 * Main play screen: wires game context to the board and action panel,
 * handles die selection, hex clicks, and automatic focal-point evaluation.
 */
export default function GameView() {
    // Destructure everything the view needs from the game context
    const {
        state,              // Full game state (dice, turn, phase, etc.)
        mapHexSet,          // Set of valid hex keys on the current map
        winner,             // Winning player id, or null if game ongoing
        reason,             // Win condition description when game ends
        evaluateFocalPoints,// Runs focal scoring at start of each turn
        performAction,      // Dispatches a player action (move, reroll, collapse, …)
        resolveCombat,      // Resolves a combat with PUSH or OCCUPY
        endTurn,            // Advances to the next player / turn phase
    } = useGame();

    // Id of the die the active player has selected for an action, or null
    const [selectedDieId, setSelectedDieId] = useState(null);
    // When true, the next hex click tries to move the whole tower, not one die
    const [towerMoveMode, setTowerMoveMode] = useState(false);

    // Player whose turn it is (derived from turn order and current index)
    const activePlayer = state.turnOrder[state.currentTurnIndex];

    // At the start of each turn, automatically score focal points before actions
    useEffect(() => {
        if (winner) return; // Game over — skip focal evaluation
        if (state.turnPhase === "FOCAL") {
            evaluateFocalPoints();
        }
    }, [state.turnPhase, state.currentTurnIndex, winner, evaluateFocalPoints]);

    /**
     * Select a die owned by the active player that is on top of its stack.
     * Buried dice (not on top of their hex) are rejected so the player can't
     * act on dice they can't see.
     *
     * @param {string} dieId - Id of the die to select.
     */
    const handleSelectDie = useCallback((dieId) => {
        const die = state.dice[dieId];
        // Only the active player may select their own dice
        if (!die || die.owner !== activePlayer) return;
        // Must be the top die on the hex — buried dice cannot be acted on
        const top = getTopDie(state.dice, die.coords);
        if (!top || top.id !== dieId) return;
        setSelectedDieId(dieId);
        setTowerMoveMode(false); // Single-die selection clears tower-move mode
    }, [state.dice, activePlayer]);

    /**
     * Hex click handler during the ACTION phase:
     * 1. If a legal move to this hex exists, perform it.
     * 2. Otherwise, select the top friendly die on this hex (if any).
     *
     * @param {string} key - Hex key of the clicked hex.
     * @param {object} coords - Axial coords of the clicked hex.
     */
    const handleHexClick = useCallback((key, coords) => {
        // Actions are only allowed once per turn, during the ACTION phase
        if (state.turnPhase !== "ACTION" || state.actionTaken) return;

        const legal = getLegalActions(state, mapHexSet);
        const selectedDie = selectedDieId ? state.dice[selectedDieId] : null;

        // Try to match a legal action whose destination is the clicked hex
        for (const action of legal) {
            if (towerMoveMode) {
                // Tower move: action must move the stack at the selected die's hex
                if (action.type !== "MOVE_TOWER") continue;
                if (!selectedDie || hexKey(action.coords) !== hexKey(selectedDie.coords)) continue;
            } else if (action.type === "MOVE_DIE") {
                // Single-die move: action must use the currently selected die
                if (action.dieId !== selectedDieId) continue;
            } else {
                continue;
            }
            const destKey = hexKey(action.path[action.path.length - 1]);
            if (destKey !== key) continue;
            // Found a matching legal move — execute and clear selection
            performAction(action);
            setSelectedDieId(null);
            setTowerMoveMode(false);
            return;
        }

        // No move matched — treat click as die selection on this hex
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

    /**
     * Reroll the selected die (uses the player's one action for the turn).
     */
    const handleReroll = useCallback(() => {
        if (!selectedDieId) return;
        performAction({ type: "REROLL", dieId: selectedDieId });
        setSelectedDieId(null);
    }, [selectedDieId, performAction]);

    /**
     * Collapse the tower at the selected die's hex onto adjacent lower dice.
     */
    const handleTowerCollapse = useCallback(() => {
        const die = selectedDieId ? state.dice[selectedDieId] : null;
        if (!die) return;
        performAction({ type: "TOWER_COLLAPSE", coords: die.coords });
        setSelectedDieId(null);
        setTowerMoveMode(false);
    }, [selectedDieId, state.dice, performAction]);

    return (
        <div className="flex min-h-screen flex-col items-center gap-6 p-4">
            {/* Turn status, action buttons, combat choices, end-turn */}
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
            {/* Interactive hex grid; hex clicks route through handleHexClick */}
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
