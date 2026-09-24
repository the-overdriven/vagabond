# Vagabond - Current Game Specification

**Document status:** Current implementation snapshot  
**Source of truth:** `index.html` + `src/*.js` + `content/*.json` from the supplied project  
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

- Gold drops from enemies are currently disabled (see 43. Loot).
- Artifact drop chance from enemy kills scales with MF using the same
  `(1 + MF*0.05)` multiplier as the old gold formula, still capped at 4.8%.
- Only humanoid enemies can wear and drop normal equipment. MF improves the
  humanoid fallback equipment roll and reduces its chance to roll one tier
  below the enemy (`35% - (tier - 1)*5% - MF*1%`, floor 5%).
- Item "quality": MF increases the chance any weapon/armor/shield rolls a
  stat modifier at all (`40% + MF*2%`, capped 90%), biases the rolled
  modifier amount upward, and reduces artifact curse chance
  (`10% - MF*0.5%`, floor 2%) while giving a chance to roll the artifact
  effect pool one tier higher (`MF*3%`, capped 50%).
- Chest loot (gold amount, and the equipment/artifact found inside) also
  scales with MF the same way.

## Max HP

Max HP receives flat bonuses first, then artifact percentage modifiers.

The HUD health bar blinks its entire frame and background red when the living
player is strictly below 20% of maximum HP; the filled portion dims in sync.
Discrete animation steps make the warning visible even when the filled portion
is only a few pixels wide. It stops at 20% or above, and on death. The warning
continues to blink with reduced-motion enabled; its earlier static-red fallback
prevented the requested blink for those players.

---

# 5. Leveling

XP required for the next level uses a fixed calibration table for levels 1–15,
followed by a steep progression curve:

```text
level 1 -> 2: 60 XP
level 2 -> 3: 120 XP
level 3 -> 4: 144 XP
level 4 -> 5: 250 XP
level 5 -> 6: 360 XP
level 6 -> 7: 504 XP
level 7 -> 8: 720 XP
level 8 -> 9: 936 XP
level 9 -> 10: 1,800 XP
level 10 -> 11: 2,160 XP
level 11 -> 12: 3,600 XP
level 12 -> 13: 4,320 XP
level 13 -> 14: 6,480 XP
level 14 -> 15: 8,640 XP
```

The implementation uses:

```js
const XP_TO_NEXT = [60, 120, 144, 250, 360, 504, 720, 936, 1800, 2160, 3600, 4320, 6480, 8640]

function xpToNext(lvl) {
  if (lvl <= XP_TO_NEXT.length) return XP_TO_NEXT[lvl - 1]
  return Math.round(Math.round(1920 * Math.pow(lvl / 14, 2.2)) * 4.5)
}
```

For level 15 onward, the threshold is therefore:

```text
round(round(1,920 x (level / 14)^2.2) x 4.5)
```

On level-up:

- level increases by 1
- XP is reduced by the threshold
- maximum HP increases by 10
- SPD increases by 1 on every second level, starting from lvl 2 (`floor(level / 2)`)
- derived stats are recalculated as needed

Therefore, the level-based SPD gains occur at levels 2, 4, 6, 8, etc.

XP is affected by the player's XP multiplier.

Human currently has a permanent +20% XP multiplier.

Actual progression depends on encounter frequency, enemy composition, prefixes,
exploration, and XP multipliers.

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

On desktop/fine-pointer devices, clicking an adjacent living enemy (including a
diagonal neighbor) invokes the same `tryMove(dx, dy)` combat path as keyboard
movement, so turn consumption, replay recording, combat rules, and animations
remain shared rather than duplicated. Hovering such an attackable enemy changes
the canvas cursor to a red diagonal sword whose hotspot is the sword tip. Outside
an attackable enemy, the inline cursor override is cleared so the canvas keeps its
existing stylesheet/default cursor. Non-adjacent clicks retain the normal click-to-move
behavior, and coarse-pointer/mobile input does not use this cursor or desktop
click-attack shortcut.

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

An attempted move into a non-walkable tile does not consume a turn. Waiting is
limited to 10 consecutive turns; after that, another wait is refused. Moving,
attacking, or interacting resets the consecutive-wait counter. This prevents
indefinitely waiting to repeatedly trigger regeneration (notably the Troll's
1 HP every 5 turns).

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

Rivers are seeded from mountain and snow-mountain cells and follow downhill
paths toward lower terrain or the surrounding sea. They are generated as
single-tile-wide channels and may be long, but separate channels do not merge
or run alongside one another.

Each world contains one volcano, with a chance of a second. A volcano is an
impassable central cone surrounded by a small impassable lava field. Volcanoes
are placed on mountain terrain and are represented by the `volcano` and `lava`
tile keys.

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
- volcanoes
- lava fields
- temple
- village
- graves
- cave entrances
- boulders
- special landmarks

Grassland tree decoration:

- Lone trees are placed visually on broad, grass-dominated areas during surface
  generation.
- They remain separated by at least six tiles so they do not form a forest.
- Trees are visual-only: the underlying grass remains walkable and retains its
  normal terrain effects.
- Tree locations are persisted in save files.
- In tile-image mode, grassland trees reuse `img/tiles/grassland-tree.png` with
  deterministic coordinate-based visual variation: some instances are mirrored
  horizontally and their scale is selected from 0.92, 0.96, or 1.0. These
  cosmetic variants consume no gameplay RNG and require no extra save fields;
  the same coordinate therefore renders the same way after loading.
- A foraged ordinary-forest tile remains `forest` terrain and keeps all normal
  forest mechanics, but tile-image mode reuses `img/tiles/forest-tree.png` with
  a muted brown/olive filter. ASCII mode and both minimaps use the existing
  `specialTiles.foragedForest.color`. The distinction comes from the persisted
  `foragedTiles` set rather than from a new terrain ID.

Underground terrain includes cave floors, walls, entrances, stairs/passages, marble, dwarven walls, rubble, and dwarven structures.

In tile-image mode, `content/rendering.json` maps ordinary cave floors
(`cavefloor`, `cavefloor2`) to `img/tiles/cave-floor.png`; one generic
z:-2 burrow uses `cavefloorBrown` and `img/tiles/cave-floor-brown-dark.png`. Cave walls
(`cavewall`) to `img/tiles/cave-wall.png`. Crypt floors and niches reuse
these textures; `marble` has a lighter stone-floor image, and walkable
`cryptrubble`/`dwarvenrubble` use a distinct rubble image. Crypt stairs,
mausoleum stairs, trap coffins, and the sarcophagus use existing transition or
coffin images over the appropriate floor. The regular coffin already uses
`specialTiles.coffin`. ASCII mode still displays the terrain glyphs.

The Dwarven Fort has its own `dwarvenfortexit` terrain ID at its underground
gate on z:-3; `dwarvengate` is the surface entrance. `caveup` remains the
generic ascent tile inside caves and retains its cave-floor background.
The fort exit reuses the existing cave-up image with `baseTileKey: marble` and
the marble ASCII background; no `marblefloor` terrain key or new image is
needed. `content/tiles.json` defines its walkable `^` glyph, gold color,
marble background, description, and unique save character `U`. Generation
stamps the fort tile in both its local template and shared map. The loader
restamps this tile at the fort gate on z:-3, including for older saves encoded
with `caveup`; it leaves all other deep-cave `caveup` entrances unchanged.
`darkforestground` and `marble` are terminal image bases, so neighboring
surface tiles cannot replace them while composing overlays.

The cave floor/wall images are rendering replacements for existing terrain
IDs. Cave scenarios add no terrain IDs; the Dwarven Fort exit is a separate
transition ID with its own save code and surface-ascent behavior.

Normally impassable terrain includes mountains, snow mountains, volcanoes,
lava, boulders, and water for non-Merlings.

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

At level 1, Temple ground heals without requiring XP growth, even on repeated
visits or while moving across Temple tiles. From level 2 onward, healing
requires XP earned since the last Temple heal. Earned XP is tracked
cumulatively, so level-up and XP loss do not erase proof of progress. A
successful blessing restores current HP only up to `min(70, current maximum HP)`
and records the earned-XP total. If a level 2+ player needs healing but has
gained no XP since the last blessing, the log says:
`The temple remains silent. Its blessing awaits proof of your growth.`
The bell tower counts as Temple ground. A Scroll of Homecoming attempts the
conditional blessing. Normal death returns the character at full current
maximum HP and records the earned-XP total; the next Temple heal requires XP
earned after that death recovery once the player is above level 1.

Enemies flee from the Temple.

The bell tower tile (see "Missing Temple Bell") is carved out of the
Temple's own generated footprint - it is Temple ground under a different
glyph, not a separate landmark. It therefore shares every "standing on
Temple ground" behavior: it heals the player on entry and causes nearby
enemies to flee, exactly like the plain `temple` tile.

## Village

A procedurally positioned settlement containing several huts.

Five NPC spawn near the village.

### Starting weapon

One randomly selected ordinary hut in each newly generated village contains
one improvised weapon. Its name is randomly picked from
`content/starting_weapons.json`; its stats are always ATK 1, GRACE 1, and it is
one-handed. Inspecting that hut yields the weapon only while the player has no
weapon equipped. An armed player leaves it in place for a later visit. On
discovery, the hut owner's usual introduction is followed by the weapon find
message, and the weapon is automatically equipped. Further inspections do not
yield another weapon. The selected name and whether it has been claimed are
stored with the hut in `villageHuts` in saves and replay starting states.

### Hut gold

A second, distinct ordinary hut is guaranteed to contain 2–9 gold. Each other
ordinary hut apart from the weapon hut has an independent 20% chance of
containing another 2–9 gold. The mausoleum and weapon huts receive no gold.
The gold and its amount are rolled once during world generation, then saved in
the hut metadata. Inspecting a gold hut grants its gold once, regardless of
equipment, and logs `Inside, you found <amount> gold.` after the hut owner's
introduction. New-game initialization verifies that the guaranteed gold hut
exists.

### Hut generation
<details>
  <summary>Details</summary>
The cemetery's anomalous/odd tombstone is generated with a **dwarven name**.
That name is the canonical identity link for the hidden mausoleum hut:

```text
odd cemetery tombstone name
        ↓
one village hut gets the exact same name
        ↓
that hut is marked mausoleum=true
```

The remaining huts receive random names from `HUMAN_NAMES`. The odd-name hut is
not selected by a later random roll and must not be replaced by a guessed
central/nearest hut. This relationship is established during world creation
and remains fixed for the lifetime of the world.

Because village placement must remain spatially constrained relative to the
Temple/Ancient Forest, the village **geometry** is generated before the
cemetery, but hut **names/mausoleum identity** are assigned only after the
cemetery has generated the anomalous dwarven name. This preserves the intended
logical generation order without changing the village's placement rules.

The exact mausoleum hut coordinate is also persisted as `mausoleumHutPos` in
saves. On load, the coordinate is preferred when valid; otherwise the game
recovers the relationship by matching a hut's name to the anomalous tombstone's
name. The loader does not invent a mausoleum by centrality or connectivity.

In tile-image mode, village huts continue to reuse the single
`img/tiles/thatched-hut.png` sprite. A coordinate-derived visual hash mirrors
some huts horizontally, producing two orientations without changing hut
identity, world generation, collision, or save data. This is cosmetic only and
does not consume the seeded gameplay RNG.

Random cave entrances are not allowed to spawn immediately beside the village.
After z:-1 caves are generated, every non-crypt cave entrance is checked against
every village hut using Chebyshev distance. If any entrance is within **4 tiles**
of any hut, cave placement is considered invalid and the **entire world is
discarded and regenerated**. This is a world-validation rule, not a cosmetic
relocation of the offending entrance.

</details>

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

In tile-image mode, every Ancient Forest tree uses `darkforestground` beneath
it, including along snowy edges. Neighboring snow cannot replace that base.

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

A large underground dwarven settlement/ruin containing:

- dwarven architecture
- marble flooring
- walls
- rubble
- statues
- ghosts
- an anvil
- a wheelbarrow
- a giant gold coin
- a guaranteed artifact chest
- a direct surface gate

The fort is the dedicated generic-chain level at **z:-3**. Fort enemies and
ground objects use `level: -3`, `levelKind: 'chain'`, and the fort's
`caveIndex` so they remain associated with the correct map identity.
The surface `dwarvengate` enters z:-3 directly, and the fort's
`dwarvenfortexit` returns directly to the same surface gate. Fort generation
does not place intermediary entrances, stairs, cave templates, or cave
descriptors on z:-1 or z:-2; the normal caves on those depths keep only their
own passages.

The surface `dwarvengate` must remain spatially distinct from ordinary cave
entrances. After the fort is generated, every non-crypt random cave entrance is
compared with the fort gate using Chebyshev distance. If any entrance is within
**15 tiles** (`max(abs(dx), abs(dy)) <= 15`), the current world attempt is
invalidated and the **whole world is regenerated**. Because the fort's z:-3
`dwarvenfortexit` uses the same world-space coordinate as the surface gate, this
also prevents an ordinary cave ascent/exit from appearing confusingly close to
the fort exit underground.

Fort ghost placement is guaranteed from actual valid floor candidates rather
than from a fixed number of blind coordinate attempts. During world generation,
the game collects marble tiles inside the fort, excludes tiles too close to the
entrance, and randomly chooses up to **8 distinct positions**. Therefore a
normally generated fort receives eight Ghosts as long as at least eight valid
candidate tiles exist.

The guaranteed artifact chest is created as a tier-5 chest with
`artifactGuaranteed: true` on the fort's z:-3 chain map. During save loading,
the loader also repairs transitional/older fort saves: it reconstructs the
fort's `caveIndex` from the z:-3 deep-level cave data, normalizes a matching
unopened fort chest to `level: -3` / `levelKind: 'chain'`, restores the
guaranteed-artifact flag, or recreates the chest on a marble fort tile when no
matching unopened chest can be recovered.

When these props (and other named ground objects such as skeletons,
campfires, dwarven remains, or a wheelbarrow) are picked up by the
"inspect surroundings" scan of nearby tiles, each is labeled by its own
name (e.g. "an anvil").

</details>

---

# 14. Underground Structure

The normal generated depth chain is:

```text
Surface
  ↓
z:-1 caves
  ↓
z:-2 deeper caves
  ↓
z:-3 Dwarven Fort
```

The **Crypt is a separate map/structure**, but its first level shares the z:-1
underground coordinate with the normal caves and its dedicated second level
uses **z:-2**. A z value identifies depth, not a unique map. The crypt's
dedicated `cryptstairsdown` / `cryptstairsup` transitions and the saved
`currentLevelKind` distinguish Crypt Level 2 from the generic z:-2 cave map.

## z:-1: Shared cave layer (includes crypt and mausoleum)

Normal caves are generated on the shared underground map.

The ruined chapel provides a separate entrance into the **Crypt area on this
same underground level**. The crypt is kept separate from randomly generated
cave regions by a generation-time exclusion zone around the crypt footprint,
with the final connectivity test retained as a defensive validation.

Crypt coffins use their own four crypt inscriptions. These are unrelated to the
mysterious tombstone inscriptions dropped by Liches. Each of the four lines is
assigned to one coffin only.

If the crypt contains more coffins than the four stored inscriptions:

- one additional coffin says `Stone coffin. It's empty.`
- all remaining coffins say `Stone coffin. The slab is heavy.`

On surface, the cemetery next to the ruined chapel (crypt entrance) contains graves.
Coffins use the `⚰` symbol and are the burial tiles generated by the crypt.
The unfinished-grave description belongs to the Gravedigger's grave and is not
used for crypt coffins. Graves and coffins of different locations should never be conflated.

The crypt also has dedicated transition text:

- entering: the player descends beneath the ruined chapel
- leaving: the player climbs out of the crypt into the ruined chapel

These transitions do not use the ordinary cave entrance/exit text about
mountain air.

## z:-2: Deeper caves and Crypt Level 2

Some z:-1 caves receive a downward connection.

The generator requires **two separate generic z:-2 caves**. The first uses
connected irregular chambers and winding passages (the grotto algorithm); the
second uses branching random-walk tunnels and small pockets (the burrow
algorithm). Their reserved footprints cannot overlap, and each staircase is
stamped into both maps. Placement is retried on clean map copies; if both required layouts still
cannot be placed, the world is regenerated. The final fallback never silently
accepts a world with fewer than two generic z:-2 caves. Additional parent caves have a 50% chance of a branch using either
algorithm.

Grotto footprints vary from 92×72 down to 42×36 tiles, with an area-scaled
chamber count, possible loops, and an optional water pocket. Burrows vary from
68×52 down to 28×24 tiles; their narrow paths branch from earlier tunnels and
end in scattered pockets. Both styles keep traversable floors connected to the
staircase. The smaller burrow footprints let two independent caves fit even
when the mountain entrances are clustered. One complete burrow cave on z:-2
uses the darker brown floor asset; the other cave floors keep the normal tile.
The crypt's separate second map and the Dwarven Fort remain independent.

The crypt's dedicated second level also uses z:-2, but it has its own map and
uses `cryptstairsdown` / `cryptstairsup`. Generic z:-2 entities are marked as
part of the generic chain, while Crypt Level 2 entities are marked as `crypt2`,
so enemies and items cannot appear or act on the wrong z:-2 map.

## z:-3: Dwarven Fort

Reserved for the Dwarven Fort. It is the third level in the generic depth chain
and is not generated as a normal random cave.
Its `dwarvenfortexit` tile leads directly to the surface `dwarvengate` at the
same coordinates. No fort-related transitions are stamped on z:-1 or z:-2.
Generic `caveup` tiles still ascend to the preceding cave depth, including any
encountered elsewhere on z:-3.

## Cave/crypt/mausoleum separation

Random z:-1 cave generation reserves a rectangular exclusion zone around the
ruined chapel/crypt footprint. The crypt footprint is approximately x +/-3 and
y +/-12 around the chapel; an additional 8-tile Chebyshev clearance is applied.
A candidate cave is rejected if its complete generated random-walk blob enters
that exclusion zone. This prevents caves from being generated immediately next
to or overlapping the crypt instead of relying on post-generation rerolls.

The existing `cryptConnectedToRandomCave()` flood-fill remains as a final safety
check because future cave/crypt geometry changes must not silently reconnect the
two regions.

The mausoleum has a separate defensive validation after the random z:-1 caves
have been merged. Its 9x9 template is anchored on the mausoleum hut, with the
actual stamped interior occupying approximately `x = hut.x-3..hut.x+3` and
`y = hut.y-6..hut.y`. Random cave floor/entrance tiles are forbidden from the
larger safety rectangle `x = hut.x-4..hut.x+4`,
`y = hut.y-7..hut.y+1`, providing a one-tile buffer around that footprint.

This mausoleum check is paired with two surface-spacing rules:

- a non-crypt cave entrance within **4 Chebyshev tiles of any village hut**
  invalidates cave generation;
- a non-crypt cave entrance within **15 Chebyshev tiles of the Dwarven Fort
  gate** invalidates cave generation.

Any of these violations causes the current world attempt to be rejected rather
than relocating only the offending entrance.

Crypt Level 2 uses its own tighter map and contains dedicated crypt
structures, including sarcophagi, burial niches, rubble, and the crypt trap.


---

# 15. Cave Generation

Up to six initial caves are attempted.

## Ordinary cave scenarios

Ordinary z:-1 caves draw from **eight surface scenarios** during the initial
population pass. Generic z:-2 caves draw from a separate, stronger pool of
**five deep scenarios**. The story crypt, mausoleum, and Dwarven Fort retain
their dedicated contents. Surface scenarios are:

| Scenario | Encounter and distinguishing features |
|---|---|
| Abandoned camp | A few bats and rats, a campfire, chest, and Life Potion |
| Bat roost | A larger group of bats placed deeper inside, plus a chest |
| Rat warren | Many rats, chest, and searchable remains at z:-1 |
| Goblin cache | Goblins guarding a chest; better chest at z:-2 |
| Bone hollow | Skeletons near the chest and searchable remains at z:-1 |
| Chitin nest | Giant Bugs deeper inside the cave |
| Beast den | A pack of Wolves |
| Smugglers' refuge | Goblins and another creature, a campfire, chest, and Scroll of Invisibility |

The z:-2 scenarios retain **one Tier-2 species per cave**, chosen from
Goblins, Skeletons, Kobolds, Skinks, or Ratlings. The larger grottos hold
24–36 enemies, spread through chambers. Eight to twelve chests are distributed
across chambers, alternating tier 3 and tier 2; there are also four loose
supplies (two potions and two scrolls). No Giant Rats, Giant Bats,
Wolves, Boars, or Giant Bugs are selected for new z:-2 cave scenario groups.
Each populated generic z:-2 cave also gets one guaranteed Champion of its
scenario species, surrounded by four unprefixed guards of the same type, and
one randomly chosen tier-3 or tier-4 enemy. The group is reserved before normal
spawns in a chamber far from the staircase; the stronger enemy is also placed
away from it. These are in addition to the normal 11% prefix
rolls and carry the same level and cave identity as the group.

| Deep scenario | Enemy group | Distinctive contents |
|---|---|---|
| Goblin cache | Goblins | Chests spread through guarded rooms |
| Bone hollow | Skeletons | Chests spread through guarded rooms |
| Kobold outpost | Kobolds | Chests and campfire |
| Skink den | Skinks | Chests and Potion of Speed |
| Ratling burrow | Ratlings | Chests and Life Potion |

Each depth shuffles its own scenario deck and avoids repeats within that depth
until its pool is exhausted. Rewards use existing chest and consumable rules;
the scenario controls placement, not the contents of a normal chest. There may
be fewer eligible caves than scenario types in a world, so one world need not
contain every scenario.

The cave descriptor stores its scenario ID alongside its entrances. That
descriptor is already persisted in saves. The entrance clue appears when the
player steps onto a surface cave entrance or a downward passage, and the
scenario introduction appears upon descent. Old saves without scenario IDs
retain their original caves and generic entrance text; loading does not
retroactively repopulate them. Scenario enemies and ground items are generated
once, then persist through the existing enemy and ground-item save fields.
Saves generated by the first scenario implementation may still contain weaker
z:-2 populations; loading does not replace their enemies or rewards. Their
existing scenario IDs and clues remain recognized. The z:-3 Dwarven Fort is
excluded from ordinary scenario population.

Cave entrances are selected from mountain edges.

Primary cave locations must be sufficiently separated.

The first cave may receive a second entrance.

Initial z:-1 caves choose independently between a compact cardinal random walk
(90–300 steps, radius 5–11) and three to six linked irregular chambers
(radius 9–15). They all retain the ordinary cave floor. On generic z:-2, the
burrow's descriptor stores `brownFloor`, and `terrainVisual()` selects the
`cavefloorBrown` entry (`img/tiles/cave-floor-brown-dark.png`) for every floor tile
in that cave, including the floor beneath its staircase. The visual is chosen
by the z:-2 cave map coordinate, not by the active z:-1 cave index. Brown cave
floors use `minimap.brownCave`, a slightly darker brown than ordinary stone
floors on both underground maps. The `caveup` exit keeps its dedicated bright
minimap color even inside the brown cave. Inspecting either generic cave floor reports
stone or brown dirt according to the marked z:-2 cave at that coordinate,
regardless of depth. No new gameplay terrain key is needed; the map still
stores `cavefloor2`.

Before a generated cave is committed to the world, its complete local map is
checked against the crypt exclusion zone. Only accepted caves are stamped onto
the surface and merged into the shared underground map. Entrance tiles are
re-stamped after merging so overlapping caves do not destroy entrances.

After the z:-1 caves are merged, cave placement receives additional spatial
validation. A random cave entrance within 4 Chebyshev tiles of any village hut
is invalid. Random cave floor/entrance tiles are also forbidden from the
mausoleum footprint plus its one-tile underground safety margin. After the
Dwarven Fort has been generated, every ordinary cave entrance is also checked
against the surface fort gate; a Chebyshev distance of **15 tiles or less** is
invalid. Any failure makes `generateCaves()` fail, causing the current world
attempt to be discarded and regenerated.

After cave generation, the generated surface is copied back into the canonical
`surfaceMap`. This preserves the stamped entrance tiles when the game returns
to the surface or renders from the canonical surface state.

---

# 16. World Connectivity

World generation checks whether the Temple can reach a map edge through walkable terrain. This is to prevent situation where player is stuck in a village surrounded by non-walkable tiles.

If the generated world fails this condition, it is regenerated.

The z:-1 crypt must remain a separate walkable region from all randomly
generated caves. The generation-time exclusion zone prevents normal cave blobs
from being placed against the crypt, and after the crypt and caves are merged,
generation flood-fills the shared underground map from the crypt entrance. If
that traversal reaches any non-crypt cave floor or entrance, the entire world is
discarded and regenerated.

World validation also rejects random caves that are too close to the village or
mausoleum. Specifically:

- a non-crypt cave entrance within **4 Chebyshev tiles of any village hut**
  invalidates the world attempt;
- a random cave floor/entrance tile intersecting the mausoleum's 9x9 footprint
  plus its one-tile safety margin invalidates the world attempt;
- a non-crypt cave entrance within **15 Chebyshev tiles of the Dwarven Fort
  surface gate** invalidates the world attempt. The fort's underground exit is
  aligned to that same coordinate, so the rule also keeps ordinary cave exits
  visually separated from the fort exit on the underground chain.

These checks occur during cave generation. They do not move or delete only the
offending cave; `generateCaves()` fails and `generateMap()` retries the **whole
world**, subject to the same maximum-attempt limit. At the beginning of every
full retry, transient generated `enemies`, `groundItems`, and `occupied` state is
cleared so content from a rejected cave/fort layout cannot leak into the next
world attempt.

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

Higher-tier enemies are placed farther from the Temple during normal surface
enemy spawning.

For Tier 3+ enemy templates, the spawn pool is filtered to tiles whose
**Chebyshev distance** from the Temple's `spawnPoint` is at least 50 tiles:

```text
max(abs(x - spawnPoint.x), abs(y - spawnPoint.y)) >= 50
```

This is a hard eligibility filter for the normal surface spawn pool, not merely
a weighting preference. If a Tier 3+ template has no eligible biome tiles at
that distance, it can fail to spawn rather than being moved into the inner
50-tile area.

The Temple is anchored at `spawnPoint`, so the code's distance check is
effectively a distance-from-Temple check.

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

Humanoid enemies wear randomly assigned gear (weapon/armor/shield) which they drop on death. All enemies have natural GRACE and can take part in grace checks while unarmed; an equipped enemy weapon overrides natural GRACE. This makes armed and unarmed combat more varied, allowing the more graceful combatant to strike twice. The player must still wield a weapon to take part in grace checks.

## Deadly

The Deadly enemy prefix grants critical-hit capability. Critical hit doubles the damage.

---

# 21. Enemy Prefixes

Underground enemies acquire the player only along an unobstructed ray through
cave, mountain, and dwarven walls. Alerted enemies may pursue around a nearby
corner for up to two tiles; surface detection remains distance based.

Approximately **5% of normal enemy spawns** receive a prefix. Scenario-spawned
z:-1 cave enemies use the same **5%** chance. Scenario-spawned generic z:-2 cave
enemies use an increased **11%** prefix chance. Dedicated story/fort population
keeps its own spawn rules unless explicitly routed through the normal prefix
roll.

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

On the game canvas, a prefixed enemy keeps its original tier-colored letter.
`content/rendering.json` supplies a translucent violet tile overlay in a
one-tile radius (3×3 square), or a gold overlay in a two-tile radius (5×5
square) for Champions. The outer Champion tiles are fainter. The overlay is
drawn below all enemy glyphs, moves tile by tile with its owner, and does not reveal
undiscovered underground tiles or change stats, terrain, or save data.

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

## Enemy XP

XP awarded for killing an enemy is calculated from its final spawned stats:

```text
base XP = tier x 10 + floor((max HP + ATK x 2 + DEF x 2) / 3)
```

If the enemy has a prefix, the result is multiplied by 1.5 and rounded:

```text
prefixed enemy XP = round(base XP x 1.5)
```

Therefore, prefixed enemies yield 50% more XP than an otherwise identical
enemy. The player's race and equipment XP bonuses are applied afterward.

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

The default aggro range is:

```text
4
```

On the surface, standing in an enemy's aggro range triggers pursuit. Underground, a new target also needs a clear line of sight through walls; an alerted enemy may keep chasing around a corner within two tiles.

Any enemy that attacks the player becomes aggroed (shown as a red border
around the enemy) in the same turn, even if the enemy's aggro range is very
low (e.g. 1) and it was already standing adjacent to the player before ever
entering the normal aggro-range check.

All explicit enemy-template aggro values were also increased by 1. Halfling
reduces effective enemy detection range by 1.

An already-aware enemy standing on the outermost tile of its effective aggro
range has a 30% chance per turn to give up the chase. That outer ring is drawn
with a more transparent red than the rest of the aggro overlay.

Enemies can also lose interest in the chase if the player's speed is at least twice as high.

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
Wander radius: 1 tile (how far from its home tile a wandering enemy/NPC may stray)
Active range: 20 tiles from the player (Chebyshev distance)
```

Wandering is limited to enemies/NPCs within the active range of the player,
not to what the camera viewport happens to be showing. This is deliberate:
the check used to be "is this enemy on screen", which depended on the live
canvas viewport (window size, sidebar collapsed/expanded, desktop vs mobile).
That made the number of `chance()`/`rng()` calls per turn depend on the
player's window at the time, which silently desynced Replay System (section
83) playback whenever a recording was watched in a differently-sized window
    than it was made in. The fixed 20-tile radius depends only on player and
    enemy/NPC position - both part of replayed state - so replay is unaffected
    by window size, device, or sidebar state.

---

# 23. Temple Enemy Behavior

The Temple is a safety zone.

Enemies near the Temple flee when the player is on Temple ground.

An enemy starts fleeing once it is within the same 20-tile active range used
for wandering (section 22) - or is already fleeing - while the player stands
on Temple ground. Once started, fleeing continues (even if the enemy moves
outside that range) until it reaches the flee distance below.

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

Damage mitigation is simply the defender's DEF reducing the attacker's ATK.
It is not a separate hit/miss roll and it is not the same thing as evasion.

The damage calculation first produces a mitigated attack value:

```text
mitigatedAtk = ATK × 10 / (10 + max(0, DEF))
```

Equivalently, the fraction of ATK that survives DEF is:

```text
10 / (10 + DEF)
```

Examples:

|                 DEF | ATK retained before damage variance |
|--------------------:|------------------------------------:|
|                   0 |                                100% |
|            1 (robe) |                              90.91% |
|            2 (cape) |                              83.33% |
| 5 (cloak + buckler) |                              66.67% |
|    10 (brass armor) |                                 50% |
|  17 (ancient armor) |                              37.04% |

Final damage is then:

```text
max(1, round(mitigatedAtk + random(-1, +2)))
```

The random term is continuous from `-1` through `+2`, using the game's seeded
RNG, so the final rounded result can vary.

### Example: Goblin

The Goblin template is:

```json
{
  "name": "Goblin",
  "hp": 20,
  "atk": 4,
  "def": 2
}
```

Suppose a Goblin with **ATK 4** attacks a defender with **DEF 2**.

```text
mitigatedAtk = 4 × 10 / (10 + 2)
             = 40 / 12
             = 3.333...
```

Before the final random variance and rounding, the attack therefore deals about
**3.33 damage**. The `random(-1, +2)` term then modifies this before rounding,
with a minimum final damage of 1.

The same DEF calculation applies when the player attacks a Goblin: a player
with ATK 4 hitting a Goblin with DEF 2 starts from the same `3.333...`
mitigated value.

This example isolates the damage formula. Actual spawned enemies can differ
from template stats because enemy stats receive spawn variance and humanoids
can also gain equipment bonuses.

When player wearing a brass armor is hit:
An enemy with 4 ATK has a mitigated ATK of 2 against brass armor.
Damage then applies the game's random variance and rounding, so 4 ATK can deal 1–4 damage, with 2 damage occurring about 33.3% of the time.
In general, with 10 DEF, an enemy needs 6 ATK or more to guarantee at least 2 damage.

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

Base combat delay:

```text
6 / GRACE
```

Higher weapon or natural GRACE means lower base combat delay. Reciprocal scaling gives high GRACE diminishing returns without making any GRACE point useless.

Player racial GRACE acts as an affinity for graceful weapons rather than being added directly to weapon GRACE:

```text
weapon affinity = min(1, weapon GRACE / 5)²
racial reduction = racial GRACE × 0.25 × weapon affinity
player delay = max(0.25, base delay - racial reduction)
```

This makes racial GRACE provide almost no benefit with slow weapons and progressively more benefit with graceful weapons. A GRACE 5 or higher weapon receives the full racial reduction.

For an Elf with **+2 racial GRACE**:

| Weapon GRACE | Normal delay | Elf delay | Delay reduction |
|---:|---:|---:|---:|
| 1 | 6.00 | 5.98 | 0.02 |
| 2 | 3.00 | 2.92 | 0.08 |
| 3 | 2.00 | 1.82 | 0.18 |
| 4 | 1.50 | 1.18 | 0.32 |
| 5 | 1.20 | 0.70 | 0.50 |

The player must wield a weapon to take part in a grace check. Every enemy has natural GRACE and can take part while unarmed; if the enemy wields a weapon, the weapon's GRACE overrides its natural GRACE.

If both combatants have a valid combat delay and the attacker has lower delay, an extra attack can occur.

Chance:

```text
(defender delay - attacker delay) × 10%
```

This can apply in either direction:

- player attacking enemy
- enemy attacking player

---

# 31. Death

Normal death is **not permadeath**; the optional mode below deliberately changes
that behavior.

An optional **Permadeath** checkbox is available on the race-selection screen.
When selected, the character tooltip displays “Permadeath”. On death, the
current character leaves a persistent dead body at the death position instead
of returning to the Temple. The world, enemies, ground objects, and generated
maps remain intact; after the death fade a new character can be selected in
the same world with fresh level, equipment, inventory, HP, gold, and other
character stats.

The body inscription reads `Here lies <name>, killed by <enemy>`. Environmental
deaths (for example freezing or poisonous mushrooms) use `???` as the killer.
Bodies are rendered on the map with a skull glyph and remain on the level where
the death occurred (surface or underground). Walking onto a body does not loot
it; the forage/loot action retrieves its contents. Its tooltip reads only
`dead <race>` when inspected on the map, while standing on it displays the
memorial inscription and `Pay respects or retrieve what is left.` The tooltip
itself only says `dead <race>`.
After looting, the corpse skull is rendered gray.
The body can be looted once for 10% of the dead character’s carried gold and
one randomly selected item from the highest-tier equipped weapon, shield, or
armor. If the killer is an unarmed humanoid and another equipped item remains,
that humanoid takes one such item and wields it. Bodies are saved as world
ground objects, so this state survives save/load.

When HP reaches zero in normal mode:

- death counter increases
- one random unequipped backpack item is dropped at the death position, if one
  is available; one unit is removed when the selected item is a stack
- a distinct `playerremains` ground object holds that item and uses the
  skeletal-remains glyph without becoming a `skeleton` or permadeath `deadbody`
- the forage/loot action restores the item and removes `playerremains` from the world
- death animation occurs
- player returns to Temple at full current maximum HP, including equipment bonuses,
  after the permanent maximum-HP loss has been applied
- death recovery records earned XP, so later Temple blessings require new XP
  from level 2 onward; level 1 remains exempt
- player returns to the surface
- position becomes the Temple spawn point
- the killer, if still alive, gains a persistent red skull and a victory level;
  each victory adds 3 maximum HP and +1 each to ATK and DEF, leaves SPD unchanged,
  then heals 10% of its new maximum HP (rounded, at least 1)
- the player loses 10% of current unspent XP (rounded up), with a minimum loss
  of 20 XP and a maximum loss of 200 XP. If fewer than 20 XP are available,
  the unspent XP total becomes negative; future XP gains repay this debt before
  the next level can be reached. The XP bar displays zero width during debt
- the player's base maximum HP permanently drops by 1 at levels 1–4, or 2
  at level 5 and above, never below 1

The player's:

- level
- equipment
- inventory
- gold

are not wiped by death.

The existing death log also states the exact XP and max-HP losses. A living
monster killer additionally produces `The <killer> has tasted victory. It grows
stronger.` Environmental deaths apply player penalties without empowering a
monster. These penalties apply only outside permadeath mode; permadeath keeps
its existing death and corpse behavior. Victory levels and the Temple's XP
progress counters persist in saves and replay starting states.

Normal-mode `playerremains` exist only in non-permadeath runs. Permadeath
continues to use its separate persistent `deadbody` object and existing corpse
loot rules; looting a permadeath body does not remove that body.

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

Shields and armors are not automatically equipped, because equipping them decreases speed.

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
| Studded Leather | 2 | 7 | 0 |
| Chain Mail | 3 | 9 | 0 |
| Brass Armor | 2 | 10 | 3 |
| Splint Mail | 3 | 11 | 1 |
| Scale Armor | 4 | 13 | 1 |
| Plate Mail | 4 | 15 | 2 |
| Ancient Armor | 5 | 17 | 2 |

Wearing all armors decreases 1 SPD, and additional SPD penalty on top of it.

---

# 36. Equipment Modifiers

Normal equipment has a **40% chance** to receive a modifier at MF 0. Each point
of Magic Find adds 2 percentage points, up to a **90% cap**.

Current modifiers:

| Modifier  | Effect |
|-----------|--------|
| Profound  | XP     |
| Resilient | HP     |
| Mighty    | ATK    |
| Sturdy    | DEF    |
| Swift     | SPD    |
| Lucky     | MF     |

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
- dwarven names
- dwarven vocations
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

These percentages apply only after an enemy has already rolled an artifact
drop. They do not describe the chance of getting an artifact in the first
place. Once the drop happens, the effect tier is selected uniformly from the
effects available to that enemy tier. The current pool has 4 tier-3 effects,
6 tier-4 effects, and 4 tier-5 effects:

| Source enemy tier | Tier 3 effect | Tier 4 effect | Tier 5 effect |
|---|---:|---:|---:|
| 1-3 | 100% | 0% | 0% |
| 4 | 40% | 60% | 0% |
| 5 | 28.6% | 42.9% | 28.6% |

Examples, assuming no Magic Find:

- Tier-1 enemy: if it drops an artifact, it is tier 3 (100% of the time).
- Tier-2 enemy: if it drops an artifact, it is tier 3 (100% of the time).
- Tier-3 enemy: if it drops an artifact, it is tier 3 (100% of the time).
- Tier-4 enemy: if it drops an artifact, there is a 40% chance of tier 3 and a
  60% chance of tier 4.
- Tier-5 enemy: if it drops an artifact, there is a 28.6% chance of tier 3, a
  42.9% chance of tier 4, and a 28.6% chance of tier 5.

Tier-1 and tier-2 sources fall back to the lowest available effect tier,
which is currently tier 3. Magic Find can treat the source as one tier higher
before selecting the effect. The chance is `min(50%, MF x 3%)`; for example,
MF 10 gives a 30% chance to use the next source tier's distribution.

---

# 39. Artifact Naming

Non-cursed artifacts can use a dwarven-owner naming pattern such as:

```text
The <noun> of <Dwarf Name>
```

Cursed artifacts use a cursed prefix directly before the artifact noun and do
not receive a dwarven-owner name:

```text
<Cursed Prefix> <noun>
```

For example, a cursed artifact might be named `Forgotten Amulet`. If no cursed
prefix is available, the naming code falls back to the normal epithet pattern
(`The <noun> of <Epithet>`) or simply `The <noun>`.

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
| 1 | 0.40% |
| 2 | 0.70% |
| 3 | 1.00% |
| 4 | 1.30% |
| 5 | 1.60% |

These are the chances for any artifact to drop from an enemy; higher-tier
enemies intentionally have a higher artifact drop chance. They do not describe
the chance of a high-tier artifact effect. When an artifact drops, its effect
pool is limited by the enemy tier (with Magic Find occasionally allowing one
tier higher), so high-tier effects remain available only from stronger and
rarer sources. Magic Find modifies the drop chances below. Guaranteed artifact
chests are unaffected.

Any-artifact enemy drop chance is capped at:

```text
4.8%
```

The cap is reached only at high Magic Find. The minimum MF needed is
approximately 220 for tier 1, 117 for tier 2, 76 for tier 3, 54 for tier 4,
or 40 for tier 5. Therefore, a 4.8% chance for any artifact is possible
against a tier-5 enemy when the player has MF 40 or higher; lower-tier enemies
require even more MF.

Artifact chance and quality (effect tier, curse odds) scale with Magic Find
(see "Magic Find" above).

---

# 44. Enemy Equipment Drops

Humanoid enemies can carry equipment. The worn item affects the enemy's stats
and is dropped as that same item when the humanoid dies.

## Equipment is generated on spawn

A humanoid is assigned equipment when the enemy is created, before the player
necessarily encounters it.

The game performs up to two independent equipment rolls:

1. **First roll:** `min(90%, 45% + tier*3%)`
2. **Fallback roll if the first fails:** `min(90%, 45% + MF*2% + tier*3%)`

Therefore the chance that a humanoid is wearing at least one item is:

```text
1 - (1 - firstRoll) * (1 - fallbackRoll)
```

At MF 0, the resulting chances are:

| Enemy tier | Chance of wearing gear |
| --- | ---: |
| 1 | 72.96% |
| 2 | 75.99% |
| 3 | 78.84% |
| 4 | 81.49% |
| 5 | 84.00% |

### What Magic Find does here

**Magic Find affects the chance that the humanoid gets equipment, but it does
not improve the quality of the worn item.**

The first equipment roll does not use MF. If that roll fails, MF increases the
fallback roll's chance by `2%` per MF, capped at the overall 90% roll chance.
The first roll creates equipment at the enemy's own tier. On the fallback
roll, the chance to generate one tier lower is:

```text
max(5%, 35% - (enemy tier - 1) × 5% - MF × 1%)
```

At MF 0 this is 30% for tier 2, 25% for tier 3, 20% for tier 4, and 15% for
tier 5, making stronger humanoids increasingly likely to wear and ultimately
drop equipment matching their own tier.

Crucially, both equipment-generation paths create the item without passing MF
into the item generator. Therefore MF does **not**:

- increase the tier of the worn weapon/armor/shield
- increase its modifier chance
- increase its modifier amount
- reroll the item when the humanoid dies

The worn item is already stored on the enemy as `e.equipment`.
Combat glancing-hit messages and enemy tooltips show only the equipment's base
name, so they do not reveal a modifier prefix before the item drops. The drop
message and recovered item retain the full prefixed name.

The item type is selected independently:

- weapon: 50%
- armor: 25%
- shield: 25%

## Death drop

When a humanoid with `e.equipment` dies, the game drops that exact stored
equipment item. It does not generate a new item at death.

This means the timeline is:

```text
enemy spawns
    ↓
equipment is rolled
    ↓
equipment affects enemy stats
    ↓
player encounters/fights enemy
    ↓
enemy dies
    ↓
the stored equipment is dropped
```

Possible equipment includes:

- weapon
- armor
- shield

Non-humanoid enemies do not wear or drop normal weapons, armor, or shields.

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

## Chest loot selection

For ordinary chests, the loot outcome is selected with **one RNG roll on a
scale of 110**:

```text
roll = rng() × 110
```

The roll is compared against the ordered `CHEST_LOOT_TABLE.table` entries
loaded from `content/loot_tables.json`. The first entry whose `upTo` threshold
exceeds the roll determines the result. If no entry matches, the configured
`elseResult` is used.

The current approximate shares are:

| Result | Approx. share |
|---|---:|
| Gold | 41% |
| Gear | 23% |
| Life Potion | 14% |
| Scroll of Invisibility | 5.5% |
| Potion of Speed | 8% |
| Scroll of Identification | 9% |

The **110-point roll chooses the result category**. If the result is gear, a
second roll chooses weapon/armor/shield according to that chest entry's
configured chances.

Gear generated from a chest uses the chest tier (capped by the entry's
`gearMaxTier`) and passes the player's Magic Find into the item generator.

World generation also buries five equipment objects beneath random surface
sand tiles. These hidden `buriedgear` objects have their positions, item types,
tiers, and modifiers fixed during world generation. They are not rendered and
cannot be collected by walking over them. Digging the exact tile with a shovel
uncovers the predetermined item before the ordinary 1–100 digging roll.

Two additional random artifacts are buried on separate surface sand tiles as
hidden `buriedartifact` objects. Each rolls a random artifact tier from 3–5
during world generation. They follow the same shovel-only discovery rules and
are also independent of the normal digging/foraging RNG.

Backward compatibility: saves created during the temporary visible-item
implementation may contain ground objects with `kind: "gear"`. The game treats
those legacy objects as buried gear everywhere: they are excluded from map
tooltips, nearby-item inspection, and Old Hunter quest targeting, and can only
be recovered by digging their exact tile with a shovel.

A chest marked `artifactGuaranteed` skips the normal 110-point loot roll and
directly creates an artifact using the chest tier and the player's Magic Find.

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

Wyrdling increases the duration by 25%. Example: 15 turns become 18.75 turns (rounded to 19 turns).

While invisible, enemies do not chase or attack the player. Invisibility can be also used to kill stronger enemies, without being hit.

## Scroll of Homecoming

Returns the player to the Temple. Temple healing follows the same level 1
exception, XP rule from level 2 onward, and 70-HP cap. Its canonical item kind
and replay action are `homecomingscroll`, and
its icon is `img/icons/homecomingscroll.svg`. Its merchant price is 100g, with
five in stock. The stock config key is `scrolls.homecomingScroll`.

## Potion of Speed

Grants:

```text
round_with_consumable_bonus(3 + round(current SPD / 3))
```

for:

```text
15 turns
```

The player's current SPD is sampled immediately before the potion activates,
so the potion never feeds its own bonus back into the formula. Wyrdling
increases the complete calculated effect and duration by 25%. For example, a
player at 6 SPD receives `3 + round(6/3) = +5 SPD`; a Wyrdling receives +6 SPD
after the 25% bonus is rounded, for 19 turns.

## Scroll of Identification

Identifies an artifact.

## Healing Herb

Foraged item. When eaten, always heals 25% HP.

Wyrdling increases the healing effect by 25%. Example: 25% HP becomes 31.25% HP (rounds to nearest whole number, on level 1: 31 HP instead of 25 HP).

## Handful of Berries

Foraged item. Grants stacking Troll-like regeneration for 100 turns.

Wyrdling increases the duration by 25%. Example: 100 turns become 125 turns.

## Mushroom

Foraged item. There is a 50% chance of healing or damaging HP. Both outcomes
use 25% of the player's maximum HP: healing is affected by consumable bonuses,
while poison damage is not. Damage is rounded and cannot be lower than 1 HP.

Wyrdling increases the healing effect by 25%, but does not increase poison damage.
Example: a healing result restores 25% HP normally or 31.25% HP for a Wyrdling.

---

# 48. Foraging

`F` performs foraging, searching, and occasional looting/pickup actions where
appropriate. For example, it can forage forest tiles, search skeletons, loot
dead bodies, pick up certain special objects, or dig sand when the player has
a shovel.

Ordinary forest tiles can be foraged.

Each forest tile can only be foraged once.

Results:

```text
9% → Handful of Berries
8% → Healing Herb
8% → Mushroom
75% → Nothing
```

Taiga and Ancient Forest cannot be foraged.

## Digging

Digging is a separate action from ordinary forest foraging.

When the player is standing on a `sand` tile and has a shovel, pressing `F`
records a `dig` action and performs the shovel-digging logic. The same action
can also be triggered directly from the shovel in the inventory.

A sand tile can only be dug once; subsequent attempts report that it has
already been dug.

The treasure-map location is checked before the normal digging loot roll. At
the marked location, digging produces the `Old Rotten Casket` instead of a
normal digging result.

After the treasure-map check, digging checks for a hidden world-generated
`buriedgear` or `buriedartifact` object on that exact tile. If found, its
predetermined item is recovered and the ordinary digging roll is skipped.

For normal sand, digging uses a separate 1–100 roll. Current results are listed under "Normal digging loot" section.

See section 79 for the full digging rules and treasure-map interaction.

## Inspection precedence

When the player is standing directly on a special tile or special ground
object, the inspect action handles that object and **does not also inspect the
surroundings**.

This is implemented as an early return in the inspection logic. Examples
include crypt coffins/sarcophagi, tombstones, special graves, village/landmark
tiles, and special ground objects such as skeletons, campfires, dwarven props,
explorer remains, and dead bodies.

An abandoned campfire can be searched once by inspecting it or pressing F
while standing on it. A seeded 30% roll grants one Potato; a failed search
finds nothing. The `searched` flag is stored on its ground object and saved,
preventing repeated rolls. Potatoes stack in the inventory and use
`img/icons/potato.svg`, matching the 24x24 item icon format. They cannot be
used, equipped, or sold.

Ordinary surroundings inspection only runs when no higher-priority special
inspection has handled the current tile/object.

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

The Merchant additionally supports trading. Trading is possible by clicking on the Merchant, while standing next to him. The Herbalist also opens a services screen when clicked while adjacent.

---

# 51. Old Hunter
<details>
  <summary>Details</summary>

The Old Hunter is associated with the Ancient Forest.

His warning contains a direction derived from the actual generated Ancient Forest location.

He warns the player about entering the Ancient Forest in a particular direction after midnight.

## Procedurally generated quests

The Old Hunter can generate a new quest when the player interacts with him and has no active quest. Quest objectives are selected from the current world state rather than from a fixed quest list.

There is a 30% chance to receive an investigation quest. Investigation quests target a recognizable, procedurally generated landmark, such as a cave entrance or the dwarven fort entrance. The target is stored by its map coordinates and landmark type, so the quest points to an actual location rather than an arbitrary wilderness tile.

The quest dialogue names the landmark and gives its direction relative to the Old Hunter, and ends with "I'll mark the location on your map." The player completes the investigation simply by getting near the target tile within 2 squares; no additional interaction or hidden object search is required. The quest then becomes ready to turn in at the Old Hunter.

As soon as the quest is generated, the Old Hunter also marks the location for real: a 5x5 area (the target tile plus 2 tiles in every direction - the same radius used for quest completion) is immediately revealed on the discovery grid, whether or not the player has actually been there.

Other generated quest types include:

- **Kill a specific monster:** kill a particular eligible, prefixed tier-3-or-higher monster.
- **Recover an item:** retrieve an item carried by a particular monster.

Kill quests are restricted to eligible prefixed monsters, while item quests are generated from living eligible enemies or qualifying ground items. When both killing and item quests are available, the system gives killing quests a 50% chance; investigation quests are checked separately first and therefore have their own 30% chance.

Quest progress is persisted in the save data. Completed objectives become ready for turn-in, and turning in a quest grants the configured reward and marks the quest completed.

</details>

---

# 52. Gravedigger
<details>
  <summary>Details</summary>

The Gravedigger is associated with the cemetery mystery.

The anomalous tombstone can trigger a special quest interaction.

The player can give the odd tombstone to the Gravedigger and gets a shovel in return.

After interaction, the delivered tombstone is inserted beneath the grave next to the gravedigger.

The grave tile next to the Gravedigger is persisted across save/load: the
game records which tile it occupies and restores that reference on load
(falling back to scanning the restored map for an existing grave tile if an
older save lacks the reference). Loading a save must never place an
additional grave near the Gravedigger.

When the player digs up the Old Rotten Casket at the treasure map's marked
location, the cemetery mystery reaches its closing state:

- the Gravedigger NPC disappears
- the grave tile remains in the world
- inspecting that grave includes `The gravedigger rests here.`

This state is persisted through the `treasureMapUnearthed` save field. Loading
an older or otherwise incomplete save that contains this flag also removes any
remaining Gravedigger instance instead of respawning him.

</details>

---

# 53. Drunk
<details>
  <summary>Details</summary>

The Drunk provides dialogue concerning the missing bell. After the bell event,
his only normal dialogue is:

```text
I'm done! No more drink! I heard a bell that's not there.
```

His direction hint is dynamically calculated from the generated Big Bell location.

After the treasure-map casket is unearthed, each post-bell Drunk interaction
has a 50% chance to use the following line instead:

```text
Gravedigger? What gravedigger? I don't remember us having one.
```

This chance is enabled for the remainder of the world and is restored from the
persisted treasure-map completion state.

</details>

---

# 54. Merchant

The Merchant:

- remains stationary
- opens a trading interface
- sells items
- buys items
- persists stock through saves
- must not occupy the same surface coordinate as any `groundItems` entry,
  including hidden `buriedgear` and `buriedartifact` objects

During new-world NPC placement, Merchant candidate tiles are rejected if a
surface ground item already occupies that coordinate. As a compatibility guard,
loading a save removes any surface ground item found directly under the Merchant;
this repairs older worlds that already contain such an impossible overlap. Other
NPCs retain their existing placement rules.

Stackable consumables are grouped by kind. Pickups and purchases add to an
existing stack regardless of item name; opening the inventory merges duplicate
stacks already present in older saves, keeping their total count.

## Item values and merchant prices

The game's base **sell value** is calculated by `itemSellValue()`.

### Tiered items

If an item has a `tier`, its base sell value comes from:

```text
SELL_VALUE_BY_TIER[item.tier]
```

The numeric tier values are loaded from `content/loot_tables.json`.

If the item has a modifier, the modifier adds:

```text
(modAmt or 1) × 5 gold
```

So for a tiered modified item:

```text
sell value = tier sell value + modifier amount × 5
```

The modifier's name/stat does not change this formula; only `modAmt` matters.

### Non-tiered items

If the item has no tier, the game first checks:

```text
FLAT_SELL_VALUE[item.kind]
```

Those flat values are also loaded from `content/loot_tables.json`.

Amber and Seashell are a special fallback: they use the `value` stored on the
item itself. In the current digging implementation:

```text
Amber    = 20g
Seashell = 10g
```

Items with neither a tier nor a configured flat value are worth 0g and cannot
be sold (for example, lore-only tombstone items).

### Buying from the Merchant

The normal default merchant buy price is:

```text
2 × itemSellValue(item)
```

However, an item with an explicit `merchantPrice` uses that price instead.

Merchant-generated stock can therefore use configured price multipliers or
fixed prices from `content/merchant_stock.json`. The exact multipliers and
fixed prices are configuration data, not hard-coded in `itemSellValue()`.

Fixed merchant weapons use `base` as a reference into
`content/gear_weapons.json`; combat stats are not duplicated in merchant
configuration. The guaranteed Two-handed Sword therefore inherits the
canonical tier-4 definition (9 ATK, 2 GRACE, two-handed), while
`merchant_stock.json` supplies only its fixed 200g purchase price. If a
configured weapon name cannot be resolved, the item is skipped and a warning
is written to the console. `ensureMerchantStock()` also reapplies the canonical
weapon fields to a matching item already present in saved merchant stock, which
repairs older saves containing the obsolete ATK-5 copy.

The important distinction is:

```text
sell price = itemSellValue(item)

buy price = explicit merchantPrice
            OR
            2 × itemSellValue(item)
```

Selling a stackable item sells one unit at its per-item sell value.

---

# 55. Herbalist

The Herbalist opens services while adjacent:

- Mushrooms cost 2g each to purify. The attempt has a 50% chance of poison
  and removal (per each mushroom); successful results become Edible Mushrooms.
- Three Healing Herbs plus 10g become a Life Potion.

The Herbalist's other purpose is to hint that forests can be foraged for
remedies, while also warning that forests are dangerous (because forest tiles
can trigger an ambush).

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

The generated cemetery contains ordinary dwarven tombstones and exactly one anomalous tombstone.

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

The dwarven ruin contains environmental story objects such as:

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

The Dwarven Fort's floor-position shuffle uses seeded Fisher-Yates through
`randInt`. Ordinary cave scenario selection, placement, and initial contents
also use the seeded RNG. These world-generation draws take place before replay
recording starts; their generated caves, enemies, and items are part of the
recorded initial state.

Loading a save therefore continues the random sequence rather than resetting it.

**RNG state is gameplay state.**

---

# 66. Save System

Current save version:

```text
13
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

`foragedTiles` must be restored before `rebuildMinimapBases()` runs during load.
The cached minimap terrain bases paint foraged forest with
`specialTiles.foragedForest.color`; rebuilding first would permanently cache the
normal forest color for that load until another full rebuild. This ordering is a
save/load rendering invariant and should be preserved when changing loader
initialization order.

Foraging a forest tile during live play must also repaint that coordinate in every
cached minimap base immediately after adding it to `foragedTiles`. The tile is
normally already discovered, so calling `markDiscovered()` is insufficient:
`markDiscovered()` intentionally returns early for an already-seen tile and would
leave the cached minimap showing ordinary forest until a later full rebuild.

Enemy save records now persist `levelKind` in addition to numeric `level` and
`caveIndex`. This is required because a z value alone does not uniquely identify
a map: for example, generic deeper caves and Crypt Level 2 can both use z:-2.
Version 13 was introduced to preserve this enemy map identity explicitly.

---

# 67. Save Compatibility

The loader contains compatibility handling for older saves.

Examples include handling:

- missing race data
- missing NPC data
- older terrain-underlay information
- older cave entrance representations
- underground level renumbering from the older z-depth scheme
- missing enemy `levelKind` metadata
- transitional Dwarven Fort chest metadata / placement
- older Dwarven Fort exits stored as `caveup`: when loading deep levels, the
  fort gate at its surface coordinates on z:-3 is restamped as
  `dwarvenfortexit` in the local template and merged map; other `caveup`
  entrances keep their cave-ascent meaning

For enemy levels specifically:

- **v13+** saves persist `levelKind` directly.
- **v11-v12** already use the current z:-1 / z:-2 / z:-3 chain numbering but
  accidentally omitted enemy `levelKind`. Their numeric z values are therefore
  kept unchanged; the loader reconstructs map identity, including recognizing
  Crypt Level 2 at z:-2 from its saved home-tile information.
- **pre-v11** saves can still require the old depth migration
  (`z:-3 -> z:-2`, `z:-4 -> z:-3`) before assigning the appropriate level kind.

This version-aware migration is important for the Dwarven Fort: a current
z:-3 Ghost must not be mistaken for an old-format z:-3 deeper-cave enemy and
moved to z:-2 during load.
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

## Underground field of view

`src/fov.js` computes a circular eight-tile sight radius around the player on
every underground map: ordinary caves, grottos, the crypt, mausoleum, and
Dwarven Fort. The game has no facing direction, so sight extends in all
directions. Sight lines stop at cave walls, dwarven walls, mountain stone,
crypt niches, boulders, and the Black Pillar. The blocking wall face itself
remains visible. Water does not block sight. Diagonal sight follows tile
centers: an adjacent open diagonal tile remains visible even if the two
cardinal neighbors are walls. Surface visibility is unchanged.

Only terrain in the current field of view becomes discovered. Never-seen tiles
are black on the main canvas and fogged on both minimaps; previously seen tiles
remain on the main canvas under a 50%-opaque black overlay, visibly lighter
than unexplored tiles, and remain on the minimaps. The overlay color is defined
in `src/fov.js` and applied by the terrain renderer in `index.html`. Enemies,
ground items, damage effects, inspection tooltips, and enemy range overlays
appear only inside the current field of view, even on explored tiles. Underground
click-to-move paths can use only discovered tiles. Enemy movement and combat
mechanics are unchanged; this feature controls the player's information.

The existing per-level discovery grids are saved and loaded as before. A
cached field of view is recalculated when the player moves or the active map
changes, rather than on every animation frame. This module uses no random
numbers, so replay RNG consumption stays unchanged. The approach follows the
wall-aware field-of-view concept in rot.js, implemented locally without a
runtime dependency.

Therefore:

> Existing map data does not imply that the player has discovered that location.

---

# 69. UI Controls

Current desktop controls include:

| Key | Action                                                         |
|---|----------------------------------------------------------------|
| WASD | Move                                                           |
| Q/E/Z/C | Diagonal movement                                              |
| Arrow keys | Move                                                           |
| Space | Inspect / interact                                             |
| F | Forage / search / special pickup / dig (in sand with a shovel) |
| T | Wait                                                           |
| Tab | Inventory                                                      |
| M | Map                                                            |
| K | Save                                                           |
| L | Load                                                           |
| Escape | Close overlays                                                 |
| Control | Show enemy ranges                                              |
| Caps Lock | Lock enemy ranges                                              |
| + / - (including numpad) | Increase / decrease game tile size               |
| Mouse wheel over game canvas | Increase / decrease game tile size           |
| G | Debug/god mode                                                 |

Tile size starts at 40 canvas pixels and changes in four-pixel steps from 20
to 96. Desktop recomputes the camera's tile count from available stage width
and height, keeping 7–50 tiles horizontally and sizing the canvas to complete
tiles. A cramped window caps the effective tile size so the canvas fits. On
coarse-pointer layouts the 16-column baseline scales with tile size (also
bounded to 7–50 columns), while the existing vertical drag still controls
visible rows. Pointer hit testing uses the canvas's actual displayed-to-buffer
ratio. Zoom is presentation-only: it does not change world coordinates,
gameplay RNG, save data, or the separate world-map zoom. Rasterized terrain
and item image caches are rebuilt when tile size changes.

Wheel zoom listens only on the game canvas: scrolling over the message log,
inventory, trade panels, or other scrollable content keeps its usual behavior.
The separate full-map wheel zoom still applies when the map is open. Ctrl/Meta
wheel remains available for browser zoom. Small trackpad deltas accumulate
before each tile-size step.

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
- two-finger pinch on the game canvas to change tile size (20–96 canvas pixels)

The game-canvas pinch uses the starting finger distance and snaps to the same
four-pixel tile steps as `+`/`-`. Pinching out enlarges tiles; pinching in
shrinks them. Lifting either finger suppresses a tap or one-finger row resize
until the gesture ends. The full-map pinch continues to zoom the map only.

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

## Rule E - Death behavior is explicit

Normal death remains a Temple recovery. Optional Permadeath deliberately changes
the model: the world persists while the character is replaced and leaves a
recoverable body.

## Rule F - Mysteries are stateful

Mysteries often progress through actual interactions and world state rather than being disconnected lore.

---

# 73. Features Explicitly NOT Current

Unless the implementation changes, do not assume the following exist:

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
- [x] Volcanoes and lava fields
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

# 79. Digging

Digging is performed with `tryDig()`. The forage key (`F`) automatically calls the digging action when the player has a shovel and is standing on sand.

## Rules

- Digging requires a shovel.
- Pressing `F` while holding a shovel and standing on a `sand` tile automatically digs.
- Pressing `F` on any non-sand tile does not dig; it uses the normal forage/search/special-pickup behavior instead.
- The player can dig only while standing on a `sand` tile.
- Attempting to dig on any other tile logs:
  ```text
  You can only dig in sand.
  ```
- The tile is recorded in `dugSandTiles` and immediately redrawn so the darker sand becomes visible.
- Digging the same treasure-map location does not create another casket if the casket is already present in the player's inventory or on the current level.
- The treasure-map location takes priority over the normal digging loot table.
- A world-generated `buriedgear` or `buriedartifact` object takes priority over
  the normal digging loot table but not over the treasure-map location. It
  remains completely hidden until that sand tile is dug.

## Treasure-map reward

<details>
  <summary>Treasure-map reward</summary>

When the player digs at the treasure map's marked X:

- An `Old Rotten Casket` is added directly to the player's inventory.
- The casket is not placed on the ground.
- The treasure-map completion state is set, removing the Gravedigger NPC and
  updating his grave's description; the grave itself remains present.
- The following message is logged:
  ```text
  Your shovel strikes something hard. Beneath the sand lies an old rotten casket.
  ```

</details>

## Normal digging loot

<details>
  <summary>Normal digging loot</summary>

If the dig is not at the treasure-map location, a roll from 1 to 100 determines the result:

| Roll | Result |
|---|---|
| 1–5 | Find a stone |
| 6–8 | Find 1 gold coin |
| 9 | Find Amber |
| 10 | Find a Seashell |
| 11 | Find a rusted spoon |
| 12 | Find a pair of old, worn boots, which are discarded |
| 13 | Find a bone |
| 14 | Find a broken shovel handle |
| 15–16 | A Scarab emerges beside the player, if a valid adjacent tile is available |
| 17–100 | Find nothing |

</details>

Amber (worth 20g) and Seashell (worth 10g) are stackable inventory items.

## Scarab spawning

On the Scarab result:

- The game searches the eight adjacent tiles.
- The destination must be walkable.
- The destination must not contain a living enemy on the current level.
- The destination cannot be the player's current tile.
- The Scarab is created from the `Scarab` entry in `ENEMY_TEMPLATES`.
- No fallback enemy template is used.
- The Scarab's HP, attack, defense, speed, and other properties come from that template.
- If no valid adjacent tile exists, no Scarab is spawned and the game logs:
  ```text
  You hear something moving beneath the sand, but nothing emerges.
  ```

Successful Scarab spawn message:

```text
Something bursts from the sand beside you - a scarab!
```

## Visual and turn effects

- Digging immediately calls `render()` so the dug-sand appearance is visible.
- The final digging action calls `render()` and `updateHud()`.
- Treasure-casket discovery also refreshes the rendered game state immediately.
- Digging consumes the normal action/turn flow of the calling interaction.

---

# 80. Status Vocabulary for Future Development

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

# 81. Future Feature Review Format

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

# 82. Canonical Rule

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

---

# 83. Replay System

**Status: IMPLEMENTED**

An opt-in **Save replay** checkbox sits next to Permadeath on the race-select
screen. It is per-character: choosing it starts recording; a new character
always starts unrecorded unless the box is checked again.

## Storage

The replay payload is stored inside the normal save as:

```text
save.replay = {
  version: 1,
  initialState,
  actions: [],
  rng: [],
  _rngCallers: []
}
```

The replay `version` is independent of the game's `SAVE_VERSION` (currently 13).
The replay field is written only while replay recording is active for that
character; saves made without recording do not gain an empty replay structure.

`initialState` is captured when the run truly begins, immediately after
character creation, after the world/spawn/enemies already exist. The snapshot is
deep-cloned before recording continues. This is important because
`buildSaveObject()` contains live gameplay object references; storing those
references directly would allow later inventory/equipment/merchant/enemy changes
to mutate the supposed starting state and make playback begin from the wrong
state. Playback restores this snapshot through the normal load path rather than
using a separate replay-specific world format.
The mausoleum fix added `mausoleumHutPos` to normal saves as an additive field
alongside `villageHuts` and `cemeteryTombstones`. That change did not itself
require a save-version bump because older saves can continue to load without the
field; the loader falls back to the existing odd-name relationship when
possible. The current game save version is 13 for later compatibility changes,
including explicit enemy `levelKind` persistence.

## Recorded actions

Replay records gameplay actions at their shared gameplay-function entry points,
not raw keyboard events. Current action types are:

- `move` - one requested grid movement, including movement into an enemy (attack),
  an NPC (interaction), or an otherwise non-walkable destination;
- `inspect` - inspect / surroundings action;
- `forage` - normal forage/search/loot action;
- `dig` - shovel digging, including the sand+shovel `F` shortcut;
- `skipTurn` - wait action;
- `talk` - currently Old Hunter direct interaction;
- `buy` / `sell` - Merchant transactions;
- `herbalist` - mushroom purification or potion creation;
- `equip` / `unequip` - equipment changes;
- `blackKey` - Black Key equip/unequip state change;
- `openCasket` - opening the Old Rotten Casket;
- `useItem` - consumable use and artifact identification.

Inventory-dependent actions carry a stable `replayId` for the relevant item.
Array indices are retained as fallbacks for compatibility, but playback first
resolves the recorded item identity so inventory reordering from previous actions
does not silently target a different item. Replay IDs are assigned to gameplay
items and persist through saves/replays.

Actions are recorded from the actual gameplay functions shared by keyboard,
mouse/canvas, and touch input. UI-only input, held modifiers, CapsLock, save/load
shortcuts, and character-name typing are not replay actions. An action entry does
not necessarily mean that a turn was consumed: for example, a blocked movement
or the wait-limit refusal can still reproduce as the same requested action.

## RNG

The single central `rng()` is the recording/substitution point. `randInt`,
`pick`, and `chance` already route through it. While recording, every returned
RNG value is appended to `replay.rng`. While playing back, `rng()` consumes the
corresponding recorded value instead of advancing `rngState`.

The replay also stores per-action RNG boundaries (`_rngStart`/`_rngEnd`) and,
for recorded actions, optional `_rngCallers` diagnostic information. Playback
compares the number of RNG values consumed by each action with the recorded
boundary. This catches the first action whose RNG consumption has changed,
rather than allowing the sequence to drift silently until a later visible result
differs.

If playback requests an RNG value beyond the recorded array, playback stops and
reports a desynchronization. `window.lastReplayDiagnostic` contains the latest
diagnostic, including the action index, expected/actual RNG counts, relevant
actions, and actual RNG values/caller information when available. A completed
replay also reports whether it consumed exactly the recorded RNG length.

**Determinism rule:** any gameplay condition that controls whether an RNG call
happens must depend only on replayed gameplay state, not rendering/browser state.
In particular, enemy/NPC wandering and Temple fleeing use the same fixed
20-tile active-range helper (`enemyIsOnScreen`) based on Chebyshev distance from
the player, rather than the live camera viewport. NPC wandering performs this
range check **before** `chance(ENEMY_WANDER_CHANCE)`, so an NPC outside the active
range consumes no wander RNG. This keeps enemy and NPC wandering on the same
spatial rule and prevents window size, device, sidebar state, or other viewport
differences from changing RNG consumption during playback.

Old Hunter quest generation also uses the seeded RNG path (`chance()`), so its
procedural quest selection is included in the recorded RNG sequence.

## Playback

**Show Replay** (HUD, next to Save/Load) appears whenever replay data exists for
the current save. Clicking it:

1. keeps the pre-replay state in memory;
2. closes transient overlays and clears pathing/pending movement;
3. loads the replay's deep-cloned `initialState` through the normal load path;
4. disables recording while watching so playback cannot append new actions;
5. resets `turnCount`, `consecutiveWaitTurns`, and `oldHunterQuestSerial` to their
   run-start values;
6. executes the recorded actions in order through the normal gameplay functions.

The current inter-action playback delay is **169 ms**. The delay is between
whole actions, not individual RNG calls: an action's movement/combat/loot and its
enemy/NPC turn happen together before the next action is scheduled.

The replay button becomes **Pause Replay** while playing and **Resume Replay**
while paused. Normal keyboard, canvas-click, and touch gameplay input is inert
while playback runs. Loading a save still works and cancels playback first.

A replay is therefore a deterministic re-execution of the recorded player action
stream against the recorded starting state and recorded RNG outcomes; it is not
a video recording or a sequence of pre-rendered frames.

## Not implemented (by design, v1)

Export/import, sharing, thumbnails, scrubbing, fast-forward, variable speed,
frame stepping, video/screenshots, a dedicated Stop button, and restoring the
pre-replay state from the UI remain unimplemented. The pre-replay snapshot is
kept in memory for the current playback session but is not exposed as a restore
operation.
