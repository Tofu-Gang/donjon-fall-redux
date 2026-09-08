/** @typedef {'gain'|'loss'|'event'|'warning'|'system'} EventType */

export const PLAYER_LABELS = { red: "Red", blue: "Blue" };

const REASON_LABELS = {
    SCORE: "Victory points",
    SUDDEN_DEATH: "Sudden death",
};

/**
 * @param {{ q: number, r: number, s?: number }} coords
 * @returns {string}
 */
export function formatCoords(coords) {
    return `(${coords.q}, ${coords.r})`;
}

/**
 * @param {object} state
 * @param {Array<{ type: EventType, text: string, detail?: string, round?: number, player?: string, tag?: string }>} entries
 * @returns {object}
 */
export function appendEvents(state, entries) {
    let seq = state.eventIdSeq ?? 0;
    const stamped = entries.map((entry) => {
        seq += 1;
        return { id: String(seq), ...entry };
    });
    return {
        ...state,
        events: [...(state.events ?? []), ...stamped],
        eventIdSeq: seq,
    };
}

/**
 * @param {Array<{ type: EventType, text: string, detail?: string, tag?: string }>} events
 * @returns {string}
 */
export function summarizeTurnEvents(events) {
    const parts = [];
    for (const entry of events) {
        if (entry.type === "gain") {
            parts.push(entry.detail ? `${entry.text} (${entry.detail})` : entry.text);
        } else if (entry.type === "event" && entry.tag) {
            parts.push(entry.tag);
        } else if (entry.type === "warning") {
            parts.push(entry.text);
        }
    }
    return parts.length > 0 ? parts.join(" · ") : "No scoring actions";
}

/**
 * @param {object} state — state before END_TURN advances the turn counter
 * @returns {object}
 */
export function flushTurnSummary(state) {
    const player = state.turnOrder[state.currentTurnIndex];
    const turnEvents = (state.events ?? []).filter(
        (e) => e.round === state.turnNumber && e.type !== "system",
    );
    const summary = {
        id: `turn-${state.turnNumber}`,
        turnNumber: state.turnNumber,
        player,
        description: summarizeTurnEvents(turnEvents),
        hasCombat: turnEvents.some((e) => e.tag === "Combat"),
        hasFocal: turnEvents.some((e) => e.detail === "Focal point"),
        hasVp: turnEvents.some((e) => e.type === "gain"),
    };
    return {
        ...state,
        turnSummaries: [...(state.turnSummaries ?? []), summary],
    };
}

/**
 * @param {object} state
 * @param {{ winner?: string|null, reason?: string|null }} gameOver
 * @returns {Array<object>}
 */
export function buildTimelineItems(state, gameOver = {}) {
    const { winner = null, reason = null } = gameOver;
    /** @type {Array<object>} */
    const items = [];

    for (const summary of state.turnSummaries ?? []) {
        items.push({
            id: summary.id,
            time: `T ${summary.turnNumber}`,
            title: `${PLAYER_LABELS[summary.player]}'s turn`,
            description: summary.description,
            player: summary.player,
            hasCombat: summary.hasCombat,
            hasFocal: summary.hasFocal,
            hasVp: summary.hasVp,
        });
    }

    if (!winner) {
        const activePlayer = state.turnOrder[state.currentTurnIndex];
        const currentEvents = (state.events ?? []).filter(
            (e) => e.round === state.turnNumber && e.type !== "system",
        );
        items.push({
            id: `turn-${state.turnNumber}-current`,
            time: `T ${state.turnNumber}`,
            title: `${PLAYER_LABELS[activePlayer]}'s turn`,
            description: currentEvents.length > 0
                ? summarizeTurnEvents(currentEvents)
                : "In progress…",
            player: activePlayer,
            hasCombat: currentEvents.some((e) => e.tag === "Combat"),
            hasFocal: currentEvents.some((e) => e.detail === "Focal point"),
            hasVp: currentEvents.some((e) => e.type === "gain"),
            current: true,
        });
    } else {
        const reasonLabel = REASON_LABELS[reason] ?? reason;
        items.push({
            id: "game-over",
            time: "—",
            title: `${PLAYER_LABELS[winner]} wins`,
            description: reasonLabel ?? "Game over",
            current: true,
        });
    }

    return items;
}
