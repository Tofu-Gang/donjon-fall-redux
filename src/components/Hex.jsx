import {
    HexTile,
    HEX_TILE_SIZES,
    DIE_TOWER_SIZES,
} from "style-guide-donjon-fall/donjon";
import Die from "./Die.jsx";
import TowerStack from "./TowerStack.jsx";

/**
 * Single hex cell: draws the tile (with state/owner styling) and, on top, the dice sitting there.
 * Stacks of 2+ dice are rendered via TowerStack; a single die is rendered directly. Empty hexes just show the tile.
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
    getDieState,
}) {
    const { w, h } = HEX_TILE_SIZES[hexSize];
    const stack = dice.length > 1;
    const dieCfg = DIE_TOWER_SIZES[dieSize];

    // Build the die overlay: a stack, a lone die, or nothing for an empty hex.
    const dieOverlay = stack ? (
        <TowerStack dice={dice} size={dieSize} getDieState={getDieState} />
    ) : dice.length === 1 ? (
        <Die
            faceValue={dice[0].faceValue}
            owner={dice[0].owner}
            state={getDieState?.(dice[0]) ?? "default"}
            size={dieSize}
        />
    ) : null;

    // Vertical offset that places the stack so its visible top sits at the hex's vertical center,
    // accounting for the cumulative peek height of all dice below the top one.
    const towerTopOffset = stack
        ? h / 2 - (((dice.length - 1) * dieCfg.peek + dieCfg.box / 2))
        : undefined;

    return (
        <div
            style={{ position: "relative", width: w, height: h, flexShrink: 0 }}
            onClick={(event) => {
                // Empty hexes have nothing to click — let the click bubble up to the board.
                if (dice.length === 0) return;
                // Treat the click as a click on this hex so the parent handler can
                // first try a legal move to the top die here, and only fall back to selection.
                // Prevent the click from also registering as a click on the board.
                event.stopPropagation();
                onClickAt?.(dice[0].coords);
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
