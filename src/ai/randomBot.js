/**
 * Picks a legal action uniformly at random.
 * @param {import("../../docs/runtime-types/gameAction.js").GameAction[]} legalActions
 */
export function pickBotAction(legalActions) {
    return legalActions[Math.floor(Math.random() * legalActions.length)];
}

/**
 * Tower attacks can only Push; otherwise choose Push/Occupy at random.
 * @param {{ isTowerAttack?: boolean } | null | undefined} pendingCombat
 * @returns {"PUSH" | "OCCUPY"}
 */
export function pickBotCombatResolution(pendingCombat) {
    if (pendingCombat?.isTowerAttack) return "PUSH";
    return Math.random() < 0.5 ? "PUSH" : "OCCUPY";
}
