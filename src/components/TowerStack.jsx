import Die from "./Die.jsx";

// Visual config for stacked dice per size tier: full die width and the "peek" height of each visible segment.
// Kept in sync with the same map in Hex.jsx — both files consume it for the same rendering math.
const towerSizeConfig = {
    xs: { box: 24, peek: 10 },
    sm: { box: 32, peek: 16 },
    md: { box: 48, peek: 20 },
    lg: { box: 64, peek: 26 },
};

/**
 * Renders a vertical stack of dice (a "tower"). The bottom die is drawn first and
 * each subsequent die overlaps it by `box - peek` pixels, leaving a small peek of
 * the dice below visible at the top of the stack.
 */
export default function TowerStack({ dice, size = "xs", getDieState }) {
    // Safe fallback to "xs" config when an unknown size is passed.
    const cfg = towerSizeConfig[size] ?? towerSizeConfig.xs;
    // Sort bottom-up by stackIndex so the visual order matches the logical stack order.
    const ordered = [...dice].sort((a, b) => a.stackIndex - b.stackIndex);

    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Reverse to render top-down visually while still giving the top die the highest z-index. */}
            {[...ordered].reverse().map((die, index) => {
                // The first (top) die sits flush; each die below overlaps the one above by (box - peek).
                // zIndex increases as we go up the stack so clicks land on the visually topmost die.
                return (
                    <div
                        key={die.id}
                        style={{
                            position: "relative",
                            zIndex: ordered.length - index,
                            marginTop: index === 0 ? 0 : -(cfg.box - cfg.peek),
                        }}
                    >
                        <Die
                            faceValue={die.faceValue}
                            owner={die.owner}
                            state={getDieState?.(die) ?? "default"}
                            size={size}
                        />
                    </div>
                );
            })}
        </div>
    );
}