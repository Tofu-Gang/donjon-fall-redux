import { useMemo } from "react";
import { hexCoords, hexKey, hexToPixel } from "../logic/hex.js";
import { getDiceAtHex, getTopDie } from "../logic/dice.js";
import { getLegalActions } from "../logic/actions.js";
import Hex from "./Hex.jsx";
import { getOwnerColor, hexDims } from "./hexLayout.js";

// Hex layout uses the medium size's height as the pixel radius for placement.
const HEX_LAYOUT_SIZE = hexDims.md.h / 2;
const HEX_SIZE = "md";
const DIE_SIZE = "xs";

/**
 * Renders the hex grid for the current map, layering dice, base colors, focal points,
 * and per-tile state (selected / move / attack) on top. All clicks route through props.
 */
export default function Board({
    mapData,
    state,
    mapHexSet,
    selectedDieId,
    towerMoveMode,
    onHexClick,
    texture,
}) {
    // Player whose turn it is (derived from turn order and current index)
    const activePlayer = state.turnOrder[state.currentTurnIndex];

    // Build lookup maps used to decorate each tile: base ownership and focal-point state.
    const { baseHexOwners, focalByKey } = useMemo(() => {
        // Each base group on the map becomes one player's starting territory.
        const bases = {};
        const baseGroups = mapData.baseGroups.filter((g) => g.forPlayersCount === 2);
        const owners = ["red", "blue"];
        baseGroups.forEach((baseGroup, groupIndex) => {
            const owner = owners[groupIndex];
            for (const baseHex of baseGroup.hexes) {
                bases[hexKey(baseHex.coords)] = getOwnerColor(owner);
            }
        });
        // Map each focal-point hex key to its active/passive game-state.
        const focal = {};
        for (const group of Object.values(state.focalPointsGroups)) {
            for (const fp of group) {
                focal[hexKey(fp.coords)] = fp.isActive ? "active" : "passive";
            }
        }
        return { baseHexOwners: bases, focalByKey: focal };
    }, [mapData, state.focalPointsGroups]);

    // Compute reachable hexes for the selected die, split into move vs attack targets.
    const reachable = useMemo(() => {
        // Outside ACTION, or with nothing selected, nothing is highlighted.
        if (state.turnPhase !== "ACTION" || !selectedDieId) {
            return { move: new Set(), attack: new Set() };
        }
        const legal = getLegalActions(state, mapHexSet);
        const move = new Set();
        const attack = new Set();
        const selectedDie = state.dice[selectedDieId];
        if (!selectedDie) return { move, attack };

        // Walk every legal action, filter to ones matching the current selection,
        // and bucket destinations by whether the top die there is friendly or enemy.
        for (const action of legal) {
            if (towerMoveMode) {
                // Tower-move mode: only consider moving the stack at the selected die's hex.
                if (action.type !== "MOVE_TOWER") continue;
                if (hexKey(action.coords) !== hexKey(selectedDie.coords)) continue;
            } else if (action.type === "MOVE_DIE") {
                // Single-die mode: only consider moves for the selected die.
                if (action.dieId !== selectedDieId) continue;
            } else {
                continue;
            }
            const dest = action.path[action.path.length - 1];
            const destKey = hexKey(dest);
            const top = getTopDie(state.dice, dest);
            if (top && top.owner !== activePlayer) {
                // Enemy-occupied destination → attack target.
                attack.add(destKey);
            } else {
                // Empty or friendly → plain move target.
                move.add(destKey);
            }
        }
        return { move, attack };
    }, [state, mapHexSet, selectedDieId, towerMoveMode, activePlayer]);

    // Hex key of the selected die, used to apply the "selected" tile style.
    const selectedHexKey = selectedDieId
        ? hexKey(state.dice[selectedDieId]?.coords)
        : null;

    // Pre-compute pixel positions for every hex so the container can be sized exactly.
    const layout = useMemo(() => {
        const keys = [...mapHexSet];
        const positions = keys.map((key) => ({
            key,
            coords: hexCoords(key),
            pixel: hexToPixel(hexCoords(key), HEX_LAYOUT_SIZE),
        }));
        // Bounding box of all hex pixels; padded by one hex width so borders aren't clipped.
        const minX = Math.min(...positions.map((p) => p.pixel.x));
        const maxX = Math.max(...positions.map((p) => p.pixel.x));
        const minY = Math.min(...positions.map((p) => p.pixel.y));
        const maxY = Math.max(...positions.map((p) => p.pixel.y));
        const pad = hexDims[HEX_SIZE].w;
        return {
            positions,
            width: maxX - minX + pad * 2,
            height: maxY - minY + pad * 2,
            // offsetX/offsetY translate the (possibly negative) pixel coords into positive container space.
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
                // HexTile uses three axes: property (what the cell is), focal sub-state,
                // and interaction state (selected / move / attack). These compose instead
                // of replacing each other.
                let property = "empty";
                let focal;
                let owner = null;
                if (key in focalByKey) {
                    property = "focal";
                    focal = focalByKey[key];
                } else if (key in baseHexOwners) {
                    property = "base";
                    owner = baseHexOwners[key];
                }

                let interactionState = "default";
                if (key === selectedHexKey) {
                    interactionState = "selected";
                } else if (reachable.attack.has(key)) {
                    interactionState = "attack";
                } else if (reachable.move.has(key)) {
                    interactionState = "move";
                }

                return (
                    <div
                        key={key}
                        style={{
                            position: "absolute",
                            left: pixel.x + layout.offsetX - hexDims[HEX_SIZE].w / 2,
                            top: pixel.y + layout.offsetY - hexDims[HEX_SIZE].h / 2,
                        }}
                        onClick={() => onHexClick?.(coords)}
                    >
                        <Hex
                            property={property}
                            focal={focal}
                            state={interactionState}
                            owner={owner}
                            dice={dice}
                            hexSize={HEX_SIZE}
                            dieSize={DIE_SIZE}
                            texture={texture}
                            onClickAt={onHexClick}
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