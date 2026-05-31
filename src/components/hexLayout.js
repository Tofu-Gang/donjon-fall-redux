import { playerColorsByKey } from "style-guide-donjon-fall/donjon";

export const hexDims = { sm: { w: 42, h: 48 }, md: { w: 62, h: 72 }, lg: { w: 83, h: 96 } };

export function getOwnerColor(owner) {
    return owner ? playerColorsByKey[owner]?.dark : null;
}
