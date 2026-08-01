import { useEffect, useRef } from "react";
import {
    FloatFeedback,
    animationStyle,
    DIE_TOWER_SIZES,
    boardPieceSizes,
} from "style-guide-donjon-fall/donjon";
import Die from "../components/Die.jsx";
import DiceTower from "../components/DiceTower.jsx";
import { directedMotionStyle, HEX_DIMS } from "./boardFx.js";

const { dieSize: DIE_SIZE } = boardPieceSizes("md");
const dieCfg = DIE_TOWER_SIZES[DIE_SIZE];

function hexBoxStyle(pos, layout) {
    return {
        position: "absolute",
        left: pos.pixel.x + layout.offsetX - HEX_DIMS.w / 2,
        top: pos.pixel.y + layout.offsetY - HEX_DIMS.h / 2,
        width: HEX_DIMS.w,
        height: HEX_DIMS.h,
        pointerEvents: "none",
        overflow: "visible",
    };
}

function PieceOverlay({ item, animKey, onEnd }) {
    const stack = item.dice ?? [];
    const isStack = stack.length > 1;
    const directed = item.dx != null;
    const motion = directed
        ? directedMotionStyle(item.dx, item.dy, item.preset ?? "dieMove")
        : null;

    const piece = isStack ? (
        <DiceTower dice={stack} size={DIE_SIZE} splitHover={false} />
    ) : stack[0] ? (
        <Die
            faceValue={stack[0].faceValue}
            owner={stack[0].owner}
            state={item.dieState ?? "default"}
            size={DIE_SIZE}
        />
    ) : null;

    const towerTopOffset = isStack
        ? HEX_DIMS.h / 2 - ((stack.length - 1) * dieCfg.peek + dieCfg.box / 2)
        : undefined;

    const handleEnd = (event) => {
        if (event.target !== event.currentTarget) return;
        onEnd?.();
    };

    // Layers: center → (optional rotate) → keyframes → (optional counter-rotate) → piece.
    // Keyframes own `transform` on their node so they don't wipe centering/rotation.
    const animated = (
        <div
            key={animKey}
            style={{
                animation: item.preset ? animationStyle(item.preset) : "none",
                perspective: item.preset === "dieRerollSpin" ? 200 : undefined,
            }}
            onAnimationEnd={handleEnd}
        >
            {directed ? <div style={motion.inner}>{piece}</div> : piece}
        </div>
    );

    return (
        <div
            style={{
                position: "absolute",
                left: "50%",
                top: isStack ? towerTopOffset : "50%",
                transform: isStack ? "translateX(-50%)" : "translate(-50%, -50%)",
            }}
        >
            {directed ? <div style={motion.outer}>{animated}</div> : animated}
        </div>
    );
}

function isBlocking(item) {
    // FloatFeedback can ride along; we wait on piece/hex motion (or explicit feedback-only frames).
    if (item.type === "feedback") return item.block === true;
    return true;
}

/**
 * Renders one FX frame (`fx.items` batch, or a single legacy item).
 * Resolves when every blocking item's animation ends.
 */
export default function BoardFxOverlay({ fx, layout, onComplete }) {
    const pendingRef = useRef(0);
    const finishedRef = useRef(0);

    const items = fx?.items ?? (fx ? [fx] : []);
    const animKey = fx?.animKey;

    useEffect(() => {
        if (!fx) return undefined;
        const blocking = (fx.items ?? [fx]).filter(isBlocking);
        pendingRef.current = Math.max(blocking.length, 1);
        finishedRef.current = 0;
        // Safety: if a preset is unknown / animation never fires, don't soft-lock the game.
        const timer = window.setTimeout(() => onComplete(), 1200);
        return () => window.clearTimeout(timer);
    }, [animKey, fx, onComplete]);

    if (!fx) return null;

    const posByKey = Object.fromEntries(layout.positions.map((p) => [p.key, p]));

    const markDone = () => {
        finishedRef.current += 1;
        if (finishedRef.current >= pendingRef.current) onComplete();
    };

    return (
        <>
            {items.map((item, index) => {
                const pos = posByKey[item.atKey];
                if (!pos) return null;
                const key = `${animKey}-${index}-${item.type ?? "piece"}`;
                const block = isBlocking(item);

                if (item.type === "feedback") {
                    return (
                        <div key={key} style={{ ...hexBoxStyle(pos, layout), zIndex: 20 }}>
                            <FloatFeedback
                                text={item.text}
                                variant={item.variant}
                                visible
                                animKey={animKey}
                                onDone={block ? markDone : undefined}
                                style={{ top: 0 }}
                            />
                        </div>
                    );
                }

                if (item.type === "hexPulse") {
                    return (
                        <div
                            key={key}
                            style={{
                                ...hexBoxStyle(pos, layout),
                                zIndex: 15,
                                animation: animationStyle(item.preset ?? "hexFocalPulse"),
                            }}
                            onAnimationEnd={(e) => {
                                if (e.target === e.currentTarget && block) markDone();
                            }}
                        />
                    );
                }

                return (
                    <div key={key} style={{ ...hexBoxStyle(pos, layout), zIndex: 18 }}>
                        <PieceOverlay
                            item={item}
                            animKey={animKey}
                            onEnd={block ? markDone : undefined}
                        />
                        {item.feedback && (
                            <FloatFeedback
                                text={item.feedback.text}
                                variant={item.feedback.variant}
                                visible
                                animKey={animKey}
                                style={{ top: 0 }}
                            />
                        )}
                    </div>
                );
            })}
        </>
    );
}
