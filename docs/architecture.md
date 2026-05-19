# Architecture

## Overview

Donjon Fall is a turn-based hex-grid board game. The frontend is a React 19 app (JSX only, no TypeScript) bundled with Vite. Game logic lives in pure functions; React context holds the minimal mutable state required to reconstruct the full game state at any point.

---

## Coordinate System

All hex positions use **cube coordinates** `{ q, r, s }` where `q + r + s === 0` always holds. Cube coordinates make distance, neighbor, and line calculations straightforward.

A hex is uniquely identified by a string key `"q,r,s"` used as object keys throughout the codebase.

---

## Map Format

The map is a static JSON file loaded once at game start. It does not change during a game session.

Full type definitions: [`docs/map-definition/map.js`](map-definition-types/map.js) and related files in that folder.

### Hex rendering orientation

All maps use **pointy-top** orientation: each hex has a vertex pointing up and down, with flat sides on the left and right. This applies to every map and is not configurable per map.

Pixel coordinates for a hex at cube position `{ q, r, s }` with hex size `size` (center-to-vertex distance):

```
x = size × (√3 × q  +  √3/2 × r)
y = size × (3/2 × r)
```

The six vertices of a pointy-top hex centered at `(cx, cy)` are at angles `30°, 90°, 150°, 210°, 270°, 330°` from the center.

---

## Game Setup

Game setup is a one-time configuration step performed before the game starts. It produces the inputs that seed the initial game state.

### Player Setup

Each player selects a color, emblem, and name. The game engine then assigns each player to a base from the map's `baseGroups`. Player count must equal the number of base IDs defined in the map.

```js
[
  {
    id: string,           // unique, derived from color (e.g. "red")
    color: string,        // chosen from a predefined palette
    emblemId: string,     // chosen from a predefined set
    name: string,         // entered by the player
    baseId: string        // key from map's baseGroups (e.g. "base_a")
  },
  ...
]
```

### Dice Setup

One die is placed on each hex of a player's assigned base. One player's face values are either randomized or set to predefined values; all other players then copy the same face values for their own dice. The number of dice per player equals the hex count of their base — it is the map designer's responsibility to keep base sizes equal across all players.

```js
[
  {
    owner: playerId,        // references player id
    faceValue: number,      // 1–6, randomised or preset
    coords: HexCoords,      // one of the player's base hexes
    stackIndex: 0           // always 0 at setup — one die per hex
  },
  ...
]
```

---

## Game State

Game state is held in a React context. Only the minimal mutable data is stored. Everything else is derived on demand via pure functions.

```js
{
  // Dice — one entry per die, keyed by unique ID
  dice: {
    [dieId]: {
      owner: playerId,          // never changes
      type: string,             // e.g. "D6", "D12"; upper bound for face value; never changes
      faceValue: number,        // 1–6 for D6, etc.
      coords: HexCoords,        // current hex
      stackIndex: number        // 0 = bottom of stack; lone die is always 0
    }
  },

  // Players — keyed by player ID (e.g. "red", "blue")
  players: {
    [playerId]: number    // accumulated victory points, never decreases
  },

  // Turn order — fixed sequence set before the game starts, never changes; first player in the array starts the game
  turnOrder: [playerId, ...],
  currentTurnIndex: number,     // index into turnOrder
  turnPhase: TurnPhase,             // 'FOCAL' | 'ACTION' | 'COMBAT'

  // Focal point groups — mirrors map definition structure
  // Evaluation always picks a passive point from the same group
  focalPointsGroups: {
    groupId: [
      {
        coords: HexCoords,
        isActive: boolean
      },
      ...
    ],
    ...
  },

  // Ephemeral turn context — null when no special state is active
  turnContext: {
    // Set when a die jumps off a tower; cleared at turn end or when the
    // die moves outside the original tower movement range
    jumpContext: {
      dieId: string,
      retainedPower: number
    } | null
  } | null,

  // Set when a move action lands on an enemy hex before the player has chosen
  // Push or Occupy; null at all other times
  pendingCombat: {
    attackerDieId: string,      // die (or tower top die) that initiated the attack
    attackerCoords: HexCoords,  // hex the attacker occupied before moving
    defenderCoords: HexCoords,  // hex being attacked (target)
    isTowerAttack: boolean      // true = tower attack; Occupy unavailable
  } | null,

  actionTaken: boolean,         // true once the active player has used their action this turn
  victoryPointsTarget: number   // score threshold to win; sourced from the map at game start
}
```

### Why `stackIndex`

Dice on the same hex form a tower. Tower rules depend on stacking order (top die is the controller; bottom die is removed on Tower Collapse). Stacking order cannot be derived from positions alone, so each die carries a `stackIndex`:

- `0` = bottom of the stack
- Highest index on a hex = top die (the controller)
- A lone die always has `stackIndex: 0`

A lone die always has `stackIndex: 0`. This is consistent with the tower stacking model without requiring any special casing in tower-related logic.

---

## Derived Data (Pure Functions)

Nothing below is stored in state. All of it is computed from the state above when needed.

### Tower detection

A hex has a tower if 2 or more dice share the same `coords`. Group dice by `"q,r,s"` key and check count.

### Top die of a hex

The die on a hex with the highest `stackIndex`.

### Tower controller

Owner of the top die.

### Combat power

For a lone die: combat power = face value.

For the top die of a tower:

```
combatPower = F + S − E
```

- `F` = top die face value
- `S` = count of dice on the same hex with the same owner as the top die, excluding the top die itself
- `E` = count of dice on the same hex with a different owner than the top die

For a die currently jumping off a tower: use `retainedPower` as combat power if the die is within the tower movement range calculated **before the jump** (derived from the tower's position and `retainedPower`). Outside that range, combat power reverts to face value (lone die rule).

### Movement range

For a lone die: movement range = face value.

For the top die of a tower: movement range = face value (not combat power).

For a jumping die: movement range = face value (same as any tower top die). `retainedPower` affects combat power only, not movement range.

For a tower moving as a whole:

```
movementRange = max(O − E, 1)
```

- `O` = count of dice on the hex owned by the controller
- `E` = count of dice on the hex owned by other players

### Move Die pass-through rules

A single die moving along a path:
- Cannot pass through enemy dice/towers.
- Can pass through or stop on a friendly die/tower only if the moving die's combat power exceeds the combat power of the die/tower being passed through.
- Passing through a friendly die/tower is treated as forming a temporary tower at that point; the remaining movement continues as if jumping off that tower. No extra movement is granted — steps already taken still count. This triggers `jumpContext` for the remainder of the move.

Towers moving as a whole cannot pass through or stop on any dice/towers (friendly or enemy).

### Legal actions

Computed fresh each time the action picker is rendered. Inputs: current game state + active player. Outputs: `GameAction[]` passed as props.

---

## Win Conditions

- **Victory points**: first player to reach `victoryPointsTarget` (from the map) wins immediately.
- **Sudden death**: a player with no legal action on their turn loses immediately.
- **Capture The King**: optional map feature — if enabled, one die per player is designated as the King; a player immediately loses when they lose control of their King die.

---

## Turn Structure

Each turn proceeds through three phases, matching the rules:

1. **Focal points evaluation** — check if active player controls a die/tower on an active focal point; award point; reroll that die/top tower die with new face value = `min(roll, original - 1)` (cannot become stronger); rotate group.
2. **Actions** — player chooses exactly one of: Move Die, Move Tower, Tower Collapse (requires 3+ dice in tower; score +1 if the removed die is an enemy die), Reroll (new face value = `max(roll, original)` — can only stay the same or increase).
3. **Combat** — if the action ended on an enemy hex: attacker's die face value decreases by 1 (minimum 1), then resolve **Push** or **Occupy** (single die attacker's choice; towers can only Push).

### Push

1. Identify the **enemy formation**: the attacked die/tower plus any consecutive enemy dice/towers in the attack direction.
2. Reroll the first die/top tower die in the enemy formation; new face value = `min(roll, original)` (defender cannot become stronger).
3. Move the whole enemy formation one hex in the attack direction. The attacker remains on the hex it moved to.
4. Additionally, depending on what is directly behind the formation in the attack direction (before the attack):
   - **Free hex** — nothing extra.
   - **Map border** — the last die/tower in the formation is pushed off the map and destroyed.
   - **Attacker's die/tower** — **Encirclement**: the last die/tower in the formation is destroyed.
5. Score +1 point per enemy die destroyed.

### Occupy

Only available when the attacker is a single die (towers cannot Occupy). The attacking die jumps on top of the enemy die/tower, forming a mixed tower. Defender does not reroll.

`turnContext` is initialised at the start of each turn and nulled at the end.

---

## File Structure (planned)

```
src/
  main.jsx                   # Entry point
  App.jsx                    # Root component
  context/
    GameContext.jsx          # React context + reducer for game state
  logic/
    hex.js                   # Cube coordinate math (distance, neighbors, line)
    dice.js                  # Tower detection, top die, stacking helpers
    combat.js                # Combat power, movement range, legal move validation
    focalPoints.js           # Focal point evaluation and group rotation
    actions.js               # Legal action generation for the active player
  maps/
    default.json             # Default 61-hex two-player map
  components/
    Board.jsx                # Renders the hex grid
    Hex.jsx                  # Single hex cell
    Die.jsx                  # Die visual
    ActionPanel.jsx          # Action picker UI
```

---

## Data Flow

```
map JSON ─────────────────────────────────────────────┐
                                                       │
game setup (players + dice) ──► GameContext ◄──────────┘
                                (state + dispatch)
                                    │        ▲
                                    │        │ dispatch(action)
                                    ▼        │
                              logic/* ──► components
                           (pure fns)   (read state +
                                         derived values)
                                ▲
                                │
                            map JSON
```

No external state library is used. React context + `useReducer` is sufficient given the small state footprint and the fact that most "state" is derived.