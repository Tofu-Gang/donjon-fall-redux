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
     * Click handler shared by hexes and dice: tries a legal move to the clicked
     * hex first, then falls back to selecting the top friendly die there.
     * Die clicks and empty-hex clicks both go through this path so clicking a
     * friendly die as a move target actually performs the move (instead of
     * just selecting that die).
     *
     * @param {object} coords - Axial coords of the clicked hex.
     */
    const handleHexClick = useCallback((coords) => {
        // Actions are only allowed once per turn, during the ACTION phase
        if (state.turnPhase !== "ACTION" || state.actionTaken) return;

        const key = hexKey(coords);
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
            setSelectedDieId(top.id);
            setTowerMoveMode(false); // Single-die selection clears tower-move mode
        } else if (state.turnPhase === "ACTION" && !state.actionTaken) {
            // Clicked a hex that isn't a legal move target and holds no friendly
            // die — treat as a deselect, mirroring an outside-board click.
            setSelectedDieId(null);
            setTowerMoveMode(false);
        }
    }, [
        state,
        mapHexSet,
        selectedDieId,
        towerMoveMode,
        activePlayer,
        performAction,
    ]);

    /**
     * Click landed on the page background (anywhere not inside ActionPanel or
     * Board). The flex root's items-center + p-4 puts the children centered
     * with empty space around them; that empty space is part of this root, so
     * the target === currentTarget guard fires only for genuine background clicks.
     */
    const handleBackgroundClick = useCallback((event) => {
        if (event.target !== event.currentTarget) return;
        setSelectedDieId(null);
        setTowerMoveMode(false);
    }, []);

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
        <div
            className="flex min-h-screen flex-col items-center gap-6 p-4"
            onClick={handleBackgroundClick}
        >
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
            {/* Interactive hex grid; clicks on dice and empty hexes share one handler. */}
            <Board
                mapData={mapData}
                state={state}
                mapHexSet={mapHexSet}
                selectedDieId={selectedDieId}
                towerMoveMode={towerMoveMode}
                onHexClick={handleHexClick}
            />
        </div>
    );
}
