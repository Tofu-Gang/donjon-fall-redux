import { useMemo } from "react";
import { animationStyle, boardPieceSizes } from "style-guide-donjon-fall/donjon";
import { hexCoords, hexKey, hexToPixel } from "../logic/hex.js";
import { getDiceAtHex, getTopDie } from "../logic/dice.js";
import { getLegalActions } from "../logic/actions.js";
import { boardGeometryStyle, HEX_LAYOUT_SIZE, HEX_DIMS, hiddenDieIds } from "../fx/boardFx.js";
import BoardFxOverlay from "../fx/BoardFxOverlay.jsx";
import Hex from "./Hex.jsx";
import { getOwnerColor } from "./hexLayout.js";

// Board hex tier — die size + px geometry come from donjon-fall-ui boardPieceSizes().
const { hexSize: HEX_SIZE, dieSize: DIE_SIZE } = boardPieceSizes("md");

/**
 * Renders the hex grid for the current map, layering dice, base colors, focal points,
 * and per-tile state (selected / move / attack / blocked) on top. All clicks route through props.
 */
export default function Board({
    mapData,
    state,
    mapHexSet,
    selectedDieId,
    towerMoveMode,
    onHexClick,
    onDeselect,
    texture,
    fx = null,
    onFxComplete,
    stuckOwner = null,
}) {
    // Player whose turn it is (derived from turn order and current index)
    const activePlayer = state.turnOrder[state.currentTurnIndex];
    const hideIds = hiddenDieIds(fx);

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
        const pad = HEX_DIMS.w;
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
                ...boardGeometryStyle(),
            }}
            // Gaps between hexes share the board bounding box with the page grass;
            // clear selection there so "click away" works inside the board chrome.
            onClick={() => onDeselect?.()}
        >
            {layout.positions.map(({ key, pixel }) => {
                const coords = hexCoords(key);
                const dice = getDiceAtHex(state.dice, coords).filter((d) => !hideIds.has(d.id));
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

                // When a die is selected, every non-target hex dims to "blocked"
                // so reachable move/attack tiles (and the selection) stand out.
                let interactionState = "default";
                if (key === selectedHexKey) {
                    interactionState = "selected";
                } else if (reachable.attack.has(key)) {
                    interactionState = "attack";
                } else if (reachable.move.has(key)) {
                    interactionState = "move";
                } else if (selectedDieId) {
                    interactionState = "blocked";
                }

                const dieVisualById = state.dieVisualById ?? {};
                const stuckPulse = stuckOwner
                    && dice.some((d) => d.owner === stuckOwner);

                return (
                    <div
                        key={key}
                        style={{
                            position: "absolute",
                            left: pixel.x + layout.offsetX - HEX_DIMS.w / 2,
                            top: pixel.y + layout.offsetY - HEX_DIMS.h / 2,
                            cursor: interactionState === "blocked" ? "not-allowed" : undefined,
                        }}
                        onClick={(event) => {
                            // Keep hex handling off the board-chrome deselect handler.
                            event.stopPropagation();
                            onHexClick?.(coords);
                        }}
                    >
                        <div
                            style={{
                                animation: stuckPulse
                                    ? animationStyle("dieStuckPulse")
                                    : "none",
                            }}
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
                                onTowerTopClick={(c) => onHexClick?.(c, { preferTowerMove: false })}
                                onTowerBodyClick={(c) => onHexClick?.(c, { preferTowerMove: true })}
                                getDieState={(die) => {
                                    if (die.id === selectedDieId) return "selected";
                                    return dieVisualById[die.id] ?? "default";
                                }}
                            />
                        </div>
                    </div>
                );
            })}
            <BoardFxOverlay fx={fx} layout={layout} onComplete={onFxComplete} />
        </div>
    );
}
