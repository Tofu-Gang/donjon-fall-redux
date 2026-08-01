import { boardPieceSizes } from "style-guide-donjon-fall/donjon";
import { getDiceAtHex, getTopDie } from "../logic/dice.js";
import { hexDistance, hexKey, hexToPixel } from "../logic/hex.js";

const { hex: HEX_DIMS } = boardPieceSizes("md");
/** Matches Board.jsx — hex center-to-vertex used by hexToPixel. */
export const HEX_LAYOUT_SIZE = HEX_DIMS.h / 2;

/**
 * Pixel delta between two hex centers (board layout space).
 * @param {import("../../docs/runtime-types/hexCoords.js").HexCoords} from
 * @param {import("../../docs/runtime-types/hexCoords.js").HexCoords} to
 */
export function hexPixelDelta(from, to) {
    const a = hexToPixel(from, HEX_LAYOUT_SIZE);
    const b = hexToPixel(to, HEX_LAYOUT_SIZE);
    return { dx: b.x - a.x, dy: b.y - a.y };
}

/**
 * CSS vars so Donjon move/push keyframes travel the real board distance/direction.
 * Outer wrapper is rotated so +X points at the destination; the die is counter-rotated.
 * `dieMove2` ends at 2×step-x, so step is half the true distance.
 */
export function directedMotionStyle(dx, dy, preset = "dieMove") {
    const dist = Math.hypot(dx, dy) || 1;
    const step = preset === "dieMove2" ? dist / 2 : dist;
    const angle = Math.atan2(dy, dx);
    return {
        outer: {
            transform: `rotate(${angle}rad)`,
            ["--donjon-hex-step-x"]: `${step}px`,
            ["--donjon-hex-step-y"]: `${step}px`,
        },
        inner: {
            transform: `rotate(${-angle}rad)`,
        },
    };
}

/**
 * Pick a Donjon move preset for a peaceful die relocation.
 * @param {object} opts
 * @param {object} opts.dice
 * @param {string} opts.dieId
 * @param {object[]} opts.path
 */
export function pickDieMovePreset({ dice, dieId, path }) {
    const die = dice[dieId];
    const from = path[0] ?? die.coords;
    const to = path[path.length - 1];
    const steps = hexDistance(from, to);
    const originStack = getDiceAtHex(dice, from);
    const destTop = getTopDie(dice, to);
    const leavingTower = originStack.length > 1;
    const landingOnDie = destTop !== null;

    if (leavingTower && !landingOnDie) return "dieMoveOffTower";
    if (landingOnDie) return "dieMoveOnto";
    if (steps >= 2) return "dieMove2";
    return "dieMove";
}

/**
 * Board-level CSS vars: Donjon defaults assume a 12px gap; our grid is edge-to-edge.
 */
export function boardGeometryStyle() {
    const stepX = Math.sqrt(3) * HEX_LAYOUT_SIZE;
    const stepY = 1.5 * HEX_LAYOUT_SIZE;
    return {
        ["--donjon-hex-step-x"]: `${stepX}px`,
        ["--donjon-hex-step-y"]: `${stepY}px`,
        ["--donjon-tower-stack"]: "16px",
    };
}

/**
 * Active focals controlled by the current player — same scoring gate as evaluateFocalPoints.
 * @returns {{ coords: object, die: object }[]}
 */
export function previewFocalScores(state) {
    const activePlayer = state.turnOrder[state.currentTurnIndex];
    const hits = [];
    for (const group of Object.values(state.focalPointsGroups)) {
        for (const fp of group) {
            if (!fp.isActive) continue;
            const top = getTopDie(state.dice, fp.coords);
            if (!top || top.owner !== activePlayer) continue;
            hits.push({ coords: fp.coords, die: top });
        }
    }
    return hits;
}

/**
 * Whether a move action opens combat (attacker stays put until resolution).
 */
export function isCombatMove(state, action) {
    const activePlayer = state.turnOrder[state.currentTurnIndex];
    const dest = action.path[action.path.length - 1];
    const top = getTopDie(state.dice, dest);
    return top !== null && top.owner !== activePlayer;
}

/**
 * Die IDs that should be hidden on the board while an overlay plays their motion.
 * @param {object | null} fx
 */
export function hiddenDieIds(fx) {
    if (!fx?.hideDieIds) return new Set();
    return new Set(fx.hideDieIds);
}

export { hexKey, HEX_DIMS };
