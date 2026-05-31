import { DieFace, playerColorsByKey } from "style-guide-donjon-fall/donjon";

export default function Die({ faceValue, owner, state = "default", size = "xs" }) {
    const playerColor = playerColorsByKey[owner]?.primary;

    return (
        <DieFace
            value={faceValue}
            playerColor={playerColor}
            state={state}
            size={size}
        />
    );
}
