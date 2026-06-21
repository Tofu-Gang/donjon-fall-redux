import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ActionPanel from "./ActionPanel.jsx";

function makeState(overrides = {}) {
    return {
        dice: {},
        players: { red: 0, blue: 0 },
        turnOrder: ["red", "blue"],
        currentTurnIndex: 0,
        turnPhase: "ACTION",
        focalPointsGroups: {},
        pendingCombat: null,
        actionTaken: false,
        victoryPointsTarget: 5,
        ...overrides,
    };
}

describe("ActionPanel — combat choices", () => {
    it("renders Push (and Occupy for lone-die attacks) during COMBAT", () => {
        const onPush = vi.fn();
        const onOccupy = vi.fn();

        render(
            <ActionPanel
                state={makeState({
                    turnPhase: "COMBAT",
                    actionTaken: true,
                    pendingCombat: {
                        attackerDieId: "r1",
                        attackerCoords: { q: 0, r: 0, s: 0 },
                        defenderCoords: { q: 1, r: -1, s: 0 },
                        isTowerAttack: false,
                    },
                })}
                mapHexSet={new Set()}
                winner={null}
                reason={null}
                selectedDieId={null}
                towerMoveMode={false}
                onTowerMoveModeChange={() => {}}
                onReroll={() => {}}
                onTowerCollapse={() => {}}
                onPush={onPush}
                onOccupy={onOccupy}
                onEndTurn={() => {}}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: "Push" }));
        expect(onPush).toHaveBeenCalledOnce();

        fireEvent.click(screen.getByRole("button", { name: "Occupy" }));
        expect(onOccupy).toHaveBeenCalledOnce();
    });

    it("renders only Push when the attacker is a tower", () => {
        render(
            <ActionPanel
                state={makeState({
                    turnPhase: "COMBAT",
                    actionTaken: true,
                    pendingCombat: {
                        attackerDieId: "r2",
                        attackerCoords: { q: 0, r: 0, s: 0 },
                        defenderCoords: { q: 1, r: -1, s: 0 },
                        isTowerAttack: true,
                    },
                })}
                mapHexSet={new Set()}
                winner={null}
                reason={null}
                selectedDieId={null}
                towerMoveMode={false}
                onTowerMoveModeChange={() => {}}
                onReroll={() => {}}
                onTowerCollapse={() => {}}
                onPush={() => {}}
                onOccupy={() => {}}
                onEndTurn={() => {}}
            />
        );

        expect(screen.getByRole("button", { name: "Push" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Occupy" })).not.toBeInTheDocument();
    });
});
