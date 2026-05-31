import { HexTile } from "style-guide-donjon-fall/donjon";
import { hexDims } from "./hexLayout.js";
import Die from "./Die.jsx";
import TowerStack from "./TowerStack.jsx";

const towerSizeConfig = {
    xs: { box: 24, peek: 10 },
    sm: { box: 32, peek: 16 },
    md: { box: 48, peek: 20 },
    lg: { box: 64, peek: 26 },
};

export default function Hex({
    tileState = "empty",
    ownerColor = null,
    dice = [],
    hexSize = "md",
    dieSize = "xs",
    onDieClick,
    getDieState,
}) {
    const { w, h } = hexDims[hexSize] ?? hexDims.md;
    const stack = dice.length > 1;
    const dieCfg = towerSizeConfig[dieSize] ?? towerSizeConfig.xs;

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

    const towerTopOffset = stack
        ? h / 2 - (((dice.length - 1) * dieCfg.peek + dieCfg.box / 2))
        : undefined;

    return (
        <div
            style={{ position: "relative", width: w, height: h, flexShrink: 0 }}
            onClick={(event) => {
                if (dice.length === 0) return;
                const top = dice.reduce((best, die) =>
                    die.stackIndex > best.stackIndex ? die : best, dice[0]);
                event.stopPropagation();
                onDieClick?.(top.id);
            }}
        >
            <HexTile state={tileState} owner={ownerColor} size={hexSize} />
            {dieOverlay && (
                <div
                    style={{
                        position: "absolute",
                        left: "50%",
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
