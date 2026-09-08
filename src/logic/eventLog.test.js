import { describe, it, expect } from "vitest";
import {
    appendEvents,
    buildTimelineItems,
    flushTurnSummary,
    summarizeTurnEvents,
} from "./eventLog.js";

describe("eventLog", () => {
    it("appendEvents assigns sequential ids", () => {
        const state = { events: [{ id: "0" }], eventIdSeq: 0 };
        const next = appendEvents(state, [
            { type: "event", text: "Moved", round: 1 },
            { type: "gain", text: "+1 VP", round: 1 },
        ]);
        expect(next.events).toHaveLength(3);
        expect(next.events[1].id).toBe("1");
        expect(next.events[2].id).toBe("2");
    });

    it("summarizeTurnEvents joins tagged actions", () => {
        const summary = summarizeTurnEvents([
            { type: "gain", text: "+1 VP — Red", detail: "Focal point", tag: "Focal" },
            { type: "event", text: "Red moved", tag: "Move" },
        ]);
        expect(summary).toContain("+1 VP");
        expect(summary).toContain("Move");
    });

    it("flushTurnSummary records completed turn", () => {
        const state = {
            turnNumber: 1,
            turnOrder: ["red", "blue"],
            currentTurnIndex: 0,
            events: [
                { id: "1", type: "event", text: "Red moved", round: 1, tag: "Move" },
            ],
            turnSummaries: [],
        };
        const next = flushTurnSummary(state);
        expect(next.turnSummaries).toHaveLength(1);
        expect(next.turnSummaries[0].player).toBe("red");
        expect(next.turnSummaries[0].description).toContain("Move");
    });

    it("buildTimelineItems includes current turn and game over", () => {
        const inProgress = buildTimelineItems({
            turnNumber: 2,
            turnOrder: ["red", "blue"],
            currentTurnIndex: 1,
            events: [],
            turnSummaries: [{
                id: "turn-1",
                turnNumber: 1,
                player: "red",
                description: "Move",
            }],
        });
        expect(inProgress).toHaveLength(2);
        expect(inProgress[1].current).toBe(true);

        const finished = buildTimelineItems(
            { turnSummaries: [], events: [], turnOrder: ["red", "blue"], currentTurnIndex: 0, turnNumber: 3 },
            { winner: "red", reason: "SCORE" },
        );
        expect(finished.at(-1).title).toBe("Red wins");
    });
});
