# Board & Components

- hexagonal fields, or **hexes** arranged to a **map**
- variable number of **players**, each color-coded
- each player controls **D6 dies** representing their units
- each player has dedicated hexes as starting positions of their dice called a **base**
- special hexes sorted into groups called **focal points**

# General Win Conditions

- first player to accumulate map-specific number of **victory points** immediately wins
- **sudden death** - player who cannot make a legal action immediately loses

## Additional Win Conditions
- **Capture The King** - optional map feature. One die can be flagged as **King**. When the player loses control over this die, that player immediately loses.

# Starting Dice Values
Each player controls one die per their own base hex. 
Starting values can be handpicked or randomized for one player. 
All players then copy the same values for their own dice.
The dice should be positioned symmetrically if possible.

# Turn Order
Turn order is predefined before the game starts. 
It can be based randomly, clockwise etc.
Turn order stays then the same for the whole game duration.

# Turn Structure
Every player is obligated to make an action on each turn. 

1. **Focal points evaluation**
2. **Actions**
3. **Combat**

The following sections are worded as instructions to the player who's on turn.
The term **your** means **dice/towers you control**.
The adjective **enemy** means **controlled by an enemy**.

## Focal Points Evaluation
Active focal point adds one victory point to you if your **die/tower** occupies it at the start of your turn.
Your die/top tower die is then rerolled and the new face value is min(roll, original - 1) (cannot become stronger).
After a victory point is scored off of active focal point:
1. A passive focal point from the same group is randomly **chosen**.
2. The scored active focal point becomes passive.
3. The **chosen** focal point becomes active.

This evaluation does not retain any past states, it is always evaluated independently, with zero context.
There is therefore no limit to how many times a focal point can become active/passive. 
It is the map designer's responsibility to keep these three steps in mind and design focal point groups accordingly.

## Actions

Choose and perform **exactly one** of the 4 actions (see below). 

### Move die

Move one of your dice up to its movement range along any path (direction may change mid-move).
- Cannot pass through enemy dice/towers.
- Can pass through/stop on your own dice/towers only if the moving die combat power is higher than the die/tower being passed through.
- Passing through a friendly die/tower is treated as forming a temporary tower at that point.
The remaining movement continues as if jumping off that tower
No extra movement is granted; steps already taken still count.
- Moving onto an empty field just moves there.
- Moving onto an enemy field triggers a **combat**, provided your die's combat power exceeds enemy's one.
- Jump from tower: A die on top of your tower may detach and move within its (the die's) movement range. 
It retains combat power of the whole tower within the tower movement range. 
Beyond that distance, combat power reverts to normal.

### Move Tower

Move one of your towers up to its movement range along any path (direction may change mid-move).
- Cannot pass through or stop on any dice/towers (friendly or enemy).
- Moving onto an empty field just moves there.
- Moving onto an enemy field triggers a **combat**, provided your tower's combat power exceeds enemy's one. Only **Push** is available; towers cannot Occupy.

### Tower Collapse

Available only when your tower has **3+ dice**.
The **bottom** die is removed from the game. 
If it was an enemy die, you score 1 point.

### Reroll

Choose one of your dice (standalone or tower top) and reroll it.
If the new value is lower than the original, keep the original.
Die value can only stay the same or increase. 
Rerolling a die with face value 6 is a legal action.

## Combat

Triggered when your move ends on an enemy die/tower. 
You can only do that if your combat power exceeds the enemy one. 
If the combat is legal, proceed with **Phase 1**, then **Phase 2**.

### Phase 1

Your attacking die/top tower die face value decreases by 1. 
If it already is 1, it cannot decrease further and stays 1.

### Phase 2

Choose one of the two options:

#### Push

Identify the enemy formation. 
It starts with the attacked die/tower. 
Check next hexes in the attack direction until there are no more consecutive enemy dice/towers.
The attacked die/tower and the chain of consecutive enemy dice/towers in the attack direction is the **enemy formation**.
The first die/top tower die in the enemy formation is rerolled.
Its new face value is min(roll, original) (defender cannot become stronger).
The whole enemy formation moves one hex in the attack direction. The attacker remains on the hex it moved to.
Additionally, depending on what is directly behind the enemy formation in the attack direction:
- Free hex: nothing extra.
- Map border: The last die/tower in the formation in the attack direction is pushed off of the map.
- Your die/tower: **Encirclement**: The last die/tower in the formation in the attack direction is destroyed.
You score 1 point for each enemy die you destroyed.

#### Occupy

Only available when the attacker is a single die (not a tower).
Your attacking die jumps on top of the enemy die/tower, creating a **Mixed tower**. 
Defender does **not** reroll.

# Key Terms

## Victory Points
Points are permanent and cannot be lost.
Points are only scored on each player's turn.

### Scoring
- **Destruction**: +1 point per enemy die destroyed (pushed off map, encircled, or tower collapse).
- **Focal points**: +1 point if a player controls die/tower on an **active** focal point at the start of their turn.

## Focal Points
Focal points are unique hexes in the map. 
Each focal point belongs to a group. 
Focal point can be either active or passive. 
This state changes during the game.
Passive focal points act as normal hexes, the only difference is that they have a potential to become active.

## Base

Each player has a dedicated base.
It is a set of hexes which serve as dice starting positions.
It is clearly color-coded, same as the player the base is assigned to. 
Bases have no special in-game rules — they act as normal hexes.

## Die

A single D6 die. 
Color-coded similarly to the **owner** player. 
Ownership never changes, cannot be passed to other players, nor it can be lost in any way.

### Position

A die is always on one unique hex. 
It can be the sole die here, or it can be a part of a **tower**.

### Control

A player **controls** a die if they can perform actions with it. A die is controlled by its owner when it is the sole die on a hex or the top die of a tower. A die that is part of a tower but not on top has no controller — no actions can be performed with it.

### Combat Power

In case of a sole die on a hex, combat power is always its face value. 
If the die is on top of a **tower**, it's combat power is calculated as F + S - E:
- F = die face value
- S = supporting dice count; a die is a supporting one if it is not on the top of the tower, and it has the same owner as the top die
- E = enemy dice count; any die that has a different owner than the tower top die

A die jumping off of a top of a **tower** retains its combat power.
This is the case only for the remainder of the turn the jump occurred and only inside the **tower movement range** (every hex reachable by the tower within one turn).
The tower movement range for this situation is calculated **before** the die jumped off.
After the turn ends or the die moves outside the original **tower movement range**, the die combat power is then calculated normally.
If the die is a part of a tower but is not on the top of it, combat power is not defined.

### Movement Range

The maximum distance a die can cover with movement.
Unlike combat power, movement range is calculated before the movement takes place and never changes during the movement.
In case of a sole die on a hex, movement range is equal to its combat power. 
If the die is on top of a **tower**, movement range is equal to its face value.
If the die is a part of a tower but is not on the top of it, movement range is not defined.

## Tower

Towers are defined as two or more dice on the same hex. 
Dice in a tower are stacked on top of each other. 
They cannot change order.
The tower is mixed if it contains dice owned by multiple players.
Dice can:
- be added to the top of the tower as a result of a **combat** or normal movement
- be **destroyed** and removed from the bottom of the tower as a result of **tower collapse** action
- jump off of the top of the tower as part of normal movement

### Position

A tower is always on one unique hex.

### Control

A tower as a whole is controlled by the owner of the top die.

### Combat Power

Tower combat power is calculated as F + S - E:
- F = top die face value
- S = supporting dice count; a die is a supporting one if it is not on the top of the tower, and has the same owner as the top die
- E = enemy dice count; any die that has a different owner than the top die

### Movement Range

The maximum distance a tower can cover with movement.
It is calculated as max(O - E, 1):
- O = own dice count (die owner equal to the tower controller)
- E = enemy dice count (die owner different from the tower controller)

# Default Map

- **61 hexes** arranged in a large hexagon shape
- two players, **red** and **blue**
- each player starts with **5 dice**
- **red base** = top hexes row, **blue base** = bottom hexes row
- **3 focal points** that form one group
    * placed in the middle horizontal row
    * left and right one hex from the map border
    * the middle is in the center of the map, two hexes from left and right
    * middle one starts as active
    * left and right start as passive
- **5 victory points** win condition
