import { useCallback, useEffect, useState } from "react";
// Grass URLs come from donjon-fall-ui's `./textures` subpath — not the main
// barrel (`…/donjon`). That subpath is an intentional exception to the usual
// tsup→dist export pattern (tokens/enums/playerColors): it ships as source
// next to JPG files so `import.meta.url` keeps working. See textures.js in
// the style-guide package for the full rationale.
import { grassTile1024 } from "style-guide-donjon-fall/donjon/textures";
import {
    DonjonButton,
    DonjonModal,
    playerColorsByKey,
} from "style-guide-donjon-fall/donjon";
import { pickBotAction, pickBotCombatResolution } from "../ai/randomBot.js";
import { useGame } from "../context/useGame.js";
import { getLegalActions } from "../logic/actions.js";
import { hexKey } from "../logic/hex.js";
import { getDiceAtHex, getTopDie } from "../logic/dice.js";
import {
    hexPixelDelta,
    isCombatMove,
    pickDieMovePreset,
    previewFocalScores,
} from "../fx/boardFx.js";
import useBoardFx from "../fx/useBoardFx.js";
import mapData from "../maps/default.json";
import Board from "./Board.jsx";
import ScoreHeader from "./ScoreHeader.jsx";
import ActionPanel from "./ActionPanel.jsx";
import { PhaseIndicator, FocalPointIcon, MoveIcon, SwordIcon } from "style-guide-donjon-fall/donjon";

const PLAYER_LABELS = { red: "Red", blue: "Blue" };
/** Blue is a simple random bot so a human can play as red. */
const BOT_PLAYER = "blue";
const BOT_THINK_MS = 450;

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
    const { fx, busy, play, complete } = useBoardFx();

    const activePlayer = state.turnOrder[state.currentTurnIndex];
    const stuckOwner = reason === "SUDDEN_DEATH"
        ? state.turnOrder[state.currentTurnIndex]
        : null;

    // Focal scoring — pulse + VP feedback + reroll spin, then commit.
    useEffect(() => {
        if (winner) return;
        if (state.turnPhase !== "FOCAL") return;

        let cancelled = false;
        const hits = previewFocalScores(state);
        (async () => {
            if (hits.length > 0) {
                await play({
                    hideDieIds: hits.map((h) => h.die.id),
                    items: [
                        ...hits.map((h) => ({
                            type: "hexPulse",
                            atKey: hexKey(h.coords),
                            preset: "hexFocalPulse",
                        })),
                        ...hits.map((h) => ({
                            type: "piece",
                            atKey: hexKey(h.coords),
                            dice: [h.die],
                            preset: "dieRerollSpin",
                        })),
                        ...hits.map((h) => ({
                            type: "feedback",
                            atKey: hexKey(h.coords),
                            text: "+1 VP",
                            variant: "vp",
                        })),
                    ],
                });
            }
            if (!cancelled) evaluateFocalPoints();
        })();

        return () => {
            cancelled = true;
        };
        // Intentionally keyed to FOCAL entry only (turn identity).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.turnPhase, state.turnNumber, winner]);

    // Hand the turn over once the action is done and FX have finished.
    useEffect(() => {
        if (winner || busy) return;
        const actionDone = state.turnPhase === "ACTION"
            && state.actionTaken
            && !state.pendingCombat;
        if (actionDone) endTurn();
    }, [
        state.turnPhase,
        state.actionTaken,
        state.pendingCombat,
        state.currentTurnIndex,
        winner,
        busy,
        endTurn,
    ]);

    const clearSelection = useCallback(() => {
        setSelectedDieId(null);
        setTowerMoveMode(false);
    }, []);

    const runMoveAction = useCallback(async (action) => {
        const intoCombat = isCombatMove(state, action);

        // Combat entry keeps the attacker in place — no travel FX (resolve animates later).
        if (intoCombat) {
            performAction(action);
            clearSelection();
            return;
        }

        const from = action.type === "MOVE_TOWER"
            ? action.coords
            : state.dice[action.dieId].coords;
        const to = action.path[action.path.length - 1];
        const { dx, dy } = hexPixelDelta(from, to);

        let hideDieIds;
        let diceSnap;
        let preset;

        if (action.type === "MOVE_TOWER") {
            diceSnap = getDiceAtHex(state.dice, from);
            hideDieIds = diceSnap.map((d) => d.id);
            preset = "dieMove";
        } else {
            const die = state.dice[action.dieId];
            diceSnap = [die];
            hideDieIds = [die.id];
            preset = pickDieMovePreset({
                dice: state.dice,
                dieId: action.dieId,
                path: action.path,
            });
        }

        await play({
            hideDieIds,
            items: [{
                atKey: hexKey(from),
                dice: diceSnap,
                preset,
                dx,
                dy,
            }],
        });
        performAction(action);
        clearSelection();
    }, [state, performAction, clearSelection, play]);

    /**
     * Click handler shared by hexes and dice: tries a legal move to the clicked
     * hex first. If a die is already selected and the click is not a legal move
     * target, clears selection. Otherwise falls back to selecting the top
     * friendly die there.
     */
    const handleHexClick = useCallback((coords, opts = {}) => {
        if (busy || activePlayer === BOT_PLAYER) return;
        if (state.turnPhase !== "ACTION" || state.actionTaken) return;

        const key = hexKey(coords);
        const legal = getLegalActions(state, mapHexSet);
        const selectedDie = selectedDieId ? state.dice[selectedDieId] : null;
        const preferTowerMove = opts.preferTowerMove === true;

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
            void runMoveAction(action);
            return;
        }

        // Already selected and this hex/die is not a legal destination — deselect
        // (covers blocked empty hexes, enemy dice, and other friendly pieces).
        if (selectedDieId) {
            clearSelection();
            return;
        }

        const top = getTopDie(state.dice, coords);
        if (top && top.owner === activePlayer) {
            setSelectedDieId(top.id);
            setTowerMoveMode(preferTowerMove);
        }
    }, [
        busy,
        state,
        mapHexSet,
        selectedDieId,
        towerMoveMode,
        activePlayer,
        runMoveAction,
        clearSelection,
    ]);

    // Any click that bubbles here is "background" (hexes and action controls
    // stopPropagation). Clears selection without needing target === currentTarget,
    // which fails once nested flex wrappers fill the viewport.
    const handleBackgroundClick = useCallback(() => {
        if (busy) return;
        clearSelection();
    }, [clearSelection, busy]);

    const runRerollAction = useCallback(async (dieId) => {
        if (busy) return;
        const die = state.dice[dieId];
        if (!die) return;
        await play({
            hideDieIds: [die.id],
            items: [{
                atKey: hexKey(die.coords),
                dice: [die],
                preset: "dieRerollSpin",
            }],
        });
        performAction({ type: "REROLL", dieId });
        clearSelection();
    }, [busy, state.dice, play, performAction, clearSelection]);

    const runCollapseAction = useCallback(async (coords) => {
        if (busy) return;
        const stack = getDiceAtHex(state.dice, coords);
        const bottom = stack[0];
        if (!bottom) return;
        const isEnemy = bottom.owner !== activePlayer;
        await play({
            hideDieIds: [bottom.id],
            items: [{
                atKey: hexKey(coords),
                dice: [bottom],
                preset: "dieCollapse",
                feedback: isEnemy ? { text: "+1 VP", variant: "vp" } : undefined,
            }],
        });
        performAction({ type: "TOWER_COLLAPSE", coords });
        clearSelection();
    }, [busy, state.dice, activePlayer, play, performAction, clearSelection]);

    const runCombatResolution = useCallback(async (resolution) => {
        if (busy || !state.pendingCombat) return;
        const { attackerCoords, defenderCoords, attackerDieId } = state.pendingCombat;
        const attacker = state.dice[attackerDieId]
            ?? getTopDie(state.dice, attackerCoords);
        if (!attacker) {
            resolveCombat(resolution);
            return;
        }

        // Phase 1 — impact shake + −1 on the attacker.
        await play({
            hideDieIds: [attacker.id],
            items: [{
                atKey: hexKey(attackerCoords),
                dice: [attacker],
                preset: "dieShake",
                feedback: { text: "−1", variant: "loss" },
            }],
        });

        if (resolution === "OCCUPY") {
            const shaken = {
                ...attacker,
                faceValue: Math.max(attacker.faceValue - 1, 1),
            };
            await play({
                hideDieIds: [attacker.id],
                items: [{
                    atKey: hexKey(defenderCoords),
                    dice: [shaken],
                    preset: "dieDrop",
                }],
            });
        } else {
            const defenderStack = getDiceAtHex(state.dice, defenderCoords);
            // Push animates one hex along the attack direction (not the full approach path).
            const dir = state.pendingCombat.attackDirection;
            const pushTo = dir
                ? {
                    q: defenderCoords.q + dir.q,
                    r: defenderCoords.r + dir.r,
                    s: defenderCoords.s + dir.s,
                }
                : defenderCoords;
            const { dx, dy } = hexPixelDelta(defenderCoords, pushTo);
            await play({
                hideDieIds: defenderStack.map((d) => d.id),
                items: [{
                    atKey: hexKey(defenderCoords),
                    dice: defenderStack,
                    preset: "formationPushFull",
                    dx,
                    dy,
                }],
            });
        }

        resolveCombat(resolution);
    }, [busy, state, play, resolveCombat]);

    const handleReroll = useCallback(() => {
        if (!selectedDieId || activePlayer === BOT_PLAYER) return;
        void runRerollAction(selectedDieId);
    }, [selectedDieId, activePlayer, runRerollAction]);

    const handleTowerCollapse = useCallback(() => {
        const die = selectedDieId ? state.dice[selectedDieId] : null;
        if (!die || activePlayer === BOT_PLAYER) return;
        void runCollapseAction(die.coords);
    }, [selectedDieId, state.dice, activePlayer, runCollapseAction]);

    const handleCombat = useCallback((resolution) => {
        if (activePlayer === BOT_PLAYER) return;
        void runCombatResolution(resolution);
    }, [activePlayer, runCombatResolution]);

    // Blue bot: same FX paths as the human player.
    useEffect(() => {
        if (winner || busy) return;
        if (activePlayer !== BOT_PLAYER) return;

        let cancelled = false;
        const timer = setTimeout(() => {
            if (cancelled) return;

            if (state.turnPhase === "ACTION" && !state.actionTaken) {
                const legal = getLegalActions(state, mapHexSet);
                if (legal.length === 0) return;
                const action = pickBotAction(legal);
                clearSelection();
                if (action.type === "MOVE_DIE" || action.type === "MOVE_TOWER") {
                    void runMoveAction(action);
                } else if (action.type === "REROLL") {
                    void runRerollAction(action.dieId);
                } else if (action.type === "TOWER_COLLAPSE") {
                    void runCollapseAction(action.coords);
                }
                return;
            }

            if (state.turnPhase === "COMBAT" && state.pendingCombat) {
                void runCombatResolution(
                    pickBotCombatResolution(state.pendingCombat),
                );
            }
        }, BOT_THINK_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // Intentionally keyed to turn identity / phase / combat, not every state field.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        activePlayer,
        state.turnPhase,
        state.actionTaken,
        state.pendingCombat,
        state.turnNumber,
        winner,
        busy,
    ]);

    const reasonLabel = {
        SCORE: "Victory points",
        SUDDEN_DEATH: "Sudden death",
    }[reason] ?? reason;

    return (
        <div
            className="flex min-h-screen flex-col items-center p-4"
            style={GRASS_SCREEN_STYLE}
            onClick={handleBackgroundClick}
        >
            <ScoreHeader state={state} />
            <PhaseIndicator
                className="my-4 w-50"
                phases={[
                    { id: "FOCAL", label: "Focal", icon: <FocalPointIcon /> },
                    { id: "ACTION", label: "Action", icon: <MoveIcon /> },
                    { id: "COMBAT", label: "Combat", icon: <SwordIcon /> },
                ]}
                currentPhase={state.turnPhase}
            />
            <div className="flex w-full flex-1 items-center justify-center overflow-hidden">
                <Board
                    mapData={mapData}
                    state={state}
                    mapHexSet={mapHexSet}
                    selectedDieId={selectedDieId}
                    towerMoveMode={towerMoveMode}
                    onHexClick={handleHexClick}
                    onDeselect={busy ? undefined : clearSelection}
                    texture={grassTile1024}
                    fx={fx}
                    onFxComplete={complete}
                    stuckOwner={stuckOwner}
                />
            </div>
            <ActionPanel
                state={state}
                mapHexSet={mapHexSet}
                selectedDieId={selectedDieId}
                towerMoveMode={towerMoveMode}
                onTowerMoveModeChange={busy ? () => {} : setTowerMoveMode}
                onReroll={handleReroll}
                onTowerCollapse={handleTowerCollapse}
                onPush={() => void handleCombat("PUSH")}
                onOccupy={() => void handleCombat("OCCUPY")}
            />
            <DonjonModal
                open={Boolean(winner)}
                onClose={() => {}}
                title="Game Over"
                footer={
                    <DonjonButton onClick={() => window.location.reload()}>
                        New Game
                    </DonjonButton>
                }
            >
                <p>
                    <strong style={{ color: playerColorsByKey[winner]?.primary }}>
                        {PLAYER_LABELS[winner]}
                    </strong>{" "}
                    wins ({reasonLabel}).
                </p>
            </DonjonModal>
        </div>
    );
}
