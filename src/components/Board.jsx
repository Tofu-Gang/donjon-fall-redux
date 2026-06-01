import { useMemo } from "react";
import { hexCoords, hexKey, hexToPixel } from "../logic/hex.js";
import { getDiceAtHex, getTopDie } from "../logic/dice.js";
import { getLegalActions } from "../logic/actions.js";
import Hex from "./Hex.jsx";
import { getOwnerColor, hexDims } from "./hexLayout.js";

const HEX_LAYOUT_SIZE = hexDims.md.h / 2;
const HEX_SIZE = "md";
const DIE_SIZE = "xs";

export default function Board({
    mapData,
    state,
    mapHexSet,
    selectedDieId,
    towerMoveMode,
    onSelectDie,
    onHexClick,
}) {
    const activePlayer = state.turnOrder[state.currentTurnIndex];

    const { baseHexOwners, focalByKey } = useMemo(() => {
        const bases = {};
        const baseGroups = mapData.baseGroups.filter((g) => g.forPlayersCount === 2);
        const owners = ["red", "blue"];
        baseGroups.forEach((baseGroup, groupIndex) => {
            const owner = owners[groupIndex];
            for (const baseHex of baseGroup.hexes) {
                bases[hexKey(baseHex.coords)] = getOwnerColor(owner);
            }
        });
        const focal = {};
        for (const group of Object.values(state.focalPointsGroups)) {
            for (const fp of group) {
                focal[hexKey(fp.coords)] = fp.isActive ? "focal-active" : "focal-passive";
            }
        }
        return { baseHexOwners: bases, focalByKey: focal };
    }, [mapData, state.focalPointsGroups]);

    const reachable = useMemo(() => {
        if (state.turnPhase !== "ACTION" || !selectedDieId) {
            return { move: new Set(), attack: new Set() };
        }
        const legal = getLegalActions(state, mapHexSet);
        const move = new Set();
        const attack = new Set();
        const selectedDie = state.dice[selectedDieId];
        if (!selectedDie) return { move, attack };

        for (const action of legal) {
            if (towerMoveMode) {
                if (action.type !== "MOVE_TOWER") continue;
                if (hexKey(action.coords) !== hexKey(selectedDie.coords)) continue;
            } else if (action.type === "MOVE_DIE") {
                if (action.dieId !== selectedDieId) continue;
            } else {
                continue;
            }
            const dest = action.path[action.path.length - 1];
            const destKey = hexKey(dest);
            const top = getTopDie(state.dice, dest);
            if (top && top.owner !== activePlayer) {
                attack.add(destKey);
            } else {
                move.add(destKey);
            }
        }
        return { move, attack };
    }, [state, mapHexSet, selectedDieId, towerMoveMode, activePlayer]);

    const selectedHexKey = selectedDieId
        ? hexKey(state.dice[selectedDieId]?.coords)
        : null;

    const layout = useMemo(() => {
        const keys = [...mapHexSet];
        const positions = keys.map((key) => ({
            key,
            coords: hexCoords(key),
            pixel: hexToPixel(hexCoords(key), HEX_LAYOUT_SIZE),
        }));
        const minX = Math.min(...positions.map((p) => p.pixel.x));
        const maxX = Math.max(...positions.map((p) => p.pixel.x));
        const minY = Math.min(...positions.map((p) => p.pixel.y));
        const maxY = Math.max(...positions.map((p) => p.pixel.y));
        const pad = hexDims[HEX_SIZE].w;
        return {
            positions,
            width: maxX - minX + pad * 2,
            height: maxY - minY + pad * 2,
            offsetX: -minX + pad,
            offsetY: -minY + pad,
        };
    }, [mapHexSet]);

    return (
        <div
            style={{
                position: "relative",
                width: layout.width,
                height: layout.height,
                margin: "0 auto",
            }}
        >
            {layout.positions.map(({ key, pixel }) => {
                const coords = hexCoords(key);
                const dice = getDiceAtHex(state.dice, coords);
                const isBase = key in baseHexOwners;
                let tileState = "empty";
                if (key === selectedHexKey) {
                    tileState = "selected";
                } else if (reachable.attack.has(key)) {
                    tileState = "attack";
                } else if (reachable.move.has(key)) {
                    tileState = "move";
                } else if (key in focalByKey) {
                    tileState = focalByKey[key];
                } else if (isBase) {
                    tileState = "base";
                }

                return (
                    <div
                        key={key}
                        style={{
                            position: "absolute",
                            left: pixel.x + layout.offsetX - hexDims[HEX_SIZE].w / 2,
                            top: pixel.y + layout.offsetY - hexDims[HEX_SIZE].h / 2,
                        }}
                        onClick={() => onHexClick?.(key, coords)}
                    >
                        <Hex
                            tileState={tileState}
                            ownerColor={isBase ? baseHexOwners[key] : null}
                            dice={dice}
                            hexSize={HEX_SIZE}
                            dieSize={DIE_SIZE}
                            onDieClick={onSelectDie}
                            getDieState={(die) =>
                                die.id === selectedDieId ? "selected" : "default"
                            }
                        />
                    </div>
                );
            })}
        </div>
    );
}
