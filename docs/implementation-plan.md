# Implementation Plan

## Goal

Ship a fully playable two-player game in `App.jsx` — no menus, no setup screen. Both players share the same browser. The default 61-hex map loads automatically at startup.

---

## Phase 1 — Default Map JSON

**File:** `src/maps/default.json`

The default map is a regular hexagon of radius 4 (61 hexes total) in cube coordinates.

Key map facts (from game-rules.md):
- 61 hexes, large hexagon shape
- Red base = top hexes row (5 hexes), Blue base = bottom hexes row (5 hexes)
- 3 focal points in one group, placed in the middle horizontal row:
  - Left: one hex from the left map border
  - Right: one hex from the right map border
  - Center: center of the map, two hexes from left and right
  - Middle (center) starts active; left and right start passive
- Victory point target: 5

Provide a map image to generate exact cube coordinates for all 61 hexes, base hexes, and focal point hexes.

---

## Phase 2 — Logic Layer (`src/logic/`)

Pure functions, no React. Each module is independently testable.

### `hex.js`
- `hexKey(coords:HexCoords)` → `"q,r,s"` string key
- `hexCoords(hexKey:string)` → HexCoords object
- `hexNeighbors(coords:HexCoords)` → array of 6 neighbor coords
- `hexDistance(one:HexCoords, other:HexCoords)` → integer cube distance
- `hexesInRange(center:HexCoords, range:number)` → all hexes within range steps
- `hexLine(one:HexCoords, other:HexCoords)` →  ordered array of hexes from one to other, inclusive of both endpoints (used for push/formation detection)
- `hexDirection(one:HexCoords, other:HexCoords)` → unit direction vector from a toward b (used for push direction)
- `hexToPixel(coords:HexCoords, size:number)` → `{ x, y }` pixel center for pointy-top layout (used by Board.jsx)

### `dice.js`
- `getDiceAtHex(dice:DiceMap, coords:HexCoords)` → array of die entries at that position, sorted by stackIndex
- `getTopDie(dice:DiceMap, coords:HexCoords)` → die with highest stackIndex at pos (or null)
- `isTower(dice:DiceMap, coords:HexCoords)` → boolean (2+ dice at pos)
- `getNextStackIndex(dice:DiceMap, coords:HexCoords)` → highest stackIndex at pos + 1
- `isTowerCollapsible(dice:DiceMap, coords:HexCoords)` → boolean (3+ dice at pos)
- `getDieById(dice:DiceMap, dieId:string)` → Die entry (or null)

### `combat.js`
- `getCombatPower(dice:DiceMap, dieId:string, turnContext:TurnContext|null)` → number
  - Lone die: face value
  - Tower top: F + S − E
  - Jumping die within retained range: retainedPower (from turnContext)
- `getMovementRange(dice:DiceMap, dieId:string)` → number
  - Lone die: face value
  - Tower top die: face value (not combat power)
- `getTowerMovementRange(dice:DiceMap, coords:HexCoords)` → max(O − E, 1)
- `canPassThrough(dice:DiceMap, movingDieId:string, targetCoords:HexCoords, turnContext:TurnContext|null)` → boolean
  - Enemy: never
  - Friendly: only if moving die combat power > target combat power
- `reachableHexes(dice:DiceMap, dieId:string, mapHexSet:MapHexSet, turnContext:TurnContext|null)` → Set of hex keys the die can reach
- `reachableTowerHexes(dice:DiceMap, coords:HexCoords, mapHexSet:MapHexSet)` → Set of hex keys a tower can reach
- `isCombatMove(dice:DiceMap, dieId:string, targetCoords:HexCoords)` → boolean (true if target hex is occupied by an enemy die or tower)

### `focalPoints.js`
- `evaluateFocalPoints(state:GameState, victoryPointsTarget:number)` → `{ newState, pointsScored }` — `pointsScored` is redundant with the score delta in `newState.players` but kept for future UI consumers (e.g. scoring animations)
  - Check if active player controls an active focal point
  - Award point, reroll (min(roll, original − 1)), rotate group
- `rotateFocalGroup(group:FocalPointHex[])` → new group array (old active becomes passive, random passive becomes active)

### `actions.js`
- `getLegalActions(state:GameState, mapHexSet:MapHexSet)` → `GameAction[]`
  - `{ type: 'MOVE_DIE', dieId:string, path:HexCoords[] }` — one per reachable hex
  - `{ type: 'MOVE_TOWER', coords:HexCoords, path:HexCoords[] }` — one per reachable hex
  - `{ type: 'TOWER_COLLAPSE', coords:HexCoords }` — only if tower has 3+ dice
  - `{ type: 'REROLL', dieId:string }`
- `isGameOver(state:GameState, victoryPointsTarget:number)` → `{ winner: string | null, reason: 'SCORE' | 'SUDDEN_DEATH' | 'CAPTURE_THE_KING' | null }`

---

## Phase 3 — Game Context (`src/context/GameContext.jsx`)

React context + `useReducer`. Seeded from map JSON at mount.

### Initial state construction
1. Load `default.json`
2. Hardcode two players: `red` (base_a) and `blue` (base_b)
3. Randomize one player's dice face values (1–6), mirror to the other player
4. Place one die per base hex, `stackIndex: 0`
5. Set `turnOrder: ['red', 'blue']`, `currentTurnIndex: 0`
6. Copy `focalPointsGroups` from map JSON into state

### Reducer actions
- `EVALUATE_FOCAL_POINTS` — run focalPoints.js, update state
- `PERFORM_ACTION` — apply selected action (move, collapse, reroll)
- `RESOLVE_COMBAT` — apply push or occupy after a combat move
- `END_TURN` — advance `currentTurnIndex`, clear `turnContext`

### Turn flow enforced in context
Each turn: focal point evaluation → action → optional combat resolution → end turn.
Track `turnPhase` in state: `'FOCAL'` → `'ACTION'` → `'COMBAT'` → (auto-advance to next turn's `'FOCAL'`).

---

## Phase 4 — Components (`src/components/`)

### `Board.jsx`
- Renders all hex cells using pointy-top hex layout (pixel coordinates from cube coords)
- Accepts `mapData`, `gameState`, `onHexClick` callback
- Highlights: selected die/tower, reachable hexes, active focal points

### `Hex.jsx`
- Single hex cell (SVG polygon or CSS clip-path)
- Visual variants: normal, base (red/blue tint), focal point active, focal point passive
- Renders dice/tower stack on top

### `Die.jsx`
- Shows face value as large number
- Color-coded by owner
- Visual states: normal, selected, jumping (from turnContext)

### `ActionPanel.jsx`
- Shows current player (red/blue)
- Shows current turn phase
- Shows each player's score
- Buttons: `Reroll`, `Tower Collapse` (greyed if illegal)
- Combat resolution panel: `Push` / `Occupy` buttons (only during `'COMBAT'` phase)
- "End Turn" button (only shown after action is taken if no combat, or after combat resolved)

---

## Phase 5 — App.jsx wiring

```jsx
// src/App.jsx
import { GameProvider } from './context/GameContext'
import Board from './components/Board'
import ActionPanel from './components/ActionPanel'
import mapData from './maps/default.json'

function App() {
  return (
    <GameProvider mapData={mapData}>
      <div className="flex flex-col items-center gap-4 p-4">
        <ActionPanel />
        <Board />
      </div>
    </GameProvider>
  )
}
```

No routing, no setup screen, no menus.

---

## Implementation Order

1. `src/maps/default.json` — needs map image or manual coordinate generation
2. `src/logic/hex.js`
3. `src/logic/dice.js`
4. `src/logic/combat.js`
5. `src/logic/focalPoints.js`
6. `src/logic/actions.js`
7. `src/context/GameContext.jsx`
8. `src/components/Hex.jsx` + `Die.jsx`
9. `src/components/Board.jsx`
10. `src/components/ActionPanel.jsx`
11. `src/App.jsx` wiring

---

## Open Questions

- **Map image**: ✅ User will provide an image at implementation time; coordinates will be adjusted based on their feedback.
- **Hex orientation**: ✅ pointy-top (vertex up/down, flat sides left/right). Documented in architecture.md.
- **Die visual**: ✅ Pip dots.
- **Starting face values**: ✅ The map JSON supplies a preset configuration (via `Die.faceValue` in base group definitions). `GameProvider` accepts a `randomizeDice` prop (boolean); when `true` one player's values are randomized and mirrored, when `false` the map's preset is used. For this phase, both modes are wired up and the prop is set on `App`.