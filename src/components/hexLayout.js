import { playerColorsByKey } from "style-guide-donjon-fall/donjon";

/**
 * HexTile `owner` for base cells — player primary (not dark).
 * Matches ScreensPage / donjon-fall-ui: primary multiply-tints grass on bases;
 * dark is for recessed UI, not map territory.
 */
export function getOwnerColor(owner) {
    return owner ? playerColorsByKey[owner]?.primary : null;
}
