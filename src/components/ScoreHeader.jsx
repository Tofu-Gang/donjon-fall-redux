import {
    VPCounter,
    SwordIcon,
    ShieldIcon,
    playerColorsByKey,
} from "style-guide-donjon-fall/donjon";

const PHASE_LABELS = {
    FOCAL: "Focal",
    ACTION: "Action",
    COMBAT: "Combat",
};

/** Per-player pictograms inside the Erb shield — matches ScreensPage desktop demo. */
const PLAYER_ICONS = {
    red: <SwordIcon />,
    blue: <ShieldIcon />,
};

/**
 * Read-only HUD strip above the board: VP progress, turn number, active player.
 */
export default function ScoreHeader({ state }) {
    const activePlayer = state.turnOrder[state.currentTurnIndex];
    const activeIndex = state.turnOrder.indexOf(activePlayer) + 1;
    const phaseLabel = PHASE_LABELS[state.turnPhase] ?? state.turnPhase;

    const players = state.turnOrder.map((playerId) => ({
        id: playerId,
        color: playerColorsByKey[playerId]?.primary,
        vp: state.players[playerId],
        icon: PLAYER_ICONS[playerId],
        active: playerId === activePlayer,
    }));

    return (
        <div className="flex shrink-0 justify-center" style={{ padding: "8px 8px 0" }}>
            <VPCounter
                players={players}
                max={state.victoryPointsTarget}
                title={`Turn ${state.turnNumber} · ${phaseLabel}\nPlayer ${activeIndex}'s turn`}
                layout="row"
                minWidth={260}
                centerValue={state.turnNumber}
            />
        </div>
    );
}
