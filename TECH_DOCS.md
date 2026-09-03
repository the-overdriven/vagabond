# Vagabond - Current Game Specification

**Document status:** Current implementation snapshot  
**Source of truth:** `index.html` + `content/*.json` from the supplied project  
**Purpose:** Cross-check future features against the existing game.

---

## 1. Game Identity

**Vagabond** is an exploration/combat game built around:

- exploration of a generated world
- turn-driven player/enemy interaction
- equipment and stat optimization
- dangerous enemies with speed and aggro differences
- same enemy types can have different variants
- caves and progressively deeper underground areas
- procedural artifacts with unknown buffs and debuffs (curses) - unknown unless identified
- NPCs and environmental lore
- deliberately unexplained landmarks and mysteries
- death returning the player to the Temple rather than ending the character

Generic roguelike mechanics are not assumed unless implemented.

---

# 2. Core Game State

The player has:

| Property | Current behavior             |
|---|------------------------------|
| Name | Chosen at character creation |
| Race | Chosen at character creation |
| Level | Starts at 1                  |
| XP | Earned from enemies          |
| HP | Current HP                   |
| Max HP | Base max HP + bonuses        |
| ATK | Attack                       |
| DEF | Defense                      |
| SPD | Speed                        |
| MF | Magic Find                   |
| GRACE | Weapon hit speed             |
| Gold | Currency                     |
| Deaths | Persistent counter           |
| Steps | Persistent movement counter  |
| Inventory | Items carried                |
| Weapon | Equipped weapon              |
| Shield | Equipped shield              |
| Armor | Equipped armor               |
| Invisibility | Temporary turn counter       |
| Speed potion | Temporary turn counter       |
| Freezing | Temporary cold status        |
| Curse debuffs | Temporary stat penalties     |

Initial player values include:

```text
Level: 1
XP: 0
Max HP: 50
HP: 50
ATK: 2
DEF: 0
SPD: 3
MF: 0
Gold: 0
Deaths: 0
Steps: 0
```

---

# 3. Character Creation

The player chooses:

1. Name
2. Race

The world is generated before the race screen appears.

Loading a save bypasses character creation.

There are currently **10 races**.

## Human

**+20% XP gain**

## Halfling

**-1 enemy aggro range**

## Catling

**+3 SPD**

## Dwarf

**+3 DEF**

## Orc

**+3 ATK**

## Leprechaun

**+5 Magic Find**

## Elf

**+2 GRACE**

Also:

**Cannot be ambushed in forests.**

## Wyrdling

Consumables are **25% more effective**.

## Merling

**Unlimited swimming.**

Open water is therefore walkable for the player.

## Troll

Regenerates:

**1 HP every 5 turns**

---

# 4. Player Stats

## ATK

Calculated from base ATK plus applicable:

- race bonus
- weapon
- shield
- armor
- equipment modifiers
- artifacts
- curse debuffs

## DEF

Calculated from base DEF plus applicable:

- race bonus
- weapon
- shield
- armor
- equipment modifiers
- terrain defense
- artifacts
- curse debuffs

Hill currently provides:

```text
+1 DEF
```

## SPD

Calculated from:

```text
base SPD
+ race SPD
+ floor(level / 2)
- shield penalty
- armor penalty
+ equipment SPD modifiers
+ Speed Potion
+ terrain SPD
+ curse SPD debuffs
- Big Bell carried penalty
```

Minimum effective SPD is **1**.

Level therefore provides:

```text
+1 SPD every 2 levels
```

## Magic Find

MF comes from base MF, race bonuses, equipment modifiers, and artifacts.

Magic Find influences loot chances **and** loot quality:

- Gold drops from enemies are currently disabled (see ï¿½43. Loot).
- Artifact drop chance from enemy kills scales with MF using the same
  `(1 + MF*0.05)` multiplier as the old gold formula, still capped at 12%.
- Non-humanoid enemy gear drop chance scales with MF (unchanged: `+MF*0.02`),
  and MF also reduces the chance of that gear rolling one tier lower
  (`35% - MF*1%`, floor 5%).
- Item "quality": MF increases the chance any weapon/armor/shield rolls a
  stat modifier at all (`20% + MF*1%`, capped 60%), biases the rolled
  modifier amount upward, and reduces artifact curse chance
  (`10% - MF*0.5%`, floor 2%) while giving a chance to roll the artifact
  effect pool one tier higher (`MF*3%`, capped 50%).
- Chest loot (gold amount, and the equipment/artifact found inside) also
  scales with MF the same way.

## Max HP

Max HP receives flat bonuses first, then artifact percentage modifiers.

---

# 5. Leveling

XP required for the next level:

```text
floor(14 × level^1.55) + 10
```

On level-up:

- level increases by 1
- XP is reduced by the threshold
- maximum HP increases by 10
- derived stats are recalculated as needed

XP is affected by the player's XP multiplier.

Human currently has a permanent +20% XP multiplier.

---

# 6. Movement

The game uses an **8-direction grid**.

Directions:

```text
N
S
E
W
NE
NW
SE
SW
```

Keyboard movement includes:

```text
W A S D
Q E Z C
Arrow keys
```

A normal player move advances one grid tile.

Walking into an adjacent enemy attacks instead of entering its tile.

Walking into an NPC triggers interaction instead of entering its tile.

---

# 7. Turn Structure

The game is fundamentally turn-driven.

A normal player action generally causes:

1. Player action
2. Enemy turn
3. NPC turn
4. Rendering/update

Waiting also consumes a turn.

`T` is the wait action.

During enemy turns, relevant temporary systems tick, including:

- global turn counter
- freezing
- race regeneration
- artifact curses
- potion/invisibility counters
- enemy actions

Ordering matters when adding future mechanics.

---

# 8. Auto-Pathing

The player can path toward a destination by tapping or clicking on a walkable target tile.

Pathfinding uses breadth-first search over walkable tiles.

Auto-pathing can account for:

- normal walkable terrain
- water when playing Merling

Occupied enemy/NPC tiles are generally avoided except when they are the intended destination.

Direct interaction cancels pathing.

---

# 9. World

The surface map is:

```text
260 × 180 tiles
```

The world is procedurally generated.

Generation uses multiple layers of interpolated random noise for things such as:

- elevation
- moisture
- roughness
- lakes
- boulders
- snow boundaries

The world has an island-style elevation falloff.

The Temple is placed near the map center.

---

# 10. Surface Terrain

Current terrain includes:

- grass
- forest
- taiga
- ancient forest
- hill
- snow
- sand
- river
- water
- mountains
- snow mountains
- temple
- village
- graves
- cave entrances
- boulders
- special landmarks

Underground terrain includes cave floors, walls, entrances, stairs/passages, marble, Dwarven walls, rubble, and Dwarven structures.

Normally impassable terrain includes mountains, boulders, and water for non-Merlings.

---

# 11. Terrain Effects

Current terrain speed effects:

| Terrain | SPD |
|---|---:|
| Grass | +1 |
| Forest | -1 |
| Ancient Forest | -1 |
| Sand | -1 |
| Snow | -1 |
| Taiga | -1 |
| River | -2 |
| Water | -2 |

Hill:

```text
+1 DEF
```

There is currently no general terrain-based ATK or vision system.

---

# 12. Snow / Cold

Snow and taiga are cold terrain.

Freezing is currently a surface mechanic.

While standing on snow or taiga, the player starts to freeze.

Every 5 cold turns:

```text
-1 HP
```

Leaving snow/taiga clears the freezing state.

There is currently no implemented general cold-resistance equipment system.

---

# 13. World Landmarks

## Temple

The Temple:

- is the starting location
- heals the player
- acts as a protected area
- is the destination after death
- is a multi-tile structure

Enemies flee from the Temple.

The bell tower tile (see "Missing Temple Bell") is carved out of the
Temple's own generated footprint - it is Temple ground under a different
glyph, not a separate landmark. It therefore shares every "standing on
Temple ground" behavior: it heals the player on entry and causes nearby
enemies to flee, exactly like the plain `temple` tile.

## Village

A procedurally positioned settlement containing several huts.

Five NPC spawn near the village.

## Black Pillar
<details>
  <summary>Details</summary>

A black stone pillar placed in/near mountains.

It is intentionally unexplained and primarily serves as a mystery/lore element.

</details>

## Big Brass Bell
<details>
  <summary>Details</summary>

A large brass bell placed near mountains and guarded by two brutes (randomly picked: either cyclops, or ogres).

It cannot initially be carried normally.

A later mystery interaction allows it to be moved.

</details>

## Ancient Forest
<details>
  <summary>Details</summary>

A special forest biome associated with:

- Old Hunter
- cemetery
- stronger forest encounters
- bell-related lore

Normal foraging is disabled there.

</details>

## Cemetery
<details>
  <summary>Details</summary>

A cemetery generated near the Ancient Forest.

It contains several tombstones, including one anomalous tombstone.

</details>

## Dwarven Ruin / Fort
<details>
  <summary>Details</summary>

A large underground Dwarven settlement/ruin containing:

- Dwarven architecture
- marble flooring
- walls
- rubble
- statues
- ghosts
- an anvil
- a wheelbarrow
- a giant gold coin
- a guaranteed artifact chest
- deeper-level connections

When these props (and other named ground objects such as skeletons,
campfires, dwarven remains, or a wheelbarrow) are picked up by the
"inspect surroundings" scan of nearby tiles, each is labeled by its own
name (e.g. "an anvil").

</details>

---

# 14. Underground Structure

The intended structure is:

```text
Surface
  ↓
z:-1 caves
  ↓
z:-2 deeper caves
  ↓
z:-3 Dwarven Fort
```

## z:-1

Normal cave layer.

Caves are carved as random-walk blobs.

Some caves have multiple entrances.

## z:-2

Some z:-1 caves receive a downward connection.

Approximately half of parent caves receive a deeper level.

Connections use matching `cavedown` / `caveup` tiles.

## z:-3

Reserved for the Dwarven Fort.

It is not generated as a normal random cave.

---

# 15. Cave Generation

Up to six initial caves are attempted.

Cave entrances are selected from mountain edges.

Primary cave locations must be sufficiently separated.

The first cave may receive a second entrance.

Cave interiors are produced using bounded random walks.

Entrance tiles are re-stamped after merging so overlapping caves do not destroy entrances.

---

# 16. World Connectivity

World generation checks whether the Temple can reach a map edge through walkable terrain. This is to prevent situation where player is stuck in a village surrounded by non-walkable tiles.

If the generated world fails this condition, it is regenerated.

Maximum attempts:

```text
50
```

---

# 17. Enemy Population

The initial surface world attempts to spawn:

```text
120 enemies
```

Tier distribution:

| Tier | Weight |
|---|---:|
| 1 | 42% |
| 2 | 26% |
| 3 | 17% |
| 4 | 10% |
| 5 | 5% |

Higher-tier enemies are generally placed farther from the Temple.

Tier 3+ enemies prefer positions approximately 50+ tiles from the Temple.

There are also special spawn rules.

---

# 18. Enemy Stats

Enemy templates define properties including:

```text
HP
ATK
DEF
SPD
Tier
Aggro
Biomes
Evade capability
Humanoid status
Flying status
```

Spawned enemies receive approximately 95%–105% random variance from template stats.

---

# 19. Enemy Roster

Current templates contain 30 enemies.

### Tier 1

- Giant Rat
- Giant Bat
- Snake
- Scarab
- Monkey
- Boar
- Wolf
- Giant Bug
- Wasp

### Tier 2

- Goblin
- Skeleton
- Cobra
- Giant Crab
- Scorpion
- Lizard Man
- Lion

### Tier 3

- Ghoul
- Ghost
- Orc
- Imp
- Mummy
- Giant Spider
- White Tiger
- Minotaur
- Ogre

### Tier 4

- Cyclops
- Banshee
- Beholder
- Wyvern

### Tier 5

- Lich

---

# 20. Enemy Special Properties

## Flying

Flying enemies can traverse terrain that includes:

- normal walkable terrain
- boulders
- water

## Evading

Enemies marked as evasive have a 30% chance to evade a player's attack.

If possible, they move to a nearby open tile after evading.

Current examples include:

- Giant Bat
- Monkey
- Wasp
- Ghost

## Humanoid

Humanoid enemies wear randomly assigned gear (weapon/armor/shield) which they drop on death. Fighting an armed humanoid creature involves weapon grace checks that reward faster weapons. This makes armed-versus-armed combat more varied, allowing faster weapons to strike twice.

## Deadly

The Deadly enemy prefix grants critical-hit capability. Critical hit doubles the damage.

---

# 21. Enemy Prefixes

Approximately **5% of normal enemy spawns** receive a prefix.

Current prefixes:

- Fierce
- Tough
- Swift
- Sturdy
- Deadly
- Brutal
- Savage
- Hardened
- Rabid
- Champion

Examples:

### Fierce

```text
ATK ×1.35
AGGRO +1
```

### Tough

```text
HP ×1.5
Max HP = HP
```

### Swift

```text
SPD ×1.5
SPD +1
```

### Sturdy

```text
DEF ×1.6
DEF +1
```

### Deadly

```text
ATK ×1.3
ATK +1
15% critical chance
```

### Brutal

```text
ATK ×1.8
ATK +1
```

### Savage

```text
ATK ×1.3
SPD ×1.3
SPD +1
AGGRO +1
```

### Hardened

```text
HP ×1.4
DEF ×1.3
DEF +1
```

### Rabid

```text
SPD ×1.8
SPD +2
DEF ×0.6
AGGRO +1
```

### Champion

```text
HP ×1.6
ATK ×1.4 +1
DEF ×1.3 +1
SPD ×1.2 +1
```

Prefix modifications use generic operations including:

```text
set
multiply
add
round
min
from
```

---

# 22. Enemy AI

Enemies have:

- aggro range
- awareness
- home position
- movement
- attack behavior
- wandering
- Temple fleeing
- pursuit/pathfinding

Default aggro range is approximately:

```text
3
```

Standing in enemy's aggro range, triggers the enemy to chase their victim.

Any enemy that attacks the player becomes aggroed (shown as a red border
around the enemy) in the same turn, even if the enemy's aggro range is very
low (e.g. 1) and it was already standing adjacent to the player before ever
entering the normal aggro-range check.

Halfling reduces effective enemy detection range by 1.

Enemies can lose interest in the case if player's speed is at least twice time higher.

Enemy pathfinding uses breadth-first search and can route around obstacles and other enemies within a detour limit.

If:

```text
enemy SPD > player SPD
```

there is a 25% chance for an additional pursuit action (enemy gets closer to victim or gets an attack turn if it's already close).

Idle enemies can wander.

Current wandering settings:

```text
Enabled: yes
Chance per turn: 30%
Wander radius: 1 tile
```

Wandering is limited to enemies visible on screen.

---

# 23. Temple Enemy Behavior

The Temple is a safety zone.

Enemies near the Temple flee when the player is on Temple ground.

Flee distance is approximately:

```text
15 tiles
```

This prevents the Temple from becoming an unrestricted combat exploit.

---

# 24. Combat

Combat occurs when the player attempts to move into an adjacent enemy.

Attack range:

```text
1 tile
```

The enemy inspect tooltip displays the player's calculated
chance to hit that enemy, using the same miss-chance formula as combat
(`1 - missChance(playerSPD, enemySPD)`).

Combat includes:

- miss chance
- damage mitigation
- evasion
- armor glancing
- enemy critical hits
- possible extra attacks (weapon vs weapon grace checks)

---

# 25. Miss Chance

Base miss formula:

```text
0.15 + (defender SPD - attacker SPD) × 0.02
```

The result is clamped to:

```text
0%–100%
```

Therefore:

- equal speed → 15% miss chance
- faster attacker → lower miss chance
- slower attacker → higher miss chance

---

# 26. Damage

Mitigated attack:

```text
ATK × 10 / (10 + max(0, DEF))
```

Final damage:

```text
max(1, round(mitigatedAtk + random(-1, +2)))
```

Randomness comes from the game's seeded RNG.

---

# 27. Armor Glancing

If the defender has armor, a speed-based check can produce a glancing hit.

Glancing damage:

```text
floor(damage / 3)
```

This applies to attacks against armored enemies and attacks against an armored player.

---

# 28. Critical Hits

Critical hits are currently an enemy-side feature.

Deadly enemies have:

```text
15% critical chance
```

Critical damage:

```text
damage × 2
```

There is currently no general player critical-hit system.

---

# 29. Weapon Timing / Grace

Weapons have a `GRACE` value.

Combat delay:

```text
max(1, 6 - GRACE)
```

Higher GRACE means lower combat delay.

Race GRACE bonuses are included in the player's effective GRACE.

If both combatants have weapons and the attacker has lower combat delay, an extra attack can occur.

Chance:

```text
(defender delay - attacker delay) × 10%
```

This can apply in either direction:

- player attacking enemy
- enemy attacking player

---

# 31. Death

Death is **not permadeath**.

When HP reaches zero:

- death counter increases
- death animation occurs
- player returns to Temple
- HP is restored
- player returns to the surface
- position becomes the Temple spawn point

The player's:

- level
- XP
- equipment
- inventory
- gold

are not wiped by death.

Current death behavior is therefore:

> failure + positional reset

rather than a new run.

---

# 32. Equipment

Normal equipment slots:

```text
Weapon
Shield
Armor
```

A two-handed weapon prevents shield use.

Equipping a two-handed weapon automatically removes the equipped shield and returns it to inventory.

If the player has no weapon, looted weapons are automatically equipped.

---

# 33. Weapons

Current base weapons include:

| Weapon | Tier | ATK | Grace | 2H |
|---|---:|---:|---:|---|
| Dagger | 1 | 1 | 5 | No |
| Short Sword | 1 | 2 | 4 | No |
| Club | 1 | 2 | 2 | No |
| Rapier | 2 | 3 | 5 | No |
| Staff | 2 | 4 | 2 | Yes |
| Long Sword | 2 | 5 | 3 | No |
| Scimitar | 2 | 5 | 4 | No |
| Mace | 2 | 5 | 3 | No |
| Scepter | 2 | 4 | 3 | No |
| Spear | 2 | 5 | 2 | Yes |
| Morning Star | 3 | 6 | 2 | No |
| Lance | 3 | 7 | 2 | Yes |
| Flail | 3 | 7 | 2 | No |
| Two-handed Sword | 4 | 9 | 2 | Yes |
| War Hammer | 4 | 10 | 1 | Yes |
| Two-handed Axe | 4 | 11 | 1 | Yes |
| Giant Sword | 5 | 13 | 1 | Yes |

---

# 34. Shields

Current shields:

| Shield | Tier | DEF |
|---|---:|---:|
| Buckler | 1 | 2 |
| Round Shield | 2 | 5 |
| Tower Shield | 4 | 10 |

Shield SPD penalty:

```text
Buckler: -1
Other shields: -2
```

---

# 35. Armor

Current armor:

| Armor | Tier | DEF | Additional SPD penalty |
|---|---:|---:|---:|
| Robe | 1 | 1 | 0 |
| Jacket | 1 | 1 | 0 |
| Cape | 1 | 2 | 0 |
| Cloak | 1 | 3 | 0 |
| Tunic | 1 | 4 | 0 |
| Leather Armor | 2 | 6 | 0 |
| Studded Leather | 2 | 8 | 0 |
| Chain Mail | 3 | 11 | 0 |
| Brass Armor | 3 | 13 | 1 |
| Splint Mail | 3 | 14 | 1 |
| Scale Armor | 4 | 16 | 1 |
| Plate Mail | 4 | 20 | 2 |
| Ancient Armor | 5 | 24 | 2 |

Armor also participates in the general equipment speed penalty.

---

# 36. Equipment Modifiers

Normal equipment has approximately a **20% chance** to receive a modifier.

Current modifiers:

| Modifier | Effect |
|---|---|
| Profound | XP |
| Resilient | HP |
| Mighty | ATK |
| Sturdy | DEF |
| Swift | SPD |
| Lucky | MF |

XP modifiers receive a percentage bonus in the approximate range:

```text
+5% to +15%
```

---

# 37. Artifacts

Artifacts are a major procedural item system.

Artifacts can be:

- unidentified
- identified
- cursed
- weapon-like (active only when equipped)
- shield-like (active only when equipped)
- armor-like (active only when equipped)
- trinket-like (passively active when unequipped)

Not every artifact needs to be equipped.

Passive artifacts can work while simply being carried.

---

# 38. Artifact Generation

Artifact generation uses separate content pools for:

- nouns
- prefixes
- epithets
- Dwarven names
- Dwarven vocations
- effects
- curses
- description fragments

Current content includes approximately:

```text
132 artifact nouns
17 artifact prefixes
20 epithets
792 Dwarf names
228 Dwarf vocations
14 artifact effects
8 curse definitions
```

---

# 39. Artifact Naming

Non-cursed artifacts can use a Dwarven-owner naming pattern such as:

```text
The <noun> of <Dwarf Name>
```

Unidentified artifacts display:

```text
Unidentified <noun>
```

Their real stats/details remain hidden, unless identified.

---

# 40. Artifact Identification

Artifacts begin unidentified.

Before identification, their stats are hidden as:

```text
???
```

A Scroll of Identification reveals:

- true name
- stats
- description
- owner/lore information

---

# 41. Artifact Effects

Artifact effects can modify:

```text
ATK
DEF
HP
SPD
MF
Max HP %
```

Some effects are lore-oriented or interact with curses/other systems.

---

# 42. Artifact Curse System

Approximately **10% of artifacts** roll as cursed.

Cursed artifacts have:

- curse interval
- one or more curse events

Current curse events include:

- HP loss
- gold loss
- ATK debuff
- DEF debuff
- SPD debuff

HP loss:

```text
1–3 HP
```

Gold loss:

```text
1–5 gold
```

Stat debuffs:

```text
-1 to -2 stat
lasting 3–6 turns
```

The artifact maintains a curse timer.

When its interval is reached, a curse effect triggers.

---

# 43. Loot

Enemy kills can provide:

1. Equipment/other loot
2. Artifacts (low chance)

<details>
<summary>Also</summary>
Mysterious tombstones (only liches)
</details>

Gold drops from enemy kills are currently **disabled** (the calculation is
still present in a code comment for easy reinstatement):

```text
random(1–5) × enemy tier, modified by Magic Find
```

Chests and Magic Find still grant gold normally; only the per-kill enemy gold
was removed.

Artifact drop chance by enemy tier:

| Tier | Base chance |
|---|---:|
| 1 | 1.00% |
| 2 | 1.75% |
| 3 | 2.50% |
| 4 | 3.25% |
| 5 | 4.00% |

Artifact chance is capped at:

```text
12%
```

Artifact chance and quality (effect tier, curse odds) scale with Magic Find
(see "Magic Find" above).

---

# 44. Enemy Equipment Drops

Humanoid enemies can carry equipment.

Possible equipment includes:

- weapon
- armor
- shield

Other enemy loot rules also permit equipment drops in certain circumstances.

This is an area to re-check against implementation when changing loot.

---

# 45. Chests

The surface and underground areas contain chests.

Chest loot can include:

- gold
- weapons
- armor
- shields
- Life Potions
- Scrolls of Invisibility
- Potions of Speed
- Scrolls of Identification

Chest tier affects loot.

Some special chests guarantee artifacts (i.e. one chest in dwarven fort ruins).

---

# 46. Ground Consumables

Loose consumables include:

- Life Potions
- Scrolls of Invisibility
- Potions of Speed

They are picked up by walking over them.

---

# 47. Consumables

## Life Potion

Fully restores HP.

## Scroll of Invisibility

Grants approximately:

```text
15 turns invisibility
```

Wyrdling race modifies consumable effectiveness.

While invisible, enemies do not chase or attack the player. Invisibility can be also used to kill stronger enemies, without being hit.

## Scroll of Teleportation

Returns the player to the Temple.

## Potion of Speed

Grants:

```text
+3 SPD
```

for:

```text
15 turns
```

As for all consumable, the effect is increased for Wyrdling race.

## Scroll of Identification

Identifies an artifact.

Chest loot odds for consumables/gold/gear are resolved from one roll out of 110. 
Current approximate shares: gold 41%, gear 18%, Life Potion 18%, Scroll of
Invisibility 5.5%, Potion of Speed 8%, Scroll of Identification **9%**.

## Healing Herb

Foraged item. When eaten, always heals 25% HP.

## Mushroom

Foraged item. There is 50% chance of healing, or damaging HP.

---

# 48. Foraging

`F` performs foraging/search actions where appropriate.

Ordinary forest tiles can be foraged.

Each forest tile can only be foraged once.

Results:

```text
15% → Healing Herb
10% → Mushroom
75% → Nothing
```

Taiga cannot be foraged.

Ancient Forest cannot be foraged.

---

# 49. Skeletons

Skeleton ground objects (dead bodies) occur mostly in caves and can be searched.

Searching one technically generates a temporary tier-1 chest at its location and immediately opens it. The word "chest" is not mentioned in the logs.

---

# 50. NPCs

Current named NPCs:

- Old Hunter
- Gravedigger
- Drunk
- Merchant
- Herbalist

NPCs generally provide dialogue/exploration interactions.

The Merchant additionally supports trading. Trading is possible by clicking on the Merchant, while standing next to him.

---

# 51. Old Hunter
<details>
  <summary>Details</summary>

The Old Hunter is associated with the Ancient Forest.

His warning contains a direction derived from the actual generated Ancient Forest location.

He warns the player about entering the Ancient Forest in a particular direction after midnight.

</details>

---

# 52. Gravedigger
<details>
  <summary>Details</summary>

The Gravedigger is associated with the cemetery mystery.

The anomalous tombstone can trigger a special quest interaction.

The player can give the odd tombstone to the Gravedigger.

The interaction provides:

```text
Shovel
```

There is currently no use for the shovel.

After interaction, the delivered tombstone is inserted beneath the grave next to the gravedigger.

The grave tile next to the Gravedigger is persisted across save/load: the
game records which tile it occupies and restores that reference on load
(falling back to scanning the restored map for an existing grave tile if an
older save lacks the reference). Loading a save must never place an
additional grave near the Gravedigger.

</details>

---

# 53. Drunk
<details>
  <summary>Details</summary>

The Drunk provides dialogue concerning the missing bell.

His direction hint is dynamically calculated from the generated Big Bell location.

</details>

---

# 54. Merchant

The Merchant:

- remains stationary
- opens a trading interface
- sells items
- buys items
- persists stock through saves

Stackable consumables are handled as stacks.

---

# 55. Herbalist

Current implemented behavior is primarily dialogue concerning forest dangers and remedies.

Her sole purpose is to hint player that forests can be foraged for remedies, but also to warn that forests are dangerous (forest tiles can trigger an ambush).

Planned Herbalist ideas in source comments are not treated as current mechanics.

---

# 56. Mysteries
<details>
  <summary>Details</summary>

The game deliberately withholds explanations for some world elements.

Important mystery systems currently include:

- missing Temple bell
- Big Brass Bell
- Ancient Forest
- Black Pillar
- anomalous tombstone
- Lich tombstones
- Dwarven Fort
- Ancient Bell Lich

</details>

---

# 57. Missing Temple Bell
<details>
  <summary>Details</summary>

The Temple has a bell tower where the bell is missing.

A huge brass bell exists elsewhere.

The player can:

1. find the bell
2. find the wheelbarrow
3. move the bell
4. return it to the Temple
5. ring it

Ringing the bell causes a major world/lore event.

</details>

---

# 58. Ancient Bell Lich
<details>
  <summary>Details</summary>

After the bell is returned to the Temple and rung, an Ancient Lich can appear near the Cemetery, somewhere near the Ancient Forest.

Its dialogue connects:

- the bell
- the old world
- the Black Pillar
- a missing key

This is an implemented mystery progression chain.

</details>

---

# 59. Black Pillar
<details>
  <summary>Details</summary>

The Black Pillar is currently primarily a lore mystery.

Its connection to the Ancient Lich suggests that its appearance changed the world.

No broad mechanical effect should be assumed unless implementation confirms one.

</details>

---

# 60. Mysterious Tombstones
<details>
  <summary>Details</summary>

There are:

```text
6
```

mysterious tombstone inscriptions.

They are dropped by Liches.

Each Lich kill has an 80% chance to produce one while any remain.

The six inscriptions form a fragmented story.

Their order is randomized per world.

The story concerns:

- a king
- a mountain
- a crown
- divine selection
- resurrection
- whether the king was truly noble

</details>

---

# 61. Cemetery Mystery
<details>
  <summary>Details</summary>

The generated cemetery contains ordinary Dwarven tombstones and exactly one anomalous tombstone.

Each tombstone's name/dates/inscription is persisted across save/load
alongside the grave tiles themselves, so reloading a save does not blank out
cemetery inscriptions back to generic "unfinished grave" text.

The odd tombstone has a future death date.

It can be picked up as:

```text
Odd Tombstone
```

It can then be given to the Gravedigger.

</details>

---

# 62. Dwarven Fort Mystery / Props
<details>
  <summary>Details</summary>

The Dwarven ruin contains environmental story objects such as:

- anvil
- wheelbarrow
- giant gold coin
- remains
- broken tools
- collapsed workspaces
- inscriptions
- ghosts

Some are currently lore/inspection objects.

The wheelbarrow is mechanically significant because it enables moving the Big Bell.

</details>

---

# 63. Bell Movement
<details>
  <summary>Details</summary>

The Big Bell cannot initially be picked up normally.

With the special:

```text
Unknown-Alloy Wheelbarrow
```

the player can move it.

The bell becomes:

```text
Enormous Brass Bell
```

While carrying it:

```text
SPD -5
```

The bell can then be returned to the Temple.

This is a complete environmental-object → discovery → item → transport → world-event chain.

</details>

---

# 64. World State

Persistent state includes significant world information such as:

- world seed
- RNG state
- surface map
- cave maps
- deeper levels
- discovery/fog
- merchant stock
- foraged tiles
- tombstone state
- NPC state
- enemy state
- ground items
- special-world state

---

# 65. RNG

The game uses its own seeded RNG.

Initial seed:

```text
Date.now() & 0xffffffff
```

The mutable RNG state is saved.

Loading a save therefore continues the random sequence rather than resetting it.

**RNG state is gameplay state.**

---

# 66. Save System

Current save version:

```text
8
```

Saves are JSON files.

Saved state includes substantial world and player information, including:

- seed
- RNG state
- maps
- caves
- deep levels
- discovery
- player
- enemies
- ground items
- NPCs
- tombstones
- merchant inventory
- foraged tiles

---

# 67. Save Compatibility

The loader contains compatibility handling for older saves.

Examples include handling:

- missing race data
- missing NPC data
- older terrain-underlay information
- older cave entrance representations
- older discovery data

Any persistent feature should therefore be evaluated for:

1. save serialization
2. load restoration
3. save-version compatibility
4. derived-state reconstruction

---

# 68. Fog / Discovery

The game stores discovered tiles separately from the actual maps.

There are separate discovery structures for:

- surface
- z:-1
- deeper levels

Therefore:

> Existing map data does not imply that the player has discovered that location.

---

# 69. UI Controls

Current desktop controls include:

| Key | Action |
|---|---|
| WASD | Move |
| Q/E/Z/C | Diagonal movement |
| Arrow keys | Move |
| Space | Inspect / interact |
| F | Forage / search / special pickup |
| T | Wait |
| Tab | Inventory |
| M | Map |
| K | Save |
| L | Load |
| Escape | Close overlays |
| Control | Show enemy ranges |
| Caps Lock | Lock enemy ranges |
| G | Debug/god mode |

---

# 70. Mobile

Touch controls reuse the same gameplay functions as keyboard controls.

Mobile supports:

- 8-direction movement
- inspect
- forage
- inventory
- map
- map dragging
- map zooming
- pinch zoom

The intent is to keep mobile gameplay rules equivalent to desktop rules.

There is currently no mobile button for waiting (skipping the turn).

---

# 71. Debug Mode

`G` activates a developer/debug mode.

It:

- reveals generated maps
- sets HP to 500
- sets base ATK to 50
- sets base DEF to 50
- sets base SPD to 50
- sets MF to 25
- sets gold to 500

This is a development feature, not normal gameplay.

---

# 72. Important Architectural Rules

## Rule A - Stats are derived

Do not casually bake race/equipment/artifact bonuses into base stats.

The current architecture distinguishes base stats from derived bonuses.

## Rule B - Race perks are system hooks

Race behavior is consumed by dedicated systems such as:

```text
raceBonus()
raceHas()
consumablePower()
xpMultiplier()
raceGrace()
effectiveAggroRange()
tickRaceRegen()
```

Future races should ideally use the same architecture.

## Rule C - RNG is gameplay state

Random gameplay should use the existing RNG architecture and preserve its save/load behavior.

## Rule D - World state persists

When a feature changes the world, determine whether the change must survive save/load.

## Rule E - Death is not a run reset

Do not introduce traditional roguelike assumptions such as permadeath or character reset without deliberately changing the death model.

## Rule F - Mysteries are stateful

Mysteries often progress through actual interactions and world state rather than being disconnected lore.

---

# 73. Features Explicitly NOT Current

Unless the implementation changes, do not assume the following exist:

- permadeath
- corpse recovery
- general crafting
- general mining
- skill tree
- generic quest system
- generic wounds
- bleeding
- broken limbs
- poison
- generic burning
- monster-vs-monster combat
- general monster ability system
- general rest/sleep system
- New Game+
- meta progression
- achievements
- multiplayer
- player critical-hit system
- general status-effect framework
- general food/survival system

The source contains design notes/TODOs for some of these. Those notes are **not implementation**.

---

# 74. Planned / Unimplemented Feature Pool

The source contains ideas including:

### Survival

- food
- meat
- berries
- expanded foraging
- cold protection
- rest

### Combat

- poison
- wounds
- bleeding
- broken limbs
- burning
- freezing effects
- monster abilities
- knockback
- dispel
- summons
- traps

### World

- expanded wandering
- monster-vs-monster encounters
- sounds
- more special locations
- additional dynamic world behavior

### Progression

- achievements
- bestiary
- quests
- monster progression

### Equipment

- blacksmith
- enchantment
- mining
- crafting
- additional artifact/Grace systems

### Exploration

- ruins
- pyramids
- shipwrecks
- observatories
- witch huts
- special caves
- volcanoes
- custom map markers

### UX

- improved path visualization
- player inspection
- unidentified consumables
- mobile improvements
- additional log hints

These remain **PLANNED** unless implementation confirms otherwise.

---

# 75. Current Feature Inventory

## Implemented

- [x] Character naming
- [x] 10 races
- [x] Race perks
- [x] Leveling
- [x] XP
- [x] HP
- [x] ATK
- [x] DEF
- [x] SPD
- [x] GRACE
- [x] Magic Find
- [x] 8-direction movement
- [x] Auto-pathing
- [x] Procedural surface
- [x] 260×180 world
- [x] Multiple terrain types
- [x] Rivers
- [x] Snow
- [x] Taiga
- [x] Ancient Forest
- [x] Temple
- [x] Village
- [x] Cemetery
- [x] Black Pillar
- [x] Big Bell
- [x] Caves
- [x] Deeper caves
- [x] Dwarven Fort
- [x] Enemy AI
- [x] Enemy wandering
- [x] Aggro
- [x] Enemy pathfinding
- [x] Enemy prefixes
- [x] Enemy equipment
- [x] Combat
- [x] Misses
- [x] Damage mitigation
- [x] Armor glancing
- [x] Enemy critical hits
- [x] Weapon timing
- [x] Extra attacks
- [x] Loot
- [x] Chests
- [x] Equipment modifiers
- [x] Artifacts
- [x] Identification
- [x] Artifact curses
- [x] Foraging
- [x] Consumables
- [x] NPCs
- [x] Merchant
- [x] Special mystery interactions
- [x] Tombstones
- [x] Bell mystery
- [x] Ancient Bell Lich
- [x] Save/load
- [x] Persistent RNG
- [x] Fog/discovery
- [x] Mobile controls
- [x] Developer mode

---

# 76. Feature-Conflict Checklist

Before implementing a new feature, answer:

### Does it consume a turn?

If yes, define exactly when the turn is consumed and what systems tick afterward.

### Does it modify a stat?

Define whether it modifies:

- base stat
- derived stat
- temporary modifier
- equipment
- artifact
- curse
- race
- terrain

### Does it persist?

If yes, evaluate:

- save serialization
- loading
- save version
- compatibility
- derived state

### Does it use RNG?

Use the existing seeded RNG.

### Does it work underground?

Explicitly define behavior on:

```text
surface
z:-1
z:-2
z:-3
```

### Does it interact with death?

Define whether its state:

- survives death
- resets
- drops
- disappears
- remains in the world

### Does it interact with invisibility?

Current invisibility suppresses normal enemy pursuit/attacks.

### Does it interact with the Temple?

The Temple currently:

- heals
- protects the player
- causes nearby enemies to flee
- is the death destination

### Does it interact with races?

At minimum consider:

- Merling
- Elf
- Halfling
- Troll
- Wyrdling

### Does it interact with artifacts?

Remember that artifacts can be:

- unidentified
- identified
- cursed
- passive
- equipment

Do not assume all artifacts occupy an equipment slot.

---

# 77. Canonical Gameplay Loop

The current game can be summarized as:

```text
Create character
    ↓
Choose race
    ↓
Awaken at Temple
    ↓
Explore generated world
    ↓
Fight / avoid enemies
    ↓
Find equipment and consumables
    ↓
Gain XP and level
    ↓
Explore caves
    ↓
Descend deeper
    ↓
Discover special locations
    ↓
Investigate mysteries
    ↓
Acquire increasingly useful gear/artifacts
    ↓
Return to Temple when desired
    ↓
Die → return to Temple
```

The current identity is therefore closer to:

> **exploration + risk management + equipment + mysteries**

than:

> **fight → loot → boss → reset run**

---

# 78. Design Principles Evident in the Current Implementation

## Speed matters

SPD affects:

- miss chance
- hit chance
- escape chance

## Position matters

Terrain, aggro, pathfinding, and Temple behavior all make positioning important.

## Preparation matters

The player can solve dangerous situations through:

- equipment
- speed
- invisibility
- teleportation
- exploration
- choosing where to fight

## The world contains secrets

Information is delivered through:

- NPC dialogue
- landmarks
- environmental objects
- artifact lore
- tombstones
- world positioning
- chained interactions

## Death is punishment, not reset

The same character continues after death.

---

# 79. Status Vocabulary for Future Development

Keep feature status simple:

```text
IMPLEMENTED
PARTIAL
PLANNED
EXPERIMENTAL
BUG/SUSPICIOUS
REMOVED
```

Use these labels when future features are discussed or documented.

---

# 80. Future Feature Review Format

When adding a feature, review it against the current specification using:

```text
FEATURE: <name>

STATUS:
IMPLEMENTED / PLANNED / EXPERIMENTAL

COMPATIBILITY:
Compatible / Conflicts / Requires architecture change

AFFECTED SYSTEMS:
- ...

NEW RULES:
- ...

CURRENT RULES THAT MUST NOT CHANGE:
- ...

TURN IMPACT:
- ...

RNG IMPACT:
- ...

SAVE IMPACT:
- ...

DEATH IMPACT:
- ...

UNDERGROUND IMPACT:
- ...

RACE INTERACTIONS:
- ...

ARTIFACT/EQUIPMENT INTERACTIONS:
- ...

EDGE CASES:
- ...

IMPLEMENTATION NOTES:
- ...

DOCUMENTATION CHANGES:
- ...
```

This is the preferred way to keep future features consistent with Vagabond's current architecture and gameplay rules.

---

# 81. Canonical Rule

When there is a conflict between:

- a TODO
- a comment
- a design idea
- a name
- an old note
- a generic roguelike expectation

and the actual implemented behavior:

> **The implemented behavior wins.**

If the implementation is ambiguous, mark the rule as **BUG/SUSPICIOUS** or **UNKNOWN** rather than inventing an answer.

The purpose of this document is to describe **Vagabond as it exists**, not an imagined or idealized version of the game.
