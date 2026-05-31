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
    const activePlayer = state.turnOrder[state.currentTurnIndex];
    const activeColor = playerColorsByKey[activePlayer]?.primary;
    const selectedDie = selectedDieId ? state.dice[selectedDieId] : null;
    const selectedCoords = selectedDie?.coords;
    const legal = state.turnPhase === "ACTION" ? getLegalActions(state, mapHexSet) : [];

    const canReroll = legal.some((a) => a.type === "REROLL" && a.dieId === selectedDieId);
    const canCollapse = selectedCoords
        && isTowerCollapsible(state.dice, selectedCoords)
        && legal.some((a) => a.type === "TOWER_COLLAPSE" && hexKey(a.coords) === hexKey(selectedCoords));
    const canTowerMove = selectedCoords
        && isTower(state.dice, selectedCoords)
        && legal.some((a) => a.type === "MOVE_TOWER" && hexKey(a.coords) === hexKey(selectedCoords));
    const showEndTurn = state.turnPhase === "ACTION"
        && state.actionTaken
        && !state.pendingCombat;
    const inCombat = state.turnPhase === "COMBAT" && state.pendingCombat;
    const isTowerAttack = state.pendingCombat?.isTowerAttack;

    const reasonLabel = {
        SCORE: "Victory points",
        SUDDEN_DEATH: "Sudden death",
    }[reason] ?? reason;

    return (
        <>
            <DonjonCard title="Donjon Fall">
                <div className="flex flex-col gap-4">
                    <PhaseIndicator
                        phases={TURN_PHASES}
                        currentPhase={state.turnPhase}
                        size="sm"
                    />

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

                    {inCombat && (
                        <DonjonButtonGroup>
                            <DonjonButton
                                variant="default"
                                size="sm"
                                onClick={onPush}
                            >
                                Push
                            </DonjonButton>
                            {!isTowerAttack && (
                                <DonjonButton
                                    variant="success"
                                    size="sm"
                                    onClick={onOccupy}
                                >
                                    Occupy
                                </DonjonButton>
                            )}
                        </DonjonButtonGroup>
                    )}

                    {state.turnPhase === "ACTION" && !state.actionTaken && (
                        <div className="flex flex-wrap gap-2">
                            <DonjonButton
                                size="sm"
                                disabled={!selectedDieId || !canReroll}
                                onClick={onReroll}
                            >
                                Reroll
                            </DonjonButton>
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

                    {showEndTurn && (
                        <DonjonButton size="md" onClick={onEndTurn}>
                            <span className="inline-flex items-center gap-2">
                                <HourglassIcon size={16} />
                                End Turn
                            </span>
                        </DonjonButton>
                    )}

                    {state.turnPhase === "FOCAL" && (
                        <p className="text-xs text-neutral-500">Evaluating focal points…</p>
                    )}
                </div>
            </DonjonCard>

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
