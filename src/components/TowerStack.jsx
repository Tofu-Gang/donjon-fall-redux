import Die from "./Die.jsx";

const towerSizeConfig = {
    xs: { box: 24, peek: 10 },
    sm: { box: 32, peek: 16 },
    md: { box: 48, peek: 20 },
    lg: { box: 64, peek: 26 },
};

export default function TowerStack({ dice, size = "xs", getDieState }) {
    const cfg = towerSizeConfig[size] ?? towerSizeConfig.xs;
    const ordered = [...dice].sort((a, b) => a.stackIndex - b.stackIndex);

    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {[...ordered].reverse().map((die, index) => (
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
            ))}
        </div>
    );
}
