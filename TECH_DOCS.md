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
- normal-mode death returning the player to the Temple rather than ending the character

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

The world is generated **only after Begin confirms a valid name and race**.
Startup loads content and essential images under a rotating skull with
`Loading...`; after confirmation, the overlay says `Generating world...`.
The overlay blocks input and allows a paint before synchronous generation.
Character race and Permadeath are set before world generation. Invalid names
and duplicate Begin clicks cannot start a second world.

The optional **Cursed world** setting is described in [§85. Cursed World](#85-cursed-world).
Loading a save bypasses character creation.
On narrow windows, the character form scrolls within the space below the HUD
so its fields remain accessible without covering the Load button.

There are currently **10 races**.

## Human

**+20% XP gain**

## Halfling

**-1 AGGRO range from all enemies; +20 percentage points to forest concealment (spotting checks),
including against alarmed unaware enemies (alarmed but not chasing the player).**

## Catling

**+3 SPD, plus +1 SPD at levels 5, 10, 15, ...**

## Dwarf

**+3 DEF, plus +1 DEF at levels 5, 10, 15, ...**

## Orc

**+3 ATK, plus +1 ATK at levels 5, 10, 15, ...**

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

**1 HP every 5 turns at levels 1–4, every 4 turns at levels 5–9, and every
3 turns from level 10 onward.** The rate stays at 3 turns at higher levels.
The interval uses the global turn count, and regeneration stops at full HP.
The race parameters are `regenEvery: 5`, `regenLevelStep: 5`, and
`regenMinEvery: 3` in `content/races.json`.

---

# 4. Player Stats

## Bestiary

The Bestiary is opened with **B**, from the map sidebar, or from the Character
inventory panel. It lists each base species the current character has killed
at least once and shows its total count. Its introduction reports how many
different species have been slain (zero for an empty list), rather than the
total number of kills. Entries run from weakest to strongest
by base `ATK + DEF + SPD + GRACE`, with alphabetical ties. Prefixes and
random equipment do not affect the order; records without a species template
follow the known species. On desktop, hovering or keyboard-
focusing an entry shows its portrait above the Bestiary overlay; on touch
screens, tapping a row expands a small portrait below the name and count. The
touch layout keeps the title and close control visible while entries scroll.
Desktop retains the compact modal and hover portrait. This character-specific
record is separate from the online Graveyard. Prefix variants share their
base-species entry; unencountered species are hidden. The list reads the saved
per-species kill counters and refreshes when opened. It does not affect gameplay,
RNG or replay actions. A new permadeath character begins with an empty Bestiary.

## Mobile character sheet and level feedback

Mobile inventory includes a **Character** button. It opens a fullscreen sheet
showing the character’s current stats, learned skills, kill achievement and
other existing counters. **Back to inventory** returns to the same backpack;
the close button exits inventory. The sheet uses the inventory’s existing
input blocking and consumes no turn or RNG. Desktop keeps its collapsible
character stats. Mobile sheet navigation is presentation state, not save data.

A level gain displays a brief animated **Level Up!** notice with the resulting
level and total max-HP, ATK, DEF, SPD and GRACE gains. Multiple levels earned from one XP
award share one notice. The notice requires no dismissal, does not intercept
input, and never delays stat changes or turns. Reduced-motion preferences
suppress the animation. Replay playback suppresses the notice; recording and
live play use identical gameplay rules. Loading or starting another character
clears any outstanding notice.

## Strongest kill achievement

The Character sheet records the strongest individual enemy killed by this
character, showing its actual name and strength. It uses the same
`ATK + DEF + SPD + GRACE` formula as Bestiary sorting, evaluated on that enemy’s
permanent spawned stats, including prefixes and equipped gear. Equipped weapon
GRACE replaces natural GRACE; defensive gear GRACE penalties apply. Terrain,
Alarmed, Enrage, Charge and temporary flight bonuses do not inflate the record.
HP, rarity and abilities are outside this ranking. Equal scores retain the first
kill. No kills displays “None”.

The record survives normal deaths, current saves and replay; a new character
starts without it. Every actual death snapshots it before penalties or character
reset and sends it as `strongest_enemy_killed` to the Graveyard. Expanded online
records show the same achievement. This trophy grants no gameplay bonus.

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

Crossing strictly below 20% HP while alive logs `You're hurt badly.` in red
once, immediately after the damage-source message. Recovering to 20% or above rearms it; exactly 20% is not low HP. Fatal
hits do not emit this warning. Damage and healing resolve the warning state
immediately, and its latch is saved/restored in current saves and replay
snapshots. Death closes inventory for both ordinary and permadeath characters.

On desktop, the HUD labels **ATK**, **DEF**, **SPD**, and **MF** expose short hover
tooltips explaining their gameplay role. These are presentation-only and do not
change stat calculations.

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
- player GRACE bonus increases by 1 on every fifth level (`floor(level / 5)`)
- Orcs gain +1 ATK, Dwarves +1 DEF, and Catlings +1 SPD on every fifth level
- derived stats are recalculated as needed

Therefore, the level-based SPD gains occur at levels 2, 4, 6, 8, etc., while
level-based GRACE gains occur at levels 5, 10, 15, 20, etc.

Racial scaling is `3 + floor(level / 5)` in the race's specialty stat. It stacks
with ordinary level gains. Death can create XP debt but does not lower level,
so it does not remove racial milestones. New characters restart at +3.

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

`B` opens or closes the Bestiary. On touch layouts, use the Bestiary button in
the Character inventory panel; desktop players can also open it from the map
sidebar.

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
click-attack shortcut. The sword SVG is decoded with the essential startup
images, before character selection opens, and the cursor uses that preloaded URL.

Walking into an NPC triggers interaction instead of entering its tile.

## Swimming

`src/swimming.js` owns the separate persistent `swimming` skill,
`swimmingPractice`, consecutive `swimTurns`, position anchor and drowning flag.
Ordinary characters start with Swimming unknown (zero); trying to enter deep
`water` logs **You don't know how to swim.** without advancing time. Merlings
swim naturally without skill levels, practice or a time limit. Rivers are
explicitly **not** swimming terrain; their existing player/enemy half-submerged
rendering remains unchanged. Ice and frozen rivers are also excluded.

Learning Swimming 5 allows five safe consecutive deep-water movements/waits;
the entry step counts as the first. Each subsequent movement/wait costs
`max(1, round(playerMaxHp() * 0.05))` HP and can kill. Only genuine successful
deep-water movement earns practice: every 100 points increases Swimming by one
with rollover and an improvement message. Practice is applied **before** testing
the drowning threshold, so an improvement can prevent that step's damage.
Waiting, failed movement, teleports, level changes and rendering earn no practice.
Disabling god mode while already in deep water keeps adjacent water traversable
until reaching shore or dying, but blocks entering water from land again without
Swimming. The consecutive-wait cap does not trap a non-Merling in deep water;
they can wait until drowning even with god mode's boosted HP.

Entry, first drowning and reaching shore have transition messages, not per-step
spam. Leaving deep water says "You reach the shore and catch your breath." Landing, homecoming, death and level transitions clear the current swim
session but preserve learned skill/practice. Non-Merlings cannot use inventory
items in deep water, including consumables, equipment, and readable items;
blocked actions spend neither items nor turns. Drowning obscures the lower two
thirds of the player sprite (ordinary swimming obscures half), and a fatal step
logs **You have drown.** Drowning records the death in water, then places any
remains on the nearest available walkable shore **after** the Temple respawn;
breadth-first search and fixed direction order settle ties deterministically.
The condition-based Drowning badge has no countdown and disappears whenever
the danger no longer applies.

God mode bypasses movement/swimming restrictions only while enabled. Pressing
**G** again disables it, resets the
current swim session, unlearns Swimming and clears practice and any pending lesson.
Non-Merlings can ask the Hermit for another lesson on an already completed quest,
without respawning its predator. Merling reward entitlement is preserved. As before,
god-mode stat grants and revealed exploration are not rolled back.

The character sheet displays Swimming as **Unknown**, its numeric value, or
**Natural** for Merlings, refreshing when skill or race state changes.

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
level-dependent healing).

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

The default surface map is **260 × 260 tiles**. Cursed world can roll
a different area; see [§85. Cursed World](#85-cursed-world).

The world is procedurally generated.
New worlds have a land boundary to the north; inland lakes remain possible.
Loaded saves retain their stored map dimensions.

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
- In tile-image mode, grassland trees use `img/tiles/grassland-tree.png` plus
  optional `specialTiles.grassTree.variants` from `content/rendering.json`.
  The image choice is deterministic from map coordinates, and the selected
  sprite can additionally be mirrored horizontally and scaled to 0.92, 0.96,
  or 1.0. These cosmetic variants consume no gameplay RNG and require no extra
  save fields; the same coordinate therefore renders the same way after loading.
  Special-tile image variants are explicitly preloaded alongside their base
  image so grassland-tree variants work offline and do not pop in late.
- A foraged ordinary-forest tile remains `forest` terrain and keeps all normal
  forest mechanics, but tile-image mode reuses `img/tiles/forest-tree.png` with
  a muted brown/olive filter. ASCII mode and both minimaps use the existing
  `specialTiles.foragedForest.color`. The distinction comes from the persisted
  `foragedTiles` set rather than from a new terrain ID.
- A dug sand tile remains `sand` terrain. In tile-image mode the normal sand
  image or sand-to-grass connector is drawn first, then
  `specialTiles.dugSand.image` (`img/tiles/sand-dug-overlay.png`) paints a small
  central hole. The overlay is clipped to the inner half of the tile, so all
  outer edges remain pixel-identical to the original sand/connector image.
  ASCII mode retains the darker `specialTiles.dugSand.bg` background. The
  existing `dugSandTiles` set persists the state across save/load.

Underground terrain includes cave floors, walls, entrances, stairs/passages, marble, dwarven walls, rubble, and dwarven structures.

Water and river tiles clip grounded creatures to their upper half on every
level, including underground. Flying creatures retain their flight rendering.

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
restamps this tile at the fort gate on z:-3, including a current-schema map
encoded with `caveup`; it leaves all other deep-cave `caveup` entrances unchanged.
`marble` is a terminal image base, so neighboring surface tiles cannot replace
it while composing overlays. Ancient Forest trees use the same grass ground
as ordinary forest; no separate dark-ground image tile is used.

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

Every 4 cold turns:

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

Visiting Temple ground (including the bell tower) cures poison before the
turn's poison tick, even at full HP or without new XP. Homecoming also cures
poison. Curing alone does not consume eligibility for a later HP blessing.

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

The remaining huts receive unique random names drawn without replacement from
`HUMAN_NAMES` (duplicate entries in the source list count only once). The odd
tombstone name is reserved and cannot be assigned to an ordinary hut. The
odd-name hut is not selected by a later random roll and must not be replaced by a guessed
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

In tile-image mode, Ancient Forest trees use grass ground beneath their image,
without a separate dark-ground image or the tile's dark fallback color. When
the player is behind an Ancient Forest tree, its opaque terrain draw is skipped.
The character is drawn at its normal opacity, then the foreground tree is drawn
once at 70% opacity, letting the character show through it. Other trees retain
their normal opacity.

</details>

## Cemetery
<details>
  <summary>Details</summary>

A cemetery generated near the Ancient Forest.

It contains several tombstones, including one anomalous tombstone.

</details>

## Dwarven Fort / Dwarven Ruins
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

The fort is the dedicated generic-chain level at **z:-3** and now serves as
the entrance complex (**D0**) for the deeper Dwarven Ruins. Fort enemies and
ground objects use `level: -3`, `levelKind: 'chain'`, and the fort's
`caveIndex` so they remain associated with the correct map identity.
The surface `dwarvengate` enters z:-3 directly, and the fort's
`dwarvenfortexit` returns directly to the same surface gate. Fort generation
does not place intermediary entrances, stairs, cave templates, or cave
descriptors on z:-1 or z:-2; the normal caves on those depths keep only their
own passages.

Every generated world also places one dedicated dwarven descent on a distant,
reachable marble tile inside D0. It leads into a persistent **3–5-floor**
Dwarven Ruins stratum generated at the same time as the world. The new floors
continue the generic depth chain from **z:-4** downward: three floors end at
z:-6 and five floors end at z:-8. Each intermediate floor has one dedicated
up stair and one dedicated down stair; the coordinates match across adjacent
levels so changing depth does not move the player laterally. The final floor
replaces its down stair with a visible but non-descending collapsed work stair
toward the future Deep Mines.

The stratum length and every layout decision use the seeded game RNG. Floor
metadata includes its 1-based dungeon floor, total floor count, and normalized
progress:

```text
progress = floorIndex / (floorCount - 1)
```

where `floorIndex` is zero-based inside the Ruins. This gives 0 on the first
floor and 1 on the final floor for 3-, 4-, and 5-floor strata alike. After room
rectangles are positioned, the generator builds a **room graph before carving
corridors**. The graph chooses the entrance, main route, exit, **2–4 optional
branch rooms**, and up to two seeded loop edges (`loopProbability: 0.18`). Only
then are corridor edges carved into terrain. The exit must be at least **4
room-graph edges** from the entrance and at least **28 walkable tiles** away after
carving; these are separate configuration knobs. Loops are rejected if they
would shorten the room-graph route below the configured minimum. Localized
collapses then damage the layout, and progression-gate selection runs against
the finished topology so a loop can never turn the mandatory gate into a
decorative bypass. Shared room-spacing and corridor-carving helpers are used by
the existing Fort and the deeper Ruins rather than maintaining separate copies
of those primitives. A failed floor layout is retried deterministically up to
**12 times** before the world-generation attempt is rejected.

The reusable dungeon-package layer owns the rules that later strata should share:
room graphs, stable feature/lock IDs, vault selection and entrance constraints,
encounter-family/depth filtering, tactical role ordering, depth loot budgets and
tier bias, trap configuration, shortcut registration, and base stratum
validation. Package configuration supplies the content-specific choices (for
example native enemy biomes, valid encounter floor tiles, key item kind, lock
namespace, vault definitions and room tactical-role preferences). Dwarven Ruins
therefore remains the first content package, while dwarven tile art and story
props stay content-specific instead of being baked into the reusable rules.

Ordinary room entrances can receive dwarven doors. The generator now finds
actual two-tile corridor crossings through each room perimeter and only places
a door if closing both leaves makes the room interior unreachable from the
floor entrance. A collapsed wall or alternate corridor cannot leave a decorative,
pointless door. The default chance remains **45% per eligible entrance**; both
leaves start closed. A closed
door blocks movement, sight, and projectiles. Bumping an unlocked closed door
opens that one leaf and consumes one player turn without moving the player; the
next movement action can pass through it. Open doors remain open permanently.
Humanoid enemies treat unlocked closed doors as traversable routes but spend an
action opening the encountered leaf before moving through it. Non-humanoids do
not open them, while ethereal traversal retains its existing ability to pass
through otherwise blocked terrain. Auto-travel may route through a known closed
door and accounts for the extra opening action. Door state lives directly in the
Ruins terrain map, so save/load and replay restore the exact open/closed state.

Every Ruins floor now also contains one **two-leaf mandatory progression gate**
on the route from its entrance to its deeper exit. The gate is selected only
when closing both leaves genuinely disconnects those two points, so it cannot be
bypassed through another corridor. Each gate has an independent **30% chance**
to generate already breached/open. A pre-breached gate needs no key. Otherwise,
exactly one matching **Dwarven Key source** is generated on the reachable side of
the gate using one of four seeded scenarios:

```text
champion carrier       -> the guaranteed floor Champion carries the key
searchable remains     -> the key is recovered while searching dwarven remains
trap-guarded side room -> the key lies in an optional room with a nearby trap
locked side room       -> a reachable local key opens the side room containing the progression key
```

The dependency validator proves that local keys can be collected in order and
that the progression key can be obtained without crossing its own gate. No
arbitrary nested key chains are generated. Killing a key-carrying Champion drops
the ordinary key item through the normal corpse/drop path; searchable remains use
the existing remains interaction. Bumping an intact gate while carrying its
matching key consumes the key, opens both leaves, and costs **1 turn** without
also moving the player. Key-opened gates use a distinct persistent **intact open**
terrain state; only gates generated pre-breached use the ruined/breached state.
Mandatory gates cannot be breached with a weapon.

Locked terrain blocks movement, sight, and projectiles until opened or breached.
Keys are tied to a specific physical lock rather than acting as universal
Dwarven keys. Auto-travel may plan through a locked door/gate only when the
matching key is already carried; it never chooses weapon breaching on the
player's behalf. Humanoids can still open ordinary *unlocked* doors, but do not
unlock or breach locked doors. Ethereal movement keeps its existing terrain-
passing exception.

Each ordinary doorway that receives a door then has an independent **10% chance
to be locked**. The roll is made once for the two-leaf doorway, never per leaf:
when a doorway locks, **both adjacent leaves share one lock and one matching
key**. This prevents a locked leaf from being bypassed simply by opening its
sibling. Generated ordinary-door keys are placed only on marble reachable from
the floor entrance while all generated locks are still closed, so a key cannot
spawn behind its own lock or form a circular dependency with another lock.

A matching key opens both leaves in **1 turn** and is consumed. Without the key,
the player may instead attempt to breach the struck leaf with any equipped
weapon; bare fists cannot attempt a breach and do not consume a turn. A weapon
attempt always costs **1 turn**, does not consume or damage the weapon, and
succeeds with:

```text
P(breach) = min(1, weapon ATK / 100)
```

For example, a 10 ATK weapon has a 10% success chance per attempt. Each actual
weapon-breach attempt, successful or not, also has an independent **25% chance**
to Alarm one enemy: the nearest eligible non-Alarmed monster on the current
level, with no distance limit. Distance ties resolve deterministically. Already
Alarmed or otherwise ineligible monsters are skipped, so repeated noisy attempts
can progressively wake multiple enemies. A breached ordinary door leaf remains
permanently passable; breaching one leaf does not automatically destroy the
other.

Gate/door terrain state and ground keys use the existing persistent level/item
data, so saves and replay restore opened/breached locks, remaining keys, and
consumed keys exactly. No additional save-schema field is required for locks.

The Ruins stratum also contains one permanent **shortcut lift**. Its upper
platform is on D1, is guaranteed reachable from the D1 entrance with all locks
still closed, and begins unpowered. The deeper endpoint is selected with
seeded RNG from the configured normalized depth range **50–100%** of the
stratum, which means D2–D3 for a three-floor stratum and D3–D5 for a five-floor
stratum. A wall-mounted control lever is generated beside the deeper platform.
Bumping that lever costs **1 turn**, permanently powers both endpoints, changes
the lever itself to a persistent pulled/locked-down terrain state, and enables
two-way inspect-to-travel between the two fixed platforms. The D1 side
cannot activate the lift remotely. Lift travel itself follows the existing
level-transition convention and does not add a separate combat turn.

Lift endpoint/lever coordinates and powered state are persisted explicitly in
the generic dungeon-shortcut registry; runtime lever activation and inspect-to-travel
always resolve the lift from that registry rather than a Ruins-only mirror variable.
The platform and pulled-lever terrain states are also stored in the ordinary
Ruins map grids. Lift metadata was introduced in save schema **34**. Distinct
open-gate/pulled-lever terrain states use save schema **36**. Room descriptors,
vault descriptors, selected encounter families and tactical enemy role metadata
use schema **37**. Schema **38** adds the persistent room graph, progression-key
scenario metadata and enemy-carried dungeon-key state. Schema **39** replaces the
Ruins-specific lift save field with a package-tagged dungeon shortcut registry and
persists each deep level's dungeon-package identity, so later dungeon strata can
reuse shortcuts without another dedicated save field. Current game version is
**v67**, save schema **39**; older saves are rejected.

### Dwarven Ruins traps (batch 5)

`src/dungeonTraps.js` places reusable spikes and wall-arrow mechanisms in
**corridors outside room footprints**, after stairs, locks, keys and the shortcut
lift are generated. Each floor targets
2–4 traps, stopping early if no safe placement remains. Placement uses seeded
RNG once; entering or loading a floor never regenerates mechanisms. Triggers
stay at least four Chebyshev tiles from entrances, generated keys and lift
platforms. Every staircase, key and lift retains a route avoiding all triggers;
keys reachable before unlocking also retain their original accessibility.
Trap triggers are separated by more than three tiles. Existing monsters cannot
start within two tiles of either a trigger or emitter. Summoning uses the same
`DungeonTraps.safeSpawn` predicate, as does Ruins encounter placement. Triggers
and emitters also keep that clearance from authored room tactical slots, so
traps cannot displace their intended encounters.

Spikes trigger on entry by players and enemies, including flying and ethereal
creatures. Forced movement also triggers them. Remaining on a trigger or
restoring a save does not. A pressure plate fires a cardinal wall arrow toward
the first creature in its lane, regardless of who stepped on it. Closed doors,
projectile-blocking terrain and ground items stop the arrow; an item on a
creature's tile intercepts before that creature. The emitter remains a wall.
Automatic player travel excludes all trigger tiles; manual movement is allowed.

Balance lives in `dungeons.dwarvenRuins.traps` in `world_generation.json`:
spike ATK 8, arrow ATK 10, mechanism speed 5, arrow range 12. Damage uses normal
DEF reduction, armor glancing and base critical rules; arrows also use the
ranged dodge multiplier. Traps grant no player XP, kill count, bestiary entry,
strongest-kill record or immediate quest-kill credit. Normal loot and stolen
items still drop, and enemy fatal-hit protection still applies. Resolution and
RNG finish before presentation; projectile animation never determines a hit.

Each deep level saves its `traps` array, including stable ID, trigger, type and
optional emitter, direction and range. Schema 35 restores it directly alongside
terrain, including replay initial snapshots.

ASCII glyphs are `^` for spikes, `_` for pressure plates and `!` for wall-arrow
emitters. Image mode uses the generated trap atlas and a separate pressure
plate tile. Rendering supports `sourceRect: [x, y, width, height]` for atlas
regions without changing the gameplay tile. Shared underground FOV now honors
`TILE.blocksSight`, so closed doors, levers and arrow walls block sight.
The supplied service worker now precaches the trap module and images for offline play.

### Dwarven Ruins encounters (batch 6)

Each floor now has a coherent seeded population. From its walkable area, the
stratum rolls one density growth rate in **10–15% per floor** and budgets threat
as `round(walkable tiles / 65 × (1 + floorIndex × growth))`. This
changes the base from **75 to 65 walkable tiles per budget point**, roughly
15% more threat for the same-size floor. Enemy tier costs
that many budget points. This increases the number and composition of threats
without silently inflating monster stats. A small minimum budget ensures the
required family mix and a roamer can appear even on a small floor.

A floor selects **2–4 dominant encounter families** (goblinoids, undead,
marauders, or cave predators when their members are depth-eligible). Template
rarity still weights members inside the family, while rarity 0.1 or lower is
excluded from choosing a family as a dominant population. Organized rooms draw
from one family at a time; a broader eligible pool supplies occasional roamers,
which retain their species wandering behavior. The configured default is exactly
**one Champion per floor**, usually leading an escort in a remote or tactical
room. Other prefixes begin at **11%**, rise by **2.5 percentage points per
floor**, and cap at **28%**; random prefix rolls exclude Champion.

Cave species may appear when their tier's depth permits it. Surface species
must opt in using a `z-N` biome tag, meaning depth N or deeper. Current tier
thresholds are tier 2–3 at D1 (z:-4), tier 4 from z:-6. These tags only affect
dungeon eligibility; names, stats and ordinary surface biomes stay intact.
Entrances keep an eight-tile enemy clearance. Encounter spawns also avoid
trap triggers and emitters within the configured two-tile trap clearance,
existing objects and other monsters.

A fleeing creature that actually moves on a Ruins floor may warn nearby
eligible monsters within the normal five-tile Alarmed range. The closest
eligible target gets a seeded **50%** chance if the same species, or **10%**
otherwise. Hesitation or opening a door does not count as movement. Once
alarmed, the target is not rolled again. This can make luring a wounded enemy
past a guard room risky; preventing its escape or choosing another route are
useful responses.

Enemies, prefixes, positions, tactical role, encounter-family identity, room/vault
identity and wander state are persisted. Loading restores the exact population;
it never regenerates tactical encounters from room metadata.

### Rooms, vaults, tactical encounters and loot (v61)

Every non-entrance room receives one gameplay archetype: **Barracks, Armory,
Dining Hall, Library, Forge, Workshop, Dormitory, Burial Chamber, Temple,
Prison, or Storage**. Normalized floor progress changes their weights from early
habitation toward military/industrial rooms. On the final floor, Barracks,
Armory, Dormitory and Prison weights receive an additional **1.45x defensive
multiplier**. Archetypes change encounter budget/roles, lock likelihood, loot
placement/quality and physical furniture rather than being cosmetic labels.

Each floor then selects **1–2 major vaults** from ten procedural concepts:
fortified barracks, trapped armory, treasury, library archive, prison block,
flooded cistern, collapsed hall, sealed tomb, forge killzone and barricaded
dormitory. Vault definitions constrain normalized progress, minimum/maximum
room dimensions, allowed entrance count, internal zones, door/lock requirement,
allowed trap mechanisms, tactical roles and loot modifiers. Dimensions and
orientation still come from the containing procedural room, so a repeated
concept does not produce a copied fixed rectangle. These constraints affect the
actual generated room: locked/closed vault entrances are enforced, trap-biased
vaults restrict mechanism types, and internal patterns create shelves, water,
rubble, defensive furniture or bars. A prison-block vault creates a real barred
cell partition with its own locked cell door and separately reachable local key,
rather than decorative bars only. Ordinary **Prison** archetype rooms use the same
cell subdivision and always place a reachable key for their locked side cell.

Vault entrance limits are measured from the actual room graph, including loop
connections, so a one-entrance archive/tomb cannot silently gain a second route.
Vault internal zones are oriented from the room entrance and actively drive
furniture, water/rubble patterns and tactical slot preference instead of existing
only as labels.

Vault and ordinary-room tactical slots are geometric roles, not monster names:

```text
backline  -> far from the entrance with a clear projectile line
frontline -> near entrances and chokepoints
group     -> clustered interior positions
champion  -> guarded tactical position
any       -> remaining valid interior positions
```

A vault backline slot is strict: when a shooter-capable family is available the
floor ensures such a family participates, and the backline spawn is forced to
be an actual ranged variant with normal starting ammunition. Frontline/group
slots suppress the ranged role even when the underlying species can normally
roll as a shooter. Champion placement cannot consume a backline slot, and room
props are kept out of the clear firing lane from backline to entrance. This lets
the same fortified architecture produce different species compositions without
hard-coding a Goblin or Skeleton to a coordinate.

Room furniture is mechanical terrain. Barracks/dormitories use beds, libraries
use sight-blocking shelves, dining halls use tables, storage/forge/workshops use
crates, and prisons use bars. Vaults add their own patterns, including water in
cisterns and rubble in collapsed halls. Fortified barracks and barricaded
dormitories drag bed frames into chokepoints. Final-floor dormitories have a
strong additional barricade chance. Furniture never replaces stairs, keys,
doors or the protected room center/door approach used by traversal validation.

Environmental damage now rises continuously with normalized floor progress: rubble
pressure scales **0.9x → 1.3x**, remains **0.8x → 1.5x**, breached-door pressure
**0.75x → 2.0x**, dormitory barricade chance **5% → 22%**, and optional defensive
debris **3% → 16%** before the final-floor override. The final floor additionally
raises rubble to at least **1.65x**, ordinary breached-door pressure to at least
**5x**, environmental remains to at least **2.5x**, and multiplies barricade
pressure by **2.2x**. It always reserves at least two major vaults: one optional artifact
vault plus a separate fortified-barracks, barricaded-dormitory, forge-killzone,
or collapsed-hall defensive scenario. This prevents the final floor from rolling
an ordinary-looking treasury/tomb-only profile. The result should visibly read as
a failed holdout: more broken defenses, bodies, rubble and improvised chokepoints,
while the sealed lower transition still points only toward continued excavation
in the future Deep Mines.

Ordinary Ruins loot uses a depth budget rather than one fixed chest:

```text
lootBudget = 2 × (1 + floorIndex × 0.10)
tierBias   = min(0.55, floorIndex × 0.12 + room/vault bonuses)
adjustedWeight(tier) = baseWeight(tier) × (1 + tierBias × (tier - 1))
```

The budget is rounded to whole ordinary chests; major vaults can add an extra
budget point. Room/vault multipliers bias where rewards are concentrated, so
armories and treasuries attract more of the floor's reward budget than dining
halls or dormitories. Existing chest generation, Magic Find and identification
rules still resolve the contents.

Exactly **one additional guaranteed artifact chest** exists in the Dwarven
Ruins stratum, on the final floor, separate from the existing Fort artifact. The
final-floor generator first reserves a reachable optional treasury/sealed-tomb/
trapped-armory vault **and a specific free tile inside it** before props, traps,
or enemies are placed. If none of those normal artifact vaults fits, the
farthest suitable optional branch is promoted into a dedicated **Guarded Artifact
Chamber** with its own locked entrance, trap options, guard/frontline/backline
roles and reliquary zone. The chest is reserved before population, so later
props, traps or enemies cannot consume its location. The artifact chest is not
required for descent.

After traps, encounters and Ruins loot are populated, a final deterministic
validator is invoked by real new-world generation before the world is accepted. Vaults that
require a closed or locked entrance are only assigned where that entrance is structurally
meaningful; ordinary Prison rooms must successfully build their barred side cell during
floor generation rather than relying on a later whole-world rejection. It verifies
floor count, room-graph and physical entrance/exit separation, room/vault
connectivity, trap-safe mandatory traversal, solvable key dependencies, the
Champion guarantee, valid enemy terrain/clearance, ground-object conflicts,
exactly one final-floor artifact, the lift endpoints and the sealed Deep Mines
continuation. Structural floor failures are retried by the floor generator; a
late population failure discards the world attempt and regenerates it, up to
**3 configured attempts**. Enemy IDs restart for every discarded attempt so the
number of retries cannot alter stable IDs or replay ordering in the accepted
world.

Tile and ASCII modes distinguish intact-open and breached progression gates.
`dwarvengateopen` uses `img/tiles/dwarven-gate-open.png`, never the breached-gate
sprite. The pulled lever likewise has dedicated `dwarven-lever-pulled.png` art.
Room furniture/barricades are mechanical terrain with dedicated ASCII glyphs,
colors, inspect strings, and 40×40 tile art for beds, dragged-bed barricades,
bookshelves, tables, crates, and prison bars. These images are precached for
offline play alongside the dedicated open-gate and pulled-lever sprites. The
Dwarven Key uses `img/tiles/dwarven-key.png` consistently on the ground and in
inventory.

The surface `dwarvengate` must remain spatially distinct from ordinary cave
entrances. After the fort is generated, every non-crypt random cave entrance is
compared with the fort gate using Chebyshev distance. If any entrance is within
**15 tiles** (`max(abs(dx), abs(dy)) <= 15`), the current world attempt is
invalidated and the **whole world is regenerated**. Because the fort's z:-3
`dwarvenfortexit` uses the same world-space coordinate as the surface gate, this
also prevents an ordinary cave ascent/exit from appearing confusingly close to
the fort exit underground.

The fort contains **5–9 searchable skeletal remains**, spread over its marble
floor without overlapping existing props. These are separate from decorative
dwarven remains on rubble. Each skeleton has an independent **10%** chance of
containing the usual skeletal-remains loot, decided during world generation:
there is no guaranteed reward (5–9 skeletons yield 0.5–0.9 rewards on average).
The other 90% can be searched once but are empty. Searching never rerolls loot
eligibility. If a discovered weapon is automatically equipped, its discovery
message appears before the automatic-equip message; equipping still resolves
immediately in the same action. Skeletons, their loot flags, and searched state persist in saves
and replay; loot stays on the skeleton's own level and map identity.

Fort ghost placement is guaranteed from actual valid floor candidates rather
than from a fixed number of blind coordinate attempts. During world generation,
the game collects marble tiles inside the fort, excludes tiles too close to the
entrance, and randomly chooses up to **8 distinct positions**. Therefore a
normally generated fort receives eight Ghosts as long as at least eight valid
candidate tiles exist.

The guaranteed artifact chest is created as a tier-5 chest with
`artifactGuaranteed: true` on the fort's z:-3 chain map. During save loading,
the loader also repairs current-schema fort data with transitional fields: it reconstructs the
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
z:-3 Dwarven Fort / D0
  ↓
z:-4 ... z:-6/-8 Dwarven Ruins (3–5 floors)
  ↓
sealed continuation toward the Deep Mines
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
On the first crypt level, their image is layered over crypt floor, rather than
the surface grass fallback.
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
and is not generated as a normal random cave. It is also D0, the entrance
complex for the Dwarven Ruins.
Its `dwarvenfortexit` tile leads directly to the surface `dwarvengate` at the
same coordinates. No fort-related transitions are stamped on z:-1 or z:-2.
A generated `dwarvenstairsdown` elsewhere on reachable fort marble begins the
Ruins chain at z:-4. Generic `caveup` tiles still ascend to the preceding cave
depth, including any encountered elsewhere on z:-3.

## z:-4 and deeper: Dwarven Ruins

The Dwarven Ruins add **3–5 persistent chain levels**, selected once during
seeded world generation. They therefore occupy z:-4 through z:-6, z:-7, or
z:-8 depending on the rolled floor count. Each floor is stored as another
`deepLevels` entry rather than in a parallel dungeon-state system.

Adjacent floors use dedicated dwarven stair tiles. `dwarvenstairsdown` uses
ASCII `>` and `dwarvenstairsup` uses `<`; tile-image mode uses dedicated dwarven
stone stair art rather than cave-stair artwork. The sealed Deep Mines
continuation uses `X` in ASCII and its own collapsed-shaft image. Inspecting the
sealed continuation describes the old excavation but does not change z-level.
The world-map level selector derives arbitrary chain depths instead of assuming
that z:-3 is the deepest possible level, and labels discovered Ruins floors by
their generated floor number.

The generated Ruins map and its single serialized local map intentionally share
the same runtime object. Persistent terrain mutations on these floors, including
ordinary doors changing from `dwarvendoorclosed` (`+` in ASCII) to
`dwarvendooropen` (`/`), keyed progression gates changing to a distinct intact
open state, and the lift lever changing to its pulled state, therefore use the existing `deepLevels[].caveMaps` save
representation without a second copy drifting out of sync. Closed doors also use
the same opacity rule for player FOV and enemy sight and the same terrain blocker
rule used by ranged projectiles. Each floor has its own discovery grid.

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

## Decorative cave props

Ordinary caves on z:-1 and z:-2 contain cobwebs, small stalagmite clusters and
small mushrooms. These are cosmetic overlays: they do not block movement,
vision or projectiles, alter terrain bonuses, slow actors, offer harvesting or
loot, or participate in quests. Crypts, mausoleums and the Dwarven Fort are
excluded. A clear floor tile at least three tiles from every entrance or stair
is eligible, provided it initially contains no creature or ground item.
Webs additionally require cave walls on two perpendicular sides and orient
their sprites toward those walls.

Placement uses a stable hash of world seed, depth and coordinates, without
consuming gameplay RNG. At eligible corners, webs have an 18% placement chance;
eligible floor positions have separate 1.8% stalagmite and 2.5% mushroom bands.
One position holds at most one decoration. The generated placement is saved
and restored directly, survives normal deaths and reused-world characters, and
is cleared and regenerated for a new world. Props draw below items and actors
and respect underground visibility. Their ASCII glyphs are `%` (web), `^`
(stalagmites) and `♣` (small mushrooms).

## Guaranteed underground Vampire

New worlds contain at least one Vampire in either crypt level or an ordinary
cave that actually contains living Giant Bats after population. Bat caves may
qualify at any depth; the mausoleum and Dwarven Fort do not qualify. An existing
Vampire in an eligible area satisfies the guarantee; a surface Vampire does not.
Otherwise seeded RNG chooses uniformly among areas with safe sites and then
among their best corner sites. The Vampire uses its normal template stats,
abilities, humanoid equipment, and level-appropriate wandering rules.

Sites must be reachable within that area's stored and playable maps, on ordinary
floor, and free of monsters and ground items. They must be at least eight tiles
from every entrance, exit, or staircase by both walking distance and Chebyshev
distance. Among eligible tiles, keep those in the furthest quarter of walking
distance, then prefer the greatest number of neighboring cave-wall tiles.
"Dark corner" means this secluded geometry; it adds no lighting mechanic.
The generator reports an error rather than silently omitting the guarantee if
no safe site exists. This is a one-time new-world population pass; loading or
replaying a saved world restores its Vampire without spawning a replacement.

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
Goblins, Skeletons, Kobolds, Skinks, or Ratlings. Their ordinary population is
24–36 enemies before other cave spawns. The **Things Below** trait raises this
range to 30–44. Ordinary enemies prefer positions beyond an eight-tile
Manhattan clearance from every staircase and at least three tiles apart
(Chebyshev distance), using other open positions only when space runs out.
Grottos spread them among side rooms; burrows use the same clearance and
spacing on open passages rather than the scenario's chest-guard placement.
Eight to twelve chests are distributed
through the cave, alternating tier 3 and tier 2; there are also four loose
supplies (two potions and two scrolls). No Giant Rats, Giant Bats,
Wolves, Boars, or Giant Bugs are selected for new z:-2 cave scenario groups.
Each populated generic z:-2 cave also gets one guaranteed Champion of its
scenario species, surrounded by four unprefixed guards of the same type, and
one rarity-weighted tier-3 or tier-4 enemy. Species with rarity ≤ 0.1 are
excluded from this extra-threat pool; missing rarity means weight 1. The
remaining species use their configured relative rarity weights. This replaces
uniform selection, and applies to every ordinary deep scenario, including
Ratling burrows. Scenario groups, Champion guards, and dedicated story spawns
retain their own rules. The group is reserved before normal
spawns in a chamber far from the staircase; the stronger enemy is also placed
away from it. These are in addition to the normal 11% prefix
rolls and carry the same level and cave identity as the group.

Fungus can spawn naturally in ordinary caves on **z:-1 and z:-2**. Each
populated cave gets an independent **35% chance for one Fungus** and a further
**15% chance for a second**. After all ordinary caves are populated, the game
counts underground Fungus across both levels and tops up random valid cave-floor
positions until there are at least **3 Fungus total in the whole world's ordinary
underground network**. This is a world-wide minimum, not a per-cave minimum.
Crypts, mausoleums, and the Dwarven Fort are not used for this guarantee.

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
scenario introduction appears upon descent. Current-schema data without scenario IDs
retains its original caves and generic entrance text; loading does not
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

Brown deep-cave floor textures alternate horizontal and vertical mirroring by
world-coordinate parity so neighboring edges match without new art or RNG.

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

The surface Dwarven Fort entrance has a separate reachability invariant. Natural Fort candidates must border the same 8-direction walkable component as the Temple; a fallback mountain outcrop may likewise only be created on that component. After the Fort gate is stamped, cave/fort generation defensively flood-fills from the Temple again and rejects the world if the gate is not reachable. This prevents visually valid mountain pockets from containing an inaccessible Fort entrance.

If either surface connectivity condition fails, the world attempt is regenerated.

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

The initial surface world attempts to spawn about one random enemy per
**260 eligible walkable tiles** (before any Cursed world density multiplier), configured by
`content/map_config.json` (`spawning.surfaceTilesPerEnemy`). Eligible tiles
exclude water, other impassable terrain, the outer two-tile border, major
landmarks, the Temple's safe area, and the bell guard's exclusion area.
This preserves roughly the former density of:

```text
120 enemies across ~31,250 eligible tiles in a 260 × 180 world
```

The target scales with actual eligible land on each generated world, not just
its dimensions. Guaranteed Liches and other special spawns are additional.

Tier distribution:

| Tier | Weight |
|---|---:|
| 1 | 42% |
| 2 | 26% |
| 3 | 17% |
| 4 | 10% |
| 5 | 5% |

After the tier is chosen, the species inside that tier is selected by its
`rarity` weight. `rarity` is a **relative weight**, not an absolute spawn
percentage: a template with `rarity: 0.02` receives one fiftieth of the weight
of a same-tier `rarity: 1.0` template. Surface world traits may further adjust
non-humanoid weighting.

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
GRACE
Tier
Rarity weight
Aggro
Biomes
Evade capability
Humanoid status
Flying status
Wander mode (`"homeReanchored"`, `"homeReturn"`, `"roam"`, `"far"`, or `false`) and optional `homeRadius`
```

Enemies with **AGGRO 0** are passive. They never acquire the player, never
chase, never retaliate after being hit (including invisible attacks), and
`enemyAttackPlayer()` defensively refuses to let them attack. This is
data-driven, so any current or future enemy with AGGRO 0 receives the same
passive behavior automatically. `Fungus` should use AGGRO 0 and `wander: false`
so it remains both harmless and stationary.
Passive AGGRO 0 enemies cannot become Alarmed.

Spawned enemies receive approximately 95%–105% random variance from template stats.

---

# 19. Enemy Roster

Current templates contain **75 enemies**. The all-uppercase species are the
ultra-rare additions; each uses `rarity: 0.02` and otherwise participates in
the normal tier, biome, distance, prefix, wandering, and stat-variance rules.

### Tier 1

- Fungus
- Giant Rat
- Giant Bat
- Snake
- Scarab
- Monkey
- Boar
- Wolf
- Hogwyrm
- Giant Bug
- Wasp
- Jackal
- Hyena
- Vulture
- Witherpod
- Giant Toad

### Tier 2

- Wretchling
- Skink
- Kobold
- Ratling
- Goblin
- Skeleton
- Cobra
- Giant Crab
- Scorpion
- Dreadling
- Slurper
- Lizard Man
- Nymph
- Centaur
- Tokka
- Grivkin
- Murkspawn

### Tier 3

- Owlbear
- Serpent
- Lion
- Chupacabra
- Harpy
- Ghoul
- Ghost
- Orc
- Imp
- Gargoyle
- Sasquatch
- Yeti
- Mummy
- Gravehound
- Giant Spider
- White Tiger
- Minotaur
- Ogre
- Myrka
- Skerva
- Kveld
- Tulla
- Grivel
- Bog Spitter
- Thornmaw

### Tier 4

- Cyclops
- Banshee
- Oculus
- Wyvern
- Manticore
- Vampire
- NULK
- SKELD
- DRUSK
- GAUR
- ASHFANG
- MIREHOWL
- Spineback
- NHALUUN

### Tier 5

- Gorgon
- Serpent Queen
- Lich

The new rare species are distributed by theme rather than by rarity alone:
river/mire creatures favor river and forest, cave creatures favor hill/cave,
and the strongest rare predators sit in Tier 4. `Bog Spitter` currently uses
ordinary melee combat; no acid/spit projectile rule exists yet, so its name
does not silently grant a ranged attack.

---

# 20. Enemy Special Properties

Every monster template and live monster has an `abilities` array. `fly` and
`evades` are ability IDs rather than separate boolean fields. For example,
Giant Bat has `["fly", "evades"]`; Wolf has `[]`. Existing shooter eligibility
IDs (`shooterStones`, `shooterArrows`) remain in the same array. An enemy with
none of these abilities has an empty array. Each spawned instance owns a copy,
so changing one monster cannot alter its template or other monsters.

Movement, evasion, track generation, projectile obstruction, and flying render
order check this array. This refactor does not change combat chances, terrain
rules, shooter assignment, or consume additional RNG calls.

Save format **25** stores each monster's abilities and restores them exactly,
including an explicitly empty array. Replay initial states use the same save
format; shooter role and remaining ammo continue to be separate instance state.
Saves from previous formats are rejected; no old boolean conversion is added.

## Flying

Flying enemies can traverse terrain that includes:

- normal walkable terrain
- boulders
- water

## Evading

Enemies marked as evasive have a 30% chance to evade a visible player's attack.
Without `trueSight`, they cannot use this special dodge against an invisible
player (or the unseen player in god mode); ordinary hit/miss and glancing-hit
rolls still apply.

If possible, they move to a nearby open tile after evading.
If that dodge is followed by the existing slow-enemy loss-of-interest roll
in the same enemy response, the log says `The <enemy> hesitates after its
dodge, giving you a moment to act.` instead of the generic chase line. The
evasion marker is consumed in that response whether or not the roll succeeds;
it is not a persistent status or a new chance to hesitate.

Evasive species are those whose templates include `evades`: Giant Bat, Monkey,
Wasp, Vulture, Grivkin, Harpy, Skerva, Vampire, and NHALUUN.
Scripted flying Ghosts in the dwarven ruins also receive `evades`.

## Ethereal

Ghost has `ethereal` ability. All Ghost spawn
paths, including scripted dwarven-ruin Ghosts, receive it. Ethereal creatures
can traverse any in-bounds terrain, including walls, mountains, water, and lava.
Actor collision and map boundaries still apply. Chasing, wandering, evasion,
and invisible-attack retreat use the same terrain permission. Walls retain
their normal sight-blocking behavior.

Only an equipped weapon with a modifier prefix (`weapon.mod`) can damage an
ethereal creature. Any weapon modifier qualifies, including non-damage modifiers;
weapon tier, name, and unprefixed ATK alone do not. Unarmed and mundane attacks
consume their normal player action but deal no damage, use no combat RNG, and
show an immunity marker with an explanatory message. They do not trigger an
extra strike or an invisible-attack reaction. Magical attacks use normal combat
rules, including evasion, misses, armor, critical hits, and timing.

An adjacent Ghost remains attackable even while standing inside a wall: player
movement checks for a creature target before checking destination walkability.
It may attack from that position, so no special floor-only attack restriction is
needed. Spotting messages (including wandering acquisition) are logged only when
the enemy's tile is visible in the player's current underground FOV. Surface
spotting messages retain their normal behavior.

## True sight

Oculus has `trueSight`. It treats an invisible player as visible for detection,
chasing, attacks, evasion, and combat timing, including god-mode invisibility.
It does not use unseen-attacker panic or the reduced-accuracy wild retaliation
when struck by an invisible player. Ordinary sight, aggro range, forest
concealment, and sacred-ground behavior continue to apply. True sight alone
does not reveal the player through walls or disable invisibility for other
enemies. No special true-sight log is added.

Both abilities use the existing copied and serialized enemy `abilities` arrays.
No new persistent flags or save-format change is required; the current format
remains 25. New worlds receive the updated template abilities, while saved
instances restore their recorded arrays exactly.

## Death shield

Gargoyle has `deathShield`: its first lethal hit leaves it at exactly **1 HP**
and permanently consumes the shield. No kill, XP or loot is awarded until it
actually dies. A subsequent hit can kill it immediately, including an extra
strike in the same turn. Healing does not recharge the shield.

The shared inspection tooltip shows **Death Shield · ready/spent**. Activation
logs `The <name>'s death shield shatters, leaving it barely alive!` and displays
a brief **Shield breaks!** effect. Survival resolves before animation and
extra strikes; the spent flag is initialized and saved for replay determinism.

## Gang power

Goblin, Skink, and Kobold have `gangPower`. Each gains +1 melee ATK per other
living member of its own species within its current effective aggro range,
measured from that monster using maximum horizontal/vertical tile distance.
The range includes normal Alarmed, race, and world modifiers. Other species,
dead creatures, and creatures on other levels or level kinds do not count.
Prefixes do not change species. Allies need not be aware or have gangPower
itself, and proximity does not require line of sight.

The bonus is added to base ATK before defense and any Enrage or Charge
multipliers. Projectile ATK and XP remain unchanged. Ally movement, flight,
death, and changes to aggro range immediately change the bonus, including
between attacks in the same turn. Inspection on desktop and mobile shows
"gang power (+N ATK)" when N is positive and includes it in effective ATK.
There are no additional log messages.

The bonus is derived from current creatures and their saved abilities,
positions, HP, and aggro state. Base ATK is never changed; loading or replaying
cannot stack bonuses. No new persistent flag, RNG roll, or save version is added.

## Wounded fleeing

Grivkin, Goblin, and Monkey have `flee`. When alive and strictly below 10% of
maximum HP, they retreat instead of melee, shooting, or pursuit while the player
is detected within active aggro range. They attempt one step per turn onto a
free tile allowed by their usual movement rules that increases tile distance
from the player. A fixed direction order resolves equally distant choices.
Each valid escape attempt has a 10% seeded chance to hesitate and stay put;
this still consumes their action, without attacking. No speed bonus or extra
pursuit action applies. With no distance-increasing escape tile, normal combat
resumes, so an adjacent cornered monster fights back. Once outside aggro range,
normal wandering rules apply. Invisible players retain ordinary detection rules.

Crossing below the threshold on a surviving hit logs "Wounded <name> retreats!"
once per crossing. Subsequent hits below the threshold do not repeat the message;
fatal hits do not log retreat. Inspection shows Fleeing while the condition holds.
Healing to 10% or higher ends it. The condition is derived from saved HP, maximum
HP, and abilities, adding no persistent flag or save-version change. This is
separate from rare-beast sighting flight and does not alter its rules.

## Thief

Some humanoid monsters have "thief" ability.
On each adjacent enemy turn (including diagonal adjacency), a visible player with an eligible backpack item
has a **10%** chance to lose one randomly selected backpack entry. Equipped
items are excluded; quest items are eligible. A selected stack loses exactly
one unit. Entries have equal selection probability, regardless of stack size.
A monster with no legal neighboring step that increases its Chebyshev distance
from the player is cornered and cannot attempt theft. Empty packs, invisibility,
and corners consume no theft roll. Failed rolls permit normal combat and can
retry next eligible turn; each monster can succeed only once.

Success replaces the attack, logs “<name> has snatched <item> from you and runs
away!”, and immediately grants one guaranteed escape step. Thereafter the thief
reuses wounded retreat movement: one step per enemy turn, with a **10%** chance
to hesitate. Carrying a stolen item keeps it fleeing regardless of HP, aggro
range, or player invisibility; it does not wander home or shoot while it can
escape. A cornered thief resumes ordinary combat and tries retreating again
when an escape tile opens. Off-level thieves remain paused like other enemies.
Sacred-ground protection still prevents new thefts.

A thief with an empty equipment slot immediately equips stolen weapons, shields,
or armor and logs "<name> has equipped <item>." Monsters have one equipment slot;
existing gear is never replaced by theft. Consumables and artifacts are carried
without equipping. This uses the normal enemy equipment rules, including weapon
ATK/GRACE, armor or shield DEF, and their usual speed penalty. Bonuses apply once,
so a cornered thief can fight with the stolen gear. Death returns it through the
bag only, without an additional equipment drop. Replacing that gear later through
existing permadeath loot rules leaves the stolen item recoverable in its bag.

A red bag marks the carrier on the map in tiles and ASCII mode and in desktop
and mobile inspection. Victory skull and Alarmed markers shift to avoid overlap.
Killing it drops a bag at its exact map location; forage recovers the original
item, preserving quest IDs and all other properties. Other monster loot is
unchanged. Theft, random selection, hesitation, and movement resolve through
seeded game rules before animation, so saves and replay preserve the outcome.

## Enrage

Orc, Minotaur, Owlbear, Lion, and GAUR have `enrage`. While alive and strictly
below 30% of maximum HP, their melee ATK is multiplied by 1.25 before defense.
At exactly 30%, the bonus does not apply. Healing to the threshold or higher
ends enrage; entering the low-HP range again can trigger it again.
The bonus combines multiplicatively with Charge and normal critical damage;
an enraged Minotaur charging across one gap tile uses `base ATK * 1.25 * 1.25`.
Ranged projectile ATK and XP rewards remain unchanged.

Crossing the threshold after an attack logs "Pain drives <name> into a rage!".
Healing out of enrage logs that its rage subsides. Fatal hits do not trigger
an enrage message, and subsequent hits below the threshold do not repeat it.
Enraged creatures have a red outline in tile and ASCII modes. Inspection shows
Enraged (ATK +25%) and their current effective ATK on desktop and mobile.

Enrage is derived from current HP, maximum HP, and the saved abilities array;
base ATK is never mutated. Save/load and replay therefore restore it directly,
without an additional persistent flag, extra RNG, or save-format change.

## Critical knockback

Ogre and Cyclops have `knockback`. A damaging critical melee strike pushes a
surviving player one tile directly away from the attacker, following Charge's
knockback rules. Any free walkable destination is eligible, including deep water
without Swimming. Walls, blocked diagonal corners, trees, occupied destinations,
and map edges prevent the push; no alternate destination is chosen.
Ordinary hits, misses, glancing hits, and ranged criticals do not push. There is
no extra proc roll or damage bonus beyond the normal critical damage. Once a
push moves the player out of melee range, weapon-timing extra attacks cannot
follow. A blocked push leaves normal melee timing unchanged.

Forced water entry applies normal drowning immediately and grants no swimming
practice or walking progress. Visibility and camera position refresh immediately.
The ability uses existing enemy ability serialization and replay, with no new
persistent flag or save-version change.

## Charge and Pull

Boar and Minotaur have `charge`; Giant Spider has `pull`. While the player is
visible and within current aggro range, an aligned target at distance two or
more can trigger a rush. Alignment is horizontal, vertical, or an exact diagonal.
Both endpoints and every intervening tile must be walkable grass without trees,
other creatures, or NPCs. Diagonal routes cannot cut blocked corners. There is
no additional distance cap beyond aggro range. Invalid routes use no RNG.

Charge has a 60% chance per eligible turn. The monster crosses the gap and stops
adjacent, then makes one melee attack with half the usual dodge chance. Before
defense, ATK is multiplied by `1 + 0.25 * (distance - 1)`, where distance counts
orthogonal or diagonal tile steps. Distance two gives +25%; three gives +50%.
Normal armor, glancing, and critical rules still apply. A surviving player hit
for positive damage is pushed one tile directly away, if traversable and free.
Water is eligible even without Swimming; blocked destinations prevent knockback.

Pull has a 70% chance to connect. The web drags the player onto the grass tile
adjacent to the spider, followed by one ordinary melee attack. The attack can
miss normally and gains no damage bonus. Both abilities replace normal movement
and allow no extra weapon-timing attacks or speed pursuit actions that turn.
There is no cooldown or use limit; fleeing along a clear grass line remains risky.

Forced player movement refreshes visibility and camera position, grants no steps,
swimming practice, or voluntary-movement quest progress, and does not collect
items or trigger transitions. Forced water entry consumes water endurance and
can immediately cause normal drowning damage. Combat and relocation resolve
synchronously; animations never determine rules or RNG. Existing abilities and
swimming state are saved and replayed normally, with no new persistent flag.

## Summoning

Templates with `summon` in `abilities` specify `summonSpecies` and `summonAmount`,
with optional `summonStrength` (defaults to 1) and `summonMsg`. On each active
aggro turn, the monster has one 10% seeded chance to summon instead of its
normal attack, shot, or chase. It can succeed only once in its lifetime.
Being out of melee range does not prevent a roll. Losing sight/concealment,
invisibility, passive behavior, and sacred-ground or rare-beast fleeing use
their normal non-combat paths without summon rolls. Extra attacks or pursuit
actions do not create additional summon rolls that turn.

| Summoner | Summoned species | Count roll | HP/ATK/DEF multiplier |
|---|---|---|---|
| Lich | Skeleton | 1–3 | 1 |
| Serpent Queen | Serpent | 1–2 | 1 |
| Wolf | Wolf | 1–3 | 1/3 |

Spawns use free adjacent tiles, excluding the player, living monsters on the
same level, and surface NPCs. The summoned species' normal traversal rules
apply. Roll the count uniformly, then reduce it to available space. If no tile
fits, the summoner keeps its ability and performs its normal action instead.
Successful placement consumes the summon and the summoner's action.

All summoned stats come directly from the named species template, independent
of the summoner's prefix, gear, damage, or victory bonuses. Only HP, ATK, and DEF
scale with `summonStrength`, rounded to the nearest integer; HP and ATK have a
minimum of 1, DEF a minimum of 0. SPD and GRACE are unchanged. Summons have no
gear or prefixes. They copy template abilities except `summon`, preventing
recursive Wolf packs. Skeletons retain their normal shooter assignment chance.

Summons inherit level, level kind, and cave identity. They become Alarmed
immediately on creation, using the normal Alarmed lifetime and AGGRO bonus;
this also prevents invisible opening-critical bonuses against them. They cannot attack in
the creation turn, including through immediate retaliation or ranged attacks;
they may act on the next enemy turn. Placement and rules resolve before visual
effects. A floating Summoned! marker and a log show the actual spawned count.
Lich and Serpent Queen use the default hand-wave message; Wolf uses its custom
hungry-howl message. Messages support `<name>`, `<amount>`, and `<species>`.

Summons use normal XP and species loot rules. With the existing stat-based XP
formula, an unprefixed summoned Wolf yields 12 XP versus 17 for a normal Wolf.
The summoner's
`summonUsed` flag and each summoned creature's `summonedTurn` initialize explicitly,
persist in current saves and replay initial states, and restore exactly.
Re-entering levels and loading never reset the once-only summon. Saves also
preserve an explicit GRACE value when present. Older save formats are rejected.

## Lifesteal

Vampire has the `lifesteal` ability. Each damaging melee hit independently has
a 30% seeded chance to heal it for `floor(effectiveDamage / 3)`, capped by its
missing HP. Effective damage is HP actually removed: 30 damage heals 10 HP,
but a 30-damage hit against a player with only 6 HP heals 2 HP. Hits for 1–2
effective damage heal nothing. Extra attacks roll independently; misses,
zero-damage hits, and ranged attacks do not roll. Lethal hits resolve lifesteal
before the normal killer victory bonus. Healing logs its actual amount,
shows a green +HP number, and updates the Vampire's HP display. Existing enemy
HP and abilities serialization preserve it without an additional status.

## Poison

Scorpion, Manticore, and Wyvern have the `poison` ability. Each melee hit
dealing positive damage has a 30% seeded chance to poison a surviving player,
including damaging glancing hits and extra attacks. Misses, zero-damage hits,
and ranged attacks do not apply poison. No poison RNG is used for other enemies.

Duration is calculated at application from current effective maximum HP:

`max(1, round(min(40, floor(maxHP × 0.20)) × (0.90 + RNG × 0.20)))`

For 100 maximum HP this gives 18–22 turns; at 200+ HP it gives 36–44 turns.
The variation applies after the base cap. A new application replaces the remaining
duration with a fresh roll, without stacking damage. Later max-HP changes do not
recalculate existing poison.

Poison deals 1 HP at the start of each subsequent enemy turn, before freezing
and regeneration. It remains active while waiting, invisible, on temple ground,
or after changing levels. Entering Temple ground cures it. It can kill; death is recorded as poison and clears
the status without crediting a monster victory. The application itself causes
no immediate poison damage.

Healing Herb and Life Potion logs describe the consumed item and healing first,
then confirm that poison leaves the body. Poison application and refresh logs
omit duration; the active-status counter still shows remaining turns.
Eating a Healing Herb or drinking a Life Potion clears poison before consuming
the item's turn, including at full HP. Temple ground and Homecoming also cure poison; other healing does not.
Enemies may poison the player again during that turn's response. Application,
refresh, damage, cure, and natural expiry have message logs. The active-status
strip shows Poisoned with turns remaining and explains its cure.

Remaining turns initialize to zero, persist in format 25 saves and replay initial
states, restore exactly, and reset for death and new characters. All rolls and
ticks resolve in game rules, independently of animation timing.

## Humanoid

Humanoid enemies wear randomly assigned gear (weapon/armor/shield) which they drop on death. 
All enemies have natural GRACE and can take part in grace checks while unarmed; 
an equipped enemy weapon overrides natural GRACE. A non-Buckler shield or an armor with `gracePenalty: 1` 
lowers an equipped enemy's natural GRACE by 1 for combat timing (minimum 1). 
This makes armed and unarmed combat more varied, allowing the more graceful combatant to strike twice. 
The player must still wield a weapon to take part in grace checks.

## Ranged shooter variants

Selected species can roll a ranged combat role when the enemy instance is created.
The role is instance state, not a separate species and not an inherent attack used by
every member of that template. Eligible templates declare either `shooterStones` or
`shooterArrows` in their `abilities` array; the shared chance and projectile tuning
live in `content/enemy_config.json`.

| Eligible species | Projectile | Projectile ATK |
|---|---|---:|
| Monkey, Goblin | Stone | 3 |
| Kobold, Lizard Man, Nymph, Centaur, Skeleton | Arrow | 5 |

Each eligible spawn has a **50%** seeded-RNG chance to become a shooter and starts
with **10 shots**. Shooter role and exact remaining ammunition persist with the
enemy. A fired projectile always consumes one shot, including dodges and glancing
hits. A blocked line consumes no ammunition. At zero shots the bow indicator
disappears and the enemy immediately uses its ordinary species AI on later turns.

Ranged attacks ignore the monster's ordinary/equipment/prefix-modified ATK and use
only projectile ATK. GRACE does not participate. DEF mitigation, monster critical
chance/multiplier and armor glancing use the normal combat rules. Ranged dodge is:

```text
min(100%, normal melee dodge chance × 2)
```

A genuine non-glancing ranged hit deals at least 1 damage after ordinary mitigation;
a glancing hit may remain at 0. Critical and glancing outcomes are mutually exclusive.
Shooter prefixes still modify their normal stats and melee behavior, but do not change
the fixed projectile ATK. While ammunition remains, desktop/mobile inspection appends
a red bow marker (`🏹`) to the existing species name; the marker disappears at zero shots.

## Deadly

The Deadly enemy prefix raises critical-hit chance to 15%. Critical hits double damage.

## Carrion Instinct and sleeping Wyverns

Vulture, Hyena, Jackal and Chupacabra have `carrionInstinct`. While the living
player is strictly below 20% of current maximum HP, they gain +1 effective AGGRO
and multiply ATK by 1.25, after gang power and enrage. At exactly 20% the effect
is inactive. These derived effects never mutate saved base stats. Enemy tooltips
show the ability and whether it is active.

Wyverns spawn asleep with 25% probability on walkable dry ground, never water,
river or lava. Sleeping Wyverns are grounded, stationary, marked `zzz`, and use
half their base AGGRO before race, world and Alarmed modifiers. Each game turn
within 20 tiles gives a 1% spontaneous wake chance. Successfully spotting the
player in their reduced range wakes them immediately; invisibility, line of
sight and forest concealment still apply. A landed hit or nearby combat alarm
also wakes them. Waking restores flight and makes them Alarmed; they never
return to sleep. Save schema **32** introduced the sleeping boolean,
including replay initial states; loading never rerolls it.

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
The letter comes from the final word of `baseName` (or the display name for
legacy enemies without one), so multiword monster names retain the right
initial after a prefix (for example, Tough Giant Rat uses `r`).
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

### Shooter combat decisions

Shooting is part of the normal awareness/chase lifecycle rather than a separate AI
mode. Special/forced behavior (passive monsters, invisibility handling, Temple
fleeing, etc.) remains higher priority. Once normal pursuit is valid, a shooter with
ammunition uses this order with the monster's **current effective AGGRO**, including
Alarmed and racial/world modifiers:

```text
adjacent -> normal melee
exactly on outermost AGGRO line -> normal chase
inside outer AGGRO line + shooter FOV + clear shot -> fire
inside range but blocked/no shooter FOV -> normal chase
zero ammunition -> completely normal monster behavior
```

A shooter without `trueSight` never fires at an invisible player and never kites/backpedals. Existing
extra pursuit behavior may still produce the same move-then-attack style sequence the
normal AI already permits, but a ranged attack itself does not grant another action.

Shooter visibility uses the deterministic sight-line geometry in `src/fov.js`; normal
AGGRO still supplies the distance boundary. A clear projectile line is an additional,
separate requirement. The same deterministic tile line is used for collision and the
visual projectile. Intermediate projectile blockers include forest/ancient forest/
taiga, grassland trees, hills (unless the shooter stands on a hill), walls, mountains,
boulders, columns/statues, closed dwarven doors and other solid structures. Open doors
do not block shots. The attacker's own tile and the
player's target tile are not rejected merely for being forest/hill. Living ground
monsters and NPCs between attacker and target block the shot; flying creatures do not.
Blocked shots cause ordinary chase/pathfinding, with no friendly fire and no ammunition
loss.

### Forest concealment

On the surface, standing on unforaged ordinary or ancient forest gives the player a
chance to avoid an unaware, unalarmed enemy's first spotting attempt within its normal
AGGRO range. The chance is `min(100%, 33% + 5% × distance in tiles)`, using
Chebyshev distance (so 43% at distance 2 and 53% at distance 4). The roll
uses seeded game RNG. A successful check logs `The trees conceal you from the
<enemy>.` only if that enemy is visible in the main view.

Halflings gain another 20 percentage points (63% at distance 2; 73% at distance
4) and may roll against Alarmed enemies
that have not yet spotted them. For other races, becoming Alarmed cancels a
successful concealment immediately. An enemy already aware of the player
cannot be concealed from, even for a Halfling.

A successful check protects the player's current tile from that enemy's
further spotting checks, including after the enemy wanders or moves closer.
Moving the player to another forest tile permits a new check; waiting or an
enemy's movement does not. Moving out of the forest or foraging the tile ends this concealment immediately.
An enemy leaving and returning to range cannot force another roll while the
player stays on the same tile.
At adjacent distance, the enemy spots or attacks normally. Newly spawned
forest ambushers begin aware, so neither race can conceal from them. Forest
concealment does not shorten AGGRO range. Successful per-enemy
concealment coordinates are saved and restored in replay starting states so
loading does not reroll a stationary player's cover. The character tooltip reports actual
per-enemy successful concealment and the hide probability against the nearest visible
hostile monster. Probability is for a new check, not a reroll of cached cover.
Tooltip rendering never consumes RNG.

### Alarmed

When the player lands a hit on a monster, the struck monster becomes Alarmed
silently, along with each *other* living, nonpassive monster on the same map
within 5 tiles of the struck monster.
This uses Chebyshev distance (diagonal squares count as one), measured from
the monster that was hit, not from the player. A miss or evade does not trigger
the status. Sound needs no line of sight; a glancing hit, including zero damage,
still counts as a hit. Monsters also become Alarmed silently the first time
they spot the player, including when they wander into detection range or first
attack from an adjacent tile. Passive AGGRO 0 enemies remain unaffected.

Alarmed temporarily adds 2 to the monster's effective AGGRO range without
changing its saved base AGGRO. Existing visibility, invisibility, Temple,
pathfinding, and chase rules still apply. A bystander newly Alarmed by the
sound of a hit logs `<name> is alarmed by the sounds of the battle.` only when
visible in the main view at activation. The struck monster and a monster that
first spots the player do not log a separate Alarmed message. Monsters obscured
by underground field of view or outside the viewport still become Alarmed silently; revealing
them later does not produce a delayed message. More hits do not stack the bonus
or repeat the line during the same activation. The tooltip shows a red
`Alarmed (AGGRO +2)` label and the glyph has a white `!` in its top right corner. If a
monster also has a victory skull, the `!` shifts left so both remain visible.

Alarmed ends when the player changes z level or map identity, or when the
monster is more than 20 tiles from the player (Chebyshev distance). It can
activate again after ending. The hit radius and clear distance are configured
as `combat.alarmTriggerRange` (5) and `combat.alarmClearRange` (20) in
`content/enemy_config.json`. Save version 16 introduced each enemy's temporary
Alarmed state and its originating level; older schema versions are rejected.
Both alarm ranges have explicit runtime bindings initialized by `loadContent()`
before gameplay starts; a missing binding prevents content loading in strict mode.

An already-aware enemy standing on the outermost tile of its effective aggro
range has a 30% chance per turn to give up the chase. That outer ring is drawn
with a more transparent red than the rest of the aggro overlay.

Enemies can also lose interest in the chase with a 25% chance per eligible
response if the player's speed is at least twice as high. A successful dodge
immediately before that roll changes only the log text, not the 25% chance or
the existing awareness and turn behavior. Other losses of interest retain
`The <enemy> loses interest in the chase.`

Enemy pathfinding uses breadth-first search and can route around obstacles and other enemies within a detour limit.

If:

```text
enemy SPD > player SPD
```

there is a 25% chance for an additional pursuit action (enemy gets closer to victim or gets an attack turn if it's already close).

Idle enemies can wander.

Enemy templates may define `wander` individually:

| `wander` | Idle behavior |
|---|---|
| `"homeReanchored"` | Randomly wanders using the existing global leash/radius. If a chase carries it beyond the leash, its post-chase position becomes the new home anchor, preserving the original wandering behavior. |
| `"homeReturn"` | Randomly wanders within its home radius, but keeps its original home anchor. If a chase carries it beyond that radius, idle behavior actively paths it back toward home until it is inside the leash again. |
| `"roam"` | Uses the normal random-wander chance but ignores the home leash, so it may gradually travel anywhere its terrain movement allows. |
| `"far"` | On the surface, picks a reachable random walkable tile on the opposite side of the map. Each idle turn has a **40% chance to stay**, **20% chance to move one open tile in a random direction other than the previous tile**, and **40% chance to take one step along the path to its destination**. An obstructed chosen move may still leave it in place. It is not limited by the player's 20-tile wander activation radius. When it reaches the village Temple's **20-tile Chebyshev avoidance radius**, it drops any cross-village destination and retargets toward an edge on its current side of the Temple; while inside that radius, random steps and cached path steps may not move closer to the Temple, so `far` travelers turn away instead of crossing the village. The destination remains fixed after random detours and until reached or invalidated; a detour rejoins the cached path when possible or rebuilds it on the next destination step. Normal aggro, attacks, pursuit, Temple fleeing, and invisible-attack reactions still take priority over travel. |
| `false` | Never performs idle wandering. |

A template value overrides the old global setting. Enemies without an explicit
`wander` property retain the old global behavior as a compatibility fallback:
`wandering.enabled: false` means no wandering; otherwise `wandering.leash:
true` resolves to `"homeReanchored"` and `false` resolves to `"roam"`.
Legacy saves/templates containing `"home"` are treated as `"homeReanchored"`.
When a monster with `"far"` is spawned underground, its instance uses `"roam"`
instead; the surface template remains unchanged. Loading a current-schema
underground `"far"` instance also converts it to `"roam"` through the shared
`enemyWanderForLevel()` helper in the Enemy AI wandering section. A surface traveler's
previous tile is saved so its random branch cannot immediately reverse after
loading; destination coordinates and the remaining cached route are saved too.
The route is gameplay state: rebuilding it after a load can choose a different
path around other creatures, changing future movement and track creation even
when RNG consumption initially matches. Save/load and replay restore the exact
remaining route; normal blocked-step checks still rebuild it when required.

Home-style enemies may also define `homeRadius` per template or per spawned enemy.
If omitted, the global `wandering.radius` is used, currently **1 tile**. This
override applies to both `"homeReanchored"` and `"homeReturn"`.

Enemy template wandering properties are resolved from the loaded
`content/enemy_templates.json` registry when an enemy instance is created, so
normal, cave, special, and ambush spawn paths inherit the species' current
`wander` / `homeRadius` values unless that individual spawn explicitly overrides
them.

Invisibility prevents ordinary detection, pursuit, and attacks. A surviving
enemy hit by an invisible player reacts once instead of wandering on that turn
(section 47). A missed attack causes no reaction, and the enemy can
take its normal idle action; no awareness or chase persists.

Current global wandering settings:

```text
Enabled/default fallback: yes
Chance per turn for homeReanchored/homeReturn/roam: 30%
Far idle turn: 40% stay / 20% random open step except previous tile / 40% destination step
Far village/Temple avoidance radius: 20 tiles (Chebyshev; surface `far` travelers only)
Leash: yes
Default home radius: 1 tile (overridable per enemy/template with `homeRadius`)
Active range for home/roam: 20 tiles from the player (Chebyshev distance)
```

NPC wandering is unchanged and continues to use the existing global settings.

`"homeReanchored"`, `"homeReturn"`, and `"roam"` wandering are limited to enemies/NPCs within the active
range of the player, not to what the camera viewport happens to be showing.
`"far"` is the deliberate exception and remains active anywhere on the current
map. This remains replay-safe because eligibility depends only on game state,
never viewport dimensions. Far-wander target selection and pathing use the
seeded game RNG; the chosen target coordinates are persisted in saves/replay
snapshots so loading does not silently choose a different destination. The village-avoidance
radius is configured by `content/enemy_config.json -> wandering.farVillageAvoidRadius`;
it defaults to 20 if omitted.

Far-path BFS reuses typed scratch buffers and a numeric occupancy snapshot.
Traversal results are cached only within one synchronous search/target selection,
so terrain changes and earlier creatures' moves are reflected in the next search.
After an unreachable candidate exhausts the search, the same predecessor tree
answers the remaining unoccupied candidates. Candidate sampling, RNG consumption,
eight-direction visitation order and shortest-path tie breaks remain unchanged;
scratch data is never saved.

The fixed 20-tile radius replaced the old "is this enemy on screen" check,
which depended on the live canvas viewport (window size, sidebar
collapsed/expanded, desktop vs mobile). That made the number of `chance()` /
`rng()` calls per turn depend on the player's window and could desync Replay
System (section 83).

---

# 23. Temple Enemy Behavior

The Temple is a safety zone.

On the surface, monsters strictly within **15 tiles Chebyshev distance** of
the Temple center (`spawnPoint`) retreat regardless of the player's position,
visibility or movement. They take up to two outward steps per game turn,
stopping at distance 15. Retreat has priority over sleep, theft, passive
behavior, ranged attacks and pursuit. Sleeping creatures wake to retreat.
Immediate counterattacks are also suppressed inside the sanctuary.

Retreat steps obey terrain and occupancy; a boxed-in monster waits rather than
attacking or teleporting. Creatures outside the boundary behave normally and
can still shoot inward. The sanctuary does not extend underground. The existing
20-tile avoidance rule for far-wandering travelers remains separate.

This makes the village a reliable refuge but also allows players to drive
monsters back toward the boundary and retreat safely after attacking.

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
- player and enemy critical hits
- possible extra attacks (weapon vs weapon grace checks)

Monster ranged attacks reuse the same mitigation, glancing and critical systems, with
the shooter-specific fixed projectile ATK and doubled dodge chance documented in
§20. They do not run melee GRACE timing or melee lunge/contact behavior. Projectile
animation is presentation-only: dodge, critical/glancing, damage, HP and ammunition are
resolved first from deterministic gameplay state, then the visual effect is queued. The
clear-shot check still uses the deterministic tile trace, but the queued projectile is drawn
along the direct straight line from shooter center to target center rather than visibly
stepping through each traced grid cell. Visual frame timing is clamped to the projectile
effect lifetime, so a late-queued effect cannot interrupt input or combat resolution. The
projectile uses a readable glyph in both tile-image and ASCII rendering modes.

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

Every successful player or monster attack has a chance to become a critical hit.

Current chances:

```text
Player: 5% normally; 25% when invisible against a non-Alarmed enemy without trueSight
Normal monster: 5%
Fierce monster: 10%
Deadly monster: 15%
```

`content/enemy_config.json` stores the three combat chances as
`baseCriticalHitChance`, `fierceCriticalHitChance`, and `criticalHitChance`
(the last remains the Deadly-specialist chance).

The invisibility bonus is **+20 percentage points**, assessed before the hit alarms
the target. TrueSight enemies are immune. After Alarmed resets, an invisible
attacker can gain the bonus again. Misses and glancing blows retain their usual
rules; successful criticals use the existing feedback.

Critical damage:

```text
damage × 2
```

The critical roll happens after the attack connects and after the normal damage
roll. Critical hits and armor glancing are mutually exclusive: if the armor
glance check succeeds, that hit cannot become critical. The crit RNG roll is
still consumed on the connected hit so the combat path keeps a stable seeded
RNG/replay call pattern. Critical rolls use the game's seeded `chance()`/`rng()`
path.

Fierce enemies therefore crit twice as often as ordinary monsters, while Deadly
enemies remain the strongest critical-hit specialists.

---

# 29. Weapon Timing / Grace

Weapons have a `GRACE` value.

Base combat delay:

```text
6 / GRACE
```

Higher weapon or natural GRACE means lower base combat delay. Reciprocal scaling gives high GRACE diminishing returns without making any GRACE point useless.

Player bonus GRACE acts as an affinity for graceful weapons rather than being added directly to weapon GRACE. The bonus is the sum of racial GRACE and level GRACE:

```text
level GRACE = floor(level / 5)
player bonus GRACE = racial GRACE + level GRACE
gear GRACE penalty = 1 for a non-Buckler shield + armor.gracePenalty (if any)
effective player weapon GRACE = max(1, weapon GRACE - gear GRACE penalty)
base player delay = 6 / effective player weapon GRACE
weapon affinity = min(1, effective player weapon GRACE / 5)²
GRACE reduction = player bonus GRACE × 0.25 × weapon affinity
player delay = max(0.25, base delay - GRACE reduction)
```

This makes both racial and level GRACE provide almost no benefit with slow
weapons and progressively more benefit with graceful weapons. A GRACE 5 or
higher weapon receives the full reduction. The player's displayed GRACE is
weapon GRACE + racial GRACE + level GRACE - gear GRACE penalty, with a minimum
of 0. Combat timing separately floors effective weapon GRACE at 1, so heavy
gear cannot disable the enemy's extra-attack checks by reducing the player's
displayed GRACE to zero. Bucklers and armors without `gracePenalty` leave GRACE
unchanged. Humanoid enemies with a non-Buckler shield or selected armor also
lose 1 from natural GRACE in combat timing (floored at 1); enemy weapons still
override natural GRACE and have no gear penalty because an enemy carries one
equipment item.

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

# 30. Reserved (no separate rule)

No gameplay rule is missing here; the numbering gap is reserved to preserve
existing section numbers and links.

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
memorial inscription and `Pay respects or retrieve what is left.`
After looting, the corpse skull is rendered gray.
The body can be looted once for 10% of the dead character’s carried gold and
one randomly selected item from the highest-tier equipped weapon, shield, or
armor. The corpse's selected item is excluded from the killer's loot. If the
killer is a humanoid and an equipped weapon remains, it takes that weapon when
unarmed, or replaces its equipment only when the weapon has a strictly higher
weighted inventory score (`equipmentSortValues().sum`). Equal scores keep the
existing equipment regardless of tier; replaced equipment is discarded, not
dropped. Nonhumanoids take nothing. Bodies are saved as world
ground objects, so this state survives save/load.

## Permadeath corpse loot

**Killer equipment selection and ties.** Monsters have one equipment slot,
not separate weapon, shield, and armor slots. The killer considers only the
dead player's equipped weapon: it does not compare matching armor slots or
randomly choose among the player's three equipment types. Corpse selection
happens first. If the weapon was reserved for the corpse, the killer takes
nothing; otherwise, the weapon is compared with whatever the killer currently
has, including armor or a shield. A winning weapon replaces that item entirely.

A **tie** means equal weighted scores, even if names, tiers, or individual
bonuses differ. The killer keeps its existing item on a tie. This comparison
uses only `equipmentSortValues().sum`, not the inventory sort's subsequent
tier and primary-stat tiebreakers.

The score is **3 times the primary stat, plus weighted secondary bonuses**.
The primary stat is ATK for weapons and DEF for armor/shields, including a
modifier to that primary stat. Weapons also count their built-in GRACE.
A secondary modifier contributes its amount, except HP contributes one third,
XP contributes `Math.round(xpBonus / 3)`, and GRACE modifiers count only for
weapons.

These illustrative stat combinations assume the player's weapon was **not**
reserved for the corpse. Unlisted bonuses, including weapon GRACE, are zero.
They illustrate the selection score, not a claim that the winner is better in
every combat situation.

| Enemy's current item           |        Current score | Player's available weapon |     Weapon score | Winner and outcome                                  |
|--------------------------------|---------------------:|---------------------------|-----------------:|-----------------------------------------------------|
| Armor: DEF 4                   |         `3 * 4 = 12` | ATK 5                     |     `3 * 5 = 15` | Weapon; armor discarded                             |
| Armor: DEF 5                   |         `3 * 5 = 15` | ATK 4, GRACE 1            | `3 * 4 + 1 = 13` | Armor retained                                      |
| Shield: DEF 3                  |          `3 * 3 = 9` | ATK 3                     |      `3 * 3 = 9` | Tie; shield retained, even if weapon tier is higher |
| Shield: DEF 3, SPD modifier +2 |     `3 * 3 + 2 = 11` | ATK 3, GRACE 3            | `3 * 3 + 3 = 12` | Weapon; shield discarded                            |
| Armor: DEF 4, HP modifier +9   | `3 * 4 + 9 / 3 = 15` | ATK 5                     |     `3 * 5 = 15` | Tie; armor retained despite different stats         |
| Shield: DEF 2, DEF modifier +2 |   `3 * (2 + 2) = 12` | ATK 3, SPD modifier +2    | `3 * 3 + 2 = 11` | Shield retained                                     |

## Non-permadeath

When HP reaches zero in normal mode:

- death counter increases
- one random unequipped backpack item is dropped at the death position, if one
  is available; one unit is removed when the selected item is a stack, but
  remains appear only after the Temple teleport
- a distinct `playerremains` ground object holds that item and uses the
  skeletal-remains glyph without becoming a `skeleton` or permadeath `deadbody`
- the forage/loot action restores the item and removes `playerremains` from the world
- death animation occurs
- temporary effects (regeneration, invisibility, speed, freezing and curse
  penalties) end on death; an ordinary living Temple return preserves them
- player returns to Temple at full current maximum HP, including equipment bonuses,
  after the permanent maximum-HP loss has been applied
- death recovery records earned XP, so later Temple blessings require new XP
  from level 2 onward; level 1 remains exempt
- player returns to the surface
- position becomes the Temple spawn point
- the killer, if still alive, gains a persistent red skull and a victory level;
  each victory adds 3 maximum HP and +1 each to ATK and DEF, leaves SPD unchanged,
  then heals 10% of its new maximum HP (rounded, at least 1)
- the XP penalty is calculated as 10% of all XP earned across levels (rounded
  up), with a minimum of 20 XP and a maximum of 200 XP. It is subtracted from
  the current level's unspent XP, without reducing the level. At level 1, the
  actual loss is capped at available unspent XP, so death at 0 XP loses 0 and
  never creates debt. From level 2 onward, XP may become negative; future XP
  gains repay that debt before advancing toward the next level. The XP bar
  displays zero width while XP is negative. Lifetime earned XP remains the
  basis for later death penalties and the Temple's progress check
- the player's base maximum HP permanently drops by 1 at levels 1–4, or 2
  at level 5 and above, never below 1

For example, a level 2+ character with 1,000 lifetime XP earned and 5 XP toward
the next level loses 100 XP on death (10% of 1,000). Their current XP becomes
`5 - 100 = -95`; their level stays the same, and future gains first repay the
95 XP debt.

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

Inventory and merchant gear icons are 24×24 transparent SVGs in `img/icons/`.
Weapons, shields, and armor prefer a file named exactly after their base item
(e.g. `Dagger.svg`, `Round Shield.svg`, `Plate Mail.svg`). Magic prefixes do
not affect the icon lookup because generated gear retains its unmodified
`base` name. A missing or unknown specific SVG falls back to the existing
`weapon.svg`, `shield.svg`, or `armor.svg`; other item kinds keep their own
kind-based icons. Failed gear-specific icon paths are remembered for the current
session, so repeated inventory/trade redraws use the generic fallback immediately
instead of repeatedly retrying a missing SVG and visibly blinking. In the inventory
paper doll, the icon immediately before each `WEAPON`, `SHIELD`, or `ARMOR`
category label uses the same lookup: equipped gear shows its specific base-item
icon when available, while an empty slot shows the corresponding generic
`weapon.svg`, `shield.svg`, or `armor.svg`. The item-value row itself is text-only;
gear icons are shown only before the category label, so the same icon is never
displayed twice. The paper-doll equipment lookup uses optional/null-safe access
for every slot so inventory rendering still works if the equipment object is
absent or incomplete. Its weapon/shield/armor definitions are stored in an
explicit local slot list before iteration; this avoids a leading-array expression
after `setSlotLabel()` being parsed as property access through automatic semicolon
insertion. The listed base gear icons are preloaded for offline use. This changes
only presentation, not gear stats or loot odds.

Inventory tabs include All, Weapons, Shields, Armors, Supplies, and Other.
Supplies lists consumable food, herbs, mushrooms, potions, and scrolls,
including potatoes. Other excludes equipment and supplies; All keeps its
existing consumables-first ordering. Tabs only filter displayed inventory.
In windows at most 720px wide, inventory, map, treasure map, trade,
and character-creation dialogs are positioned against the browser viewport.
Their width is independent of the canvas, which may be narrow while the
sidebars are open. This applies even when the browser reports no pointer. 
Inventory actions remain reachable without horizontal scrolling. 
Touch devices retain their existing full-screen dialog layout.

## Non-gear item catalog

`content/items.json` defines all 22 non-gear inventory kinds. Weapons, shields,
armor, and procedural artifacts retain their existing configuration systems.
The dictionary keys are the canonical `kind` identifiers used by inventory,
merchant references, saves, and replay actions. Descriptive loot-outcome names
can map to these item kinds through their handlers.

Each definition contains a default `name`, inventory `category` (`supplies` or
`other`), `stackable`, base `sellValue`, and ordered `actions`. Optional
`description`, `effect`, `carryStats`, and `icon` fields describe inspection
text, behavior parameters, carrying modifiers, and an inventory-icon override.
Without an override the icon is `img/icons/<kind>.svg`. Explicit item-icon overrides may use either `.svg` or `.png` and may point to local `img/icons/` or `img/tiles/` assets. The Dwarven Key deliberately reuses its ground tile (`img/tiles/dwarven-key.png`) in inventory so ground and inventory visuals stay consistent.

Actions name approved JavaScript handlers; JSON contains no executable rules.
Inventory buttons and replay item-use actions share that handler registry.
Handlers retain turn costs, swimming restrictions, quest consequences, and
replay recording. An empty actions list means no inventory button: potatoes
are inert Supplies, valuables are Other, and Identification scrolls are used
through an artifact's identification button. The Black Key remains in inventory
when equipped and uses its special Equip/Unequip action.

Item creation uses the catalog's defaults. Instances retain their counts,
replay IDs, and unique data such as generated tombstone inscriptions; actions
and effect definitions are not copied into saves. Stackable kinds merge by kind,
while tombstones and other non-stackable objects retain separate identities.
Catalog loading and item creation consume no gameplay RNG. Carried modifiers
apply once per present kind; carrying the bell gives SPD −5.

Drop locations and probabilities stay in `loot_tables.json` and world-generation
configuration. Merchant quantities and purchase prices stay in
`merchant_stock.json`, which references item kinds without duplicating names.
World-dependent mushroom poison chance stays in world-generation configuration.
Chests, corpses, campfires, and other environmental objects are outside this
inventory catalog.


A two-handed weapon prevents shield use.

Equipping a two-handed weapon automatically removes the equipped shield and returns it to inventory.
Equipment stat changes in equip/unequip logs use green for increases and red for decreases, including GRACE.
Equipment swap messages name the previously equipped item before the new item in one log line; equipping a two-handed weapon also names the shield it removes. Every named item uses its tier colour, including automatic equips, unequips, and monster gear pickups. Identically named items retain their own colours.

If the player has no weapon, looted weapons are automatically equipped.

Shields and armors are not automatically equipped; most impose a speed penalty.

---

# 33. Weapons

Current base weapons include:

| Weapon | Tier | ATK | Grace | 2H |
|---|---:|---:|---:|---|
| Dagger | 1 | 2 | 5 | No |
| Short Sword | 1 | 3 | 4 | No |
| Club | 1 | 3 | 2 | No |
| Rapier | 2 | 4 | 5 | No |
| Staff | 2 | 6 | 2 | Yes |
| Long Sword | 2 | 6 | 4 | No |
| Scimitar | 2 | 6 | 4 | No |
| Mace | 2 | 6 | 2 | No |
| Scepter | 2 | 5 | 3 | No |
| Spear | 2 | 7 | 2 | Yes |
| One-handed Axe | 2 | 6 | 3 | No |
| Sabre | 3 | 5 | 5 | No |
| Morning Star | 3 | 7 | 2 | No |
| Lance | 3 | 9 | 2 | Yes |
| Flail | 3 | 8 | 2 | No |
| Chain Whip | 4 | 7 | 4 | No |
| War Sickle | 4 | 9 | 5 | Yes |
| Two-handed Sword | 4 | 11 | 2 | Yes |
| War Hammer | 4 | 12 | 1 | Yes |
| Two-handed Axe | 4 | 13 | 1 | Yes |
| Katana | 4 | 11 | 4 | Yes |
| Chain-sickle | 5 | 11 | 2 | Yes |
| Bone Cleaver | 5 | 11 | 1 | No |
| Giant Sword | 5 | 16 | 2 | Yes |
| Kanabo Club | 5 | 15 | 1 | Yes |
| Crescent Blades | 5 | 13 | 5 | Yes |
| Titan Warpick | 5 | 18 | 1 | Yes |

Crescent Blades represent a matched pair equipped as one two-handed weapon:
they occupy both hands and prevent shield use under the existing equipment rules.
They do not add a separate dual-wield attack; extra attacks use the normal GRACE
checks. Sabre is one-handed; Katana and Kanabo Club are two-handed.
These four weapons use the existing tier-based gear selection and modifier rules.
Their icons are named exactly after their base names in `img/icons/`, with
the existing generic weapon icon fallback. No special weapon abilities are added.

Bone Cleaver (one-handed) and Titan Warpick (two-handed) extend tier 5's
heavy weapon choices. War Sickle is a two-handed tier-4 finesse weapon;
Chain Whip is a one-handed tier-4 alternative. Chain-sickle represents a
kusarigama wielded with both hands and is deliberately a weaker novelty
in the tier-5 pool (9 ATK, 3 GRACE).
All five use ordinary ATK/GRACE combat and existing tier-based selection.
Their silhouettes and themes do not grant armour piercing, parry bypass,
additional hits, reach, or new damage types. Higher GRACE only affects the
existing combat timing and extra-attack rules. Each has a matching 24×24
transparent SVG named exactly after its base name in `img/icons/`.

---

# 34. Shields

Current shields:

| Shield | Tier | DEF |
|---|---:|---:|
| Buckler | 1 | 2 |
| Pelt Shield | 2 | 3 |
| Chitin Shield | 2 | 4 |
| Round Shield | 2 | 5 |
| Kite Shield | 3 | 6 |
| Spiked Shield | 3 | 7 |
| Bone Shield | 4 | 8 |
| Tower Shield | 4 | 10 |
| Royal Shield | 5 | 9 |

Shield SPD penalty:

```text
Buckler: -1
Other shields: -2
```

Every shield except the Buckler also applies **−1 GRACE** while equipped.
Inventory and trade item stat lines omit built-in shield and armor GRACE
penalties to keep gear rows compact. The shield penalty still stacks with an armor GRACE
penalty and reduces the player's extra-attack timing through effective weapon
GRACE; it does not change the shield's DEF or SPD penalty.

---

# 35. Armor

Current armor:

| Armor | Tier | DEF | Total SPD penalty | GRACE penalty |
|---|---:|---:|---:|---:|
| Robe | 1 | 1 | 0 | 0 |
| Jacket | 1 | 1 | 0 | 0 |
| Cape | 1 | 2 | 1 | 0 |
| Cloak | 1 | 3 | 1 | 0 |
| Tunic | 1 | 4 | 1 | 0 |
| Doublet | 2 | 5 | 1 | 0 |
| Leather Armor | 2 | 6 | 1 | 0 |
| Studded Leather | 2 | 7 | 1 | 0 |
| Quilted Armor | 2 | 8 | 2 | 0 |
| Hauberk | 3 | 9 | 3 | 1 |
| Brass Armor | 2 | 10 | 4 | 1 |
| Splint Mail | 3 | 11 | 2 | 0 |
| Brigandine | 3 | 12 | 2 | 0 |
| Scale Armor | 4 | 13 | 2 | 0 |
| Half Plate | 4 | 13 | 3 | 1 |
| Bone Armor | 4 | 14 | 3 | 1 |
| Plate Armor | 4 | 15 | 4 | 1 |
| Chitin Armor | 5 | 16 | 2 | 0 |
| Royal Armor | 5 | 17 | 4 | 1 |
| Ancient Armor | 5 | 18 | 4 | 1 |

Armor subtracts only its stored `speedPenalty`; there is no additional flat SPD
penalty. Robe and Jacket have no stored penalty; the other ordinary armor bases
have the penalties above. Armor artifacts retain their 1 SPD cost as an explicit item
property. The same seven ordinary armor bases retain `gracePenalty: 1`; this is
independent of their new total SPD penalties. Built-in GRACE penalties are
omitted from inventory and trade stat lines.

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

## Humanoid equipment effectiveness

Each humanoid receives one seeded, persistent effectiveness factor uniformly
distributed from **0.50 to 0.70**, replacing full **1.00** effectiveness. The
same factor applies to positive equipment ATK, DEF, SPD, HP and GRACE, including
modifiers, stolen gear and replacement gear. Negative modifiers and existing
gear penalties retain their full effect. HP gains round to whole HP; other
combat stats retain fractions internally and display rounded values. Weapon
GRACE still replaces natural GRACE, with an effective minimum of 1.

The factor belongs to the monster, is not revealed in its tooltip, and does
not reroll when gear changes. Replacing equipment removes its previous applied
bonuses before applying the new item. Nonhumanoid thieves retain full gear
effectiveness. Items themselves remain unchanged and drop with full stats;
the random effectiveness makes enemy stats a less precise clue to modifiers.
The multiplier and applied bonuses persist in current saves and replay states.

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

The surface and underground areas contain chests. Generated chests, potions
and scrolls cannot occupy the same tile on the same level/map. Surface loose
supplies sample legal, unoccupied ground-item positions without replacement,
preserving configured counts while enough valid positions exist. Cave loot
already reserves each selected position. Runtime drops are unaffected.
The surface starts with up to four remote tier-3 chests guarded by tier-3+
monsters, ordinary chests at roughly one per **720 eligible walkable tiles**,
and up to twelve additional edge chests. The ordinary chest density
(`spawning.surfaceTilesPerChest` in `content/map_config.json`) preserves
the former 45 chests per ~32,370 eligible tiles of a 260 × 180 world.
Up to five of the edge chests are placed along the northern edge first; remaining
ones can appear on any edge. Each edge chest is on walkable ground within a
tier-3+ monster's aggro range, with tier matching that monster.

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
0–100 scale**:

```text
roll = rng() × 100
```

The roll is compared against the ordered `CHEST_LOOT_TABLE.table` entries
loaded from `content/loot_tables.json`. The first entry whose `upTo` threshold
exceeds the roll determines the result. If no entry matches, the configured
`elseResult` is used.

The roll is at least 0 and strictly below 100. Thresholds are cumulative:
each result's percentage chance is its upper threshold minus the previous
threshold (starting at 0). `elseResult` gets the remaining percentage above
the last threshold. Rescaling from 110 preserves the original probabilities;
the stored thresholds retain floating-point precision.

| Result | Cumulative upper threshold (rounded) | Chance (rounded) |
|---|---:|---:|
| Gold | 40.909091 | 40.909091% |
| Gear | 63.636364 | 22.727273% |
| Life Potion | 77.272727 | 13.636364% |
| Scroll of Invisibility (`scrollOfInvisibility`) | 81.818182 | 4.545455% |
| Potion of Speed | 90.909091 | 9.090909% |
| Scroll of Identification (`elseResult`) | 100 | 9.090909% |

For example, a roll of 79 gives an Invisibility scroll, 86 gives a Speed
potion, and 95 reaches the Identification-scroll fallback. The specific item ID `scrollOfInvisibility` is shared by the catalog, loot
results, ground pickups, merchant stock, and recorded replay actions.

The **100-point roll chooses the result category**. If the result is gear, a
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

A chest marked `artifactGuaranteed` skips the normal 100-point loot roll and
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

HP restored by a Life Potion, Healing Herb, edible Mushroom, berry regeneration,
Troll regeneration, or a living player's Temple blessing uses the existing
floating damage-number animation with a green `+<actual HP>` label. The amount
is capped by missing HP; no number appears at full HP. Death revival and
character setup are separate from healing and do not show this animation.
Herb and edible-Mushroom recovery messages also report the actual capped HP.

## Scroll of Invisibility

Grants approximately:

```text
20 turns invisibility
```

Wyrdling increases the duration by 25%: 20 turns become 25 turns. Reading
the scroll consumes the first turn, leaving 19 or 24 subsequent turns,
respectively.

While invisible, enemies without `trueSight` never acquire or chase the player and continue to
wander normally. The following hit reactions apply to those enemies; Oculus
uses ordinary combat. A hit on a surviving enemy, even a zero-damage glancing hit,
provokes exactly one immediate reaction instead of that enemy's wander action
for the turn. A miss causes no reaction; evasive enemies cannot use their
special dodge against an invisible attacker. An enemy killed by the attack
cannot react. A single roll gives
10% confusion (no action), then a flee chance of
`clamp(30% - 2% × enemy tier - 1% × enemy AGGRO + 0.5% × damage received, 5%, 90%)`.
On a flee result the enemy moves one tile to an open walkable neighbor,
preferring maximum distance from the player; if no tile is available, it stays
put and reports being cornered. The remaining probability is a wild lash-out:
if still adjacent, the enemy makes one ordinary attack with one tenth of its
normal hit chance (including normal damage, armor, and critical-hit rules).
No reaction grants lasting awareness or subsequent pursuit. God mode
invisibility uses the same hit reaction; with its invisibility toggled off,
ordinary visible combat applies. Invisibility is therefore not guaranteed
protection when attacking.

The merchant stocks three Scrolls of Invisibility at 200g each, configured
under `scrolls.invisibilityScroll` in `content/merchant_stock.json`. The
exhausted stock remains saved with count zero rather than replenishing on
load; selling a scroll back to the merchant makes it available again.

## Scroll of Homecoming

Returns the player to the Temple. Temple healing follows the same level 1
exception, XP rule from level 2 onward, and 70-HP cap. Its canonical item kind
and replay action are `homecomingscroll`, and
its icon is `img/icons/homecomingscroll.svg`. Its merchant price is 100g, with
nine in stock at world creation. The stock config key is `scrolls.homecomingScroll`.

## Potion of Speed

The Potion of Speed ground tile uses `img/tiles/speed-potion.png`: a transparent
yellow-liquid variant of the Life Potion bottle. Both potions use scale 0.9;
the speed potion’s previous oversized scale was 1.5. ASCII colors are unchanged.

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

Identifies an artifact. The Merchant starts with six at 100g each.

## Healing Herb

Foraged item. Its ordinary healing amount is calculated from maximum HP, then bounded before
racial consumable bonuses:

```text
base heal = clamp(round(25% of max HP), 20, 50)
final heal = round(base heal × consumable multiplier)
```

Wyrdling therefore increases the already-bounded base heal by 25%. For example, a 40-max-HP
character heals 20 HP normally or 25 HP as a Wyrdling; a 400-max-HP character heals 50 HP
normally or 63 HP as a Wyrdling. Actual recovery is still capped by missing HP.

## Handful of Berries

Foraged item. Shares its regeneration effect with Fresh Fish: each serving adds
100 turns, or 125 for a Wyrdling, to the existing regeneration duration.
Eating spends one turn, leaving 99 or 124 turns after the first serving.
Trolls consume either food without gaining additional regeneration.

Wyrdling increases each serving's duration by 25% before it is added to the
existing counter. Both foods use the same five-turn regeneration tick.
Effect durations are configured per item in `content/items.json`.

## Mushroom

Foraged item. There is a 50% chance of healing or damaging HP. Both outcomes
use 25% of the player's maximum HP: healing is affected by consumable bonuses,
while poison damage is not. Damage is rounded and cannot be lower than 1 HP.

Killing a `Fungus` always grants **1–3 normal Mushrooms** (`randInt(1, 3)`), so
one Mushroom is guaranteed on every kill. The drop uses the existing
`mushroom` inventory kind and therefore stacks with foraged Mushrooms. It is
separate from the normal enemy artifact/equipment loot path.

Wyrdling increases the healing effect by 25%, but does not increase poison damage.
Example: a healing result restores 25% HP normally or 31.25% HP for a Wyrdling.

---

# 48. Foraging

`F` performs foraging, searching, and occasional looting/pickup actions where
appropriate. For example, it can forage forest tiles, search skeletons, loot
dead bodies, pick up certain special objects, or dig sand when the player has
a shovel.

Ordinary forest tiles can be foraged.

Each forest tile can only be foraged once. Finding berries, a herb, or a
mushroom displays a short rising, fading **found!** label above the searched
tile in both tile and ASCII modes. Empty searches and repeat searches show no
label. This feedback is cosmetic: the item and turn resolve immediately,
without animation timing or extra RNG; simulation-only replay skips the effect.

Results:

```text
9% → Handful of Berries
8% → Healing Herb
8% → Mushroom
75% → Nothing
```

Taiga and Ancient Forest cannot be foraged. Cursed world traits can change
the three result probabilities; the remaining chance yields nothing. The
table above is the normal-world distribution; see
[§85. Cursed World](#85-cursed-world).

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
tiles, dwarven columns (`dwarvenstatue`), and special ground objects such as skeletons,
campfires, dwarven props, explorer remains, and dead bodies.

An abandoned campfire can be searched once by inspecting it or pressing F
while standing on it. A seeded 30% roll grants one Potato; a failed search
finds nothing. The `searched` flag is stored on its ground object and saved,
preventing repeated rolls. Potatoes stack in the inventory and use
`img/icons/potato.svg`, matching the 24x24 item icon format. They cannot be
used, equipped, or sold.
Searched campfires have a gray ASCII glyph and a slightly dimmed, desaturated
tile image.

Ordinary surroundings inspection only runs when no higher-priority special
inspection has handled the current tile/object.

---

# 49. Skeletons

Skeleton ground objects (dead bodies) occur mostly in caves and can be searched.
Once searched, their `looted` state gives their tile image the same dimmed,
desaturated treatment as campfires; the ASCII glyph remains gray.

Searching one technically generates a temporary tier-1 chest at its location and immediately opens it. The word "chest" is not mentioned in the logs.

---

# 50. NPCs

Current named NPCs:

- Old Hunter
- Gravedigger
- Drunk
- Merchant
- Herbalist
- Fisherman Hermit

NPCs generally provide dialogue/exploration interactions.

At new-world generation, every named village NPC except the Drunk spawns within
**5 NPC-walkable steps of the Temple**. Distance is measured with an 8-direction
breadth-first search, so walls and other blocked terrain count properly rather
than using straight-line distance. NPC path distance also treats forest and
river/water tiles as unavailable, matching their wandering restrictions. The
Drunk keeps the wider random Temple-area placement. Village NPCs and the
Fisherman Hermit never spawn on grassland-tree tiles; neighboring tree artwork
does not exclude other tiles. NPC wandering never enters
forest, river, or water tiles.

NPC tile artwork is configured by exact NPC name in
`content/rendering.json` under `npc.characters`, with `image` and `scale`
per character. Drunk, Herbalist, Ancient Lich, Merchant, Old Hunter and Fisherman use
transparent `img/tiles/npc-*.png` sprites at scale 1.0. These sources are
larger than 40x40 and use chunky pixel shapes; the shared nearest-neighbor
sprite cache renders them at the current tile size, including zoom.
Both initial visual loading and background preloading include these paths.
`drawNpcVisual()` uses the existing image renderer and falls back to the
configured white initial if a mapping/image is absent or tile images are
disabled with P. Gravedigger retains that fallback until his standalone
sprite is supplied; the supplied composite preview is not used as a tile.
Swimming clipping, movement interpolation and the Old Hunter's quest marker
remain in the existing NPC draw pass. NPC dialogue portraits are separate
and unchanged. These visuals consume no RNG and change no NPC behavior,
quest state, balance, save format or replay state.

The Merchant additionally supports trading. Trading is possible by clicking on the Merchant, while standing next to him. The Herbalist also opens a services screen when clicked while adjacent. On the first interaction with the Herbalist, she gives exactly one **Healing Herb**; the one-time gift flag is saved, restored, and replayed so repeated conversations never duplicate it.

The Ancient Lich addresses the player by their selected race in its dialogue. This is flavor only and does not branch quests or rewards.

## Fisherman Hermit / Empty Nets

The static, invulnerable Hermit is a separate surface NPC, not a village NPC.
His template lives in `content/npcs.json`, using shoreline placement rather than
the village placement pass. `src/npcFisherman.js` owns his placement and quest;
portrait preloading and save restoration use the shared NPC templates.
His original dark-haired, bearded, teal-clad pixel PNG is configured by NPC name
in `content/rendering.json`; the supplied reference is his separate portrait.
He uses the ordinary sprite cache, preloading, tooltip and `!` marker draw pass.

After surface population/structures are complete, deterministic placement finds
a Temple-foot-reachable grass/sand/hill bank beside an unfrozen connected water
region of at least 25 tiles, with an adjacent small `fishermanhut`. No structures
are overwritten. Seed-selected preferred village distances of 40, 80 and 140
tiles diversify proximity; suitable terrain and safety take precedence.
Naturally safe footprints are tried first. If necessary, only explicitly marked
ordinary surface spawns may be relocated; special encounters remain untouched.
Relocations are planned atomically using reachable, unoccupied species terrain,
outside the Hermit's safe area and the Temple/village exclusion zones. No
world-generation or dialogue decision depends on animation or unseeded randomness.

`fishermanQuest` is an extensible `{type, state, targetId, ...}` record. The current
`fish_predator` variant is **Empty Nets**. No predator exists before the first
conversation. Activation chooses a free, foot-reachable land bank at least 25
tiles away, preferring the same connected water region. The generated village
center used by the target exclusion rule is persisted exactly in saves/replay
snapshots so restoring the same action cannot change the legal target set. Activation
then creates one non-wandering **Fat Slurper** (Slurper, `fat` prefix, double template HP).
Only that stored enemy ID's death, through the shared kill hook, makes the
quest ready. The `!` is shown before activation, when ready, and on completed
quests with an unclaimed reward and no pending lesson. Bumping or adjacent clicking gives short, gruff,
one-way dialogue, with no player choices.

Turn-in completes the quest but only offers non-Merlings a persistent pending
lesson (`player.fishermanLessonPending`). The reward is claimed and Swimming 5
learned only on a successful step from a walkable bank into deep water, with both
tiles within three tiles (Chebyshev distance) of the Hermit on the surface;
the move itself must still be exactly one tile. Waiting, teleporting, distant water
and god-mode travel cannot complete it. The lesson completes before entry practice
and drowning checks; pending lessons survive saves and deterministic replay.
The dialogue marker clears while a lesson is pending and returns if god-mode
disable restores reward entitlement. Merlings instead receive natural-
swimmer dialogue and 100 XP, without numeric Swimming or practice. State changes
before granting the reward prevent repeated rewards/restarts. After completion,
the Hermit gives exactly one Fresh Fish per character at first turn-in, including
Merlings. The persisted `fishermanFishGiftGiven` flag is not cleared by debug
lesson resets, only by creating a new character. Subsequent interactions open
the shared services interface, including while the lesson is pending, with only
**Buy fish (5g)**. Purchases stack fish and record a `fisherman` / `buyFish` replay
action. The Hermit retains normal one-tile home-radius wandering.
His discovered hut (not his current position) is a deep-blue (`#003366`) square
exactly one map tile in both map views, using the shared fog-aware terrain cache.
Fish uses the **same regeneration helper as
berries** (+100 regeneration turns), including Troll immunity and normal item
turn consumption.

---

# 51. Old Hunter
<details>
  <summary>Details</summary>

The Old Hunter is associated with the Ancient Forest.

His warning contains a direction derived from the actual generated Ancient Forest location.

He warns the player about entering the Ancient Forest in a particular direction after midnight.

## Procedurally generated quests

The Old Hunter can generate a new quest when the player interacts with him and has no active quest. Quest objectives are selected from the current world state rather than from a fixed quest list.

There is a 30% chance to receive an investigation quest when a cave entrance exists. It targets the cave entrance closest to the village (squared map distance; map scan order breaks ties). The target is stored by its map coordinates and landmark type, so the quest points to an actual location rather than an arbitrary wilderness tile.

The quest dialogue names the landmark and gives its direction relative to the Old Hunter, and ends with "I'll mark the location on your map." The player completes the investigation simply by getting near the target tile within 2 squares; no additional interaction or hidden object search is required. The quest then becomes ready to turn in at the Old Hunter.

As soon as the quest is generated, the Old Hunter also marks the location for real: a 5x5 area (the target tile plus 2 tiles in every direction - the same radius used for quest completion) is immediately revealed on the discovery grid, whether or not the player has actually been there.

Hunter dialogue uses the target's actual direction and avoids unverified
landmark names such as roads, forts, mountain passes, or a nearby cemetery.
Group quests use a living designated target; ground-item quests use the
identified item's position. Nearby or unknown locations are phrased without
adding "of here" to them.

Other generated quest types include:

- **Kill a specific monster:** kill a particular nearest eligible monster, preferring tier 3 over tier 4.
- **Recover an item:** retrieve an item carried by a particular tier-3-or-4 monster.

The first quest’s monster objectives use reachable surface enemies. Eight-direction
walking distance from the village determines proximity; water and impassable
terrain cannot shorten a route. If any eligible tier-3 enemies are reachable,
tier 4 is excluded. Otherwise reachable tier-4 enemies are the fallback. Only
the closest targets in that preferred tier remain eligible; equally close
targets retain seeded quest variety. A kill target need not have a prefix.
Group kills use equally close members of the same species. Ground-item delivery
candidates retain their existing rules.

Tier-5 monsters, all far-wanderers (including world-generation promotions), and
every base template with rarity <= 0.02 are excluded from new kill, group-kill,
and carried-item recovery targets. Existing active quests are preserved. When
both killing and item quests are available, killing quests retain their 50%
chance; investigation quests retain their separate 30% chance. The later rare
hunt keeps its edge-biome selection and difficulty, and its opening names the
quarry as “A <monster name>, they call it.” Monster names retain their exact
configured spelling and capitalization.

Quest progress is persisted in the save data. Completed objectives become ready for turn-in, and turning in a quest grants the configured reward and marks the quest completed.
Hunter delivery candidates must be actual named, nonstackable recoverable items
in surface thief bags; artifacts must already be identified. Unopened loot
containers cannot supply a delivery target. The exact item is tagged for the
quest, and dialogue uses its name instead of the former "the lost item" fallback.

Completing the first quest also teaches **Tracking**, once per character, using the
Hunter's craft-teaching dialogue. The character sheet then shows `Tracking: Learned`;
before learning, the skill is hidden. The first quest's existing XP reward is unchanged.

After Tracking is learned and the first quest is completed, the Hunter has one final
**rare hunt** to offer. The quarry is selected at quest creation from enemy templates
that satisfy all three rules:

- `wander: "far"`
- `humanoid: false`
- `rarity <= 0.1`

The selection remains data-driven: adding or changing an enemy template automatically
changes the eligible pool. A candidate must also have at least one valid surface spawn
tile in one of its configured biomes. The spawn tile must be walkable, reachable from
the village/Hunter over ordinary surface terrain, unoccupied, and preferably very far
from the village. The desired minimum Chebyshev distance is:

`max(20, floor(min(world width, world height) × 0.35))`

Among qualifying distant tiles, the hunt uses the closest available world-edge band
and allows tiles up to 3 squares farther inward. A species with no valid tile beyond
the minimum village distance is skipped; if no qualifying species can be placed that
far away, the rare hunt is not generated rather than moving the quarry closer.

The Hunter emphasizes that the creature is exceptionally rare and gives the direction
of the **initial sign** he found. That bearing is frozen when the quest starts; it does
not update as the far-wandering quarry moves. The quest never reveals the quarry on the
map and only the exact spawned enemy ID can complete it, so killing another monster of
the same species does not count. This is intentionally a practical Tracking test rather
than a live-direction hunt.

Returning after killing that exact quarry grants **400 base XP** through the normal XP
pipeline and one non-stackable **Echo-Blight Horn**. The rare hunt is then permanently
completed for that character.

Normal death preserves the lesson and quest. A new permadeath character starts
with no Tracking knowledge, no species kill counts and no Old Hunter quest,
so the Hunter can offer a fresh quest in the surviving world.

## Rare monster sightings and flight

`src/rareFlee.js` applies to living, unalarmed surface enemies whose **base template**
has `rarity <= 0.02`, independent of quest membership, prefix, humanoid type, and
wander mode. Current species: Myrka, Vampire, NULK, SKELD, DRUSK, GAUR, ASHFANG,
MIREHOWL, NHALUUN. Kveld and other more common templates retain normal AI.
Underground encounters use normal AI; an off-level flight pauses until returning.

Two sightings precede ordinary combat. An unaware, armed beast notices a visible,
unconcealed player within 8 tiles. The first sighting cannot be hit or cornered;
the second can be caught by reaching adjacency or blocking every outward step.
Caught beasts become aware and Alarmed; a third approach uses ordinary combat.
An attack can start the flight before damage or evasion, including an invisible
attack. An invisible attacker triggers flight during either sighting, without
catching or damaging the beast. Invisibility and forest concealment alone never
start a sighting. Active flight takes priority over temple flight and idle AI.

The first steps occur immediately, including when a wander step enters sighting
range. Flight itself deals no damage, sets no alarm or spotted message, and leaves
no tracks. Each flee step deterministically chooses a legal neighboring tile that
strictly increases Chebyshev distance from the player; if none exists, the normal
catch/slip rules apply. Far paths are cleared when flight starts; normal far targeting
and tracks resume afterward.

Configuration in `content/enemy_config.json`:

```json
"rareFlee": {
  "maxRarity": 0.02,
  "sightings": 2,
  "sightRange": 8,
  "rearmDistance": 14,
  "fleeTurns": [8, 10],
  "paceFloorFirst": 1.5,
  "paceMin": 0.35,
  "paceMax": 1.5,
  "slipMinDistance": 12,
  "startledMinSpd": 5
}
```

Each turn adds `clamp(enemySpd / playerSpd, paceMin, paceMax)` to a fractional
accumulator and takes its whole-number steps. Sighting one has a minimum pace of
1.5 regardless of player speed. **Startled** temporarily raises effective enemy
SPD to at least 5 during either flight, including terrain modifiers; base template
stats are unchanged. The bonus ends immediately on catch or escape and is shown
with `Fleeing` and the Startled SPD bonus in the enemy tooltip. The internal
sighting counter is not shown; its two-encounter rules are unchanged. Normal terrain bonuses still apply.

Potion of Speed works through ordinary effective player SPD, costs its usual turn,
and should be drunk before approaching. Open-ground tuning across all nine templates,
starting gaps 3–8 and effective player SPD 3/5/8 found no catches at unboosted SPD
3 or 5. With a potion, 25/36 SPD-3 and 36/36 SPD-5 scenarios at gaps <= 6 caught
the beast; naturally fast SPD-8 characters can also catch it. Terrain and obstacles
change the outcome. Neither natural speed nor a potion defeats the first escape.

At the end of either uncaught flee timer, or when boxed in during the first flight,
the beast slips away. A BFS starts at the beast's own tile over walkable surface
terrain. Seeded selection uses vacant walkable tiles in the template's native
biomes, at least `max(slipMinDistance, rearmDistance)` from the player, without
shrinking the current gap. Home-return/reanchored beasts prefer the closest valid
tile to their home and re-anchor there. Occupancy is updated and move animations
are cleared so the beast never slides across the map.

If an enclosed component offers no valid tile, selection falls back to valid tiles
outside that component. A boxed escape logs: "The enclosed <name> stampedes through
you! You dodge aside, but it escapes!" It causes no damage, moves no player, and
changes no terrain. If the entire map has no valid destination, the protected
flight remains active and retries next turn. Relocation establishes the 14-tile
separation and re-arms the next sighting immediately; simply lingering nearby never
burns the next sighting.

| Enemy state | Default | Meaning |
|---|---|---|
| `rareSightings` | 0 | Number of sightings started, including current flight |
| `rareFleeTurns` | 0 | Turns remaining in current flight |
| `rareFleeAcc` | 0 | Fractional movement carried to the next turn |
| `rareArmed` | true | Another sighting may start after separation |

Save version 22 and replay initial snapshots preserve non-default fields only;
loading supplies finite numeric defaults and treats missing `rareArmed` as true.
Eligibility gates trigger, continuation, immunity and the temporary speed bonus.
Old recordings can diverge when they encounter a rare under these new AI rules.
Slips and new far routes use seeded RNG; animation timing never drives gameplay.

## Tracking beast trails

Only surface, non-flying, non-humanoid `far` wanderers leave tracks. Each successful
idle travel step (including a random detour) with a valid stored destination has
one seeded **3%** roll. Waiting, blocked movement, attacks, pursuit, teleports and
other wander modes produce no tracks and consume no track RNG. Tracks occupy the
vacated tile; a new impression replaces any existing track on that tile.

The bearing is the nearest of eight compass directions from the track tile to the
beast's stored **final destination**, captured when the track is made. It does not
follow the latest step, even on an obstacle detour, and does not change if the
beast later retargets or dies. North points up; northeast rotates 45° clockwise;
south rotates 180°. The approved transparent paw SVG and its PNG export live in
`img/overlays/`. Tile mode rotates the PNG; ASCII mode uses a directional arrow.
Tracks appear above terrain, below ground objects and actors, only on discovered
surface tiles in the viewport. Tracks do not affect movement, collision or loot.

Hover shows only `foot tracks?`, regardless of knowledge. Existing actor, NPC and
ground-object tooltips take priority. Inspecting the tile uses the usual inspect
key; special terrain and ground-object interactions retain priority. Without
Tracking it logs exactly: “You notice something that looks like foot tracks, but
cannot make sense of them.” With Tracking, it reports bearing and freshness:

| Age in turns | Example for a recognized species |
|---|---|
| 0–49 | Fresh wolf tracks lead northeast. |
| 50–149 | The wolf tracks lead northeast. |
| 150–199 | Fading wolf tracks lead northeast. |
| 200 | Track removed |

Species recognition requires at least one player kill of that **base species**;
prefixes share one counter. Every enemy killed through the normal kill handler
increments that species' count once. Unrecognized tracks omit the species and
append “You've never seen paw prints like these before.” Knowledge is checked
at inspection time, so killing a species also makes its surviving older tracks
recognizable. These counters are player knowledge, not a new visible bestiary.

`content/enemy_config.json → tracking` configures the chance, lifetime and freshness
thresholds. Age advances once per game turn across all levels, independently of
rendering, animation or inspection. Save/load and replay preserve track coordinates,
bearing, species and age, learned Tracking, and per-species kill counts. Tracks
remain environmental evidence across a permadeath character change; only the new
character's knowledge resets. Tracks are clues to an earlier destination, not a
guarantee that a living beast still occupies or is heading toward that location.

The first Old Hunter quest excludes enemies whose current wandering mode is
`far`, including trait-promoted wanderers. The later rare hunt deliberately
retains its far-wandering quarry.

The Old Hunter has a white `!` in the top-right corner of his glyph before the first conversation (when he has a quest to offer), after the first quest is completed and Tracking has been learned (when the rare hunt can be received), and whenever either quest can be turned in. Kill and investigation quests need the `ready` state; item quests require the requested item in inventory, even if killing its carrier has already set the quest to `ready`. An active item quest can also be turned in as soon as the item is carried. The marker is absent during unfinished quests and after the rare hunt is completed. His tooltip says `Click to talk`. The marker reuses the visual treatment of the Alarmed enemy indicator; it does not change NPC behavior or quest rewards.

When the requested delivery item is equipped, the Hunter acknowledges its
recovery: `I see that you have retrieved my <item>. You aren't trying to claim
it as your own now, are you? Will you give it back?` The quest remains open and
the equipment stays equipped. Unequipping the item permits the existing normal
backpack hand-in.

## Echo-Blight Horn

The Echo-Blight Horn is the reward for the post-Tracking rare hunt. Its inventory action
is **Use**. A successful use consumes one game turn and emits a brief cosmetic `♪`
sound-wave effect around the player; this animation has no gameplay RNG and is disabled
for replay simulation.

When used, living **non-humanoid** enemies on the player's current level within
**80 tiles Chebyshev distance** can answer, regardless of line of sight, darkness, forest,
walls, or other intervening terrain. To keep the signal readable, the horn reports at most
**3 distinct directions**. For each of the eight compass directions, only the nearest
qualifying monster is considered; the horn then reports the three closest of those
directional candidates. Equal-distance ties are resolved deterministically. Each reported
direction produces one deliberately imprecise log message:

`You hear something answering from <direction>.`

`<direction>` is one of the same eight compass bearings used by Tracking. Multiple beasts
in the same direction therefore produce only one answer. The horn does not reveal species,
exact distance, or map position. If no valid enemy answers, the log says `Nothing answers.`

The horn is reusable, but only after the character has **earned more XP** since its last
successful use. This uses `player.totalXpEarned`, the same proof-of-growth concept used
by Temple healing, rather than current spendable XP. A blocked reuse consumes no turn.
The horn stores the earned-XP total of its last successful use on that individual item;
the value is serialized with inventory state and therefore restored by saves and replay
starting snapshots.

</details>

---

# 52. Gravedigger
<details>
  <summary>Details</summary>

The Gravedigger is associated with the cemetery mystery.

The anomalous tombstone can trigger a special quest interaction.

The player can give the odd tombstone to the Gravedigger and gets a shovel in return.

After interaction, the delivered tombstone is inserted beneath the grave next to the gravedigger.

New worlds place a separate unfinished grave beside the Gravedigger, preserving
its terrain underlay on both the active and stored surface maps. If adjacent
placement is blocked, a deterministic search finds the nearest eligible land
tile around his home, avoiding NPCs, water, the temple, bell tower, huts, and
existing graves. Cemetery graves are never adopted as his unfinished grave.

The grave reference is reset for each new world and included in current saves
and the replay initial state. Loading preserves the referenced grave, regardless
of the Gravedigger's current wandering position, without placing another one.

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

Configured fixed stock includes a **Two-handed Sword for 600g**. Scroll stock at
world creation is **9 Homecoming**, **6 Identification**, and **3 Invisibility**.

During new-world NPC placement, Merchant candidate tiles are rejected if a
surface ground item already occupies that coordinate. As a compatibility guard,
loading a save removes any surface ground item found directly under the Merchant;
this repairs older worlds that already contain such an impossible overlap. All non-Drunk named NPCs use the Temple walk-distance placement rule described in section 50.

Stackable items are grouped by kind. Pickups and purchases add to an
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

Non-gear inventory items use their `sellValue` from `content/items.json`.
Values are independent of merchant stock and saved `merchantPrice` fields.

| Item | Sell value |
|---|---:|
| Life Potion | 8g |
| Potion of Speed | 12g |
| Scroll of Invisibility | 15g |
| Scroll of Identification | 20g |
| Scroll of Homecoming | 50g |
| Healing Herb | 4g |
| Mushroom | 3g |
| Edible Mushroom | 5g |
| Handful of Berries | 2g |
| Amber | 20g |
| Seashell | 10g |

Fresh Fish, Potato, tools, and quest/readable objects have a sell value of 0g
and cannot be sold. Homecoming costs 100g to buy; its nine-scroll initial stock
and purchase price remain configured in `merchant_stock.json`.

### Base purchase values

Every non-gear definition in `content/items.json` and every weapon, shield and
armor template has a nonnegative `baseValue`, representing the normal per-unit
purchase value. Generated artifacts take their `baseValue` from their selected
entry in `artifact_effects.json`. The common household starting-weapon value
and modifier purchase increment are configured in `loot_tables.json`.

Initial values preserve the prior pricing: ordinary base purchase values are
twice the existing sell value; gear modifiers add 10g per modifier point to
purchase value while continuing to add 5g per point to sell value. Starting
household weapons cost 4g and sell for 2g; household weapons generated as
ordinary tier-1 loot under the relevant world trait retain their 30g base value.
Base values and sell values can now be edited independently. Generated gear/artifact instances retain their chosen
base value through inventory, trading, theft, saves and replay.

### Buying from the Merchant

The normal default merchant buy price is:

```text
itemBaseValue(item)
```

However, an item with an explicit `merchantPrice` uses that price instead.

Merchant-generated stock can therefore use configured price multipliers or
fixed prices from `content/merchant_stock.json`. The exact multipliers and
fixed prices are configuration data, not hard-coded in `itemSellValue()`.

Fixed merchant weapons use `base` as a reference into
`content/gear_weapons.json`; combat stats are not duplicated in merchant
configuration. The guaranteed Two-handed Sword therefore inherits the
canonical tier-4 definition (11 ATK, 2 GRACE, two-handed), while
`merchant_stock.json` supplies only its fixed 600g purchase price. If a
configured weapon name cannot be resolved, the item is skipped and a warning
is written to the console. `ensureMerchantStock()` also reapplies the canonical
weapon fields to a matching item already present in saved merchant stock, which
repairs older saves containing the obsolete ATK-5 copy.

The important distinction is:

```text
sell price = itemSellValue(item)

buy price = explicit merchantPrice
            OR
            itemBaseValue(item)
```

Selling a stackable item sells one unit at its per-item sell value.

---

# 55. Herbalist

The Herbalist opens services while adjacent:

- Mushrooms cost 2g each to purify. The attempt has a 50% chance of poison
  and removal (per each mushroom); successful results become Edible Mushrooms.
  The Herbalist processes up to `floor(gold / 2)` mushrooms per visit in
  inventory order, leaving any unaffordable mushrooms in their stacks and
  reporting that not all could be checked. With fewer than 2g, no purification
  or RNG roll occurs.
- **Buy Life Potion (100g)** supplies one Life Potion per purchase, with
  unlimited stock. Buying requires adjacency to the surface Herbalist and
  enough gold. It adds to the normal potion stack, uses no turn or RNG, and
  records a Herbalist purchase action for replay. Existing gold/inventory
  save fields hold the result; no separate stock or cooldown is needed.
  The normal resale value remains 8g, so buying and reselling cannot produce gold.
- Brew Life Potion consumes three Healing Herbs and 10g for one Life Potion.
- Brew Life Potions (use all herbs) makes the maximum affordable batch:
  `potions = min(floor(herbs / 3), floor(gold / 10))`. Six herbs and at least
  20g yield two potions; seven herbs leave one herb. With six herbs and 10g,
  only one potion is brewed and three herbs remain. Herbs are consumed in
  inventory order across stacks. Both options retain the same per-potion cost,
  consume no turn, and use no RNG. An unsuccessful attempt consumes nothing.
  Batch brewing is recorded as one replay action and follows the same rule
  during playback. Buy Life Potion uses the existing potion SVG inventory icon
  (with the life-potion tile as an image fallback). Other service icons retain
  their current presentation.

The Herbalist's other purpose is to hint that forests can be foraged for
remedies, while also warning that forests are dangerous (because forest tiles
can trigger an ambush). Forest ambush candidate selection excludes enemy
templates with `aggro: 0`; passive creatures do not initiate ambushes.
Each step onto a forest or ancient-forest tile rolls the base
`surfaceEnemies.forestAmbushChance` of **4%**. A spawn still requires an open
adjacent tile of the same forest type and an eligible enemy template; the roll
alone does not guarantee an encounter. Ancient-forest ambushes use tier 3+
templates, ordinary forest ambushes tier 1–2. Elves, invisible players, and god
mode do not trigger forest ambushes. A spawned ambusher begins aware and
Alarmed immediately, gaining the usual **+2 effective AGGRO** and its marker;
the separate bystander sound message does not appear. Its Alarmed level
identity is stored through the normal enemy save fields.

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
7
```

mysterious tombstone inscriptions.

They are dropped by Liches.

Each Lich kill has an 80% chance to produce one while any remain.

The seven inscriptions form a fragmented story, including:

`Men call it holy, yet the beasts sense what men do not.`

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

The odd tombstone has a future death date. Reading it in inventory preserves
its inscription/name and dates, prefaced with
`Odd tombstone found in the ruined cemetery.`

It can be picked up as:

```text
Odd Tombstone
```

It can then be given to the Gravedigger.
Inspecting it in inventory displays its stored inscription, including the
dead person's name and birth/death years, with a name/date fallback for older
items without an inscription.

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
Picking it up removes the ground object and refreshes the canvas and HUD
immediately, without waiting for another movement or animation frame.

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
39
```

Saves are JSON files.

Version 39 stores the dungeon-package shortcut registry and each deep level's
package identity; versions 34–38 introduced the Ruins lift, traps, distinct
terrain states, room/vault descriptors, room graph and progression-key state
(see section 13). Saves from other schema versions are rejected.

Version 33 extends the generic `deepLevels` chain with all generated Dwarven
Ruins floors and their exact transition terrain/discovery state. Saves can
restore an active chain depth below z:-3 directly; replay starting snapshots use
the same restoration path. The Ruins floor map and its serialized local map are
kept as one runtime object after loading so later persistent dungeon mutations
cannot desynchronize the two representations. No compatibility path is added
for older save/replay schemas.

Version 32 stores humanoid gear effectiveness, applied equipment bonuses, and the
spent death-shield flag. Current saves and replay snapshots restore these values
directly without rerolling or reapplying stat bonuses. Older schemas are rejected.

Version 30 adds the generated decorative cave overlay list. Current saves and
replay snapshots restore it without rerolling placement or consuming RNG.

Version 29 adds the character’s strongest-kill snapshot and generated
gear/artifact base purchase values. Player initialization and new-character
reset clear the achievement; current saves and replay starting snapshots
restore it directly. No older-save migration or historical-kill reconstruction
is added. Price metadata never adds RNG calls.

Version 28 adds `stolenItemEquipped`, initialized false and preserved in saves
and replay snapshots. Enemy stats are saved after gear bonuses are applied;
restoration does not apply them again. The flag distinguishes stolen gear from
ordinary equipment so death cannot duplicate the stolen item.

Version 27 stores each enemy’s `theftUsed` flag and exact `stolenItem` object,
including stack count, quest identity, affixes and artifact properties. Both are
initialized on spawn and restored directly for saves and replay snapshots. A
stolen item dropped on death uses the existing serialized ground-item list.
No compatibility for older saves is added.

Version 26 stores the low-HP warning latch and generated fort skeleton loot
eligibility. Armor items store their complete SPD penalty. Current saves and
replay starting snapshots restore these values directly; no older-save
compatibility is added.

Version 22 adds sparse rare-sighting count, remaining flee turns, fractional pace and
re-arm state to enemy saves and replay initial snapshots. Default values are omitted;
loading restores them without rerolling or restarting a sighting. No migration for
older save versions is added. Older replay recordings can diverge on rare encounters.

Version 21 adds the post-Tracking rare-hunt state and the Echo-Blight Horn's per-item
XP-gated reuse state. The rare hunt continues to use the existing serialized Old Hunter
quest object and exact enemy IDs; the horn's `lastUseTotalXp` travels with its inventory
instance. Replay initial snapshots preserve the same state. No older-save migration is
added.

Version 20 adds per-enemy ranged shooter role and exact remaining ammunition.
The save stores the rolled shooter ability plus `shotsRemaining`; projectile type is
derived from the current configured ability. Replay starting snapshots therefore keep
the same shooter assignment and partial ammunition (for example, 7/10 remains 7/10)
without rerolling on load, z-level changes or replay. No older-save migration is added.

Version 19 adds Tracking knowledge, per-species kill counts, surface track records
and their ages, plus each far traveler’s remaining route. Turn count, consecutive waits and the Old Hunter quest serial
are saved too; replay restores their actual starting values rather than assuming
zero. No migration for older saves is added for these new fields.

Version 18 persists Fisherman hut/quest state, exact enemy IDs and the next-ID
counter, and all Swimming skill/practice/session fields. Loading does not spawn
another target, infer completion from its name or re-grant a lesson. Fisherman
talk, fish consumption and god-mode disabling use the shared replay action
handlers; movement/waits run the same deterministic swimming mechanics during
playback. No Fisherman retro-generation is performed for older worlds.

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

Current gameplay state requires **version 39** saves. Other versions are rejected
before world state is changed; begin a new world when upgrading. No migration is provided for older saves or replay snapshots.

Every persistent feature must cover initialization, current-save serialization
and restoration, replay starting state, and character-reset behavior. Existing
map identity remains authoritative: `levelKind` distinguishes the Crypt from
chain maps sharing a numeric depth, and current z:-3 fort enemies stay on z:-3.

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
cardinal neighbors are walls. Surface visibility is unchanged. The same module also
exposes its deterministic tile-center line trace for shooter sight/projectile checks;
using that geometry for combat does not alter the player's surface discovery/FOV rules.
Projectile collision then applies its own blocker rules on top because visibility and a
physically clear shot are intentionally different concepts.

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

The full-map overlay has up/down controls for browsing the surface and each
underground map whose discovery grid contains at least one revealed tile.
The zoom controls sit on the left of a single toolbar, with the compact
level label and up/down controls on the right.
Generic z:-2 caves and the separate Crypt Level 2 have distinct entries,
despite sharing a depth. Historical views paint only their saved discovered
tiles; undiscovered terrain stays fogged. The full-map player marker pulses
only on the currently occupied map. Browsing does not change the active game
map, field of view, side minimap, save state, or replay RNG. Reopening the map
starts on the current level.
The active minimap cache also checks the map and discovery-grid identities,
because generic and Crypt z:-2 maps can have the same depth and cave index.

The hidden desktop side minimap is not repainted on mobile. Its dirty flag and
player coordinates remain pending until it is visible again; opening the world
map still renders independently. Idle surface terrain animation uses clipped
damage regions around animated tiles, redrawing overlapping terrain and all
upper layers in their normal order without a persistent scene cache. Underground
views and unsettled cameras retain full rendering. Movement, effects, visibility
changes and zoom continue through the full renderer with a shared frame timestamp.

At the end of a movement animation, buffered movement/automatic-path processing
is scheduled as a timer task after the animation frame, rather than running the
next world simulation inside that frame. The camera input lock remains held until
that task executes, and stopping the camera cancels the task. Scripted tests must
wait for this lock to clear: awaiting `tryMove()` alone does not await animation
or a buffered turn.

Therefore:

> Existing map data does not imply that the player has discovered that location.

---

# 69. UI Controls

Wide, fine-pointer desktop layouts use a UI font scale of **1.1**; narrow
or touch layouts retain **1.0**.

On desktop, the XP bar displays `<current> / <needed> XP` centered inside the bar.
The character statistics show steps alongside elapsed turns and list how many
of the four world edges have been discovered, with their compass directions.
Reached directions appear as uppercase initials (`N`, `S`, `E`, `W`).
Touch layouts retain their previous compact XP bar and steps row and omit the
world-edge row. These are display-only changes; the underlying XP, turn and
edge-reward rules are unchanged.

### Active player statuses

Compact badges sit inside the bottom-left of the canvas in both tile and ASCII
modes. Only active effects appear; the strip disappears when empty. Backgrounds
are 70% opaque (90% when hovered, focused, or inspected); text and icons remain
fully opaque. Badges wrap upward on narrow screens without resizing the canvas.
Hover, keyboard focus, or tap reveals details above the row. Tap again, tap
outside, or press Escape to dismiss. Inspecting a badge does not spend a turn.

| Effect | Counter |
|---|---|
| Freezing | `hit in Nt`: cold turns until the next damage tick, calculated as the configured damage interval minus the current cold counter. This is not an expiry timer. |
| Temporary ATK / DEF / SPD penalty | Remaining turns; penalties with the same stat and expiry share a badge showing their combined amount. Different expiries stay separate. No artifact identity is revealed. |
| Berry regeneration | Remaining duration, including duration added by further berries. |
| Invisibility | Remaining duration; god-mode invisibility shows `∞` while enabled. |
| Speed potion | Remaining duration. |
| Drowning | Condition only, no countdown. Active while consecutive deep-water time exceeds the learned safe limit; each movement/wait costs 5% max HP, minimum 1. |

Instant healing and permanent racial traits do not create timed badges. The UI
reads the existing resolved gameplay counters, so activation actions and all
other turn costs retain their current behavior. Save loading and replay redraw
these same counters; no additional persistent state or RNG calls are introduced.

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
| G | Toggle god mode on or off                                       |

Tile size starts at **40** canvas pixels on desktop and **56** on
coarse-pointer mobile devices (four additional zoom steps). It changes in
four-pixel steps from 20 to 96. Desktop recomputes the camera's tile count from available stage width
and height, keeping 7–50 tiles horizontally and sizing the canvas to complete
tiles. A cramped window caps the effective tile size so the canvas fits.
On desktop, collapsing both the side map and keyboard hints releases their shared
right-side reservation and expands the canvas; collapsing either panel alone
keeps that reservation. Both toggles recalculate the viewport. On
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

The message log keeps the newest entry fully bright and gives the second- and third-newest
entries slightly lower brightness. Older history is further dimmed and mildly desaturated so
recent consequences remain visually prominent without hiding previous messages. Loot messages
use white as their base text color; when the looted object has an item tier, the item name uses
the same tier color as inventory/equipment UI.

---

Desktop layouts with a mouse or other fine pointer use a brown scrollbar thumb
and dark brown track, including devices that also support touch. Narrow touch
layouts keep native scrollbar styling. The treasure map renders its terrain in sepia while
retaining the red treasure X, with no effect on world or discovery state.

# 70. Mobile

Touch controls reuse the same gameplay functions as keyboard controls. Enemy
inspection separates SPD and hit chance with a centered dot on mobile; desktop
retains its existing line break.
The inspection prompt and touch controls are hidden while a modal overlay is open. The Bestiary keeps its own full-screen scrolling list and close control on touch layouts.
The backpack opens the inventory, the magnifier runs the normal inspect action (including village huts), and the hand button uses the normal forage/loot action. Each button handles touch and click input while suppressing the duplicate click browsers emit after a touch.

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
Walking uses an uncapped `requestAnimationFrame` loop for a 140 ms camera pan. The renderer redraws the viewport each frame, including terrain, items, and creatures. Occupied tree-canopy overlays now consider only entities near the visible viewport; offscreen entities cannot contribute to the current frame. Ground creatures remain behind the canopy; flying enemies and their status markers are drawn after it and remain visible above trees. This reduces per-frame world scans without changing visibility or turn timing. Frame pacing and canvas scaling on a specific phone still require device measurements to diagnose any remaining glyph shimmer.

There is currently no mobile button for waiting (skipping the turn).

---

# 71. Debug Mode

`G` activates a developer/debug mode and makes the player invisible. Pressing
`G` again turns god mode and its invisibility off, restoring normal movement
restrictions and drowning. Revealed maps and granted stats/gold remain.
Holding the key does not trigger repeated toggles. The key press is a replay
action; older recordings that toggled only god-mode invisibility still replay
with their original behavior. The visibility flag is saved; older god mode
saves load with invisibility on.

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

Do not infer a general system from a specific implemented mechanic:

- general crafting (the Herbalist brews potions; there is no general crafting system)
- general mining (shovel digging is restricted to sand; see section 79)
- skill tree (Tracking and Swimming are learned individually; there is no tree)
- generic cross-NPC quest framework (the Old Hunter and Fisherman Hermit have NPC-specific quests)
- generic wound system (wounded enemies can flee, but there are no persistent wounds)
- bleeding
- broken limbs
- generic burning
- monster-vs-monster combat
- general rest/sleep system
- New Game+
- meta progression
- multiplayer
- general status-effect framework (specific effects have separate counters and UI badges; see section 69)
- general hunger/thirst survival system (berries, fish, mushrooms and herbs are consumables)

Poison, enemy abilities, player critical hits, and the strongest-kill achievement
are current; see sections 20, 28, 4 and 84. Design notes/TODOs are **not implementation**.

---

# 74. Planned / Unimplemented Feature Pool

Ideas not implemented as general systems or named locations include:

### Survival

- meat
- cold protection
- a general hunger/thirst system
- a general rest/sleep system

### Combat

- persistent wounds
- bleeding
- broken limbs
- burning
- dispel

### World

- monster-vs-monster encounters
- sounds

### Progression

- skill tree
- general cross-NPC quest framework

### Equipment

- blacksmith
- player-applied enchantment
- general mining
- general crafting

### Exploration

- pyramids
- shipwrecks
- observatories
- witch huts
- player-placed custom map markers

### UX

- improved path visualization
- unidentified consumables

Already implemented, not planned: freezing (§12, §69); poison, summoning and
knockback (§20); traps and Dwarven Ruins (§13); expanded wandering (§22);
quests (§50–51); special cave scenarios (§15); volcanoes (§9–10);
achievements (§4, §84); Bestiary (§4); monster victory progression (§31);
berries and foraging (§47–48); and mobile controls (§70). These are
NPC- or feature-specific where the corresponding general system remains absent.

---

# 75. Current Feature Inventory

## Implemented

**Character and progression**

- [x] Character naming
- [x] 10 races and race perks
- [x] Leveling, XP, HP, ATK, DEF, SPD, GRACE and Magic Find
- [x] Learned Tracking and Swimming; strongest-kill achievement
- [x] Normal death recovery, permadeath and persistent corpse loot

**Movement, world and exploration**

- [x] 8-direction movement, auto-pathing and swimming/drowning
- [x] Procedural surface; 260×260 default world (variable area under Cursed world)
- [x] Terrain effects, rivers, volcanoes and lava, snow/freezing, taiga and Ancient Forest
- [x] Temple, village, cemetery, Black Pillar and Big Bell
- [x] Surface caves, deeper caves, crypt, mausoleum and ordinary cave scenarios
- [x] Dwarven Fort (D0) and Dwarven Ruins (D1–D5): stairs, doors,
      locks and keys, progression gates, shortcut lift, traps, encounters,
      rooms and vaults
- [x] Foraging, sand digging, buried treasure and Scarab encounters
- [x] Fog/discovery and beast-trail Tracking

**Enemies and combat**

- [x] Enemy roster, stats, prefixes, equipment, AI, aggro, pathfinding
      and home/roam/far wandering
- [x] Combat, misses, mitigation, armor glancing, player and enemy critical
      hits, weapon timing and extra attacks
- [x] Flying, evasion, ethereal, true sight, death shield and gang power
- [x] Wounded fleeing, Thief, Enrage, critical knockback, charge and pull
- [x] Summoning, lifesteal, poison and ranged shooter variants
- [x] Alarmed, rare monster flight, Carrion Instinct and sleeping Wyverns
- [x] Troll regeneration and enemy victory levels after normal-mode kills

**Items, NPCs and mysteries**

- [x] Loot, chests, equipment modifiers, artifacts, identification and curses
- [x] Consumables, regeneration, speed and invisibility
- [x] Old Hunter quests, rare hunt, beast trails and Echo-Blight Horn
- [x] Fisherman Hermit/Empty Nets quest and Swimming lesson
- [x] Gravedigger, Drunk, Merchant/trading, Herbalist/services and Ancient Lich
- [x] Tombstones, Bell mystery, Black Pillar and Dwarven Fort mysteries

**Persistence, records and interface**

- [x] Save/load, persistent RNG, replay and Cursed world traits
- [x] Online Graveyard (optional), Bestiary and strongest-kill record
- [x] Desktop controls, active-status badges, mobile controls and character sheet
- [x] Developer mode

## Known gaps / unverified

At the Dwarven Ruins traps batch 5 (save schema 35), movement, blocking,
kill credit, save/replay, seeded generation and safe routes across 3–5 floors
were checked in Node with mocked DOM/canvas. No smoke-spec tests were added;
browser/Cypress visual checks were not executed in that batch. This is a
historical test-status note, not a claim about the current release.

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

Current invisibility suppresses normal enemy pursuit/attacks, but an
invisible player's attack can provoke one immediate reaction (section 47).

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
- The tile is recorded in `dugSandTiles` and immediately redrawn so its hole
  becomes visible in tile-image mode (or its darker background in ASCII mode).
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
| 11 | Find a rusted fork |
| 12 | Find a pair of old, worn boots, which are discarded |
| 13 | Find a bone |
| 14 | Find a broken shovel handle |
| 15–16 | A Scarab emerges beside the player, if a valid adjacent tile is available |
| 17 | Find a silver spoon; flavor message only |
| 18–100 | Find nothing |

</details>

Amber (worth 20g) and Seashell (worth 10g) are stackable inventory items.
The silver spoon has a **1%** chance on an ordinary dig and logs “You dig up a
silver spoon. Someone threw away a good spoon.” It is never an inventory item.
This replaces one empty outcome (nothing: **84% → 83%**) without changing other
loot chances, guaranteed buried finds, turn costs or the number of RNG rolls.

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
  version: 2,
  initialState,
  actions: [],
  rng: []
}
```

The replay `version` is independent of the game's `SAVE_VERSION` (currently 39).
The replay field is written for characters with a recording, including after
watching it; characters without one do not gain an empty replay structure.
RNG stack-trace diagnostics are disabled by default (`RNG_DEBUG` in
`src/replay.js`). Loading a recorded current-schema save drops its optional `_rngCallers`
diagnostics, so saving it again retains its actions and RNG values without
the debug payload.
Watching a replay temporarily rewinds the game; on completion (or desync) the
live state from before playback is restored, including its RNG state and
recording. Loading a recorded save resumes appending actions to that replay.
NPC save records include `talkFreezeTurns`. This counter is deterministic gameplay
state, not presentation state: while it is positive, `npcTurn()` skips that NPC
without consuming its wandering RNG. Persisting it is required when a recorded
run is saved/loaded or when the pre-replay live snapshot is restored; otherwise
continuing the recording after a replay can append actions from a different NPC
RNG state than a full replay reconstructs.

The save also stores `herbalistGiftGiven`. Opening the Herbalist service window is
a recorded non-turn replay action, so replay applies the first-gift transition at
the same interaction boundary as the live run.

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
require a save-version bump because the loader can fall back to the existing
odd-name relationship when this field is absent from current-schema data.
Subsequent save versions added per-enemy wandering state, temporary Alarmed
status and the current persistent skill/evidence fields (see section 66).

## Recorded actions

Replay records gameplay actions at their shared gameplay-function entry points,
not raw keyboard events. Current action types are:

- `move` - one requested grid movement, including movement into an enemy (attack),
  an NPC (interaction), or an otherwise non-walkable destination;
- `inspect` - inspect / surroundings action;
- `forage` - normal forage/search/loot action;
- `dig` - shovel digging, including the sand+shovel `F` shortcut;
- `skipTurn` - wait action;
- `talk` - direct Old Hunter and Fisherman Hermit interaction;
- `buy` / `sell` - Merchant transactions;
- `herbalist` - mushroom purification, potion brewing, or potion purchases;
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

The replay save/load E2E test starts a character through Begin and waits for
world generation to finish before arranging its deterministic Temple fixture.
It then restarts recording so the fixture is captured in `initialState`, walks
and talks to the Old Hunter, saves and loads, replays, continues the run, and
repeats the save/load and playback checks. Fixture changes made after the
recording snapshot would not be represented by the replay actions.

## Playback

**Show Replay** (HUD, next to Save/Load) appears whenever replay data exists for
the current save. Clicking it:

1. snapshots the live state and turn counters for restoration;
2. closes transient overlays and clears pathing/pending movement;
3. loads the replay's deep-cloned `initialState` through the normal load path;
4. disables recording while watching so playback cannot append new actions;
5. resets `turnCount`, `consecutiveWaitTurns`, and `oldHunterQuestSerial` to their
   run-start values;
6. executes the recorded actions in order through the normal gameplay functions;
7. restores the live state, RNG state, and recording when playback finishes or
   desynchronizes. Loading another save during playback replaces that state.

The current inter-action playback delay is **12 ms**. The delay is between
whole actions, not individual RNG calls: an action's movement/combat/loot and its
enemy/NPC turn happen together before the next action is scheduled.

The replay button becomes **Pause Replay** while playing and **Resume Replay**
while paused. Normal keyboard, canvas-click, and touch gameplay input is inert
while playback runs. Log messages appear in full immediately, including a
message that was already typing when playback started. Loading a save still
works and cancels playback first.

A replay is therefore a deterministic re-execution of the recorded player action
stream against the recorded starting state and recorded RNG outcomes; it is not
a video recording or a sequence of pre-rendered frames.

The optional online Graveyard is never called from replay execution. The central
recording entry point checks `replayPlaying`, `replaySimulationMode`,
`replayAnimationsDisabled`, `replayActionRunning`, and `replayCurrentActionIndex`
before generating a UUID or touching storage/network. Opening the Graveyard
while replaying makes no database query. Graveyard UI activity is not a recorded
action and never draws from the gameplay RNG.

## Not implemented (by design, v1)

Export/import, sharing, thumbnails, scrubbing, fast-forward, variable speed,
frame stepping, video/screenshots, a dedicated Stop button, and restoring the
pre-replay state from the UI remain unimplemented. The pre-replay snapshot is
kept in memory for the current playback session but is not exposed as a restore
operation.

---

# 84. Online Graveyard / Records (optional)

The desktop and mobile HUDs have a 💀 button (desktop tooltip: Graveyard)
opening an in-game overlay with the 50
most recent deaths (`created_at DESC LIMIT 50`). All, Permadeath, and
Non-permadeath each use a separately limited query. A record can be expanded
for equipment/stats. Equipped gear shows the inventory stat line in brackets,
for example `Meat Cleaver (ATK 1, GRACE 1)`; earlier records without the
additional item stats still show their stored names. Red highlights permadeath;
amber highlights normal deaths.
The HUD button remains reachable during character selection and other narrow-
window dialogs. These dialogs reserve the measured HUD area above their content.
Opening/closing never consumes a game turn or changes replay/save state. The
overlay fills the viewport with one scrolling records list; its title and X
close control remain visible.

Architecture: GitHub Pages -> lazily loaded, pinned Supabase browser JS SDK
(`src/graveyard.js`) -> Supabase Data API -> PostgreSQL `death_records`. There
is no backend, account, service key, build step, reward, or gameplay dependency.
Edit `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` at the top of
`src/graveyard.js`. Use the Project URL and browser publishable key (or legacy
anon key), **never** a secret/service_role key. The schema, policies, indexes,
validation and pre-request rate limit are in `supabase-graveyard.sql`: paste it
into the Supabase SQL Editor of a new project. Keep the Data API enabled. No
other dashboard configuration is required for a new default project. If the
project already has a `pgrst.db_pre_request` hook, compose the checks rather
than overwrite it.
Before deploying the achievement-enabled client, the database needs a nullable
JSONB `strongest_enemy_killed` column with bounded name, species, tier,
strength and stat snapshot validation. The migration is not present in this
repository. Older online records display “None”. The frontend includes the
column in both death submission and Graveyard queries.

For an existing Graveyard database, apply `supabase-graveyard-drowning.sql`
before deploying the client so its cause constraint accepts drowning deaths.
For poison support, `death_cause_check` must also allow `poison` in both
existing and new databases before deploying the poison client. The current
`supabase-graveyard.sql` and the drowning migration allow `drowning` but not
`poison`; a poison migration is not present in this repository.

The browser's `vagabond_online_player_id` localStorage entry is a random UUID
created with `crypto.randomUUID()` (secure random-bytes UUID fallback). It is
reused on this browser, not a verified identity. If storage or secure randomness
is unavailable, submission is skipped. A fresh `death_event_id` is generated
once on every real `die()` call; `deathTransition` prevents repeat callbacks,
and the database UNIQUE constraint rejects duplicates. Each new character
gets a random ID saved with the character. A browser-local
high-water death count for that ID is reconciled when a save is loaded and
advanced on each live death. Thus loading an earlier save on the same browser
does not reuse a death number; older saves without a character ID use their
world seed, name, race, and mode as a legacy identity. This does not synchronize
counts across browsers or recover records from a cleared browser store.
Replay playback neither reads nor updates this count. Death number is
incremented before snapshot, but the snapshot is taken before XP/max-HP
penalties, backpack drops, teleport, corpse transfer, or character reset.
The mode is read from `player.permadeath` directly; non-permadeath deaths each
produce a separate event and the same character continues; a permadeath
produces exactly one final event. Requests are fire-and-forget.

Exact uploaded columns (apart from server-generated `id` and `created_at`):
`death_event_id`, `killed_at`, `last_position` (x/y/z, level kind, tile/biome),
`player_id`, `character_name`, `race` (game race ID), `permadeath`, `level`,
`cumulated_xp` (`totalXpEarned`), `death_number`, `killer_name`,
`killer_prefix`, `cause_of_death` (`enemy`, `poisonous_mushroom`, `freezing`,
`drowning` (shown as Drown), `poison` (shown as Poisoned to death),
or legacy/unknown `environment`), `max_hp`, `atk`,
`def`, `spd`, `grace`, `gold`, `weapon`, `armor`, `shield` (base equipment
names), `equipment` (JSONB equipped-item snapshots with base/name, actual
ATK/DEF/SPD/GRACE, speed penalty, tier, modifiers, XP bonus, replay ID if
present, artifact effect ID when present, and the inventory-formatted
`stat_line`), `artifacts` (compact JSONB artifact inventory snapshots with
their `stat_line`), `steps_taken`,
`creatures_slain`, `strongest_enemy_killed` (name, species, tier, strength and
permanent ATK/DEF/SPD/GRACE), `turn_count` (turns in the current page session, reset on
load), `world_seed` (original seed restored from saves), and `game_version`
(the current release version from `src/version.js`). `WORLD_SEED` is reassignable so
loading a save restores its original seed instead of reporting the new page
load's seed. The service worker imports that same version file for its cache
name; bump `src/version.js` for each release. Registration bypasses the HTTP
cache for service-worker imports so a changed version file triggers an update
even when `sw.js` itself has not changed. Playtime is not recorded:
there is no reliable persisted playtime counter. Neither full saves nor
replay/RNG histories are uploaded. The existing service worker precaches
`src/graveyard.js`, `src/version.js`, and CSS under the current versioned cache.
The cross-origin SDK is **not** precached or required for boot,
and `navigator.onLine === false` skips SDK loading and every SELECT/INSERT.
Offline deaths are not queued or retried.
SDK failures and network request timeouts display only a generic UI state or
a console warning; gameplay never waits for them.

Freezing and poisonous mushrooms pass their actual fatal cause to `die()`; an
enemy death remains `enemy`. Older or otherwise unspecified environmental
records remain `environment` and are displayed as unknown rather than guessed
from location or inventory. Cursed artifacts currently clamp direct HP loss
to at least 1 HP: they cannot be the direct fatal cause, so there is no
`cursed_item` record and this feature does not change that gameplay rule.

RLS permits only anonymous SELECT and INSERT; there are no UPDATE/DELETE
grants or policies. SQL CHECK constraints validate game fields. A Supabase
Data API pre-request hook counts at most 20 POST `/death_records` requests per
gateway-reported source IP in each fixed UTC hour, with an atomic counter;
a trigger rejects multi-row inserts. Only an HMAC of the IP, keyed by a secret
in the unexposed `private` schema, and its hour bucket are retained; raw IPs
are never stored in application tables. Old buckets are removed on later
write requests. This hook relies on Supabase's `x-forwarded-for` forwarding:
verify your gateway overwrites/normalizes it; a client-controlled forwarded
header may weaken the per-IP quota. An IP limit also affects players sharing
a NAT. The publishable key and page Origin/Referer cannot prove a request
came from the genuine game. RLS and validation are abuse mitigation, **not
cheat protection**: clients can modify JS/stats, impersonate names or browser
IDs, forge plausible rows and modes, or send direct Data API requests.
An authoritative server would be required to verify a run. Never treat the
two death-mode populations as interchangeable in later balance analysis.
Remote text is rendered with DOM `textContent`, never interpolated into HTML.

---

# 85. Cursed World

## Selection

The **Cursed world** checkbox in character creation is off by default. Its
brown desktop tooltip warns that this experimental mode can be unbalanced. On
mobile-sized or touch screens, the three checkboxes form separate full-width
rows, and the warning appears below them only while Cursed world is checked.
The desktop tooltip is anchored to
the Cursed world label; each checkbox sits beside its text with a small fixed
gap. With the checkbox off, generation
uses the base configuration and logs no trait line.
The mobile checkbox layout and the warning's checked/unchecked visibility
are covered by `tests/e2e/race-options.cy.js`.
After a valid name/race is confirmed, a cursed world draws the requested
number of traits before world generation. All generation retries use the
same resolved effects. Each nonempty `flavor_text` is logged on a new line
after the introductory story text, in selected order. A trait without
`flavor_text` is silent but fully active. The flavor describes evidence in the
world rather than revealing the changed parameter.

`content/world_traits.json` is an object:

```json
{
  "traits_per_world": {"count": "random", "min": 1, "max": 5},
  "traits": [
    {
      "name": "example_trait",
      "flavor_text": "The paths seem different each morning.",
      "_note": "Attempts 8 shallow caves instead of the default 6.",
      "direction": "one_way",
      "exclusiveGroup": "example_group",
      "effects": [
        {"param": "caves.shallow.attemptedCaves", "type": "additive", "value": 2}
      ]
    }
  ]
}
```

This example is illustrative and is not an active trait. Every active trait
has a human-readable `_note` explaining its mechanical changes relative to
the base values in
`world_generation.json` (or `map_config.json` for world size). `_note` is
metadata for developers and is not an effect or a player-facing flavor line.
`count` may be an integer **1–5**, or `"random"` to draw an integer inclusively from `min` to
`max` (default **1–5**). The chosen count is fixed for this world. Candidates
are drawn without replacement using the seeded gameplay RNG. The optional
positive `weight` defaults to `1`; `the_bell_is_guarded` uses `0.25` so it is
less likely to be drawn.

`exclusiveGroup` prevents two entries in the same group from being active
(e.g. two competing snow climates). `excludes` can name further incompatible
trait IDs. If a conflicting pair appears in the initial draw, a trait marked
`direction: "one_way"` wins against `"two_way"`, independent of draw order.
The other candidate is dropped; the selection fills the empty slot with the
next nonconflicting candidate, if available. The current 40-entry pool has
ample room to reach the configured 1–5 active traits. Group conflicts do not
make every modifier to a shared parameter exclusive: compatible traits can
stack, and their numerical effects are applied in selected order.

## Effect format and bounds

`name` is the stable ID; `effects` is an array of operations. The standard
`param` is a dot-separated path to a numeric leaf in
`content/world_generation.json`, including numeric array indices such as
`dwarvenFort.roomCountRange.1`. Only `type: "additive"` is supported for these
paths. `value` is a fixed number or a `[minimum, maximum]` range. Each ranged
effect rolls independently using the seeded game RNG, after selection.
Positive-only ranges always raise that parameter; negative-only ranges always
lower it; a range spanning zero can do either. A trait's several ranges are
**not** linked into a single warm/cold direction: they can partly cancel.
Unknown numeric paths, unsupported types, and nonfinite resolved effects fail
world generation visibly rather than silently doing nothing.

The special effect `{"param":"map.world.area","type":"scale_area",
"value":[0.5,1.25]}` changes *surface area*. It scales both default world
dimensions by the square root of one shared area roll and rounds to tile
counts. Thus a 260×260 default becomes about **184×184 to 291×291**, not
130×130 to 325×325. This interpretation preserves the promised 50–125% tile
area and leaves more room for the guaranteed two distinct z:-2 caves. The
`world_size` trait has no `flavor_text`, so it logs nothing. The surface
population and ordinary chests already scale by eligible walkable tiles;
special guaranteed spawns do not scale by area.

Only `surface.snow.bandFraction` has a dedicated clamp (0.08–0.55). Other
probabilities and nonnegative sizes are controlled by the configured values
and their conflict groups. Do not add large offsets without checking
endpoints **and** combinations. `surface.snow.bandFraction` extends the
candidate snow band; decreasing `surface.snow.coldnessThreshold` lets more
eligible land tiles become snow; `surface.snow.edgeNoiseAmplitude` changes the
raggedness. `cold_world` uses all three. `wild_weather` now independently
rolls −0.10–+0.10 band fraction, −0.08–+0.08 threshold, and −0.15–+0.15 edge
noise amplitude. It can look nearly normal or produce contradictory cues.

## Trait families

The table groups implemented traits by their main effect. Exact numbers and
all parameter paths live in `content/world_traits.json`; the following entries
are the current behavior, not future proposals.

| Family | Traits | Behavior and notable constraints |
| --- | --- | --- |
| Climate and size | `cold_world`, `wild_weather`, `world_size`, `drought` | Snow expands near the Temple, snow parameters vary both ways, total map area rolls silently, or water and forage become scarce. The two snow climates conflict; specific cold wins. |
| Cave extent | `hollow_world`, `shallow_earth`, `great_caverns`, `world_beneath_the_world` | Deep layouts enlarge; shallow passages contract with more caves and additional entrances; all caves open up; or more branches, threats and chests appear. These share a cave scale exclusion group. The guaranteed grotto/burrow pair still uses different algorithms. |
| Deep cave character | `wormways`, `halls_below`, `flooded_depths`, `fungal_bloom`, `deep_bounty` | Optional branches favor burrows or grottos, more grotto water forms, Fungus is more common, or supplies and threats increase together. Wormways and Halls Below conflict; guaranteed distinct z:-2 caves remain. |
| Forest and wildlife | `ancient_wilderness`, `eyes_in_the_trees`, `wild_frontier`, `migration_season`, `restless_wilds`, `great_migration`, `watchful_world` | Ancient forest/ambush/rough terrain vary; mobile enemies promote to roam/far; grouped migrants start near edges; enemy aggro reach grows by one. Existing underground wall sight checks still apply. Forest and migration themes each have a conflict group. |
| Enemy quality | `champions_age`, `mundane_age`, `wild_blood`, `uncertain_blood`, `things_below` | Random prefixes rise or fall; Mundane Age raises ordinary surface density; variance broadens; Things Below shifts density underground. The guaranteed deep champion and guards are never removed by lower random prefix odds. Elite ages conflict. |
| Equipment and money | `treasure_age`, `age_of_rust`, `relic_world`, `cursed_riches`, `poor_kingdom` | Better modifier rolls carry more elite enemies, common tier-one junk weapons offset weaker modifiers, artifacts rise alongside danger, richer gear brings more curses, or chest gold shrinks. Merchant prices do not change. These five share a wealth conflict group. |
| Supplies and digging | `herbal_bloom`, `blighted_harvest`, `buried_age`, `treasure_at_the_edges`, `far_fortune`, `strange_fortune` | Herbs/mushrooms and Fungus rise while loose life potions fall; forage yields less and mushrooms poison more often; loot moves underground, toward edges, or farther from the village; supply composition changes. Herbal/Blighted/Fungal themes conflict as harvest traits. Drought excludes all three to avoid contradictory or near-empty forage. |
| Dwarven fort | `underkings_legacy`, `haunted_hold`, `grand_delving` | A larger intact fort, a ghost-heavy fort, or a wider mountain excavation. They conflict as fort variants. |
| Story hazard | `the_bell_is_guarded` | Additional and stronger bell guardians; this specific quest hazard is less likely to roll. |

The legacy names *The Unfallen Hold* and *Underking's Legacy* are represented
by `underkings_legacy`. *No Safe Woods* is folded into `eyes_in_the_trees`;
*Rich and Cruel* into `cursed_riches`. This avoids duplicate effects and
reduces extreme combinations. The unrelated `surfaceEnemies.prefixChance`
and cave prefix chances remain separate; `champions_age` and `wild_blood`
affect the random rolls, not the mandatory deep cave champion.

The generation code reads neutral values from `world_generation.json` on every
world. `caves.shallow.extraEntranceChance` controls optional second entrances
(the first cave still gets its guaranteed second entrance). Surface enemy
density, far/roam promotion, and migrant group count/size use
`surfaceEnemies.*`; migrant edge width, local radius, spacing, and maximum
tier are also configured there. Only mobile home/roam templates are promoted;
immobile enemies stay still. Migrants select legal surface edge sites and use
the existing opposite-edge `far` path logic.
Forest ambush odds are additive: `eyes_in_the_trees` raises 4% to 13%,
`wild_frontier` raises 4% to 8%, and `drought` raises 4% to 11%.
The first two conflict as forest traits, but either can stack with Drought,
giving 20% or 15%, respectively. These are roll chances before checking for
an available adjacent spawn tile.
`surfaceLoot.looseHerbs/looseMushrooms` control additional loose supplies.
`cavePopulation.deepMobEntranceClearance` and `deepMobMinSpacing` govern the
ordinary deep-cave placement preference described under Ordinary cave
scenarios. The guaranteed Champion, its four adjacent guards, and the extra
high-tier threat retain their dedicated positions.

Foraging uses a single `rng() × 100` roll and cumulative percentage thresholds
in `loot_tables.json`: 9 for berries, 17 for herbs, and 25 for mushrooms.
These represent 9%, 8%, and 8% respectively; the remaining 75% yields nothing.
`environment.forageResultMultipliers` scales the separate berries, herb, and
mushroom probability widths; the remainder yields nothing. At the default
multipliers of 1, this consumes the same single roll and preserves the
original 9%/8%/8% yields. Herbal Bloom raises herb/mushroom widths; Blighted
Harvest and Drought lower them. `environment.mushroomPoisonChance` controls
whether an unidentified mushroom is poisonous (base 50%). Saved older
forage-extra/spoil effects are translated to the new probabilities on load;
their old stored effect paths remain readable.

`environment.enemyAggroBonus` acts through `effectiveAggroRange()`; cave walls
still block sight. `environment.humanoidHpMultiplier` applies while preparing
ordinary humanoid equipment, before any prefix or item bonus. Story spawns
without that preparation are unaffected. `surfaceEnemies.nonHumanoidRarityMultiplier`
multiplies template `rarity` weights only when selecting ordinary surface
enemies, using each template's `humanoid` flag. It changes species composition
while keeping the same surface population count, cave scenarios, and
guaranteed Liches. `lootRules.enemyEquipmentChanceBase/PerTier/Cap` and
`enemyEquipmentWeaponShare/ArmorShare` configure what ordinary humanoids
carry; the remaining share is shields. The fallback equipment drop roll is
unchanged. `lootRules.worldGoldMultiplier` scales chest gold but leaves
merchant prices untouched. The Age of Rust `commonStartingWeapons` switch
still adds the hut's improvised weapons as tier-one ordinary drops and marks
the hut copy tier one. A special `map.world.area` effect scales both map
dimensions because their base values reside in `map_config.json`; it is
separate from terrain-generation parameters. Neutral values reproduce the
normal world's probabilities and counts.

Drought lowers lake carving and river sources, reduces the water elevation
threshold, widens the sand band, cuts forest forage and cave Fungus, and
raises forest ambush chance. It leaves the frozen-river guarantee active. Its
non-humanoid rarity multiplier is 0.4 and prepared humanoid HP multiplier is
0.85; the equipment roll rises from `0.45 + 0.03 × tier` to
`0.61 + 0.03 × tier`, with weapon share rising from 50% to 70%. It excludes
Herbal Bloom, Blighted Harvest, Fungal Bloom, and Flooded Depths. Ordinary
population is unchanged, so humanoids replace some beasts rather than making
the world empty.

## Persistence and balance

`buildSaveObject()` stores the full **resolved** `worldTraits` array, including
numeric rolled offsets, names, and optional flavor. `loadGameFromObject()`
reapplies these offsets to a fresh base config without drawing RNG again.
Current-schema data with a single `worldTrait` object is accepted as a one-element
array, and data with neither trait field uses the base config. A replay
initial snapshot is taken after world generation and includes the same array.
Saved map dimensions and terrain are restored from the save; the map is not
regenerated on load. Updating base JSON later can change how a saved offset
is interpreted, though the saved map itself remains intact.

These traits are deliberately high variance. At five traits, stacked increases
to deep monsters and loot may overwhelm a new character or skew progression.
`cold_world` puts freezing near the Temple and reduces safe forage; flooded
caves may impede routes; extra `far` wanderers can add pathfinding work. Age
of Rust makes weak tier-one weapons common without lowering merchant prices.
The cave and fort generation checks still run, but unusual combinations and
small maps should be exercised across many seeds before treating balance or
generation success as stable. Drought can remove safe forage while arming a
larger share of humanoids; its exclusions prevent the strongest resource
contradictions, but other dangerous combinations remain possible.
