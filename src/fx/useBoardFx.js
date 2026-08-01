import { useCallback, useRef, useState } from "react";

/**
 * One-at-a-time board FX queue. `play(fx)` resolves when the overlay calls `complete()`.
 * Multi-step combat/focal sequences await multiple `play` calls.
 */
export default function useBoardFx() {
    const [fx, setFx] = useState(null);
    const doneRef = useRef(null);
    const seqRef = useRef(0);

    const complete = useCallback(() => {
        const resolve = doneRef.current;
        if (!resolve) return;
        doneRef.current = null;
        setFx(null);
        resolve();
    }, []);

    const play = useCallback((next) => {
        // Drop a prior waiter if somehow overlapping (should not happen when UI is gated).
        doneRef.current?.(false);
        return new Promise((resolve) => {
            doneRef.current = resolve;
            seqRef.current += 1;
            setFx({ ...next, animKey: seqRef.current });
        });
    }, []);

    return {
        fx,
        busy: fx !== null,
        play,
        complete,
    };
}
