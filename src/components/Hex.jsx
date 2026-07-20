import {
    HexTile,
    HEX_TILE_SIZES,
    DIE_TOWER_SIZES,
} from "style-guide-donjon-fall/donjon";
import Die from "./Die.jsx";
import DiceTower from "./DiceTower.jsx";

/**
 * Single hex cell: draws the tile (with state/owner styling) and, on top, the dice sitting there.
 * Stacks of 2+ dice use the DiceTower adapter; a single die is rendered directly. Empty hexes just show the tile.
 *
 * Hex/die geometry and pairing come from donjon-fall-ui
 * (`HEX_TILE_SIZES`, `DIE_TOWER_SIZES`).
 */
export default function Hex({
    property = "empty",
    focal,
    state = "default",
    owner = null,
    dice = [],
    hexSize,
    dieSize,
    texture,
    onClickAt,
    onTowerTopClick,
    onTowerBodyClick,
    getDieState,
}) {
    const { w, h } = HEX_TILE_SIZES[hexSize];
    const stack = dice.length > 1;
    const dieCfg = DIE_TOWER_SIZES[dieSize];
    const coords = dice[0]?.coords;
    const towerSelected = stack
        && dice.some((die) => (getDieState?.(die) ?? "default") === "selected");

    // Build the die overlay: a stack, a lone die, or nothing for an empty hex.
    const dieOverlay = stack ? (
        <DiceTower
            dice={dice}
            size={dieSize}
            selected={towerSelected}
            getDieState={getDieState}
            onTopClick={(event) => {
                event.stopPropagation();
                onTowerTopClick?.(coords);
            }}
            onTowerClick={(event) => {
                event.stopPropagation();
                onTowerBodyClick?.(coords);
            }}
        />
    ) : dice.length === 1 ? (
        <Die
            faceValue={dice[0].faceValue}
            owner={dice[0].owner}
            state={getDieState?.(dice[0]) ?? "default"}
            size={dieSize}
        />
    ) : null;

    // Align bottom-die center with hex vertical center (DicePage TowerOnHex formula).
    const towerTopOffset = stack
        ? h / 2 - ((dice.length - 1) * dieCfg.peek + dieCfg.box / 2)
        : undefined;

    return (
        <div
            style={{ position: "relative", width: w, height: h, flexShrink: 0 }}
            onClick={(event) => {
                // Empty hexes have nothing to click — let the click bubble up to the board.
                if (dice.length === 0) return;
                // Lone die / hex grass under a stack: treat as a hex click so the parent
                // can try a legal move first, then fall back to die selection.
                // Tower top/body clicks stopPropagation in DiceTower handlers above.
                event.stopPropagation();
                onClickAt?.(coords);
            }}
        >
            <HexTile
                property={property}
                focal={property === "focal" ? focal : undefined}
                state={state}
                owner={owner}
                size={hexSize}
                texture={texture}
            />
            {dieOverlay && (
                <div
                    style={{
                        position: "absolute",
                        left: "50%",
                        // Single die is centered on both axes; stacks are anchored from the top instead.
                        top: stack ? towerTopOffset : "50%",
                        transform: stack ? "translateX(-50%)" : "translate(-50%, -50%)",
                        cursor: "pointer",
                    }}
                >
                    {dieOverlay}
                </div>
            )}
        </div>
    );
}
