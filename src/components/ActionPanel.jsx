import {
    DonjonButton,
    DonjonButtonGroup,
    DonjonCard,
    NumericDisplay,
    PhaseIndicator,
    PlayerIdentityBadge,
    playerColorsByKey,
    DonjonModal,
    TowerCollapseIcon,
    HourglassIcon,
} from "style-guide-donjon-fall/donjon";
import { getLegalActions } from "../logic/actions.js";
import { isTower, isTowerCollapsible } from "../logic/dice.js";
import { hexKey } from "../logic/hex.js";

const TURN_PHASES = [
    { id: "FOCAL", label: "Focal" },
    { id: "ACTION", label: "Action" },
    { id: "COMBAT", label: "Combat" },
];

const PLAYER_LABELS = { red: "Red", blue: "Blue" };

/**
 * Side panel that shows turn status, action buttons, combat choices, and the end-turn control.
 * Receives callbacks from GameView; never dispatches directly — all state changes flow through props.
 */
export default function ActionPanel({
    state,
    mapHexSet,
    winner,
    reason,
    selectedDieId,
    towerMoveMode,
    onTowerMoveModeChange,
    onReroll,
    onTowerCollapse,
    onPush,
    onOccupy,
    onEndTurn,
}) {
    // Player whose turn it is (derived from turn order and current index)
    const activePlayer = state.turnOrder[state.currentTurnIndex];
    const activeColor = playerColorsByKey[activePlayer]?.primary;
    // Resolve the selected die (if any) into a die object + its hex coords for action gating
    const selectedDie = selectedDieId ? state.dice[selectedDieId] : null;
    const selectedCoords = selectedDie?.coords;
    // Legal actions are only meaningful during ACTION — elsewhere we keep an empty list
    const legal = state.turnPhase === "ACTION" ? getLegalActions(state, mapHexSet) : [];

    // Each button is gated on a matching legal action so disabled state mirrors what's actually playable
    const canReroll = legal.some((a) => a.type === "REROLL" && a.dieId === selectedDieId);
    const canCollapse = selectedCoords
        && isTowerCollapsible(state.dice, selectedCoords)
        && legal.some((a) => a.type === "TOWER_COLLAPSE" && hexKey(a.coords) === hexKey(selectedCoords));
    const canTowerMove = selectedCoords
        && isTower(state.dice, selectedCoords)
        && legal.some((a) => a.type === "MOVE_TOWER" && hexKey(a.coords) === hexKey(selectedCoords));
    // End-turn is only available after an action has been taken and no combat is awaiting resolution
    const showEndTurn = state.turnPhase === "ACTION"
        && state.actionTaken
        && !state.pendingCombat;
    // Combat UI shows when phase is COMBAT and a pending combat exists
    const inCombat = state.turnPhase === "COMBAT" && state.pendingCombat;
    // OCCUPY is only legal for lone-die attackers; tower attackers are pushed-only
    const isTowerAttack = state.pendingCombat?.isTowerAttack;

    // Translate internal win-condition ids into player-facing labels
    const reasonLabel = {
        SCORE: "Victory points",
        SUDDEN_DEATH: "Sudden death",
    }[reason] ?? reason;

    return (
        <>
            <DonjonCard title="Donjon Fall">
                <div className="flex flex-col gap-4">
                    {/* Top: phase progress (Focal → Action → Combat) */}
                    <PhaseIndicator
                        phases={TURN_PHASES}
                        currentPhase={state.turnPhase}
                        size="sm"
                    />

                    {/* Mid: per-player identity badges + running VP totals */}
                    <div className="flex flex-wrap items-center gap-3">
                        {state.turnOrder.map((playerId) => (
                            <div key={playerId} className="flex items-center gap-3">
                                <PlayerIdentityBadge
                                    name={PLAYER_LABELS[playerId]}
                                    color={playerColorsByKey[playerId]?.primary}
                                />
                                <NumericDisplay
                                    value={state.players[playerId]}
                                    label="VP"
                                    variant="vp"
                                    size="sm"
                                    suffix={` / ${state.victoryPointsTarget}`}
                                />
                            </div>
                        ))}
                    </div>

                    <p className="text-sm text-neutral-400">
                        Current turn:{" "}
                        <span style={{ color: activeColor }}>{PLAYER_LABELS[activePlayer]}</span>
                    </p>

                    {/* Combat phase: present PUSH always; OCCUPY only when the attacker is a lone die */}
                    {inCombat && (
                        <DonjonButtonGroup
                            size="sm"
                            items={[
                                { value: "push", label: "Push" },
                                ...(isTowerAttack ? [] : [{ value: "occupy", label: "Occupy" }]),
                            ]}
                            onChange={(choice) => {
                                if (choice === "push") onPush();
                                else if (choice === "occupy") onOccupy();
                            }}
                        />
                    )}

                    {/* ACTION phase, before an action has been taken: reroll / tower-move toggle / collapse */}
                    {state.turnPhase === "ACTION" && !state.actionTaken && (
                        <div className="flex flex-wrap gap-2">
                            <DonjonButton
                                size="sm"
                                disabled={!selectedDieId || !canReroll}
                                onClick={onReroll}
                            >
                                Reroll
                            </DonjonButton>
                            {/* The same button toggles tower-move mode; its label flips to reflect what the next click will do */}
                            <DonjonButton
                                size="sm"
                                variant="warning"
                                disabled={!canTowerMove}
                                onClick={() => onTowerMoveModeChange(!towerMoveMode)}
                            >
                                {towerMoveMode ? "Move Die" : "Move Tower"}
                            </DonjonButton>
                            <DonjonButton
                                size="sm"
                                variant="danger"
                                disabled={!canCollapse}
                                onClick={onTowerCollapse}
                            >
                                <span className="inline-flex items-center gap-1">
                                    <TowerCollapseIcon size={14} />
                                    Collapse
                                </span>
                            </DonjonButton>
                        </div>
                    )}

                    {/* After action is taken and no combat is pending, surface End Turn */}
                    {showEndTurn && (
                        <DonjonButton size="md" onClick={onEndTurn}>
                            <span className="inline-flex items-center gap-2">
                                <HourglassIcon size={16} />
                                End Turn
                            </span>
                        </DonjonButton>
                    )}

                    {/* FOCAL phase has no user input — show a placeholder while the scoring runs */}
                    {state.turnPhase === "FOCAL" && (
                        <p className="text-xs text-neutral-500">Evaluating focal points…</p>
                    )}
                </div>
            </DonjonCard>

            {/* Game-over modal; the only way out is a full page reload (new game) */}
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
        </>
    );
}
