import { playerColorsByKey } from "style-guide-donjon-fall/donjon";

export const hexDims = { sm: { w: 42, h: 48 }, md: { w: 62, h: 72 }, lg: { w: 83, h: 96 } };

/**
 * HexTile `owner` for base cells — player primary (not dark).
 * Matches ScreensPage / donjon-fall-ui: primary multiply-tints grass on bases;
 * dark is for recessed UI, not map territory.
 */
export function getOwnerColor(owner) {
    return owner ? playerColorsByKey[owner]?.primary : null;
}
