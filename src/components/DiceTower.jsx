import {
    DiceTower as LibDiceTower,
    playerColorsByKey,
} from "style-guide-donjon-fall/donjon";

/**
 * Thin adapter: game dice (`faceValue`, `owner`, `stackIndex`) → library DiceTower.
 * Forwards selection, split hover/click, and size; does not reimplement stacking.
 */
export default function DiceTower({
    dice,
    size,
    selected = false,
    getDieState,
    splitHover = true,
    onTopClick,
    onTowerClick,
    onTopHover,
    onTowerHover,
}) {
    const ordered = [...dice].sort((a, b) => a.stackIndex - b.stackIndex);
    const mapped = ordered.map((die) => ({
        value: die.faceValue,
        playerColor: playerColorsByKey[die.owner]?.primary,
        state: getDieState?.(die) ?? "default",
    }));

    return (
        <LibDiceTower
            dice={mapped}
            size={size}
            selected={selected}
            splitHover={splitHover}
            onTopClick={onTopClick}
            onTowerClick={onTowerClick}
            onTopHover={onTopHover}
            onTowerHover={onTowerHover}
        />
    );
}
