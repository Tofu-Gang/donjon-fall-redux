import { useMemo } from "react";
import {
    EventLog,
    Timeline,
    useBreakpoint,
    playerColorsByKey,
    gainColor,
    FocalPointIcon,
    SwordIcon,
    TowerIcon,
    MoveIcon,
} from "style-guide-donjon-fall/donjon";
import { buildTimelineItems } from "../logic/eventLog.js";

const PANEL_MAX_HEIGHT = 480;
const TIMELINE_WIDTH = 240;
const EVENT_LOG_WIDTH = 280;

/**
 * @param {{ hasCombat?: boolean, hasFocal?: boolean, hasVp?: boolean }} item
 */
function timelineIcon(item) {
    if (item.hasCombat) return <SwordIcon width={12} height={12} />;
    if (item.hasFocal) return <FocalPointIcon width={12} height={12} />;
    if (item.hasVp) return <TowerIcon width={12} height={12} />;
    return <MoveIcon width={12} height={12} />;
}

/**
 * @param {object} props
 * @param {object} props.state
 * @param {string|null} [props.winner]
 * @param {string|null} [props.reason]
 * @param {'timeline'|'eventLog'} props.variant
 * @param {'side'|'below'} [props.slot='side']
 */
export default function GameHistoryPanels({
    state,
    winner = null,
    reason = null,
    variant,
    slot = "side",
}) {
    const { isDesktop } = useBreakpoint();

    const timelineItems = useMemo(
        () => buildTimelineItems(state, { winner, reason }).map((item) => ({
            ...item,
            icon: item.player ? timelineIcon(item) : undefined,
            color: item.player
                ? playerColorsByKey[item.player]?.primary
                : item.hasVp
                    ? gainColor
                    : undefined,
        })),
        [state, winner, reason],
    );

    if (variant === "timeline") {
        if (!isDesktop) return null;
        return (
            <div
                className="shrink-0 self-center overflow-y-auto"
                style={{ width: TIMELINE_WIDTH, maxHeight: PANEL_MAX_HEIGHT }}
            >
                <Timeline items={timelineItems} />
            </div>
        );
    }

    if (variant === "eventLog") {
        if (slot === "side" && !isDesktop) return null;
        if (slot === "below" && isDesktop) return null;

        const wrapperClass = slot === "below" ? "w-full max-w-lg" : "shrink-0 self-center";
        const wrapperStyle = slot === "below"
            ? { maxHeight: PANEL_MAX_HEIGHT }
            : { width: EVENT_LOG_WIDTH, maxHeight: PANEL_MAX_HEIGHT };

        return (
            <div className={wrapperClass} style={wrapperStyle}>
                <EventLog
                    events={state.events ?? []}
                    maxHeight={PANEL_MAX_HEIGHT - 48}
                    title="Game log"
                    showRound
                    autoScroll
                    ornament="decorated"
                />
            </div>
        );
    }

    return null;
}
