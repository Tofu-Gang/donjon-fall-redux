import { useCallback, useEffect, useState } from "react";
// Grass URLs come from donjon-fall-ui's `./textures` subpath — not the main
// barrel (`…/donjon`). That subpath is an intentional exception to the usual
// tsup→dist export pattern (tokens/enums/playerColors): it ships as source
// next to JPG files so `import.meta.url` keeps working. See textures.js in
// the style-guide package for the full rationale.
import { grassTile1024 } from "style-guide-donjon-fall/donjon/textures";
import { useGame } from "../context/useGame.js";
import { getLegalActions } from "../logic/actions.js";
import { hexKey } from "../logic/hex.js";
import { getTopDie } from "../logic/dice.js";
import mapData from "../maps/default.json";
import Board from "./Board.jsx";
import ActionPanel from "./ActionPanel.jsx";

/**
 * ScreensPage desktop convention: 1024 JPG as a 256×256 repeating tile
 * (not stretched to the viewport). Same URL is passed to HexTile below.
 */
const GRASS_SCREEN_STYLE = {
    backgroundImage: `url(${grassTile1024})`,
    backgroundSize: "256px 256px",
    backgroundRepeat: "repeat",
};

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

    // Once the action is fully resolved (taken, no pending combat, back in ACTION),
    // hand the turn over to the next player — no manual End Turn click required.
    useEffect(() => {
        if (winner) return; // Game over — let the modal stand
        const actionDone = state.turnPhase === "ACTION"
            && state.actionTaken
            && !state.pendingCombat;
        if (actionDone) {
            endTurn();
        }
    }, [state.turnPhase, state.actionTaken, state.pendingCombat, state.currentTurnIndex, winner, endTurn]);

    /**
     * Clears die selection and tower-move mode. Used by page background,
     * board chrome (gaps around hexes), and unreachable hex/die clicks.
     */
    const clearSelection = useCallback(() => {
        setSelectedDieId(null);
        setTowerMoveMode(false);
    }, []);

    /**
     * Click handler shared by hexes and dice: tries a legal move to the clicked
     * hex first. If a die is already selected and the click is not a legal move
     * target, clears selection (unreachable / blocked hex or die). Otherwise
     * falls back to selecting the top friendly die there.
     *
     * @param {object} coords - Axial coords of the clicked hex.
     * @param {{ preferTowerMove?: boolean }} [opts] - From DiceTower split click:
     *   top die → preferTowerMove false; tower peeks → true. Omitted for hex /
     *   lone-die clicks (always die-move selection).
     */
    const handleHexClick = useCallback((coords, opts = {}) => {
        // Actions are only allowed once per turn, during the ACTION phase
        if (state.turnPhase !== "ACTION" || state.actionTaken) return;

        const key = hexKey(coords);
        const legal = getLegalActions(state, mapHexSet);
        const selectedDie = selectedDieId ? state.dice[selectedDieId] : null;
        const preferTowerMove = opts.preferTowerMove === true;

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
            clearSelection();
            return;
        }

        // Already selected and this hex/die is not a legal destination — deselect
        // (covers blocked empty hexes, enemy dice, and other friendly pieces).
        if (selectedDieId) {
            clearSelection();
            return;
        }

        // Nothing selected — select the top friendly die on this hex, if any
        const top = getTopDie(state.dice, coords);
        if (top && top.owner === activePlayer) {
            setSelectedDieId(top.id);
            // Tower body click selects in tower-move mode; top die / hex grass do not.
            setTowerMoveMode(preferTowerMove);
        }
    }, [
        state,
        mapHexSet,
        selectedDieId,
        towerMoveMode,
        activePlayer,
        performAction,
        clearSelection,
    ]);

    /**
     * Click landed on the page background (anywhere not inside ActionPanel or
     * Board). The flex root's items-center + p-4 puts the children centered
     * with empty space around them; that empty space is part of this root, so
     * the target === currentTarget guard fires only for genuine background clicks.
     */
    const handleBackgroundClick = useCallback((event) => {
        if (event.target !== event.currentTarget) return;
        clearSelection();
    }, [clearSelection]);

    /**
     * Reroll the selected die (uses the player's one action for the turn).
     */
    const handleReroll = useCallback(() => {
        if (!selectedDieId) return;
        performAction({ type: "REROLL", dieId: selectedDieId });
        clearSelection();
    }, [selectedDieId, performAction, clearSelection]);

    /**
     * Collapse the tower at the selected die's hex onto adjacent lower dice.
     */
    const handleTowerCollapse = useCallback(() => {
        const die = selectedDieId ? state.dice[selectedDieId] : null;
        if (!die) return;
        performAction({ type: "TOWER_COLLAPSE", coords: die.coords });
        clearSelection();
    }, [selectedDieId, state.dice, performAction, clearSelection]);

    return (
        <div
            className="flex min-h-screen flex-col items-center gap-6 p-4"
            style={GRASS_SCREEN_STYLE}
            onClick={handleBackgroundClick}
        >
            {/* Turn status, action buttons, and combat choices (turn ends automatically) */}
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
            />
            {/* Interactive hex grid; clicks on dice and empty hexes share one handler. */}
            <Board
                mapData={mapData}
                state={state}
                mapHexSet={mapHexSet}
                selectedDieId={selectedDieId}
                towerMoveMode={towerMoveMode}
                onHexClick={handleHexClick}
                onDeselect={clearSelection}
                texture={grassTile1024}
            />
        </div>
    );
}
