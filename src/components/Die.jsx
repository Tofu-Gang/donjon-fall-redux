import { useState } from "react";
import { DieFace, playerColorsByKey, gold } from "style-guide-donjon-fall/donjon";

// Match DiceTower top-die hover glow (library DiceTower.jsx).
const HOVER_GLOW = `drop-shadow(0 0 6px ${gold}AA)`;

/**
 * Thin adapter: game die (`faceValue`, `owner`) → library DieFace.
 * Adds the same gold hover glow DiceTower applies to a lone top die.
 */
export default function Die({ faceValue, owner, state = "default", size }) {
    const playerColor = playerColorsByKey[owner]?.primary;
    const [hovered, setHovered] = useState(false);

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                filter: hovered ? HOVER_GLOW : undefined,
                transition: "filter 120ms ease",
            }}
        >
            <DieFace
                value={faceValue}
                playerColor={playerColor}
                state={state}
                size={size}
            />
        </div>
    );
}
