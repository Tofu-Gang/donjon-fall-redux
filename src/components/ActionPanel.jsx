import {
    ActionBar,
    MoveIcon,
    TowerIcon,
    TowerCollapseIcon,
    PushIcon,
    OccupyIcon,
} from "style-guide-donjon-fall/donjon";
import { RerollIcon } from "style-guide-donjon-fall/donjon/icons";
import { getLegalActions } from "../logic/actions.js";
import { isTower, isTowerCollapsible } from "../logic/dice.js";
import { hexKey } from "../logic/hex.js";

/**
 * Bottom action strip: four pictogram tiles during ACTION, combat choices during COMBAT.
 * Receives callbacks from GameView; never dispatches directly.
 */
export default function ActionPanel({
    state,
    mapHexSet,
    selectedDieId,
    towerMoveMode,
    onTowerMoveModeChange,
    onReroll,
    onTowerCollapse,
    onPush,
    onOccupy,
}) {
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
    const inCombat = state.turnPhase === "COMBAT" && state.pendingCombat;
    const isTowerAttack = state.pendingCombat?.isTowerAttack;
    const inActionPhase = state.turnPhase === "ACTION" && !state.actionTaken;

    let actions = [];

    if (inCombat) {
        actions = [
            { label: "Push", icon: <PushIcon />, variant: "attack", onClick: onPush },
            ...(isTowerAttack
                ? []
                : [{ label: "Occupy", icon: <OccupyIcon />, variant: "move", onClick: onOccupy }]),
        ];
    } else if (inActionPhase) {
        actions = [
            {
                label: "Move die",
                icon: <MoveIcon />,
                variant: "move",
                selected: Boolean(selectedDieId && !towerMoveMode),
                disabled: !selectedDieId,
                onClick: () => onTowerMoveModeChange(false),
            },
            {
                label: "Move tower",
                icon: <TowerIcon />,
                variant: "default",
                selected: towerMoveMode,
                disabled: !canTowerMove,
                onClick: () => onTowerMoveModeChange(true),
            },
            {
                label: "Collapse",
                icon: <TowerCollapseIcon />,
                variant: "attack",
                disabled: !canCollapse,
                onClick: onTowerCollapse,
            },
            {
                label: "Reroll",
                icon: <RerollIcon />,
                variant: "special",
                disabled: !canReroll,
                onClick: onReroll,
            },
        ];
    }

    if (actions.length === 0) return null;

    return (
        <div className="flex shrink-0 justify-center" style={{ paddingBottom: 6 }}>
            <ActionBar
                actions={actions}
                size="xs"
                bordered={false}
                showLabel={false}
                showKeycap={false}
            />
        </div>
    );
}
