import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { GameProvider } from "./GameContext.jsx";
import { useGame } from "./useGame.js";

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Minimal map with two base hexes (one per player) and no focal points.
 * Keeps tests fast and independent of the real map layout.
 */
const MINI_MAP = {
    hexes: [
        { q: 0, r: 0, s: 0 },
        { q: 1, r: -1, s: 0 },
        { q: 2, r: -2, s: 0 },
        { q: -1, r: 1, s: 0 },
        { q: -2, r: 2, s: 0 },
    ],
    baseGroups: [
        {
            forPlayersCount: 2,
            hexes: [{ coords: { q: 2, r: -2, s: 0 }, dice: [{ type: "D6", faceValue: 3, stackIndex: 0 }] }],
        },
        {
            forPlayersCount: 2,
            hexes: [{ coords: { q: -2, r: 2, s: 0 }, dice: [{ type: "D6", faceValue: 3, stackIndex: 0 }] }],
        },
    ],
    focalPointsGroups: [],
    victoryPointsTargets: [{ forPlayersCount: 2, target: 5 }],
};

/** Captures context value into a ref so we can call actions outside render. */
function ContextCapture({ capture }) {
    capture.current = useGame();
    return null;
}

function renderProvider(mapData = MINI_MAP, randomizeDice = false) {
    const ref = { current: null };
    render(
        <GameProvider mapData={mapData} randomizeDice={randomizeDice}>
            <ContextCapture capture={ref} />
        </GameProvider>
    );
    return ref;
}

// ─── initial state ───────────────────────────────────────────────────────────

describe("GameProvider initial state", () => {
    it("starts with FOCAL phase, no winner, scores at 0", () => {
        const ref = renderProvider();
        const { state, winner, reason } = ref.current;
        expect(state.turnPhase).toBe("FOCAL");
        expect(state.players).toEqual({ red: 0, blue: 0 });
        expect(winner).toBeNull();
        expect(reason).toBeNull();
    });

    it("exposes all action helpers", () => {
        const ref = renderProvider();
        expect(typeof ref.current.evaluateFocalPoints).toBe("function");
        expect(typeof ref.current.performAction).toBe("function");
        expect(typeof ref.current.resolveCombat).toBe("function");
        expect(typeof ref.current.endTurn).toBe("function");
    });

    it("exposes a mapHexSet containing map hexes", () => {
        const ref = renderProvider();
        expect(ref.current.mapHexSet).toBeInstanceOf(Set);
        expect(ref.current.mapHexSet.size).toBeGreaterThan(0);
    });
});

// ─── evaluateFocalPoints → ACTION ────────────────────────────────────────────

describe("evaluateFocalPoints", () => {
    it("advances turnPhase from FOCAL to ACTION", () => {
        const ref = renderProvider();
        act(() => ref.current.evaluateFocalPoints());
        expect(ref.current.state.turnPhase).toBe("ACTION");
        expect(ref.current.state.actionTaken).toBe(false);
    });
});

// ─── performAction → endTurn flow ────────────────────────────────────────────

describe("performAction + endTurn", () => {
    it("REROLL sets actionTaken and stays in ACTION phase", () => {
        const ref = renderProvider();
        act(() => ref.current.evaluateFocalPoints());
        const dieId = Object.keys(ref.current.state.dice)[0];
        act(() => ref.current.performAction({ type: "REROLL", dieId }));
        expect(ref.current.state.actionTaken).toBe(true);
        expect(ref.current.state.turnPhase).toBe("ACTION");
    });

    it("endTurn advances to the next player and resets to FOCAL", () => {
        const ref = renderProvider();
        act(() => ref.current.evaluateFocalPoints());
        const dieId = Object.keys(ref.current.state.dice)[0];
        act(() => ref.current.performAction({ type: "REROLL", dieId }));
        act(() => ref.current.endTurn());
        expect(ref.current.state.currentTurnIndex).toBe(1);
        expect(ref.current.state.turnPhase).toBe("FOCAL");
        expect(ref.current.state.actionTaken).toBe(false);
    });
});

// ─── combat flow ─────────────────────────────────────────────────────────────

describe("combat flow via performAction + resolveCombat", () => {
    it("MOVE_DIE into enemy hex sets COMBAT phase with pendingCombat", () => {
        const ref = renderProvider();
        act(() => ref.current.evaluateFocalPoints());

        // Place red die at center and blue die one step away (manually via a known state)
        // We test the shape of the context-level plumbing here, not specific combat outcomes.
        // Verify that after resolveCombat the phase returns to ACTION.
        const redDieId = Object.keys(ref.current.state.dice).find(
            id => ref.current.state.dice[id].owner === "red"
        );
        const blueDieId = Object.keys(ref.current.state.dice).find(
            id => ref.current.state.dice[id].owner === "blue"
        );
        const redCoords = ref.current.state.dice[redDieId].coords;
        const blueCoords = ref.current.state.dice[blueDieId].coords;

        act(() => ref.current.performAction({
            type: "MOVE_DIE",
            dieId: redDieId,
            path: [redCoords, blueCoords],
        }));
        expect(ref.current.state.turnPhase).toBe("COMBAT");
        expect(ref.current.state.pendingCombat).not.toBeNull();

        act(() => ref.current.resolveCombat("OCCUPY"));
        expect(ref.current.state.turnPhase).toBe("ACTION");
        expect(ref.current.state.pendingCombat).toBeNull();
    });
});

// ─── useGame outside provider ─────────────────────────────────────────────────

describe("useGame", () => {
    it("throws when used outside GameProvider", () => {
        const Bomb = () => { useGame(); return null; };
        expect(() => render(<Bomb />)).toThrow("useGame must be used inside GameProvider");
    });
});