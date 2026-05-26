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
- `evaluateFocalPoints(state:GameState, rollFunction:()=>number)` → `{ newState, pointsScored }` — `pointsScored` is redundant with the score delta in `newState.players` but kept for future UI consumers (e.g. scoring animations)
  - Check if active player controls an active focal point
  - Award point, reroll (min(roll, original − 1)), rotate group
- `rotateFocalGroup(group:FocalPointHex[], scoredFocalPoints:FocalPointHex[])` → new group array (applies one rotation sequentially per scored focal point: each becomes passive then a random currently-passive FP is promoted; previously-scored FPs re-enter the passive pool and may be re-promoted, preserving active count even when passives are scarce)

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

Visual components are built as thin wrappers around **`style-guide-donjon-fall`**, which provides two libraries verified working in this project:

| Library | Import path | Role |
|---|---|---|
| **TkajUI** | `style-guide-donjon-fall/tkajui` | Generic UI — `Button`, `Badge`, `Card`, `ButtonGroup`, etc. |
| **Donjon** | `style-guide-donjon-fall/donjon` | Game UI — `HexTile`, `DieFace`, `DonjonButton`, `DonjonCard`, `FloatFeedback`, `PlayerIdentityBadge`, etc. |

### Prerequisites (done)

- `style-guide-donjon-fall` linked in `node_modules` (symlink to sibling repo)
- Vite aliases in `vite.config.js` pointing at the library source (with React dedupe)
- `@source` directive in `index.css` so Tailwind v4 scans library class names

No custom SVG/CSS hex or die rendering — map game state to library props instead.

### `playerColors.js`
- Hardcoded palette for the two-player default game: `{ red: '#E05C5C', blue: '#4D8FE0' }`
- Used by `Hex`, `Die`, and `ActionPanel` to pass `owner` / `playerColor` to library components

### `Board.jsx`
- Renders all hex cells using pointy-top hex layout (`hexToPixel` from `hex.js`)
- Each cell is an absolutely positioned wrapper (see `DieOnHex` / `TowerOnHex` patterns in the style guide's `DicePage`)
- Accepts `mapData`, `gameState`, interaction callbacks (`onHexClick`, `onDieClick`)
- Derives per-hex highlight state and passes it to `Hex`
- Highlights: selected die/tower, reachable hexes (move vs attack), active/passive focal points

### `Hex.jsx`
- Wraps `HexTile` from `style-guide-donjon-fall/donjon`
- Maps game state → `HexTile` props:

| Game condition | `HexTile` state | Notes |
|---|---|---|
| Normal empty hex | `empty` | |
| Base hex | `base` | `owner` = player color |
| Active focal point | `focal-active` | |
| Passive focal point | `focal-passive` | |
| Selected die/tower | `selected` | |
| Reachable (non-combat) | `move` | |
| Reachable (combat) | `attack` | |

- Renders `Die` (single die) or `TowerStack` (2+ dice) centered on the hex
- Optional `FloatFeedback` overlay for VP/scoring animations (positioned inside the hex wrapper)

### `Die.jsx`
- Wraps `DieFace` from `style-guide-donjon-fall/donjon`
- Props: `faceValue`, `owner`, visual `state`
- Maps game state → `DieFace` props:

| Game condition | `DieFace` state |
|---|---|
| Normal | `default` |
| Selected | `selected` |
| Jumping (from `turnContext`) | `selected` |
| Just rerolled this turn | `rerolled` |
| Combat-damaged (−1 face) | `damaged` |

- Size: `xs` for md hex tiles (62×72); coordinate with `HexTile` size

### `TowerStack.jsx`
- Stacks multiple `DieFace` components with negative vertical offset (style guide `TowerStack` pattern)
- Bottom die aligned to hex center; top die is the active/top-of-stack die
- Size config (`box`, `peek`) must match die size ↔ hex size pairing from the style guide

### `ActionPanel.jsx`
- Built with Donjon/TkajUI components — no raw HTML buttons
- `DonjonCard` as panel container
- `PlayerIdentityBadge` (or `Shield`) for current player indicator
- Score display per player (VP count; style guide `VPCounter` pattern as reference)
- Turn phase label (Focal / Action / Combat)
- Action buttons via `DonjonButton`: `Reroll`, `Tower Collapse` (disabled when illegal)
- Combat resolution via `DonjonButtonGroup`: `Push` / `Occupy` (only during `'COMBAT'` phase)
- "End Turn" via `DonjonButton` (shown after action if no combat pending, or after combat resolved)

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
8. `style-guide-donjon-fall` integration — Vite aliases, Tailwind `@source`, smoke-test imports ✅
9. `src/components/playerColors.js`
10. `src/components/Die.jsx` + `TowerStack.jsx`
11. `src/components/Hex.jsx`
12. `src/components/Board.jsx`
13. `src/components/ActionPanel.jsx`
14. `src/App.jsx` wiring

---

## Open Questions

- **Map image**: ✅ User will provide an image at implementation time; coordinates will be adjusted based on their feedback.
- **Hex orientation**: ✅ pointy-top (vertex up/down, flat sides left/right). Documented in architecture.md.
- **Die visual**: ✅ `DieFace` from `style-guide-donjon-fall/donjon` — pip dots, owner-colored octagon.
- **UI library**: ✅ Both `tkajui` and `donjon` packages verified working; Vite aliases + Tailwind `@source` configured.
- **Starting face values**: ✅ The map JSON supplies a preset configuration (via `Die.faceValue` in base group definitions). `GameProvider` accepts a `randomizeDice` prop (boolean); when `true` one player's values are randomized and mirrored, when `false` the map's preset is used. For this phase, both modes are wired up and the prop is set on `App`.