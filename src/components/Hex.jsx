import { HexTile } from "style-guide-donjon-fall/donjon";
import { hexDims } from "./hexLayout.js";
import Die from "./Die.jsx";
import TowerStack from "./TowerStack.jsx";

// Visual config for stacked dice per die-size tier: full die width and the "peek" height of each visible segment.
const towerSizeConfig = {
    xs: { box: 24, peek: 10 },
    sm: { box: 32, peek: 16 },
    md: { box: 48, peek: 20 },
    lg: { box: 64, peek: 26 },
};

/**
 * Single hex cell: draws the tile (with state/owner styling) and, on top, the dice sitting there.
 * Stacks of 2+ dice are rendered via TowerStack; a single die is rendered directly. Empty hexes just show the tile.
 */
export default function Hex({
    tileState = "empty",
    ownerColor = null,
    dice = [],
    hexSize = "md",
    dieSize = "xs",
    onClickAt,
    getDieState,
}) {
    // Resolve hex dimensions with a safe fallback to "md" if an unknown size is passed.
    const { w, h } = hexDims[hexSize] ?? hexDims.md;
    // Stacks are anything with 2+ dice; a single die is rendered flat (no peek).
    const stack = dice.length > 1;
    // Same fallback strategy for the per-die-size tower config.
    const dieCfg = towerSizeConfig[dieSize] ?? towerSizeConfig.xs;

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
            {/* The styled hex tile behind everything else (state = selected/attack/move/focal/base/empty). */}
            <HexTile state={tileState} owner={ownerColor} size={hexSize} />
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