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
SPD: 5
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

**World size** is independently selectable at character creation (XS, S, M, L, XL,
XXL); **L** is the default 260×260 surface. See [§9. World](#9-world).
The optional **Cursed world** setting is described in [§85. Cursed World](#85-cursed-world).
Loading a save bypasses character creation.
On desktop the character-selection overlay stays above gameplay-only overlays
(the side minimap, keyboard hints and message log) while the top HUD remains
visible; the form itself is kept below the HUD. On narrow windows, the character
form scrolls within the space below the HUD so its fields remain accessible
without covering the Load button.

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
touch layout keeps the title and header close control visible while entries scroll,
and provides a separate Close button below the list.
Desktop retains the compact modal and hover portrait. This character-specific
record is separate from the online Graveyard. Prefix variants share their
base-species entry; unencountered species are hidden. The list reads the saved
per-species kill counters and refreshes when opened. It does not affect gameplay,
RNG or replay actions. A new permadeath character begins with an empty Bestiary.

Explicit save-file export errors are logged in red and also shown in a browser
error dialog; the alert remains visible even when the game log is obscured by
a modal. Browser download cancellations or silently blocked downloads cannot
be detected by the game.

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
HP, rarity and abilities are outside this ranking. Exact unrounded stat totals
decide which kill is stronger, so two enemies that display the same rounded
strength can still be ordered correctly; exact ties retain the first kill. The
stored/displayed strength is rounded to the nearest integer. No kills displays
“None”.

The record survives normal deaths, current saves and replay; a new character
starts without it. Every actual death snapshots it before penalties or character
reset and sends it as `strongest_enemy_killed` to the Graveyard. The in-game
achievement and save/replay keep exact permanent ATK/DEF/SPD/GRACE stats for
ranking (humanoid gear can produce fractions). At the online submission boundary,
the total strength is recomputed from those exact stats and rounded, and **each**
ATK/DEF/SPD/GRACE stat is independently rounded to an integer. Consequently the
rounded total need not equal the sum of the individually rounded stats. This
also normalizes records restored from saves that contain an unrounded strength.
An invalid or non-finite trophy is omitted from the submitted death, not from
the live game, so it cannot prevent the death record being posted. Expanded online
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

On fine-pointer desktop layouts, attacking an enemy also keeps a temporary combat
inspection target. While the keyboard-hint panel is collapsed, if that enemy is not
already being inspected by hovering its glyph, the shared enemy tooltip is pinned
exactly 12 px inside the visible bottom-right edge of the full-screen desktop game
stage and refreshes as the attack changes HP or combat status. Expanded keyboard hints suppress the pinned
tooltip without discarding the
combat target; collapsing the hints can reveal it again until the player moves.
Attacking another enemy replaces the target; killing the target clears it. A successful
player movement clears the temporary inspection, matching the mobile combat-inspection
lifetime. Hovering the attacked enemy continues to use the normal cursor-relative
tooltip instead of creating a second copy. The desktop side map and keyboard-hint
panels use a tighter upper-right stack so their collapse controls stay clear of the
combat tooltip. This desktop-only presentation state is not saved or replayed;
coarse-pointer/mobile inspection and layout remain unchanged.

Walking into an NPC triggers interaction instead of entering its tile.

## Swimming

`src/swimming.js` owns the separate persistent `swimming` skill,
`swimmingPractice`, consecutive `swimTurns`, position anchor and drowning flag.
Ordinary characters start with Swimming unknown (zero); trying to enter deep
`water` logs **You don't know how to swim.** without advancing time. Merlings
swim naturally without skill levels, practice or a time limit. Rivers are
explicitly **not** swimming terrain; their existing player/enemy half-submerged
rendering remains unchanged. Intact/cracking lake ice and frozen rivers are
also excluded. When lake ice breaks, its tile becomes ordinary deep `water`:
Swimming/Merling rules apply immediately. The collapse deals a single
`max(1, round(playerMaxHp() × 0.08))` HP plunge hit to every non-Merling,
even one who has learned Swimming. This replaces, rather than adds to, the
ordinary drowning hit on the entry turn. Non-swimmers also enter the Drowning
state; later drowning turns use the normal 5% damage. Merlings take no plunge
hit. Forced entry grants no practice and still allows escape through adjacent
water until reaching shore. The tile remains freezing (§12).

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

Turn-consuming actions that leave the player on the same tile still use the same
presentation pipeline as movement. After enemy and NPC rules resolve, the shared
animation loop must run until their movement reaches its final tile. This includes
item/equipment actions, foraging, digging, waiting, and other stationary interactions.
Animation never controls rules or RNG: actor destinations are resolved first, and the
animation loop only presents those already-determined start/end positions and guarantees
a final repaint.

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

The surface size is selected independently of Cursed world at character creation.
**L** (260×260 tiles) is the default. The six square presets are configured in
`content/map_config.json`:

| XS | S | M | L (default) | XL | XXL |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 184×184 | 210×210 | 235×235 | 260×260 | 290×290 | 320×320 |

The selected dimensions remain fixed for the world. Loading a save or starting
another permadeath character in the same world preserves those dimensions;
only a newly generated world can select a different size. The surface
population and ordinary chests scale with eligible walkable terrain, while
specific landmarks and guaranteed spawns do not multiply with map area.

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

The world has an island-style elevation falloff on low ground. The coastal
penalty fades smoothly as the raw noise rises from the lowland threshold
(0.58) to the mountain threshold (0.68); natural peaks retain their elevation
at every latitude. Southern mountains are therefore possible before world
rotation, while low coastal terrain can still become sea. The northern land
boundary retains its existing exemption from coastal falloff.

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
- frozen river
- water
- lake ice and cracking lake ice
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
`cryptrubble` uses cave rubble, while `dwarvenrubble` alternates between
cave rubble and `img/tiles/dwarven-rubble.png` with an even-weight,
coordinate-based visual selection (no gameplay RNG). Crypt rubble in tile mode
overlays the original `crypt2floor` tile without a painted square, just as
dwarven rubble overlays its recorded floor underlay; ASCII backgrounds stay
unchanged. Crypt stairs, mausoleum stairs, trap coffins, and the sarcophagus
use existing transition or coffin images over the appropriate floor. The regular coffin already uses
`specialTiles.coffin`. Underground Dwarven columns use
`img/tiles/dwarven-column-indoor.png`; the two surface Fort entrance columns
keep `img/tiles/ancient-stone-column.png`. Dwarven rubble and all columns are
transparent props composited over **the underlying floor at their exact map
coordinate**. Both surface and indoor Dwarven columns **block walking**, while preserving
their existing projectile-blocking behavior and transparent visual underlays.
The surface entrance columns also clear mountains
and tree cover beneath them, exposing grass, sand or snow as appropriate for
the surrounding terrain. No tree may occupy a column tile. The underlay is
recorded during generation, rotates with the world and persists in saves;
underground underlays are keyed by depth to keep floors independent.
Where no underlay is recorded, tile-image mode draws only the transparent prop
without inserting a fabricated floor. Underground floor textures never inherit
the surface grass/snow fallback. ASCII mode retains its normal terrain glyph
and background.

The Dwarven Fort has its own `dwarvenfortexit` terrain ID at its underground
gate on z:-3; `dwarvengate` is the surface entrance. `caveup` remains the
generic ascent tile inside caves and retains its cave-floor background.
The surface Fort gate, its underground exit and the Dwarven Ruins up/down
staircases have bright red minimap markers, distinct from their original gold ASCII/tile presentation.
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

Dwarven masonry walls on z:-3 and deeper use `img/tiles/dwarven-stone-wall.png`
when any of their eight neighbors is walkable terrain or a dwarven doorway.
Including closed doorways keeps wall materials stable when doors open. Buried
masonry uses the existing dark cave-wall texture; natural cave walls retain
that texture throughout. The simple overhead stone blocks distinguish room
and corridor boundaries from solid rock. Dark charcoal masonry has four visual
variants, selected by a stable coordinate hash: **30% plain, 50% cracked,
10% moss-covered and 10% ivy-covered**. These are approximate
frequencies across many tiles, not quotas for each room. Cracks do not weaken
walls; moss and ivy are decorative, with no interaction. Unlit torches are no
longer used. All four masonry assets are 100×100 pixels, designed for readability at a
40×40 display size. Moss follows mortar joints and chipped edges in muted olive bands; ivy follows
stone gaps with restrained dark-green leaves. Cracks retain the original
stone fracture patterns with slightly wider, darker main splits. Shading and
color stay close to the masonry so weathering blends into the wall.
The renderer preserves an outer 10% border (rounded up to whole pixels) from the plain stone
image on all four sides, keeping vegetation away from neighboring tiles.
Repeated entries in the rendering variant list supply these weights.
Selection uses terrain and coordinates only, never
creature occupancy, visibility, animation timing or RNG. Collision, sight,
ASCII glyphs and save/replay data are unchanged.

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

Freezing is a surface mechanic. Snow, taiga, frozen rivers, both lake-ice
stages and water exposed by broken lake ice are cold terrain. A snow underlay
also marks cold river water. Each elapsed turn on cold terrain advances the
existing Freezing counter; the configured defaults are **1 HP every 5 cold
turns**. Moving between cold tiles preserves that counter. Leaving cold terrain
clears it. There is no general cold-resistance equipment system.

## Frozen lakes

Deep surface water inside the ragged cold-region boundary starts as walkable
`ice`; rivers retain their separate, safe `frozenriver` rules. Climate uses the
same snow noise and trait-adjusted threshold as nearby land, before cardinal
rotation. Ice is applied after landmark/cave validation, so required walking
routes are checked with lakes still impassable. Fisherman access likewise
excludes fragile lake ice.

| Tile under the player | Checks per elapsed turn | Result |
| --- | --- | --- |
| Intact ice | First: 1% instant break | Deep freezing water, skipping the cracking stage |
| Intact ice surviving that check | 2% | Cracking ice |
| Intact ice entered beside cracking ice, surviving the instant check | 85% on that step | Cracking ice |
| New cracking ice reached from a cracking-ice tile | Extra 10% check on that same step | Deep freezing water if it succeeds |
| Cracking ice | 10% | Deep freezing water |
| Frozen river | None | Never breaks |

Only the player's occupied tile initiates checks, once per spent turn,
including movement, waiting, combat and item actions. The 1% instant-break
check comes first on intact ice, even when stepping beside cracking ice.
Otherwise the normal 2% roll or 85% adjacent-step cracking check applies.
Thus ordinary intact ice has a 1% instant-break outcome and a 1.98% cracking
outcome per turn (99% × 2%). Already-cracking ice uses only its 10% break roll.

Stepping onto intact ice beside cracking ice checks all eight neighbors,
including diagonals and the tile just vacated. If the instant-break check
fails, the entered tile has an 85% chance to become cracking ice. A failed
spread roll leaves it intact: there is no fallback 2% roll or extra break check.
When the step started on cracking ice and the 85% roll succeeds, the newly
cracked destination immediately gets an additional 10% break check. Its total
chance to become water on that step is **9.415%**:
`1% + 99% × 85% × 10%` (previously 10.9%). A failed break recheck leaves it
cracking. Moving from any other terrain does not get that extra break check,
even if a neighboring crack makes the 85% spread rule apply. Waiting beside
cracking ice keeps the ordinary 2% cracking chance after the instant-break
check. Randomly starting to crack still grants a warning stage.

Whenever the player's tile breaks into water, its eight neighbors that were
already cracking also become freezing water. This is one ring only: those
neighbor collapses do not trigger a chain reaction. A 1% instant break also
turns adjacent intact lake ice into cracking ice. All neighbor states are
read before any tiles change, so newly cracked neighbors survive the turn.
Ordinary 10% breaks leave intact neighbors unchanged; frozen rivers, land and
existing water are never converted. The extra 10% check for a step from
cracking ice uses these ordinary-break rules, so it can also collapse the
tile just vacated. It does not crack intact neighbors. Other newly cracked
tiles, including neighbors cracked by an instant break, survive that turn.

Monsters never initiate cracking or collapse. Underground terrain, god mode
and flight do not roll or spread cracks. Disabling god mode restores normal
rules on the next spent turn. Merlings are immune to the collapse damage;
learned swimmers still take the one-time 8% max-HP plunge hit, but can swim
without immediate drowning. Rendering and animation timing never roll or
advance these rules.

Each transition logs a warning, shows an animated popup and stops auto-travel.
Ordinary ice inspection shows only `lake ice`, without displaying the random
break/cracking probabilities; the rules remain unchanged.

Cracking ice retains its state when vacated, uses a bright white fracture overlay in
tile mode, and changes the ASCII glyph from `=` to `≠` and the minimap color.
The hero hover portrait on both lake-ice stages reuses the frozen-river
background variants, selected deterministically from the tile coordinates.
Broken ice uses normal water rendering and swimming/drowning visuals. Falling
through inflicts the single 8% max-HP plunge hit (except Merlings) without
granting swimming practice; normal drowning starts for non-swimmers but cannot
deal a second hit that turn. Freezing continues on the same turn. Reaching
intact ice or land ends swimming, but only warm terrain ends freezing. Broken
tiles never refreeze, and water washes away any tracks on the tile.

Ice stages live in the saved surface grid; the existing snow underlay preserves
the cold-water property after breaking. Both rotate with the world and restore
through current saves and replay snapshots. No new player status or parallel
ice registry is needed. Every collapsed tile keeps its snow underlay, loses
any tracks and refreshes its map display. The player receives only one forced
water-entry check and one plunge hit regardless of how many neighboring tiles
collapse. Chances are configured in `environment.iceInstantBreakChance`, `environment.iceCrackChance`,
`environment.iceSpreadChance` and `environment.crackingIceBreakChance`.

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

Its mountain-edge position must be reachable on foot from the Temple, not just
border any walkable snow or grass in an isolated mountain pocket. World
rotation preserves the route.

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
replaces its down stair with the visible **Collapsed Mine Stairway** toward
the future Deep Mines. A cave-in blocks descent; inspecting it describes the
ruined passage without changing level.

The stratum length and every layout decision use the seeded game RNG. Floor
metadata includes its 1-based dungeon floor, total floor count, and normalized
progress:

```text
progress = floorIndex / (floorCount - 1)
```

where `floorIndex` is zero-based inside the Ruins. This gives 0 on the first
floor and 1 on the final floor for 3-, 4-, and 5-floor strata alike. After room
rectangles are positioned, the generator builds a **room graph before carving
corridors**. The graph chooses the entrance, main route, exit, **4–6 optional
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
next movement action can pass through it. Clicking/tapping an **adjacent** intact
open wooden or barred prison door closes **that leaf** for **one turn** without
moving the player. Diagonal adjacency counts, but the player cannot close a
leaf while standing on it or while a monster occupies it. Invalid attempts
cost no turn. Closing changes the tile back to its ordinary **unlocked** closed
state; it never restores a spent lock/key, repairs a breached leaf, or closes
an open progression gate. Closed doors again use their existing collision,
sight and projectile rules; FOV refreshes immediately. Door interactions stop
auto-travel and replay as distinct deterministic actions.
Humanoid enemies treat unlocked closed doors as traversable routes but spend an
action opening the encountered leaf before moving through it. Non-humanoids do
not open them, while ethereal traversal retains its existing ability to pass
through otherwise blocked terrain. Auto-travel may route through a known closed
door and accounts for the extra opening action. Door state lives directly in the
Ruins terrain map, so save/load and replay restore the exact open/closed state.

Every Ruins floor now also contains one **two-leaf mandatory progression gate**
on the route from its entrance to its deeper exit. The gate is selected only
when closing both leaves genuinely disconnects those two points, so it cannot be
bypassed through another corridor. Finished room perimeters have **only
registered two-leaf entrances**: optional loop passages join the exterior of
existing entrances instead of cutting through masonry. Post-collapse repairs
preserve every room wall and authored opening, rerouting through safe rock or
rejecting the floor attempt. Both generation and final stratum validation
reject unregistered walkable gaps and verify intact progression gates against
**eight-direction movement**, preventing diagonal bypasses beside doors. This
layout correction is deterministic and applies only to newly generated worlds.
Each gate has an independent **30% chance**
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
arbitrary nested key chains are generated. Key-carrying Champions must be non-ethereal so they cannot phase into an
impassable tile with the key; other Champions (including Ghosts) remain eligible
for normal generation. Killing a key-carrying Champion drops
the ordinary key item through the normal corpse/drop path; searchable remains use
the existing remains interaction. Bumping an intact gate while carrying its
matching key consumes the key, opens both leaves, and costs **1 turn** without
also moving the player. Key-opened gates use a distinct persistent **intact open**
terrain state; only gates generated pre-breached use the ruined/breached state.
Mandatory gates cannot be breached with a weapon.

### Closing the Dwarven progression gate

Clicking/tapping either leaf of an adjacent **intact open** two-leaf Dwarven
progression gate closes **both leaves in one turn** only if neither is occupied.
It uses `dwarvengateclosed` (an unlocked, opaque, impassable tile) rather than
`dwarvengatelocked`, so the original key is never required again. Bumping
either leaf opens both in one turn. Humanoid enemies can open it as well.
Breached gates are never closable. The new terrain tile is included in
`content/tiles.json` save codes and uses the existing closed-gate art.


Closed wooden doors (including ordinary locks and mandatory progression gates)
block movement, sight and projectiles. Barred prison doors instead block only movement
while allowing sight and projectiles through the bars, even when locked. Their
adjacent prison-bar partitions follow the same sight and projectile rules. Keys are tied
to a specific physical lock rather than acting as universal Dwarven keys.
Inspecting a Dwarven Key also states its originating underground floor
(e.g. `Found on floor -5.`), determined from its existing lock identity;
keys retain that label through save, load and replay. Auto-travel may plan through a locked door/gate only when the
matching key is already carried; it never chooses weapon breaching on the
player's behalf. Humanoids can still open ordinary *unlocked* doors, but do not
unlock or breach locked doors. Ethereal movement keeps its existing terrain-
passing exception. Any door/gate transition from sight-blocking to open or breached
terrain invalidates the cached underground FOV immediately, so sight through the
new opening updates in the same action rather than waiting for player movement.
Opening a barred cell door removes its movement barrier; sight and projectile
lanes were already open.

Each ordinary doorway that receives a door then has an independent **10% chance
to be locked**. The roll is made once for the two-leaf doorway, never per leaf:
when a doorway locks, **both adjacent leaves share one lock and one matching
key**. This prevents a locked leaf from being bypassed simply by opening its
sibling. Generated ordinary-door keys are placed only on marble reachable from
the floor entrance while all generated locks are still closed, so a key cannot
spawn behind its own lock or form a circular dependency with another lock.
Ordinary, progression, and internal prison-door keys are spaced at least
**four tiles apart** by Chebyshev distance. Independently generated locked
doors may never touch orthogonally unless they use the **same key**; otherwise
the floor is regenerated. This avoids ambiguous three- or four-leaf door
clusters and accidental key piles without changing deliberate two-leaf gates.

A matching key opens both leaves in **1 turn** and is consumed. Without the key,
the first bump on a particular locked doorway identifies the lock without
spending a turn. A subsequent bump attempts a breach with an equipped weapon,
using the same **220 ms cosmetic attack lunge** as ordinary melee and crate
strikes. Inspection is remembered per physical lock (including double-door
leaves), survives save/replay, and resets with a new character. Bare fists
cannot attempt a breach and do not consume a turn. Each actual weapon attempt
costs **1 turn**, does not consume or damage the weapon, and uses
the player's **final ATK** (the same ATK shown in the HUD, including the equipped
weapon and other current ATK bonuses/penalties):

```text
P(breach) = min(1, max(0, final ATK) / 100)
```

For example, a character at 18 final ATK has an 18% success chance per attempt,
regardless of how much of that ATK comes from the equipped weapon itself. Each actual
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
Its inactive and pulled sprites visually use marble as their underlay, even
though the underlying lever terrain remains blocking like a wall. Bumping that lever costs **1 turn**, permanently powers both endpoints, changes
the lever itself to a persistent pulled/locked-down terrain state, and enables
two-way inspect-to-travel between the two fixed platforms. The D1 side
cannot activate the lift remotely. Lift travel itself follows the existing
level-transition convention and does not add a separate combat turn.

Lift endpoint/lever coordinates and powered state are persisted explicitly in
the generic dungeon-shortcut registry; runtime lever activation and inspect-to-travel
always resolve the lift from that registry rather than a Ruins-only mirror variable.
The platform and pulled-lever terrain states are also stored in the ordinary
Ruins map grids. Terrain save codes are one-to-one with terrain IDs: lava and the
pulled lever must never share an internal code, and these save codes are separate
from the visible ASCII glyphs. On load, an already-powered shortcut reasserts the
pulled terrain only at its registered lever coordinate, so saves written during a
code collision restore lava normally without losing the powered lever. Lift
metadata was introduced in save schema **34**. Distinct open-gate/pulled-lever
terrain states use save schema **36**. Room descriptors,
vault descriptors, selected encounter families and tactical enemy role metadata
use schema **37**. Schema **38** adds the persistent room graph, progression-key
scenario metadata and enemy-carried dungeon-key state. Schema **39** replaces the
Ruins-specific lift save field with a package-tagged dungeon shortcut registry and
persists each deep level's dungeon-package identity, so later dungeon strata can
reuse shortcuts without another dedicated save field. The current save/replay
format is listed in §66; older saves are rejected.

### Dwarven Ruins traps (batch 5)

`src/dungeonTraps.js` places reusable spikes and wall-arrow mechanisms in
**corridors outside room footprints**, after stairs, locks, keys and the shortcut
lift are generated. Each floor targets
2–4 traps, stopping early if no safe placement remains. Placement uses seeded
RNG once; entering or loading a floor never regenerates mechanisms. Both spike
and pressure-plate triggers reject dead ends and skippable inside corners. A
trigger needs at least two cardinal exits (closed/locked doors count as exits).
With exactly two perpendicular exits, their shared diagonal must be blocked:
this preserves narrow corridor bends but excludes the corner of an open area.
The check applies to the final pressure-plate position, not just its emitter
candidate. **Arrow emitters also require solid stone or cave rock directly
behind the emitting wall**, in the opposite direction from the shot. A thin
wall separating a corridor from walkable room flooring is never eligible:
otherwise the `!` mechanism can appear to cap a pointless dead-end corridor
while the hidden plate passes the separate route check. The check applies
before the emitter replaces the wall and to every candidate direction; a
rejected candidate consumes no placement slot. Triggers stay at least four Chebyshev tiles from entrances, 
generated keys and lift platforms. 
Every staircase, Dwarven key source (including key-bearing searchable remains) 
and lift endpoint retains a route avoiding all triggers; keys reachable
before unlocking also retain their original accessibility. Optional loot and
non-key searchable/decorative remains are not mandatory safe-route targets and may
sit beyond a trap. Trap triggers are separated by more than three tiles. Existing monsters cannot
start within two tiles of either a trigger or emitter. Summoning uses the same
`DungeonTraps.safeSpawn` predicate, as does Ruins encounter placement. Triggers
and emitters also keep that clearance from authored room tactical slots, so
traps cannot displace their intended encounters. Floor and wall-arrow triggers must also have meaningful
walkable continuation at least three steps on each apparent exit: a two-wide
cul-de-sac is not a valid through-route just because its end-cap has three
walkable neighbours. This check applies before placing either trap type;
wall-arrow emitters must also be backed by solid stone.

Spikes and arrow pressure plates trigger on entry by players and grounded,
corporeal enemies. **Flying and ethereal enemies do not activate either floor
mechanism**, including when moved by force. Forced movement of other creatures
still triggers them. Remaining on a trigger or
restoring a save does not. A pressure plate, placed a seeded random **1–5 floor squares** from its
backed wall emitter where corridor geometry permits, fires a cardinal arrow
toward the first non-ethereal creature in its lane, regardless of who stepped
on it. Ethereal creatures do not intercept arrows. Closed doors,
projectile-blocking terrain and ground items stop the arrow; an item on a
creature's tile intercepts before that creature. The emitter remains a wall.
Automatic player travel excludes all trigger tiles; manual movement is allowed.

Balance lives in `dungeons.dwarvenRuins.traps` in `world_generation.json`:
spike ATK 8, arrow ATK 10, mechanism speed 5, arrow range 12. Both
mechanisms **ignore numerical DEF**, including temporary DEF bonuses and monster
DEF. Separate armor glancing and critical rolls still apply; arrows retain
their ranged dodge multiplier. Ordinary weapon attacks still use DEF. Traps grant no player XP, kill count, bestiary entry,
strongest-kill record or immediate quest-kill credit. Normal loot and stolen
items still drop, and enemy fatal-hit protection still applies. A trap's damage
message appears before its fatality message; deaths and drops still resolve in
the same game action. Resolution and RNG finish before presentation; projectile
animation never determines a hit.

Each deep level saves its `traps` array, including stable ID, trigger, type and
optional emitter, direction and range. Save and replay restoration use the
recorded positions rather than rerolling distances; v173/schema 94 also
revises deterministic generation and is not compatible with older saves.

ASCII glyphs are `^` for spikes and `!` for wall-arrow emitters. Wall-arrow
pressure plates are disguised as ordinary `marble` flooring in both tile and
ASCII modes (including inspection text); their hidden gameplay tile and entry
trigger remain intact, and auto-travel still avoids them. In image mode, spike
traps use `dwarven-floor-trap-0.png` when empty
and `dwarven-floor-trap-1.png` while the player or a living monster occupies
the tile. Occupancy changes the displayed image only; spikes still deal damage
on entry, not each turn spent standing on them. The arrow emitter still uses
the trap atlas. Rendering supports
`sourceRect: [x, y, width, height]` for atlas regions without changing the
gameplay tile. Shared underground FOV now honors
`TILE.blocksSight`, so closed doors, levers and arrow walls block sight.
The supplied service worker now precaches the trap module and images for offline play.

### Dwarven Ruins encounters (batch 6)

Each floor has a coherent seeded population. After the Ruins footprint was
expanded, the former **65 walkable tiles per threat point** left the larger
floors noticeably empty. The budget is now:

```text
threat budget = round(walkable tiles / 17 × (1 + floorIndex × growth))
growth = one seeded value in [0.20, 0.25] for the entire stratum
```

`floorIndex` begins at zero on D1; for an equally sized floor, D1 gains about
**3.8×** the former base budget, while deeper floors grow faster than before
(former growth: **10–15% per floor**). Each enemy still costs its normal tier
in threat points, so the precise monster-count increase depends on the species
mix; no species stats, loot, XP values or Champion count are multiplied.
The minimum budget still supports the required family mix and Champion escort.
More enemies increase the *total* obtainable combat XP and monster drops, even
though individual rewards and placed chest/loot budgets are unchanged.

The organized room budget targets **70%** (formerly **82%**), though
required Champion and tactical encounters can exceed this slice. A separate corridor budget targets **20%** of threat on D1, rising
**1.5 percentage points per deeper floor**. These corridor spawns use the
floor's existing dominant families and normal species wandering; they appear
only on walkable passage tiles outside any room rectangle and at least two
tiles away from authored door leaves. The remainder can appear as ordinary
ambient roamers. Both corridor and room spawns preserve entrance clearance,
trap safety, terrain eligibility, spawn spacing and obstacle rules. Corridor
placements reuse the existing wandering and persistence rules with the tactical role label `corridor`; they do not create new tile or status types.

A floor selects **2–4 dominant encounter families** (goblinoids, undead,
marauders, or cave predators when their members are depth-eligible). Organized
rooms, Champions and their escorts select only common family members, whose
`rarity` is **greater than 0.1** (`dominantRarityCutoff`). Rarity still weights
those common members relative to one another. Species at or below that cutoff,
including `rarity: 0.02`, may instead appear among unthemed corridor and ambient
wanderers. Both roaming selections use the **full depth-eligible species pool**,
not just the selected dominant families or their leftovers, and use each
species' configured rarity as a direct relative weight. Thus a `0.02` species
has one fiftieth of the selection weight of an otherwise eligible `1.0` species
in these global draws. This is a relative weight, not a 2% spawn chance.
Only species explicitly marked `"ultraRare": true` in `enemy_templates.json`
are limited to **one individual per species per world**, across surface,
underground and forest ambush generation. A low `rarity` weight by itself does
not imply uniqueness. After an ultra-rare species spawns, subsequent weighted
selections exclude it and other eligible monsters fill those slots. Unflagged
species, including Myrka (`0.02`) and Vampire (`0.01`), can repeat. Themed room populations remain
predictable while wandering encounters can occasionally be exceptional.
**All** Ruins enemies use their species' normal idle wandering mode and home radius,
including Champions, escorts, ranged backliners and other tactical room/vault guards.
Roles determine initial positions and shooter selection, not stationary behavior;
`far` still becomes `roam` underground and normal active-range/terrain limits apply.
The configured default is exactly **one Champion per floor**, usually spawning
with an escort in a remote or tactical room. Other prefixes begin at **11%**,
rise by **2.5 percentage points per floor**, and cap at **28%**; random prefix rolls exclude Champion.

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

### Guaranteed Throne Hall (v146, side-branch layout and last-stand defense)

The deepest generated **Dwarven Ruins** floor contains exactly one reserved
**Throne Hall** as a single-entrance optional side branch, never on the
mandatory route to the separate sealed Deep Mines chamber. It is a landmark room, not one of the
randomly selected major vault types, and occupies one of the floor's ordinary
room slots. Earlier Ruins floors and the entrance Fort contain no throne hall.
The artifact chest is still in a separate optional vault. The throne hall
**replaces** the formerly guaranteed separate defensive vault: exactly one
artifact vault remains compulsory, while a second fitted vault is an ordinary
1–2-vault roll. The ordinary room and Champion budgets are unchanged; the royal treasury and its extra guards are the only explicit additional rewards and foes.

The floor reserves the hall's footprint **before** placing other rooms. Three
possible interior dimensions are **9×19, 9×21, 9×23** cells, with four
possible facings. All Dwarven Ruins floors now **target 11–15 rooms**
(previously 8–12), with **4–6 guaranteed optional room-graph branches**
(previously 2–4); physical room-placement constraints can reduce the final
room count without reducing the branch guarantee. Their
horizontal half-bounds range from **34–40** cells (previously 28–34), and
vertical half-bounds from **26–30** (previously 20–24). The final floor keeps
its additional 10-cell extension in both axes and permits at least two cells
of ordinary room separation, rather than three. The larger layout offers
more side exploration. Chest, artifact and loot budgets remain unchanged;
**enemy threat was subsequently raised** and spread into corridors to keep the
expanded floors dangerous, particularly deeper underground.

The hall has **exactly one specified two-leaf entrance**, at the short end
opposite the throne. It is a **leaf branch** attached to a nearby main-route
room, and the back wall is solid. There is no back passage or route to the
mines through the throne hall. Corridors, loops, collapses and reachability
repair may not tunnel through its perimeter. Closing both leaves must isolate
only the throne hall, while the ordinary mandatory route still reaches the
sealed mine continuation. Generation retries rather than accepting extra
connections, an unreachable throne hall or a compromised progression gate. The hall has a three-cell clear central aisle and
**three paired indoor stone columns**. Near the far end, exactly one
**blocking dwarven stone throne** occupies the center of a **3×3 ceremonial
dais**. Its eight exposed dais cells are walkable and have no gameplay bonus.
The throne cannot be entered or interacted with, but deliberately **does not
block sight or projectiles**; columns retain their existing projectile
blocking behavior. Ordinary ambient chests are kept out of the hall. The throne
has one dedicated royal treasure chest two cells behind it against the back
wall, reachable from both flanking lanes without passing through the throne.
The chest does not create another entrance or affect mine progression.

Room metadata identifies the hall's special archetype and facing. A separate
stable landmark record stores recipe revision 3, associated room, sole front
entrance and the throne anchor. It is serialized alongside room/vault
descriptors and restored without rerolling any world-generation decisions.
Whole-world rotation transforms its rectangle, points and facing together.
The landmark direction runs from its single entrance toward the throne; the
**throne sprite faces the opposite direction, back toward the entrance**. Sprite
filenames indicate the direction the monarch faces (north, east, south, west); east/west art matches the ruler's actual facing, not the hall's approach vector. The camera, animation timing and random numbers do not affect
which sprite appears. The throne and dais are new encoded terrain types,
using the unique current-save codes `╙` and `╜`. Both graphics are transparent
over the recorded stone floor: dais engravings overlay marble; the throne uses
the dais as its underlay, saved and rotated alongside other per-level overlays.
The hall has two to three small patches of walkable rubble along its side
edges and up to two decorative dwarven remains taken from the existing floor
budget. Its central aisle, columns, dais, doorway landings and tactical slots
remain clear of ambient dressing. Searchable corpses, regular chests and the
artifact are placed in other rooms.

The hall's own tactical slots are measured relative to its entrance: two
frontline flankers near column gaps, two supporting defenders farther back,
a far-side ranged slot when the chosen encounter family includes a shooter,
and a position for the existing guaranteed Champion. Guards use one of the
floor's already-selected encounter families and spend the **current depth
threat budget**; when no shooter is available, the backline is omitted rather
than inventing a ranged species. The Champion and its existing escort may
defend the throne instead of a fitted vault, unless the Champion must carry
a progression key elsewhere. The floor still has exactly one guaranteed
Champion and retains the same encounter-family count, wander/Alarmed rules,
ordinary chest budget. In addition, the royal treasury is protected by
**2–3 extra Tier-4 enemies** taken from the current depth-eligible, common
monster pool (`rarity > 0.1`). They spawn around the rear portion of the hall,
without taking ordinary floor threat points or introducing an extra Champion.
Their ordinary XP and loot drops still apply. Guards remain free to pursue the player; the hall
does not lock during combat.

The throne recipe is revision 3. The progression gate **cannot** occupy the
throne entrance: it belongs on the mandatory route to the sealed mine.
The throne hall can still have an ordinary closed or locked door under the
normal doorway rules. The royal chest guarantees **one item plus 300–600 gold** (before the
world-gold multiplier): **70%** chance of equipment with a Tier-4 or Tier-5
base, or **30%** chance of a tier-5-source artifact. It is separate from the
existing guaranteed artifact chest and therefore sometimes gives a second
artifact. The outcome is rolled by the seeded gameplay RNG when opened, just
like ordinary chests; no respawning or reward reroll on save/load. This
remains a landmark rather than a new boss or interactive throne.
Landmark role positions, family assignments and enemy affiliations are
persisted with existing room and monster records; loading never repopulates
or rerolls the hall.

### Rooms, vaults, tactical encounters and loot (v61)

Every room containing a Ruins staircase is an **unthemed transit hall**: the
upstairs room is the Entrance Hall and the downstairs (or sealed-mine-stair)
room is a Stair Hall. Neither room is eligible for a gameplay archetype,
vault, prison cell, Crusher, gas chamber, authored room defenders, keys or
chests/remains. Their interiors remain plain walkable marble with the staircase;
ambient roaming monsters can still walk through. This applies to the whole
room, not merely a three-tile clearance around the stairs. Transit halls are
excluded from the 20–30% prison-quota denominator; the room graph prefers an
unreserved ordinary destination rather than using a prison-reserved footprint.
Stair halls have no separate persistent status: their roles live in existing
room metadata and their terrain in the saved floor map.

Every other eligible room receives one gameplay archetype: **Barracks, Armory,
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
rather than decorative bars only. Barred partitions use dedicated prison-door
terrain and artwork, independent of regular entrances and mandatory gates. Ordinary
**Prison** archetype rooms use the same
cell subdivision and always place a reachable key for their locked side cell.
The bar divider must span the entire room interior, without gaps at its ends;
generation rejects any alternate route into the cell, including diagonal moves
and routes that could open other doors. World rotation also rotates the cell
partition's orientation and bounds, preserving the complete divider and its
single doorway after generation and save/restore. Closed bars and prison doors block
movement but do **not** block sight or projectiles.

Every Ruins floor now guarantees a **functional barred Prison in at least 20%
of ordinary room slots on D1**, rising linearly to **30% on the deepest floor**
(rounded up and never fewer than one). All non-entrance, non-throne ordinary
room slots count toward that denominator, including rooms that cannot fit a
cell; invalid cells never count. The generator reserves additional suitably
sized room footprints before connecting the room graph. After the layout,
structural doorways and vaults are chosen, the same pure partition planner
checks geometry both for the quota and the actual cell build. Unsatisfied
floors are retried within the existing 12-attempt cap, rather than silently
lowering the prison target. Throne and guaranteed artifact rooms remain
protected from Prison assignment.

Each prison cell contains a seeded reward prop: a **75% chance** of a
searchable prisoner's skeleton (with its independent **10%** loot chance),
or a **25% chance** of a chest, subject to the existing non-guaranteed
floor chest allowance (an excess chest becomes another prisoner skeleton).
A prisoner's skeleton substitutes for a
searchable skeleton that would otherwise be scattered elsewhere on that
floor; prison chests likewise substitute for ordinary floor-budget chests.
The guaranteed royal and artifact rewards are unaffected. This makes the
higher Prison frequency a change in *where loot is found*, not a chest farm.
Every ordinary barred Prison instead guarantees **one actual ranged guard per six
walkable cell-floor tiles**, rounded up per cell. These are armed, ammunition-
limited monsters that shoot through bars, not decorative prisoners or a 65%
chance of one guard. The same staffing ratio applies to ordinary prison cells
and gallery bays; galleries round their two sides independently. Guards are
placed before ambient encounters and use a special placement exception for
enclosed cells: they may be closer to stairs than roaming monsters, but cannot
occupy the protected 3×3 landing. Spike/arrow trap placement avoids occupying
the cells' potential guard positions. All guard state, ammunition and roles
survive rotation and save/replay without an extra generation roll.

The fixed cell-density rule has a substantial **combat and balance cost**:
more guaranteed archers means more arrows, danger and potential XP in prison-
heavy dungeons. Worldgen enlarges its encounter funding when necessary so the
prison quota, gallery guards, throne and champion encounters can all coexist;
it does not silently abandon promised cell occupants. This may increase total
monster counts rather than only substituting one enemy role for another.
Dungeon-wide balance and loot/XP exposure need separate measurement before
release; the player can still avoid optional cells or shoot through their bars.

From **D2 (z:-5) onward**, the dungeon guarantees a full **crossfire Prison
gallery on D2**. That signature room's special 17×11 footprint is reserved
**before** ordinary prisons claim rectangular space, while preserving the
mandatory Prison quota. Other eligible depths independently have a **70%
reservation-attempt chance** to build an additional gallery, capped at one
per floor. A failed optional attempt may be skipped, but failure to place or
validate the guaranteed D2 gallery rejects that floor candidate instead of
quietly producing a dungeon without the feature. A gallery counts as **one
Prison room** toward the quota, and remains a dead-end optional branch that
does not gate stairs, progression keys, throne or artifact.

A crossfire gallery occupies a reserved **17×11 exterior** room footprint
(**15×9 interior**), rotated so the main doorway faces down its length.
The middle aisle is three tiles wide. Continuous iron bars divide it from
**two long ranged-guard cells**, which connect to each other along the far
wall in a U-shape. No side doors interrupt the bars. Instead, **one central
iron-barred prison door** at the end of the aisle controls entry into the
entire connected cell. The one guaranteed treasure chest sits immediately
**behind that prison door**; there is no ordinary stone wall or ordinary
wooden/stone reward door across the aisle. Eight-way movement cannot bypass
the closed gate into the cells.

The first row of the three-tile-wide exposed aisle is a **visible gallery
alarm threshold**. Every square in that row carries a small, 70%-scale, 50%-transparent
`dwarven-dais.png` floor engraving (ASCII: `◇`) on the ordinary stone floor.
Stepping onto **any** of these three squares immediately applies the existing
**Alarmed** status to all living ranged guards *currently inside that
gallery*, including its connected rear aisle. It happens before the next enemy turn, needs no
LOS or RNG check, and works when the hero is invisible (without revealing
an invisible hero or bypassing normal targeting rules). The ordinary AGGRO
+2, expiry, movement, and ranged firing rules stay unchanged. Guards outside
the barred bays and unrelated prisoners are not affected; already Alarmed
guards are not re-alarmed and do not create repeated log messages. The event
has one concise log message when at least one new guard is alerted. The
threshold itself remains passable, blocks neither projectiles nor vision,
and does not consume an extra action beyond walking onto it. Its positions
are saved within gallery geometry and rotate with the dungeon; individual
enemy Alarmed states already persist via the regular save/replay mechanism.

Every side cell contains **at least one genuine ranged monster for each six
walkable cell squares (rounded up per side)**. With the current 15×2-tile
bays this means **five shooters per side, ten total** rather than the former
one per side. Shooters are distributed along the length, have real ammunition,
use existing LOS and ranged-combat AI through the bars, and count fully
against the normal floor encounter budget before roaming enemies. This is
an intentionally dangerous optional branch, not a progression requirement.
Each gallery also has two independent **20%** optional rolls. One places a
Giant Spider in the unobstructed central aisle, never inside a barred shooter
cell. The other places one additional chest on a free, trap-safe aisle tile;
the guaranteed chest behind the prison door is never replaced. These optional
encounters and rewards are rolled during seeded generation and survive saves.
If the floor cannot fund the promised archers, generation must not substitute
fake archers or quietly accept a less-populated gallery. The far-end chest
remains a one-tier-higher reward, capped at the ordinary loot ceiling and
substituted for discretionary floor loot. Gallery geometry, door state,
enemy roles and reward persist through rotations and save/replay.

### Dwarven Ruins Crusher and corridor consistency (v168 / schema 89)

Every **newly generated** Dwarven Ruins dungeon must contain **at least one
working Crusher**, in addition to its exactly one guaranteed poison-gas
chamber and the mandatory D2 crossfire gallery. The guaranteed Crusher is
located on a different floor from the gas chamber, at z:-5 or deeper; other
eligible floors may still gain one through the existing **30% roll**.
A Crusher encounter is not required to reach stairs, keys, the royal chest
or the main artifact.

To prevent the previous zero-Crusher dungeons, the room generator now
reserves a suitable **9×11 or 11×9 outside-wall footprint** on eligible
floors **before** connecting rooms or adding prisons, vaults, debris, loot
and furnishings. It is an optional one-port side room, kept out of the
mandatory prison count and off the main route. The room stays clear so its
three-row moving-wall mechanism and escape lanes are actually usable.
Generation rejects a world without the guaranteed Crusher rather than
silently accepting a dungeon with none. This does not increase damage:
Crusher jaws deal 80% max HP to the hero and ordinary monsters, but
only 20% to Champions/bosses. The once-per-monster anti-farming cap and
warning/cooldown remain in place.

After rubble collapses and access repairs, a deterministic corridor
finishing pass widens **straight one-cell passages outside rooms** wherever
adjacent solid rock can safely be converted to marble. No room border,
protected door, staircase or surrounding one-tile room buffer may be
carved through. A one-cell bottleneck is still possible immediately against an authored
door jamb; it is better to retain an isolated narrow part than create an
accidental bypass around a gate or prison lock. This
polishing is applied only to newly generated worlds, preserving save/replay
coordinates without load-time rerolls.

**Gameplay decisions and feedback:** The player can choose to investigate,
avoid or deliberately use a visibly grooved side chamber. The advancing
walls remain readable on the floor itself and can threaten creatures.
The optional room is never necessary for progression, and crossing the
rest of the dungeon becomes less prone to one-cell movement bottlenecks.

### Dwarven Crusher — opposing stone jaws (v85)

From D2 (`z:-5`) downward, eligible optional Ruins rooms can host one
Crusher. The **30% floor selection chance** applies only to eligible floors
not containing the dungeon's guaranteed gas chamber. Crusher encounters
are placed away from mandatory progression, keys, stairs and protected vaults.
Only a limited number of non-critical furnishings may be displaced to create
a clear, legible crushing passage.

**The Crusher is no longer a single-tile slab trap.** Two opposing original
room walls contain **moving stone jaws**. Its whole threat strip is **five
tiles long** and five to eight tiles wide, extending **all the way between
those opposing walls** (at least 25 threatened floor squares). Visible
pressure plates in the central lane and grooved entry tracks on the walls
mark the mechanism. Any creature stepping on a plate arms it. A log and
small active-status countdown warn the player; the former large
`CRUSHER!` popup was removed.

The triggering action is safe. On each **subsequent consumed player action**,
the masonry emerges one tile from **each opposing wall**, becomes temporarily
impassable and blocks projectiles and sight. For a five-tile passage, both
walls meet on the **third action after triggering**; wider passages take a
proportionate number of actions. Before the last step, a physical hero or
monster touched by the advancing masonry is **pushed inward by one tile in
the wall's direction of travel**, without losing HP. The player can still
escape by moving lengthwise out of the five-tile strip during their turns;
a stone push does not consume an extra action. Forced motion updates enemy
occupancy, player camera/FOV, and auto-travel consistently. Pushing never
moves through stone or stacks corporeal actors: a blocking actor is first
pushed inward if possible. Actors who cannot be pushed (e.g. a crowded
center) remain trapped and are hurt at the final squeeze, never earlier.
At the last step, a terminal strike state holds for one consumed player action
so the center pressure plates visibly become two opposed wall faces with a
narrow seam (the real stone-wall artwork is cropped horizontally or vertically
based on jaw direction). This final held frame does **not** hit again. Then
the jaws retract and the three-turn cooldown begins. All temporary walls are
restored to their recorded pre-compression
tiles; opening the inventory, animations, enemy bonus actions, reloading,
and time spent on other z-levels never advance the mechanism.

Only the **terminal collision**, when the opposing jaws seal the central
squishing zone, causes damage. A caught player takes `ceil(0.80 × maximum HP)`,
ignoring numerical DEF, dodge and glancing, but retaining God Mode and
fatal-hit shields. Ordinary monsters take **80% max HP**, and Champions/bosses
**20% max HP**, once per final collision. The same monster may be injured on
future activations of that Crusher (no permanent one-hit immunity), including
lethal repeated activations. The 80% figure is **80% of maximum HP as a flat subtraction**
(not 80% of current HP and not a floor at 20% HP), so a previously wounded
monster can die from the hit. Temporary fatal-hit protection remains effective.
Ethereal monsters completely ignore Crusher displacement and damage.
They also ignore spike traps, wall arrows, and room gas.
Monster environmental deaths grant no XP.
Combat logs say the Crusher **squeezes** its victim, distinguishing
compression damage from an ordinary weapon hit.
Triggers and damage are deterministic turn events; wall progress, original
tile records and geometry persist in deep-floor save state and rotate with the
map. There is no persistent per-monster hit list. Auto-travel considers the *entire*
danger strip known and refuses to traverse it automatically.

**Crusher push/squeeze redesign (v175 / save schema 96):**
This supersedes v174's early-step collision damage: intermediate advancing
jaws only shove physical actors inward one square, and only terminal contact
inflicts damage. No RNG draws are consumed by shoving. Occupied destinations
are resolved deterministically by pushing blockers inward first; if the
remaining center has no vacancy, actors are held in place until final
compression. A single closing event never damages the same monster twice,
but a subsequent Crusher activation can injure or kill the same monster.
Ethereal monsters phase through both movement and damage, unchanged.
Unaware monsters avoid Crusher trigger
plates while roaming randomly, walking far routes, and returning home; far
route searches treat the triggers as blocked and reject stale cached routes.
If no safe idle step exists, the monster waits. Monsters actively chasing the
player, pushed by other abilities, or otherwise deliberately moved onto
plates may still activate them. Players can therefore bait or push opponents
onto a trigger; flying and ethereal monsters do not depress the Crusher plates.
Ethereal monsters remain immune to Crusher damage and displacement. A flying
monster can still be struck by jaws activated by another actor, since the
walls close across the passage rather than rising from the floor.

**Crusher reward (v171):** Every functional Crusher room holds exactly one
unopened chest beyond the far end of its five-tile crushing strip, farther
from the room entrance than the pressure plates. The chest lies on safe
floor, never beneath a moving jaw; reaching it means deciding whether to
cross the visible mechanism, retreat when the walls advance or lure enemies
into the danger zone. It uses the normal chest opening/one-time loot rules
and a depth-appropriate tier, capped by the Ruins loot-tier limit. A Crusher
chest consumes one ordinary floor chest allowance before discretionary
chests are placed, without changing the guaranteed artifact or royal chest.
The chest coordinate and association are saved with the hazard and item and
rotate with the room. Monsters damaged by the terminal pinch show visible
damage and an explanatory log if seen. Temporary magical immunity only
protects the current collision: a protected monster is not marked as already
injured, so a later real hit can still affect it. Ordinary monster damage
was raised from **50% to 80% maximum HP** in v171; the **20%**
Champion/boss fraction is unchanged. As of v175, these damage values apply
on terminal compression only, and are repeatable on later activations.

**Game version v164 / save schema 85:** new gallery geometry/enemy allocation,
solid advancing Crusher tile and jaw step/base-tile state change the
world-generation and replay contracts; old saves are not migrated.

### Sealed poison-gas treasure chambers (v83)

Every newly generated Dwarven Ruins dungeon contains **exactly one guaranteed
poison-gas chamber** from **z:-5 downward**, regardless of whether the dungeon
has 3, 4 or 5 Ruins floors. Generation chooses an eligible depth from a
seed-derived ordering and tries the other eligible floors when the first cannot
fit a legal chamber. A failed candidate does **not** silently omit the chamber:
the whole world candidate is rejected for bounded world regeneration. The
requirement is not one chamber *per floor*: the chamber takes the single major
hazard slot on its own floor, leaving other eligible floors with an independent
**30% Crusher chance**. Gas placement is no longer a 25% selection roll.

A chamber must occupy an optional non-Prison **single-doorway side room** without
mandatory progression, vaults, keys, stairs or royal/artifact loot. It must fit
two linked entrance leaves, a reachable chest and a separate walkable approach
to a visible valve. Prisons retain the required 20–30% quota. The chest is
funded by removing an optional Prison or ordinary reward chest when the floor
budget is already spent; guaranteed gallery, vault, throne and artifact loot
is not sacrificed. Inability to preserve these rules rejects the world rather
than producing a softlock or missing signature room.

Even before opening the chest, distinctive **vent grates and a pressure-release
valve** signal danger; the chest itself is the trigger. Bumping or tapping an
adjacent valve operates it with the same deterministic player-action system as
movement. The first turn of valve operation is saved and persists if the player
steps away or fights before finishing. **Two valve interaction turns** fully
open it. The valve works without a weapon or matching key. Normal dungeon locks,
breaching, entrance keys and ordinary door behavior are unchanged.

Opening the marked chest awards its loot exactly once, closes any intact
owned entrance leaves under an **emergency seal**, then begins a **15-action
gas window**. The opening action is free of gas damage. Thereafter, each
consumed player action while inside the room (including failed breach attempts
and waiting) deals `max(1, ceil(0.08 × current maximum HP))`, bypassing
numerical DEF, dodge and armor glancing. The exposure test is performed
**after** movement or an interaction, so stepping onto a broken/open doorway,
opening the valve, or leaving the room ends damage for that action. There is
no poison-status timer to cure. God Mode and one-use fatal-hit protection still
apply. Monsters remaining inside also take environmental max-HP damage; deaths
award no player XP or kill credit. The room vents by itself after **15 active
turns**, leaving no permanent lock.

A sealed entrance can alternatively be broken with an equipped weapon. It
requires **two successful hits** across the pair of leaves with independent
success per attempted action `P = min(0.50, playerBreachAtk() / 100)`.
Failures consume a turn and use ordinary door-breach Alarm rolls. The two
leaves share progress, so alternating them does not reset or duplicate work;
no key can unlock the emergency seal. Fists can never breach it, so the visible
valve is always the weapon-independent response. A pre-breached leaf stays
broken even if the chest triggers later. A creature occupying a leaf does not
prevent sealing: it may move **off** the occupied tile on its next action but
no new actor may move onto a sealed leaf. Items on door tiles remain present
for recovery; they do not jam the mechanism.

Gas chambers use two **100×100 object-only transparent PNGs** placed over the
normal marble background (`dwarven-gas-valve.png` and
`dwarven-gas-vent.png`). Gas inside the chamber has a readable green floor
overlay in tiles and a supplementary `≈` mark in ASCII. The green haze draws above all floor props, including decorative dwarven remains and searchable corpses, but below living actors; it does not obscure combatants. While exposed the
player's status strip displays the active timer. The chamber's authoritative
`hazards[]` entry contains immutable post-rotation world-space geometry,
valve progress, door successful-hit progress, remaining turns, and the
`dormant → active → vented` state. All values persist across save/load and
replay; no render frame or inventory redraw advances the gas clock, and other
z-level turns do not advance it. A fatal hit records **`poison gas`**
separately from `dwarven crusher` or `dungeon trap` in death payloads.
**Save/replay schema 83, game v161** introduces the gas tiles and chamber
state; old save compatibility is intentionally not provided.

The browser client supports these death cause strings, but a deployed Graveyard
or Highscores database may separately constrain `cause_of_death`. Confirm that
its constraint includes `poison gas` and `dwarven crusher` before deploying;
otherwise the server may reject those death submissions even when the game
shows the correct local cause.

### Dwarven Ruins integration rules and verification (v162)

Ordinary room entrances remain **two-leaf doorways**. A crossfire gallery has
one additional **single-leaf reward-alcove door** at the far end; it is not an
ordinary room entrance and must not be counted when testing ordinary-door
pairing. Tests identify both door categories from the generated room metadata
rather than making assumptions about the parity of all closed-door tiles.
Bumping an ordinary closed door still opens it in one consumed action; opened
state persists through save/replay, and normal door closing remains available.
The two leaves of an *active gas-chamber emergency seal* are a different
mechanism and still share breach progress, as described above.

Both dangerous room types remain **optional and visibly telegraphed**:
Crusher pressure plates and tracks mark impact tiles, while gas vents and the
emergency valve identify suspicious treasure chambers before opening a chest.
The Crusher provides one spent-action reaction window with no temporary
blocking terrain; gas can be escaped via the two-turn valve or weapon strikes.
Neither introduces unavoidable progression locks. Environmental monster deaths
grant no XP. Timers depend on consumed actions on the active floor rather than
animation time, and state restores without additional random rolls.

The deterministic Ruins survey (`node tests/dwarven-ruins-hazard-survey.cjs`)
uses the actual generator and validates floor-count range, prison quotas,
registered door geometry, optional galleries and their shooters, hazard placement,
progression topology and selected save/restoration states. Its short fixed-seed
sample found **42/42 valid floors in 12 worlds** (7 three-floor, 4 four-floor,
1 five-floor), with **116 functional prison rooms against 113 required**, 12
galleries, 9 Crushers and 4 gas chambers. These are *sample outcomes*, not the
intended global spawn rates. For release statistics, run `node tests/dwarven-ruins-hazard-survey.cjs --full` (500 seeds), then inspect actual
spawn frequencies, key/loot density and recovery cost for different player
builds. The short survey does **not** establish stable long-run frequencies,
unmodified loot economics or expected crossing damage.

Rule-level checks additionally cover real bump/open/close actions, prison cell
quotas, crossfire shooter geometry, trapped doors, hazard damage, valve/breach,
traps' DEF bypass, throne rotation and Death Bolt. Browser Cypress execution,
mobile/tile/ASCII visual inspection and Supabase death-cause constraints are
separate release gates; headless rule checks are not substitutes. The currently
supported death labels are `dwarven crusher`, `poison gas` and `dungeon trap`.

The four throne-facing sprites are supplied as **100×100 transparent PNGs**,
with the original artwork scaled proportionally. The Death Bolt projectile
uses the standalone `img/projectiles/death-bolt.png` sprite and preloads through
the normal image pipeline before its 650 ms purely visual flight.

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
The later lift placement also leaves every authored tactical slot as ordinary
floor, so its platform cannot replace a defender's planned position.

Room furniture is mechanical terrain. Barracks/dormitories use beds, libraries
use sight-blocking shelves, dining halls use tables, storage/forge/workshops use
crates, and prisons use bars. Beds (including bed barricades) and all other room-specific furniture are
forbidden **anywhere inside a Ruins stair room**. The additional mechanically
clear 3×3 stair landing rule remains unchanged. Other rooms may contain their
normal furniture, even when they happen to be close to a staircase. Dwarven crates remain solid to movement and
projectiles until destroyed by equipped-weapon strikes. Every crate has **8 HP**
and each strike removes `max(1, final ATK)` HP, without hit/miss/critical rolls.
Bare fists cannot damage crates; weapon strikes cost **1 turn** and reuse the
player's cosmetic melee lunge. Every successful weapon strike against a crate,
including the final blow, immediately Alarms all eligible nonpassive monsters
within **5 tiles of the crate** (Chebyshev distance, no sight requirement).
Each strike independently has a **25% chance** to Alarm the nearest eligible,
not-yet-Alarmed monster **beyond that radius**, without a maximum distance;
repeated strikes can alert different monsters. Ties resolve by stable enemy ID.
These sound effects also apply when the player is invisible: Alarmed does not
reveal the player or bypass normal visibility and pursuit rules. Newly Alarmed
monsters visible in the main view log `<name> is alarmed by the noise.`; offscreen
monsters are alerted silently. Both the guaranteed radius and the distant
chance are independently editable as `alarmNearbyRadius` and
`alarmDistantChance` in `content/world_generation.json` under
`dungeons.dwarvenRuins.crates`. Crate noise is resolved before enemies take
their turn, regardless of the player's attack animation.
A destroyed crate immediately becomes **walkable crate debris**
(`dwarvencratepieces`) for game rules and save/replay. Broken boards, iron bands
and any pre-rolled loot appear immediately, including during the player's
**220 ms attack lunge**. Crates have no sinking, shrinking or fading death effect;
monster death effects are unchanged. Debris remains
over the marble floor; ASCII uses `;`. Debris does not block movement, sight,
projectiles or auto-travel, cannot be smashed again, and remains beneath dropped
loot and actors. Its unique terrain code persists in the existing floor map,
including replay snapshots; no separate timer or destruction flag is needed.
Destruction logs
`You smash dwarven crate into pieces.` Each generated crate
rolls its contents **once during accepted world generation** and persists its
remaining HP and pre-rolled contents per dungeon floor. Empty crates yield
nothing. The small crate loot table is editable in
`content/world_generation.json` → `dungeons.dwarvenRuins.crates`: the defaults
provide a **16% total drop chance** (previously 10%), with one result per crate:

| Result | Chance per crate |
|---|---:|
| Nothing | 84% |
| Life Potion | 6% |
| Scroll of Invisibility | 4% |
| Potion of Stone Skin | 1.8% |
| Potion of Berserk | 1.8% |
| Scroll of Fear | 1.2% |
| Scroll of Chaos | 0.9% |
| Scroll of Death Shield | 0.3% |

The five tactical consumables together account for 6% of crates. The original
Life Potion (6%) and Invisibility (4%) chances are retained; the empty share
falls from 90% to 84%. Death Shield remains the rarest. Drops appear on the broken crate tile, are picked up
normally, and cannot be rerolled through save/load or replay. The JSON loot
entries use **relative weights**: `P(result) = weight / sum(all weights)`. Supported
kinds are `null` (nothing), `potion`, `speedpotion`, `scrollOfInvisibility`, and all
five tactical consumable IDs; changing weights changes the odds without code
edits. Contents still use exactly one seeded roll per crate during generation.
Existing generated crates retain their saved contents; the expanded table is
used for new worlds. Destroyed terrain and remaining ground
loot persist as part of the existing dungeon map/ground item records. Vaults
add their own patterns, including water in cisterns and rubble in collapsed halls. Fortified barracks and barricaded
dormitories drag bed frames into chokepoints. Final-floor dormitories have a
strong additional barricade chance, except the final room containing the sealed
Deep Mines work stair: that room never contains beds, bed barricades, or
bookshelves, regardless of its other room/vault roles. Furniture never replaces
stairs, keys, doors, or the protected room center/door approach used by traversal
validation.

Environmental damage now rises continuously with normalized floor progress: rubble
pressure scales **0.9x → 1.3x**, decorative-remains pressure **0.8x → 1.5x**, breached-door pressure
**0.75x → 2.0x**, dormitory barricade chance **5% → 22%**, and optional defensive
debris **3% → 16%** before the final-floor override. **Decorative `dwarvenremains` and
searchable skeletal remains are separate populations and must not be conflated.** Each
Ruins floor keeps the original seeded **2–4 decorative `dwarvenremains`** roll, scaled
by depth. In addition, it rolls **3–5 searchable skeletal remains** as real `skeleton`
ground objects using the normal one-time search rules and an independent **10% loot
chance**. The two populations use separate placement rolls and cannot occupy the same
tile. These ambient remains are distributed outside prison-cell interiors;
cell-specific skeletons are generated independently so the scattered remains
population is not reduced by adding prison occupants.

On the final floor, both populations become denser to sell the failed-last-stand
scene. Decorative remains use at least a **2.5x** multiplier, yielding **5–10** ambient
`dwarvenremains` before room-specific decorations; searchable skeletons independently
use at least a **2.5x** multiplier, yielding **8–13** ambient searchable corpses before
any progression-key corpse. The final floor also raises rubble to at least **1.65x**,
ordinary breached-door pressure to at least **5x**, and multiplies barricade pressure
by **2.2x**. It always guarantees two major **scenarios**: the mandatory throne hall
last stand and a separate optional artifact vault. The former guaranteed
fortified-barracks/barricaded-dormitory/forge-killzone/collapsed-hall selection
has been removed; any additional fitted vault uses the normal weighted roll. The result should visibly read as
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
nonempty sealed prison cells with no eight-direction bypass routes,
exactly one final-floor artifact, occupied throne-hall frontline/support slots,
the one-Champion-per-floor budget, the lift endpoints and the sealed Deep Mines
continuation. Structural floor failures are retried by the floor generator; a
late population failure discards the world attempt and regenerates it, up to
**3 configured attempts**. Enemy IDs restart for every discarded attempt so the
number of retries cannot alter stable IDs or replay ordering in the accepted
world.

Tile and ASCII modes distinguish locked, intact-open and breached progression
gates, while reusing the normal solid dwarven door sprites for room entrances
and progression gates. The bars beside a prison cell use
`dwarven-prison-bars.png`; closed and locked cell leaves use
`dwarven-prison-door-locked.png`, with `dwarven-gate-open.png` reserved for their
open state. The pulled lever has dedicated `dwarven-lever-pulled.png` art.
Room furniture/barricades are mechanical terrain with dedicated ASCII glyphs,
colors, inspect strings, and tile art displayed at 40×40 for beds, dragged-bed barricades,
bookshelves, tables, crates, and prison bars. The bed barricade and smashed-crate
pieces use transparent 100×100 source sprites; the barricade keeps a recognizable
headboard, mattress and legs with simple shapes. These images are precached for
offline play alongside the prison-door and pulled-lever sprites. The
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
`artifactGuaranteed: true` on the fort's z:-3 chain map. When looted, it is
removed from `groundItems`, and loading **must not recreate it**. The loader
may correct old location metadata only for an existing unopened chest already
marked `artifactGuaranteed`; it never converts an unrelated fort chest into an
artifact chest, nor treats the absence of a chest as corrupted data.

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
z:-9 ... z:-12/-13 Dwarven Mines (4–5 floors)
```

The **Crypt is a separate map/structure**, but its first level shares the z:-1
underground coordinate with the normal caves and its dedicated second level
uses **z:-2**. A z value identifies depth, not a unique map. The crypt's
dedicated `cryptstairsdown` / `cryptstairsup` transitions and the saved
`currentLevelKind` distinguish Crypt Level 2 from the generic z:-2 cave map.

## Whole-world cardinal rotation

Once a newly generated world has passed the dungeon population validator and
all actors and loot have been placed, one seeded roll chooses
one of four orientations with equal **25%** probability: unchanged (cold north),
90° clockwise (cold east), 180° (cold south) or 270° (cold west). This is a true
map rotation, not a movement or temperature modifier: the surface, shared caves,
crypt, Dwarven Fort, every deeper Ruins floor, entrances, stairs, locks and their
keys, traps and projectile directions, and terrain underlays are transformed
together. This includes the secondary lock ID required by a progression key
inside a locked side room: it must continue to identify the same rotated lock.
On rectangular worlds, a quarter-turn swaps width and height. Each fresh
generation restores the configured, unrotated dimensions before allocating maps,
including when regenerating multiple worlds in the same session. Stored
coordinates already describe the rotated layout, so save/replay needs no new
rotation flag, and seeded gameplay remains deterministic. Cosmetic cave decorations
are then hashed against the final rotated coordinates without consuming RNG.

## z:-1: Shared cave layer (includes crypt and mausoleum)

Normal caves are generated on the shared underground map.

The ruined chapel provides a separate entrance into the **Crypt area on this
same underground level**. The crypt is kept separate from randomly generated
cave regions by a generation-time exclusion zone around the crypt footprint,
with the final connectivity test retained as a defensive validation.

Crypt coffins use their own four crypt inscriptions. These are unrelated to the
mysterious tombstone inscriptions dropped by Liches. Each of the four lines is
assigned to one coffin only. Whole-world rotation moves the crypt's stored
coffin coordinates and inscription keys with its terrain. Saving/loading and
replay initialization preserve both the exact coffin positions and each
coffin's generated inscription; they do not create coffins at pre-rotation
coordinates or reassign the inscriptions. No save-format change is needed.

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

The second-level source caves can now form **optional connected complexes**.
Each original cave keeps its own floor material: the brown burrow retains the
brown tile/ASCII background inside its source footprint, ordinary grotto and
silhouette regions retain their normal cave floor, and shared connectors use
ordinary cave floor. At generation time each accepted connector has a **30%**
chance to acquire a short water-lined section (up to 9 flank water tiles,
requiring at least 3 connector tiles). **15% of these water-passage rolls**
also flood the middle **1–3 tiles of the connector**, leaving at least one dry
connector tile at either end. Such a link has **no continuous dry causeway**:
non-Merlings must learn Swimming (level 5 is enough for the crossing). All
other water-lined links retain a dry causeway. The effective probability of
attempting a flooded shortcut is **4.5% per eligible accepted connector**
(30% × 15%), not 15% of all cave links. Flooded connectors remain optional:
all source caves keep their own independently accessible stairs and dry interior;
Swimming never gates mandatory story progression or the only exit. Flank water
replaces only unowned rock, and flood water replaces only the central carved
connector cells. No water overwrites source cave maps, entrances, or special
dungeons. Water-lined links without suitable flanks stay dry unless their
central segment is selected for flooding.
Nearby source components may be joined by short, carved dry corridors (**2–12
rock tiles**). For two previously separate source caves, the baseline chance now
varies by rock gap: **85–70%** across 2–4 tiles, **60–40%** across 5–8 tiles,
and **30–16%** across 9–12 tiles (previously an exponential falloff from 85%
to 5%). A world-seeded affinity of **85–115%** and a mild dry-area modifier
(1 + combined dry area / 15,000)^−0.5 adjust these chances; large complexes
retain the stronger **0.6 multiplier per already joined extra component**.
The resulting chances are typically about **60–80%**, **35–55%**, and **10–25%**
for small separate caves in the respective bands, and are not guarantees.
All original entrances, source cave identities and staircase pairs remain in place. A complex may
contain a grotto, burrow and silhouette cave, while other caves remain
independent. Connected layouts are still navigated as one shared z:-2 map.

Links are generated **after source cave carving** and exist only on the shared
map. The original source masks, silhouette shapes and the brown burrow's local
floor region are not altered. For each complex the generator stores sorted
source membership and entrances, and partitions its traversable topology into irregular **territories** using
walking-distance seeds. Flooded connector cells are included as potential
Swimming routes in territory assignment, while dry-only exploration diagnostics
exclude them. Territories guide initial enemy placement but do not constrain monster
movement, change AI or add faction rules. Loot is allocated from a shared
world budget by playable area; merging gives no additional reward.

Connector cells and territory/complex metadata are saved and restored directly;
the shared map is reconstructed by overlaying saved **connector cells, then
water cells (which may overlap the connector's own central cells)** after the
source maps. Rotation transforms both
sets of connector cells and territory anchors along with all stairs and source
caves. The new flank-water field is persistent link metadata: save schema
**101 → 102** for flank water and **102 → 103** for the new flooded-connector
semantics. Neither cave connections nor silhouette choices are rerolled on
save/load or replay. No compatibility code is added for older saves.

The generator requires **at least three generic z:-2 source caves**: one
silhouette, one grotto with connected irregular chambers and winding passages,
and one branching burrow. The three required components are generated first;
none can be replaced. Footprints cannot overlap. Multiple descents may belong
to the same shallow cave, but each staircase is paired at identical coordinates
and retains its source cave identity. Failed placement trials use clean map
copies; if any required style is missing, the world is regenerated.

**Additional silhouettes are possible but never guaranteed.** After placing
the three required styles, the generator makes a **70%** world-seeded attempt
to place a second silhouette on an unused parent cave. Each remaining unused
parent has a **65%** chance to receive an optional descent; an accepted
optional descent selects silhouette with **45%** probability (until the
**three-silhouette maximum**), otherwise grotto/burrow according to the current
`optionalGrottoChance`, which remains affected by Cursed World traits. If a
large optional silhouette fails to fit, the generator may try a smaller grotto
or burrow instead. Placement limits and empty parent availability mean these
are attempt probabilities, not guaranteed counts. A connected complex may hold
several distinct silhouette sources, but joining them never merges their
original source masks. Each component adds its ordinary area-weighted threat
and loot capacity; simply choosing silhouette instead of burrow adds no reward.

Grotto footprints vary from 92×72 down to 42×36 tiles, with irregular
rooms linked into a connected chamber network. Burrows vary from 68×52 down to
28×24 tiles and retain their branching, narrow-tunnel identity. One burrow
retains its distinct brown floor. **Topology variation (Deep Caves 2.0,
geometry batch)** now samples connectivity and shape parameters separately
for each grotto or burrow: the cave may have few or many meaningful loops,
small or large chambers/pockets, narrow or wider passages, shorter or longer
branches and up to three water pockets in a grotto or two in a burrow.
Water is optional and may not cut off any dry-floor route. Burrows stay below
63% dry-footprint coverage, with usual tunnels just one or three tiles wide;
large room networks remain the domain of grottos. All dry floor tiles remain
connected to their own staircase. Subsequent Deep Caves 2.0 batches allow optional connecting corridors and
territory-based populations, but do not change the silhouette extraction
or source layout algorithm. The later loot-budget work is still pending.
Crypt maps and the Dwarven Fort remain separate.

### Monster silhouette cave prototype

Only generic **z:-2** receives silhouette caves. A world-seeded selection from
`content/cave_silhouettes.json` determines each preloaded composite shape, with
optional horizontal mirroring. Transparent enemy images provide geometry only:
the selected monster
has **no influence on inhabitants, rewards or tier preferences**.
Normal deep-cave population and entrance safety rules still apply. Each
silhouette component is populated by the same parametric ecosystem rules as
other z:-2 source caves. More silhouettes increase shape variety rather than
creating separate fixed scenarios.

The alpha silhouette becomes dry ordinary cave floor, surrounded by rock. The
prototype receives a uniformly world-seeded target of **700–2,800 dry floor
tiles**, independent of whether it combines two, three or four sources. Size
selection is stable across placement retries. Sampling compensates for the
prototype's fraction of solid pixels, so sparse shapes are enlarged instead of
receiving much less usable floor. The estimate allows 15% of sampled floor for
later rock/water separators. This is an approximate target, not an exact quota:
connectivity repairs, contour changes and separators affect the final count.

The maximum reserved footprint is **112×100 tiles** (previously 60×52). If the
chosen size cannot fit, placement tries 85%, 70% and 55% of the target area,
subject to the same footprint cap. Every accepted layout must retain at least
**500 dry floor tiles after all separators** (previously only 90 sampled tiles
before repairs). A smaller result is rejected and another placement is tried.
This makes exploration area comparable to the other z:-2 cave styles, while
allowing substantially smaller and larger examples. Larger caves retain the
existing population rules: area-based monster counts can increase within their
normal limits; fixed rewards and encounter guarantees are not multiplied.

Detached fragments and diagonal-only limbs receive short cardinal connections;
the staircase has a clear 3×3 landing. After dry connectivity repairs, a light
contour pass softens straight exterior edges of **8 tiles or longer**. Small,
seed-derived tapered bulges and insets move the outline by at most **2 tiles**,
within its reserved bounds. This breaks the cut-off appearance inherited from
flat image borders or sampled outlines without globally blurring the monster
shapes. The pass changes at most **6% of the initial dry-floor cells**.
Only rock connected to the exterior boundary counts as outside: enclosed rock
holes, the 3×3 landing and one-tile limbs are preserved. Insets that disconnect
dry floor and bulges that bridge another lobe are rejected. Proposals use a
stable coordinate/seed hash and do not consume gameplay RNG. Water/rock
obstructions are placed afterwards, so smoothing cannot bypass the 15-tile
limit or turn swimming into a requirement. Other cave generators are unchanged.
The resulting map is saved directly; save format remains **97**.

Horizontal and vertical uninterrupted **dry-floor**
runs are capped at **15 tiles** inside silhouette caves. Water is chosen
individually for each cave: a **40% chance of exactly 0% water** (rock-only
separators); otherwise the water probability is sampled from **0–25%**
(previously **30% for every cave**). Every long-run separator then selects
water or rock using that cave's probability. Its choice is retained throughout
placement retries. The original silhouette shape, 15-tile cap and mandatory
dry reachability remain unchanged.

Rock uses seeded, asymmetric outlines instead of solid square blocks: chipped
corners, notched boulders, L-shaped pieces and compact cross-shaped clusters.
Larger pieces occupy **5–8 cells in a 3×3 footprint** (previously a solid
**9-cell square**); smaller pieces use **3-cell L shapes** (previously solid
**4-cell squares**). Outlines are clipped to existing floor. A rock placement
that forms or completes a small isolated solid rectangle is rejected, including
rectangles formed by adjoining clusters. The surrounding
rock mass and pre-existing holes are not reshaped by this rule. Narrow passages
retain a single-tile fallback where a larger shape would break connectivity.
Water keeps its existing irregular seven-cell or three-cell outlines; each
obstruction uses its cave's independently sampled **0–25% water** chance. Existing rock boundaries and
earlier obstructions are preserved. Placement keeps every dry floor reachable
from the clear 3×3 stair landing; if an obstruction cuts a narrow passage, a
short dry bend reconnects it. Swimming is never required to explore the cave.
A layout that cannot satisfy both the limit and connectivity is retried rather
than accepted with blocked or oversized passages. Diagonals are not capped.
Rock blocks movement, visibility and projectiles under the existing cave-wall
rules. Pools use ordinary deep `water`: they interrupt dry runs but remain
transparent to sight and projectiles. Swimmers and Merlings may cross them under
normal swimming/drowning rules; non-swimmers can always use the dry route.
Thus the 15-tile rule limits continuous dry floor, not swimmers' travel distance
or ranged sightlines. No freezing or special water status is introduced. Other cave styles retain their previous generation rules.
No special terrain, monster affinity or new status is introduced. Tile mode and ASCII mode use the existing cave terrain rules.

The browser extracts prototypes directly from transparent PNGs. The JSON at
`content/cave_silhouettes.json` contains only the ordered source IDs and image
paths (91 entries; previously 72), not precomputed shapes. Changing an existing source PNG
requires no build step; a newly added image needs an entry in this list because
static hosting cannot enumerate a directory. No Python or image tooling is
required to run or update the game.

Before world generation starts, a fixed integer hash of the world seed selects
two, three or four distinct sources, without consuming gameplay RNG:

| Source count | Chance per world |
| --- | --- |
| 2 | 30% (previously 60%) |
| 3 | 40% (previously 30%) |
| 4 | 30% (previously 10%) |

The browser prepares **three independently blended prototypes** per new
world. The first uses the original world-seed source selection; the second and
third use deterministic salted seeds and **disjoint source images** from the
same 91-image catalog. This allows 1–3 silhouette caves to have distinct shapes,
not just rotated copies of a single composite. Only the images selected for
these three potential caves (6–12 unique source PNGs) are fetched, rather than
the entire catalog. Preparation completes before any gameplay worldgen starts;
each successful silhouette cave uses the next preloaded prototype, and placement
retries reuse that exact prototype. Loading order, rendering and animation
timing never affect source choice. A missing or invalid required image is a
world-generation error, not an excuse to select a timing-dependent substitute.
Preloading more images may increase new-world startup time, but saved worlds and
replays never need to fetch the original source PNGs.

Extraction reads the PNG's original alpha bytes directly, without canvas or
browser resizing. Sources must be non-interlaced 8-bit RGBA PNGs (all 91 current
images meet this format). PNG filtering and decompression recover the original
pixels exactly. Pixels with alpha below 128 are discarded. The visible shape
is cropped to its bounding box, then reduced to a grid whose longest dimension
is 48 cells. Each cell uses fixed integer pixel boundaries and becomes floor
when at least one quarter of its source pixels are solid. Fully transparent or
fully opaque sources are rejected. This deliberately replaces the previous
Python/Pillow sampling rule.

Completed prototypes are reused in memory during the session. Versioned source
image requests use the existing service-worker runtime cache, allowing reuse
offline once that image has been fetched. Starting a new world offline still
requires all selected images to have been cached; loading an existing save or
replay does not require the source image. Deploy changed art with the normal
game-version bump so clients fetch the new source bytes.

Two-source caves keep the existing union blend: the second source is rotated,
may be mirrored, and is offset while retaining meaningful contributions from
both shapes. Two-source overlap rules remain unchanged.

For **three- and four-source caves**, every added silhouette, including the
second, attaches at the cluster's edges with only **5–15% of its floor cells
overlapping** the existing cluster. Thus **85–95% of each incoming shape** stays
outside the cluster at placement. Each addition is rotated and may be mirrored.
The search also preserves at least **25% exclusive floor from every earlier
source** after all additions, so a later shape cannot erase an earlier one.
Overlap is measured on the extracted masks before fitting and cave repairs.
These connections make distinct lobes and branches rather than a central stack.

Each combined outline is still fitted to the same per-cave footprint bounds.
A different source composition does not multiply that cave's inhabitants or
extra loot. Raster fitting can narrow limbs; the existing dry connectivity,
clear stairs, 15-tile dry-floor limit and per-cave **0–25% water** separator
rules still apply. This provides more route and pursuit choices while preserving the
existing balance envelope. Source choice still has no monster affinity.

Cave style, all source IDs, combined prototype ID and complete generated
geometry use the existing cave descriptor and map save fields. Loading and
replay initialization restore them directly without fetching source images or
regenerating layouts. These shape-selection changes introduce no persistent per-actor status; the
complete result remains stored in the existing cave descriptors and map data.

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
stone stair art rather than cave-stair artwork. Every Dwarven stair has a full
3×3 marble landing: the eight surrounding cells must be free of walls, furniture,
props, and initially placed occupants. The Fort descent and later Ruins exits
are selected only at valid clear landings; decoration and loot placement protect
them on both ends of each paired stair. The sealed Deep Mines
continuation uses `X` in ASCII and its own collapsed-shaft image. A Pickaxe is
needed to clear it; excavation costs one turn and permanently opens the passage
without immediately changing floors. Inspecting the cleared entrance descends
to the Mines.
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

## z:-9 and deeper: Dwarven Mines

Dwarven Mines form a separate **4- or 5-floor** dungeon with equal probability,
always starting at **z:-9**. The established 3–5-floor Dwarven Ruins generator
is unchanged. If the Ruins end at z:-6 or z:-7, a direct staircase leads to
z:-9; unused depths are not accessible play areas. When the Ruins end at z:-8,
they connect directly to z:-9. Mines extend through z:-12 or z:-13 and contain
paired up/down stairs, allowing the player to return along the same route.
The first floor offers a comparatively quiet respite after the Dwarven Fort;
the second is a deliberate difficulty spike. Mine floors use **brown cave-floor
tiles**, with dedicated brownish **Shoddy Mine Stairs** art for stair travel.
The collapsed entrance is highlighted **red** on the maps like other exits.

The initial mine layout uses a narrow winding excavated spine, side branches,
short pockets, and at least one alternate route. Generation checks a single
connected walkable component and a minimum 30-step stair-to-stair route. Floor
count, geometry, retries, encounter density, pack sizes, group weights, and
spacing are configured in `content/world_generation.json`. A flooded side
chamber is guaranteed on mine floor 4 and may appear on floors 3 or 5
(**35% each**). Each chamber branches from a dry passage, has a dry shoreline
around a pool of deep water, and never cuts through existing corridors,
staircases or cage landings. Swimming is optional for reaching all dungeon
stairs. **Xibal spawns inside the flooded pools**, not on dry mine floors;
its Swimming ability lets it leave the water to pursue the player. The haulage cage
occupies the **same x/y position on every mine floor**: reachable cage landings
on the first and final floors, and an **open shaft with a dangling rope** on
intermediate floors. The exposed shaft cannot be crossed or climbed, but all
eight surrounding tiles are walkable and connected to the passages. The shaft
remains clear of stair approaches and never replaces an ordinary staircase.

Exactly one Pickaxe is placed in reachable space on the penultimate Dwarven
Ruins floor. It is a normal inventory item, **40 gold** base value and **20 gold**
sell value, and is not consumed by clearing the mine entrance. The opened
entrance, every mine floor and transition, monster positions, discovery, and
inventory state persist through current saves and replay. Gameplay transitions
and excavation resolve on the turn; animations never determine their outcomes.

The separate mine encounter generator uses **19 new species** grouped into
early, middle, and late threats. The floor-by-floor progression is:

| Mine floor | Depth | Population | Random prefix chance |
|---|---|---|---|
| 1: respite | z:-9 | Giant Rats, Giant Bats, Scarabs; at most **one Giant Spider**, appearing with **25% chance** | **0%** |
| 2: early | z:-10 | Predominantly early mine species | **11%** |
| 3: middle | z:-11 | Predominantly middle species, sometimes early | **13.5%** |
| 4: late | z:-12 | Predominantly late species, sometimes early/middle | **16%** |
| 5: late (optional) | z:-13 | Predominantly late species, sometimes early/middle | **18.5%** |

**A stronger species never appears above its intended tier.** Deeper floors may
include a small proportion of weaker tiers, with a stronger bias toward their
own tier. Floor 1 borrows existing basic enemies without changing their
ordinary surface spawn pools. When `guaranteeEachSpecies` is enabled,
generation reserves at least one of every early species on mine floor 2,
every middle species on floor 3, and every late species on floor 4. Those
encounters count toward the normal floor population budget; remaining slots
use weighted groups and packs. Monster stats, rarity, existing
abilities, and `z-n` spawn biomes live in `content/enemy_templates.json`. The
abilities listed in **Enemy Special Properties** are active. No species
receives an unimplemented ability string.
Mine encounters use the ordinary non-Champion prefix and humanoid-equipment
systems. Among the mine roster, **Wyrdhag, Naledi, Troglodyte, and Cave Troll**
are humanoids; the others remain non-humanoid. Equipped humanoids gain normal
gear stat effects and drop their worn gear on death. All retain normal XP,
artifact-loot, and Bestiary rules. The ordinary surface and cave spawn pools
are unaffected.

**Haulage cage.** The upper cage is on mine floor 1 (z:-9), and the lower
cage is directly below it on the final generated floor (z:-12 or z:-13). Both begin locked. The
player must reach the **lower cage** by ordinary stairs and Inspect it to release
the counterweight. This consumes **one gameplay turn** and does not also move
the player. The single unlocked state then enables travel in **both directions**
between those two floors. Inspecting the upper cage while locked consumes no
turn; riding a released cage uses the existing dungeon-stair transition turn
rules, with no resource cost or simulation of skipped floors. As on other mine
transitions, pending monster warnings are canceled when changing floors.
Arrival uses the ordinary safe-landing search: a creature occupying the cage
cannot be overwritten, and travel is denied if no legal arrival exists.
Locked platforms use a muted cage graphic; the released upper and lower cages
have distinct directional tile and ASCII visuals. The endpoint coordinates,
both tile states and the **one shared unlock flag** persist through saves and
replay. Settings and messages are in `content/world_generation.json`.

The mine-specific monster abilities use the generic handlers documented in
**Enemy Special Properties**. Mine terrain and stair geometry constrain their
legal moves and target tiles.

Outside the Mines, the normal encounter pools are unchanged. The two approved
exceptions are: an independent **10% per-world chance** to add one Cave Troll
on the ordinary z:-2 cave map away from cave entrances, and the 19 new
transparent monster silhouettes becoming eligible sources for ordinary z:-2
silhouette cave generation. No mine monster is included in the Old Hunter's
normal quarry selection by this addition.

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

The 9×9 mausoleum contains four fixed **tier-5 chests** in its four
interior corners, with a central sarcophagus and a staircase at the hut.
World rotation turns the room and chests together around that staircase.
The room's quarter-turn orientation (0–3) is persisted in saves and replay
snapshots: restoring the world reconstructs the rotated room from its cave-layer
context without generating fresh loot. Chests that have been opened stay
absent, and remaining chests never overlap the sarcophagus. Restoring a
current-format save created before the orientation field was recorded uses its
remaining marked chests and explored mausoleum tiles to reconstruct the layout.

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

## Deep grotto and burrow route variety

For each generic **z:-2** grotto, the generator samples a chamber density
(divisor 235–410), chamber-count bonus (2–6, adjusted by world traits),
chamber radii (3–10 horizontally, 2–9 vertically), center separation,
ragged edges, passage widths (typically 1–4), midpoint detours and **0–9
optional loop attempts**. A loop is carved only if it provides a meaningful
shorter route between previously connected chambers (the existing path must
be at least 1.7 times the direct Manhattan distance). Some generated grotto
networks deliberately have no extra loop. Each grotto now has a **35% dry
roll**; otherwise its water-pocket chance is sampled from **0–40%** (previously
fixed at **60%**), attempting **1–3 pockets** only on success. The
`flooded_depths` trait adds its existing **25 percentage points** to the sampled
chance and continues to enlarge pools. Every accepted pool preserves dry
reachability from the stair.

Burrows vary their turning chance (**8–40%** before world-trait adjustments),
branch count (**4–15**, area-limited), path lengths, segment widths, narrow
pockets and **0–7 optional narrow shortcuts**. The shortcuts need a genuine
detour to shorten, using an existing dry-path / direct-distance ratio of at
least **1.8**. Burrows have a **55% dry roll**; otherwise the chance of
attempting **0–2 small water pockets** is sampled from **0–25%** (previously
fixed at **35%**), preserving the same dry reachability guarantee. Their dry
footprint must cover
less than **63%** of the reserved rectangle, retaining meaningful tunnel space
instead of becoming another irregular grotto.

Both styles retain their **original maximum footprint choices** (modulo Cursed
World modifiers), existing paired stairs and deterministic worldgen. Cursed
World effects on room bonus, radius caps, link attempts, turn rates, minimum
branches/steps, water odds and pool radii are applied on top of the newly
sampled ranges. Generated maps persist as ordinary underground tiles; no new
runtime state, save flag, replay action or monster mechanic is introduced.
The silhouette-cave algorithm and its source imagery are unchanged.

**Deep Caves 2.0 v195 — organic walls.** Grotto and burrow layouts now also
use the silhouette cave's exterior-outline softener. They add only small,
deterministic outward bulges, never remove floor, cut stairs or merge cave
components. Grottos modify up to **1–3%** of dry area along eligible exterior
runs of **9–13 tiles**; burrows use **0–2%** on **10–14-tile** runs, preserving
their narrow, branching identity. Silhouette smoothing retains its original
6% budget and geometry rules. Changes are stored as ordinary generated tiles;
no new runtime or replay status is needed.


## Decorative cave props

Ordinary caves on z:-1 and z:-2 contain cobwebs, small stalagmite clusters and
small mushrooms. These are cosmetic overlays: they do not block movement,
vision or projectiles, alter terrain bonuses, slow actors, offer harvesting or
loot, or participate in quests. Crypts and mausoleums are excluded. The Dwarven Fort and deeper
Dwarven Ruins also receive webs only (35% of eligible masonry corners),
without extra stalagmites or mushrooms. Each eligible marble-floor corner
anchors a web on **one of its two adjacent perpendicular masonry wall tiles**,
chosen by a seeded coordinate hash. Webs never lie on the room floor, cover an
existing ground item, or change wall collision or opacity. The ordinary cave
props instead occupy clear floor tiles at least three tiles from entrances or
stairs, with webs requiring cave walls on two perpendicular sides.

Placement uses a stable hash of world seed, depth and coordinates, without
consuming gameplay RNG. At eligible corners, webs have an 18% placement chance;
eligible floor positions have separate 1.8% stalagmite and 2.5% mushroom bands.
On the surface, living Giant Spiders generate up to two decorative webs per
spider, scattered **2–3 tiles from their original spawn point** (Chebyshev
distance, on ordinary dry grass/forest/hill ground). They never occupy the
spider's tile or an immediately adjacent tile, existing loot, NPCs, or enemy
spawn tiles, and overlapping webs are prevented. Their placement uses the
same seeded coordinate-hash method, not combat RNG. They remain in place if
the spider wanders or dies. As with cave webs, they confer no status, hazard,
loot, or obstruction, and render behind items and creatures.

On generic z:-2 each source cave now samples a stable seed-derived
**0–4× decoration-density multiplier**, with additional nine-tile local
variation and probabilistic correlations: webs are somewhat likelier near
existing Giant Spiders, and decorative mushrooms somewhat likelier beside
water. Neither association is guaranteed, so decorations are clues, not
species detectors. The original z:-1 and Dwarven decoration probabilities
remain unchanged. No decoration consumes gameplay RNG or overlaps a static
Tracking clue.

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

Ordinary z:-1 caves retain their **eight seeded scenarios** and entrance clues.
The generic z:-2 population is no longer scenario-based; it uses the
**Deep Caves 2.0 parametric ecosystem** detailed below. Crypt, mausoleum and
Dwarven Fort encounters remain separate.

| Shallow scenario | Encounter and distinctive features |
|---|---|
| Abandoned camp | Bats, rats, campfire, chest and Life Potion |
| Bat roost | Bats gathered deeper inside and a chest |
| Rat warren | Giant Rats, chest and remains |
| Goblin cache | Goblins guarding a chest |
| Bone hollow | Skeletons near loot and remains |
| Chitin nest | Giant Bugs deeper inside |
| Beast den | A Wolf pack |
| Smugglers' refuge | Goblins, another creature, campfire and supplies |

### Deep Caves 2.0 — territory-based populations (v192 / schema 99)

On z:-2 the generator populates **connected complexes**, not a predefined
cave-type deck. Each source cave still retains its style, entrance coordinates,
source tile mask and `caveIndex`. Complexes and irregular territories use the
stored topology from the previous generation stage; they do **not** introduce
new movement or territorial AI. Monsters can travel across linked caves.

The ecosystem parameters live under `cavePopulation.ecosystem` in
`content/world_generation.json`. For each complex, the generator samples a
center-weighted population density between **6 and 43 monsters per 1000 source
dry-floor tiles**, scaled by the existing `deepMonsterMin` and `deepMonsterMax`
world-trait modifiers. Population is capped at **70 monsters per source component**,
not at 105 per merged complex. A separate threat budget limits effective
population strength; stronger encounters consume more of that budget.

Each territory receives a randomized population share weighted by its usable
area and local density, with a **16% initial chance of being empty**. Actual
occupancy depends on stair clearance, terrain, available positions and the
shared budget. Species selection uses template `rarity`, tier weights, a
randomized complex-wide preference, and additional local preference to
repeat species within a territory. Consequently one territory can contain
multiple species while another may have entirely different inhabitants.
The maximum across a complex is 18 species and at most 7 preferred species
per territory. These are limits, not quotas.

**Eligibility:** new ordinary z:-2 populations use the explicit approved
species lists in `cavePopulation.ecosystem.allowedSpecies` and
`conditionalSpecies`. The entire tier 5, `ultraRare` species, Nymph,
Centaur, Sasquatch, Yeti, White Tiger, Myrka and Skerva are excluded.
Tokka is allowed at its existing rarity. Slurper, Giant Crab, Murkspawn,
Lizard Man and Giant Toad require water within eight Manhattan tiles of their
spawn location and begin on ordinary dry cave floor; Slurper does not receive
Swimming. A natural Vampire still uses the existing special guaranteed
crypt-or-bat-cave placement, not the new ordinary selection pool. Generic
z:-2 scenarios never rewrite an enemy template's stats, abilities or AI.
Existing `far`-wander species use the ordinary underground `roam` conversion.

Every existing staircase retains **at least eight Chebyshev tiles** of
monster clearance for ordinary ecosystem spawns. Ordinary monsters prefer
at least three tiles between recent spawns, with spacing relaxed when space
is limited. Source cave floors are owned by their original descriptors, and
carved connector tiles are left clear. Champions remain **optional**; the
current number of attempts, escort and territory budget rules are specified
in the v194 section below. A separate **10%** roll may add one tier-4 enemy;
neither encounter is guaranteed and attempts may fail if no safe space or
budget remains. Tier-4 choices exclude `ultraRare`
and tier-5 species. Ordinary prefix rolls use the existing deep-cave prefix
chance, preserving `champions_age`, `mundane_age`, `things_below` and other
world traits that modify it. Champions have their normal existing properties.

### Deep Caves 2.0 — per-cave tiers, clusters, synergies and route measurements (v194 / schema 101)

The z:-2 generator now varies **tier probabilities independently for every
source cave** even when several caves belong to one connected complex. Tier 1
weights sample from **0.12–0.90**, tier 2 from **0.55–1.50**, and tier 3 from
**0.20–1.25**, then normalize to sum to 1. Existing species rarity,
water-based eligibility, bans on tier 5 and `ultraRare` creatures and world
traits remain in force. Tier 4 continues to use its separate **10% attempt per
complex**; the tier ratios do not allow mass tier-4 spawns. The sampled weights
are stored on each source cave descriptor.

The old **40% single-Champion attempt** becomes a count of **0–5 Champion
candidates per complex**, with probabilities **60%, 24%, 10%, 4%, 1.5%, 0.5%**
respectively. The overall chance to attempt at least one remains **40%**.
Champions and their existing **0–6** potential escorts consume the same complex
and territory population/threat budgets as all other monsters. Their actual
count may be less than sampled or zero where space or danger budgets prohibit
placement. Champion support costs more when its **Inspired** radius overlaps
allies. The optional tier-4 encounter remains separate; no end boss is assured.

Every territory receives a distinct threat share based on its target
population and a center-weighted **0.55–1.60** multiplier. Those shares are
normalized to the complex-wide budget; a joined cave does not obtain extra
budget. Costs include base tier, the monster's existing abilities, the Champion
prefix and proximity-based synergy with previously placed allies. The model
charges extra for cooperating Gang Power users of the same species, multiple
ranged attackers, Pull with shooters, stacked crowd control, summons with
support, Champion auras and other mobility/control combinations. It is an
**approximate placement-time risk model**, not a replacement for combat rules
or a guarantee that every possible tactical combination has the same strength.
There are no additional monster abilities or runtime debuffs.

Each territory independently samples **0–8 spawn-cluster centers**, subject to
its target population and valid dry floor. Cluster radii are **2–7 walking
steps** as a placement preference (checked by Manhattan distance) and each
spawn has **35–85%** chance to prefer a cluster instead of the dispersed
placement. The normal entrance clearance still applies. Territory metadata
stores target and actual budgets, cluster centers, cluster radius and actual
population. Cluster centers only influence worldgen, not later monster movement.

For **grotto** and **burrow** a seed-sampled alternative-route target is chosen
from **0–70%**, center-weighted. The generator tries to reach its goal by
creating a limited number of useful shortcuts between chambers or branch tips.
Cave width, shape, dry connectivity and the separate identity of burrow and
grotto remain protected. Silhouette geometry is unchanged; it does not try to
fulfill this target. Targets are not guarantees: unsuitable geometry may yield
fewer alternative routes. Actual attempted/accepted loops are stored in the
source cave topology metadata.

After population and rewards, a deterministic **read-only exploration audit**
measures each complex's dry area, number of staircase entries and encounter/
loot sites, distance from stairs to first event, the longest geodesic distance
to an event, lengths and out-and-back travel costs of empty dead-end branches,
and actual route alternatives. An alternate route is counted if one of up to
**12** sampled distant destinations remains accessible within **2.2×** its
original shortest route after blocking a **3×3** middle section **and** its path differs from the
original by at least **8 distinct tiles**. This rejects superficial detours
around an isolated tile in a room. All metrics use stored
terrain, inhabitants and rewards and **consume no RNG**. They are diagnostics
for balancing world generation, not random values themselves or gameplay rules.
The finished metadata persists through world rotation, save/load and replay.

Deep Caves 2.0 still excludes new `far` wandering underground and does not
change the z:-1 scenarios, crypt, dwarven dungeons or silhouette extraction.

### Deep Caves 2.0 — world-budget rewards and permanent spoor (v193 / schema 100)

Ordinary z:-2 chests and loose supplies are now allocated **once for the
whole explorable deep-cave network**, after monster population and before
optional underground clues. The previous 8–12 chests and 4 supplies per
source are replaced by reference allowances of **10 chests and 4 loose
supplies per source component**, adjusted by the total playable dry-floor
area. Chest allowance uses an area factor clamped to **0.75–1.35** relative
to **1,700 dry floor tiles per source**, and an independent world multiplier
**0.8–1.2**. Loose supplies use a **0.7–1.3** multiplier. This preserves
approximately the old world-wide economy without enforcing equal rewards
per cave. Connecting cave components neither creates extra allowances nor
removes a component's budget; rewards are divided across **complexes** with
area-weighted, random allocations. Allocation is subject to usable space and
never overlaps other ground items or living monsters.

Chests retain their existing normal tier-2/tier-3 loot tables (**50/50**
selection); no tier-4 chest is introduced. Reward positioning uses the
shortest dry walk from any staircase, randomized spatial concentration and
nearby monster pressure. Tier-3 chests within **14 dry steps** of a stair
and more than **7 tiles** from enemies reject **86%** of otherwise valid
early-safe placement attempts; occasional lucky finds remain possible.
Difficulty/reward correlation is sampled **65% neutral, 25% mildly positive,
10% weakly negative**. The resulting distribution is deliberately uneven,
but does not systematically penalize dangerous complexes with poor loot.

The total world budget and tier chances stay unchanged. 
An unguarded candidate is rejected when **two other rewards are
already within 7 Chebyshev tiles**; a candidate within **7 tiles of any enemy**
allows at most **four rewards** in that radius, including the candidate.
Chests must be separated by at least **5 Chebyshev tiles**. Crowded positions
also score lower and the old concentration preference drops from **0.45 to
0.20**. If space is exhausted, the generator skips optional rewards rather
than depositing a large pile. A rich complex remains possible, but rewards
are distributed across exploration space. Existing saves keep their already
placed loot; generation does not rearrange it on entry or loading.

Each connected deep complex may also contain **static old tracks** placed
after actual inhabitants (including the guaranteed Vampire) are generated.
Each stair has a **20–35% seeded chance** to receive **1–4** clues on suitable
floor tiles **3–16 cardinal walking steps** away. Territories have an
independent **18%** chance for an additional clue; no complex exceeds **12**.
Tracks identify a species that genuinely existed in that same connected
complex at generation, usually from the entrance's vicinity; the bearing
points toward that original individual at generation time, not its current
location. Clues persist if the creature moves or dies, do not expire, and
do **not** cause underground `far` wandering or participate in the surface
track-aging system. They never reveal the existence of a Champion or exact
coordinates. Untrained characters cannot interpret them; trained Tracking
reveals direction and reveals species only after at least one normal kill of
that species. They render as small, permanent paw/arrow marks in discovered,
currently visible generic z:-2 cave terrain, and are inspectable without
consuming a turn. The old tracks are persisted as `caveSpoor`, rotated with
the world (including their eight-direction bearing), restored on save/replay,
and retained when a new character reuses the same world.

Natural Fungus still uses its previous independent per-source rolls and the
world-wide minimum of three across z:-1 and z:-2. These changes never
regenerate cave loot, clues or Fungus on level entry.

There are **no content-revealing named scenario clues or introductory messages**
for z:-2. Shallow scenario clues continue to work. Each deep-cave descriptor
saves `populated: true` instead of a scenario ID. The existing world-level
state preserves complex ecosystem statistics, local territory population and
species summaries, enemies, equipment, ground items, cave membership and
all seeded RNG outcomes. Save/replay restore this stored state; loading never
reruns generation. The new schema 99 requires newly generated worlds and does
not migrate earlier saves.

Cave entrances are selected from mountain edges.

Primary cave locations must be sufficiently separated.

The first cave may receive a second entrance.

On z:-1, passages between a cave's two surface entrances follow a seeded,
winding digger trail rather than a direct diagonal/straight line. The digger
favours the destination but can turn and make local detours; connections remain
one tile wide and cardinally connected, so diagonal corner contacts are never
required. A six-tile margin around the endpoints bounds the wandering area.
Wandering has a finite budget, followed by guaranteed progress to the target.
The route avoids the crypt exclusion zone and the mausoleum's underground
safety margin. If no safe route exists, that cave placement is rejected.
Both entrance tiles are preserved. This changes only the links between paired
entrances, not chamber generation or the z:-2 silhouette caves. Trails are
created during world generation and stored as ordinary cave floor; loading a
save or replay restores the stored map. Save version remains 97.

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

The Big Bell also has a strict Temple-reachability invariant: placement scans
the Temple's eight-direction walkable component and only accepts mountain tiles
next to that component. It prefers space for both guardians, widening the
search if necessary, while keeping the bell at least 20 tiles from the Temple.
After volcanoes and cave/fort entrances are stamped, reachability is checked
again. An absent or isolated bell rejects the world attempt rather than
creating a disconnected patch of grass inside the mountains.

The surface Dwarven Fort entrance has a separate reachability invariant. Natural Fort candidates must border the same 8-direction walkable component as the Temple; a fallback mountain outcrop may likewise only be created on that component. After the Fort gate is stamped, cave/fort generation defensively flood-fills from the Temple again and rejects the world if the gate is not reachable. This prevents visually valid mountain pockets from containing an inaccessible Fort entrance.

If these surface connectivity checks fail, the world attempt is regenerated.

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
non-humanoid weighting. The independent `"ultraRare": true` template flag,
not the numeric rarity, enforces **at most one spawned individual of that
species per world** across surface, caves, Dwarven Ruins and forest ambushes.
Currently only NULK, SKELD, DRUSK, GAUR, ASHFANG, MIREHOWL and NHALUUN have
this flag. An absent flag is `false`. Once one of these species spawns, even if
it later dies, it cannot spawn again in the same world; a different eligible
monster fills subsequent ordinary weighted slots. Other species are unaffected.
In particular, Myrka (`0.02`) and Vampire (`0.01`) may spawn multiple times.
At least one Vampire is still guaranteed in a distant eligible underground
crypt or bat cave; this does not prevent other natural Vampire spawns.
Templates listing only depth biomes such as `z-9` are ineligible for surface
population, including migration groups; the missing-surface-biome fallback
cannot spawn mine-exclusive monsters on the overworld. A template with an
explicit surface biome remains eligible under its normal surface rules.
No additional persistent state is required: the existing saved enemy roster
and world-wide killed-species history enforce uniqueness, including across
permadeath characters. Existing saved enemies are never removed.

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
Optional `ultraRare: true` (one spawned individual of that species per world)
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

Current templates contain **75 enemies**. The seven all-uppercase species
NULK, SKELD, DRUSK, GAUR, ASHFANG, MIREHOWL and NHALUUN use `rarity: 0.02`
and `ultraRare: true`. They follow the normal tier, biome, distance, prefix,
wandering and stat-variance rules, but each is limited to one spawned
individual per world. Other rare creatures, including Myrka and Vampire,
do not have this limit.

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

## Telegraphed mine abilities

**Rupture** is a generic telegraphed attack, currently used by Duiwel. On an
eligible turn it has a **25%** chance to mark the player's tile and up to two
nearby legal floor tiles, at most **four tiles** from a normally detected target.
The marked floor is visible in tile and ASCII modes and interrupts auto-travel.
The monster waits for **one complete player action** before erupting; moving
off every marked tile prevents the hit. A player is never deliberately left
without an initially unoccupied one-step escape, although other hazards,
rooting or moving actors can subsequently block it. A caught player takes an
ordinary damage roll with **125% of the monster's effective ATK** against the
player's DEF, without a separate miss/critical/glancing roll. Eruption gives
the visible game canvas a pronounced **650 ms** visual shake whether it hits or misses; the animation
does not affect turns, damage or replay outcomes. Resolution consumes the
monster's action and starts **five complete subsequent active-floor turns**
of cooldown. Warnings and cooldowns persist in saves/replay; pending attacks
disappear on the caster's death or the player's departure. Thresholds and
messages are configurable in `enemy_config.json`.

**Burrow** is a generic repositioning action, currently used by Marsutal.
On an eligible chase turn within **four tiles**, Blind hesitation is checked
first; there is then a **25% chance** to retreat underground. It vanishes
immediately, freeing its original tile and leaving a disturbance where it
disappeared. No destination marker is shown. The destination is selected at
preparation time from free tiles adjacent to the player's position, reachable
from the monster's origin within **four terrain-traversable steps** without
crossing solid walls, gates or closed doors. The monster remains hidden and
untargetable for **two complete player actions**, then emerges on the following
enemy action. If its chosen tile is still free, it may make **one ordinary
melee attack** when adjacent; it cannot gain an extra weapon-speed attack.
If the player is standing on the disturbed origin or the secret landing tile,
the monster instead attempts **one 90%-accuracy collision attack** from that
tile. A successful hit uses ordinary melee damage, armor, critical and status
rules, then shoves the player onto one randomly selected adjacent walkable
tile (including hazardous tiles, which trigger normally); no second attack or
critical knockback occurs. If the collision misses, the monster emerges at its
origin or a free adjacent tile without attacking again. If an ordinary landing
is blocked, it uses the same harmless fallback. If there is nowhere to push a
player occupying its landing, or no safe return space exists after a miss,
it stays buried until an opening appears. A successful emergence or canceled Burrow begins
**six complete active-floor turns** of cooldown. Origin, destination, remaining
wait time, and cooldown are deterministic save/replay state.

**Jump** is a generic fast repositioning action, used by Naledi and Giant Toad.
It prepares a straight leap of **two to four tiles** when it can bypass
creatures or low cover, or improve pursuit by at least two tiles. It may cross
creatures, dwarven beds, tables and crates, but not boulders, walls, doors,
shelves or gates. The landing tile is fixed during the player's response
action, but no floor warning overlay appears. The next enemy phase moves the
jumper to an available landing tile without damage or same-turn melee. A
blocked landing leaves it at the origin. Cooldown: **four complete active-floor
turns**. Blind hesitation is checked before pursuit Jumps. Neither Jump nor
Burrow can land on dungeon transitions, protecting staircase access.

**Wall Ambush** is a generic one-time concealment rule, currently used by
Trogloraptor. Concealed monsters spawn in ordinary legal spaces beside a solid
wall, never in protected stair approaches; without a valid site they start
visible. They cannot be seen, inspected or attacked while concealed. When
the player comes within **two tiles** and has line of sight to the location,
disturbed stones provide a visible warning and **one player action** to
respond. On the next enemy action the monster reveals itself and makes **one
immediate ordinary melee attack if adjacent**, without a weapon-speed follow-up.
Walking into a concealed monster instead reveals it and spends the attempted
movement action, with no free counterattack. Revealed monsters cannot hide
again. Concealment, warning and spent state persist through saves/replay.
All three actions use deterministic preparation and resolution independent
of their warning visuals.

## Monster group awareness

**Collective Mind** is a generic one-time group alert, currently used by
Naledi. When the first member on a generated floor normally detects the
player, every living ally of the configured species with this ability on that
floor becomes **Alarmed**. Alarmed monsters retain their existing sensory
chase rules, including following around corners within aggro range; they do
not teleport, share a forced path, or receive a permanent tracking target.
The shared Alarmed state does not fade with distance or when the player leaves
and returns to the floor. Before the scout reaches another group, killing that
scout cancels the collective alert; survivors then follow ordinary Alarmed
expiration rules. Successfully reaching the other group makes the broadcast
**permanent** for surviving members on that floor, even if the scout later
dies. Each floor can trigger Collective Mind only once.
The broadcast is conveyed by its world log and the monsters' Alarmed state,
without a separate floating "Linked!" popup.

The detecting member becomes the designated scout. It chooses a reachable
**different pack**, preferring packs with **at least two other surviving
members**, then the shortest legal travel path; an isolated surviving ally is
an acceptable fallback. Equal choices use stable identifiers. The scout
spends its actions moving toward an adjacent reachable space near those allies
instead of attacking the player. If no separate group is reachable, it **flees
away from the player and searches** instead. If trapped adjacent to the
player with no legal step farther away, it fights back using normal melee;
otherwise it keeps searching rather than pursuing the player. Normal movement or
an eligible, prepared **Jump** may be used; Jump follows its ordinary cooldown
and never grants a landing attack. A blocked route or loss of the chosen group
ends that route; the scout searches for another reachable pack, defending
itself only if cornered. Regrouping ends its flight. Floor alert, permanent-regrouped state,
pack identity, destination and retreat are saved and replayed independently
of animation. Parameters and messages are configured in `enemy_config.json`.

## Monster-applied status effects

The Dreadling, Gorgon, Mummy, and Banshee introduce timed combat statuses.
They are applied during deterministic enemy actions, **not** after an animation
finishes. Attack-based effects require a damaging melee hit; gaze and wail
instead replace the monster's attack or movement action. A proc that fails its
roll does not begin a cooldown. Each enemy owns its cooldown independently;
status reapplications refresh the duration and never stack with themselves.

| Monster / ability | Trigger | Effect | Duration | Cooldown after success |
|---|---|---|---|---|
| Root — Dreadling and other configured monsters | 25% of damaging melee hits by default | Walking is blocked, but attacks and item use remain available. An attempted move spends a turn. | 3 player turns | 5 complete turns |
| Gorgon — Petrifying Gaze | 25% per eligible enemy action; line of sight and ≤3 tiles | −3 SPD and −3 GRACE, respecting the normal stat floors | 3 player turns | 5 complete turns |
| Mummy — Curse | 25% of damaging melee hits | −2 ATK | 4 player turns | None |
| Banshee — Wail | 25% per eligible enemy action; line of sight and ≤4 tiles | Confusion: every movement attempt has a 40% chance to choose a different, currently walkable, unoccupied adjacent tile | 5 player turns | 7 complete turns |

The Banshee's Wail may trigger at four tiles even though its ordinary AGGRO
is three. When a player tries to attack an adjacent monster, confusion does
**not** redirect that deliberate melee action. It also never redirects into
another creature or a closed/locked door. Movement redirected onto a hazard
uses that tile's ordinary movement and hazard rules; redirecting cannot make
an impassable tile walkable. When there are no alternate legal destinations,
the intended move proceeds. An actual misstep cancels auto-travel. Root
prevents movement even while confused.

Confusion tracks the **individual Banshee's ID**. Killing that specific Banshee
immediately removes its confusion, but killing a different Banshee does not.
Wails from a different caster refresh the timer and replace the source.
Normal expiration also clears the source. Statuses survive save/load and replay;
all application, struggle, misstep, expiration, and caster-death events have
combat logs, with floating text on their most important effects. Active effects
are visible on the player status strip. Both the player's counters and the
monsters' absolute ready-turn deadlines are persisted by save schema **57**.

Root's chance, duration, cooldown, and source-dependent messages are defined
in `content/enemy_config.json`. The active root's source and flavor persist in
current saves and replay so struggle feedback is consistent after restoration.
The reusable `blind` ability senses invisible players without granting a
critical-hit bonus against them, and can hesitate instead of taking an ordinary
pursuit step at a configurable rate outside melee range. It counts walkable
tiles among all eight neighbors of both the creature and the player:

| Blind monster's adjacent walkable tiles | Player's adjacent walkable tiles | Chance to hesitate |
|---|---|---|
| 1–2 | 1–2 | **0%** |
| 1–2 | 3+ | **20%** |
| 3+ | 1–2 | **40%** |
| 3+ | 3+ | **60%** |

An open monster position overrides the narrow-player exception; a blind
creature in open space may still become uncertain even when the player is in
a tight passage. Checks only happen with a legal pursuit step, outside melee
range, and do not consume RNG at 0%. The existing Pull mechanic now supports
configurable messages and visuals: a non-web grasp can
move a player without showing spider webs or applying their separate status.
Blind enemies show only the **Blind** ability label in inspection; their spotting and hesitation
messages describe sensing rather than seeing the player.

## Defensive mine abilities (generic)

Three additional ability IDs share handlers and tuning in
`content/enemy_config.json`; assigning an ability to a different monster needs
no species-specific code. Effects change effective combat stats without
permanently changing base values, and active states are visible in tile/ASCII
rendering and enemy inspection.

| Ability / initial user | Rule | Player response |
|---|---|---|
| `exposed` — Vrakeber | Each attempted melee attack, including a miss, reduces its base DEF **12 → 3** through the next complete player action. Spawn variation and ordinary prefix, equipment, terrain, and ally modifiers apply after selecting the appropriate base. Subsequent attacks refresh the opening. | Strike while its exposed marker is visible. |
| `shellRetreat` — Tholosum | The first surviving hit leaving it **below 40% max HP** activates a one-time shell state: **+12 DEF**, no attacks or moves for **four subsequent complete player actions**. The triggering action does not count, and lethal hits do not activate the shell. | Heal, retreat, wait, or attack the shell; its marker and duration are visible. |
| `regen` — Cave Troll | Heals **2 HP every 3 active-floor gameplay turns**, capped at max HP. The phase pauses off-floor without catch-up and never revives a dead monster. This also applies to the optional z:-2 cave encounter. | Deal sustained damage before recovery offsets weaker strikes. |

Exposure deadline, shell duration/spent flag, and regeneration phase initialize
per enemy and persist through current saves and replay. Monster regeneration
does not alter the player Troll race's separate healing mechanics.

## Enemy support abilities: Haste, Inspired and HealSelf

These monster abilities resolve during the normal deterministic combat turn. They
cannot add bonus attacks, and their feedback is logged with brief floating text.

| Source | Activation | Result | Restriction |
|---|---|---|---|
| Gravehound, White Tiger — `haste` | 20% on eligible pursuit turns at least 3 tiles from the visible player | Move up to **2 tiles**, replacing normal chase and any same-turn attack | **5 complete turns** cooldown. Never exceeds two movement steps, cannot bypass closed doors, does not trigger while invisible/safe in sanctuary |
| Champion prefix — **Inspired** | Continuous while alive | Every living **non-Champion** ally within 2 Chebyshev tiles gains **+2 ATK, +1 DEF** | Champion does not buff itself or other Champions. Multiple Champions do not stack; moving out of range or killing the source immediately removes the bonus |
| Nymph — `healSelf` | 25% on eligible combat turns below **50% maximum HP** | Instead of an attack or chase, restore **25% max HP** (rounded up, capped at max HP): ordinary 28-HP Nymph heals 7 HP | **Once per lifetime**; successful use starts a 5-turn cooldown, but the one-use limit remains in force even afterward. Cannot heal while passive, asleep, concealed from the player, or in sanctuary |
| Wyrdhag — `consumeHealingItem` | 10% on eligible combat turns below **50% maximum HP** | Consume one randomly chosen eligible item and spend the entire action: Healing Herb or Mushroom below 50% HP, Life Potion also eligible below 20% HP | **Once per lifetime**; cannot heal while passive, asleep, unable to see the player, or in sanctuary. Healing takes priority over wounded Flee on a successful roll |

Wyrdhag's herbs and mushrooms heal as if used by a **Wyrdling** (25% bonus,
rounded to whole HP). Herb base healing is 25% of maximum HP, clamped to
20–50 HP before the bonus; mushrooms restore 25% maximum HP before the bonus
and are **never poisonous** to Wyrdhag. A Life Potion fully restores its HP.
At under 20% HP, all three eligible items are equally likely; from 20% up to
50%, herb and mushroom are equally likely. Which items are available, their
thresholds, chance, and bonus are configured per species in
`enemy_templates.json` under `consumableHealing`. Its spent charge persists
through saves and replay, and the ability does not create supplies on demand
for the player.

Haste uses the existing walkable pathfinder, and opening a door takes the normal
separate action; a sprint cannot open a door and then run through it. The two
steps are animated in sequence, but movement and any hazards resolve before
presentation. Naturally faster enemies can still earn **one extra pursuit action**, with a
chance of 5 percentage points per point of effective SPD advantage (maximum
50%). Haste replaces that roll on its activation turn, so neither effect can
produce three actions. A Haste
activation can finish adjacent to the player, but never attacks on that turn.

Inspired modifies *effective* combat stats, after spawning/prefixes, rather
than permanently adding ATK or DEF to monsters. It uses the same radius as the
Champion's gold visual aura; buffed allies have a small golden star on the tile
and an Inspired tooltip. The Champion can announce its inspiration upon
spotting the player. The Champion tooltip omits its redundant aura summary;
the Inspired status remains visible on affected followers. Defeating a visible Champion with followers gives a log
and fading-aura popup. Nymph healing shows its exact HP gained; its spent use
and Haste cooldown appear in monster inspection.

`hasteReadyTurn`, `healSelfReadyTurn`, `healSelfUsed`, and
`consumableHealUsed` belong to each enemy
instance and are initialized for new spawns and serialized/restored in **save
schema 58**, including replay snapshots. Inspired needs no per-recipient status
flag: it is recalculated directly from living Champion positions, so save/load
and replays cannot preserve a stale aura. Animations never advance or change
combat state.

## Swimming monsters

Murkspawn has the `swim` ability. In addition to its ordinary walkable terrain,
this lets it enter and pathfind through deep `water` while chasing, wandering,
or returning home. Swimming never grants flight, ethereal movement, or access
to walls, boulders, lava, and other blocked tiles. Rivers retain their ordinary
terrain rules. No swimming progress or drowning status applies to monsters.
A visible Murkspawn entering deep water logs its plunge without a floating
text popup; continued swimming does not spam the log. Monster
inspection identifies Swimming. The ability is part of the saved enemy ability
list, including replay snapshots.

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
Ghosts, including the scripted fort encounters and their prefixed variants,
do not receive `evades`; their defense is ethereal immunity to mundane weapons.

## Ethereal

Ghost has `ethereal` ability. All Ghost spawn
paths, including scripted dwarven-ruin Ghosts, receive it. Ethereal creatures
can traverse any in-bounds terrain, including walls, mountains, water, and lava.
Actor collision and map boundaries still apply. Chasing, wandering, evasion,
and invisible-attack retreat use the same terrain permission. Walls retain
their normal sight-blocking behavior. A Ghost that has already detected the
player continues phasing toward their last known direction while within aggro
range even if a wall or bookshelf interrupts sight; ghosts do not acquire
unseen targets through solid walls.

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
Lich uses the same one-use Death Shield; it does not recharge.

## Shared monster spells

Any monster template can independently add `weaken`, `slow`, `disarm`, `dispel`, `deathBolt`, `immunity`, `lowHpTeleport`, or `sacrifice`
to its `abilities` array. Lich currently has all eight. **Low-HP survival
spells are resolved before ordinary casting** using one seeded roll each
eligible turn: Sacrifice takes the first **30%** of the roll, and Teleport
the next **20%**. If **both** are eligible, their combined chance is **50%**
per turn; if only one is eligible, its probability stays **30%** or **20%**,
without inheriting the other's share. An unavailable spell's roll slice is
unused, but ordinary magic may still be cast on that turn.

If no survival spell fires, the caster gets the ordinary **20% spell-casting
roll**. Eligible ordinary spells have equal weight except **Death Bolt, which
has 5× selection weight**; the overall ordinary casting chance does not rise.
With all six ordinary abilities eligible, its chance per ordinary cast changes
from 1/6 to 5/10 (and its per-turn chance from roughly 3.3% to 10%, when no
survival ability is eligible). A successful cast consumes
the monster's one action, and cannot stack with another cast, attack, or move
on that turn. Pursuit never grants additional spell rolls. Passive, frightened,
sleeping, newly summoned, or off-level monsters cannot cast. Invisibility,
forest concealment, underground sight blockers, and sanctuary retain their
normal protections; True Sight can reveal an invisible player but cannot
bypass walls or sanctuary. Survival and ordinary abilities are determined by
the monster's abilities, not its species or name.

| Ability | Effect | Eligibility |
|---|---|---|
| `weaken` | Maximum HP −10% for 5 player turns | Weaken is not already active |
| `slow` | SPD −10% for 5 player turns | Slow is not already active |
| `disarm` | One uniformly random equipped weapon, shield or armor moves intact to the player's inventory | At least one of these slots is occupied |
| `dispel` | Removes one uniformly random active temporary buff | At least one dispellable buff is active |
| `deathBolt` | Fires a slow, skull-shaped magical projectile with fixed 20 ATK | Clear shot to the visible player within effective aggro |
| `immunity` | Blocks all incoming attacks for 5 player actions | Not already used by this monster |
| `lowHpTeleport` | Teleports to a distant reachable tile outside player detection range | Below 25% HP; not used before; safe destination exists |
| `sacrifice` | Kills one nearby monster and heals the caster by its remaining HP (capped at max HP) | Below 50% HP; eligible creature within 4 tiles and line of sight |

Weaken and Slow round their reductions up, with a minimum reduction of 1 and
minimum final maximum HP/SPD of 1. Weaken immediately caps current HP to the new
maximum; expiry restores the maximum without free healing. Slow applies after
other SPD modifiers. Cast messages report the **actual numeric stat loss** after
rounding and minimum-stat limits, not a percentage. Both appear in the status
strip with remaining turns, do not stack, and clear on player death. Their generic `weakenTurns` and `slowTurns`
counters persist in saves and replay initial states.

Disarm is announced as a **disarming spell**, not a physical disarm. 
It preserves the exact item's identity, modifiers, and identification state;
it never drops or destroys it, and never touches the Black Key slot or passive
backpack trinkets. HP changes caused by removing equipment resolve immediately,
before any following monster acts. The cast consumes only the monster's action;
the player can spend a later normal equipment action to put the item back on.

Dispel can remove food Regeneration, Invisibility, Speed, Stone Skin, Berserk,
or an unspent player Death Shield. Potion stat bonuses and drawbacks both end
with the potion's effect. Racial traits, learned skills, equipment powers,
god-mode invisibility and negative statuses are not dispellable. A normal Lich
cannot target an invisible player, so Invisibility is removable only by a
caster that can actually see that player. No eligible buff means no Dispel
attempt or target-selection RNG.

Death Bolt has **unlimited ammunition** and shares arrow/stone rules for ranged
SPD-based dodge (2× normal), armor/DEF mitigation, glancing blows, and critical
hits. Ordinary ranged misses deal no damage; glancing may deal zero; an actual
non-glancing hit deals at least 1. Like ordinary projectiles, Death Bolt cannot
pass through projectile-blocking terrain or living ground creatures, but can
pass through flying creatures. A blocked line removes Death Bolt from that
turn's eligible spell pool without consuming a cast or an RNG roll; the monster
can still pursue or choose another spell. True Sight is required to target an
invisible player. Sanctuary protections remain in force.

The supplied pixel-art skull is rendered as a `deathBolt` projectile in tile mode
(with an ASCII skull fallback), travelling for **650 ms** compared with **220 ms**
for ordinary arrows/stones. Damage or a dodge resolves on the casting turn,
not when the visual arrives; hit/miss floating text is delayed to match arrival.
No extra game turn, projectile inventory, or persistent timer is created.
Its ATK and flight duration are configurable in `content/enemy_config.json`.

Immunity is a one-use protective cast per monster, never refreshed by healing.
It blocks player melee and extra strikes, as well as dungeon spike and arrow
traps, before damage, glancing or critical rolls. Death Shield remains unspent
while immunity is active. The cast protects the next five player actions and
expires before monsters act on the fifth subsequent turn; its timer and
ready/spent state appear in the inspected monster's tooltip. Active immunity
also shows a violet rune on the creature in both tile and ASCII mode. Cast,
blocked hit and expiry all display log messages and floating text. The player can retreat,
heal or reposition while this temporary shield remains active.

Low-HP Teleport is a **one-use** escape spell triggered strictly below 25%
maximum HP. Each eligible turn has a fixed **20%** teleport chance through
the survival roll, independent of the availability of Sacrifice. A successful cast moves the caster at
least 13 Chebyshev tiles away from the player (and at least 2 tiles beyond its **current effective aggro
range**, including Alarmed bonuses), choosing uniformly with seeded RNG from
safe, unoccupied, traversable floor within a 20-step connected-area search.
It cannot escape into sealed chambers, sanctuary, traps, walls, NPCs or occupied
tiles. Without a suitable destination it is ineligible and consumes no RNG.
Teleport replaces the monster's action, reanchors its return-home position and
breaks pursuit. It does not move the player, create a new turn or depend on
visual timing. The disappearance and arrival show floating text.

Sacrifice is available strictly below 50% maximum HP when another living
monster is within **4 tiles** (Chebyshev distance) with unobstructed sight.
The victim is chosen uniformly using seeded RNG and removed with the ordinary
death animation; its **current HP** is transferred to the caster, capped at
its missing HP. Sacrifice is repeatable while eligible, with a fixed
**30%** per-turn chance through the survival roll, even if teleport is
unavailable. Both abilities use the same seeded survival roll each turn,
and each successful cast consumes the caster's action. It gives the player no XP, kills,
quest progress or ordinary loot. Summoned monsters can be sacrificed. Monsters
carrying progression keys or stolen items, active quest targets and temporarily
immune monsters cannot be sacrificed; their progression or belongings must
remain recoverable. Death Shield is not consumed in this sacrifice removal.
Both spells obey normal caster sight, invisibility, forest cover, sanctuary
and turn eligibility. Their resolution never depends on animations.

Auto-looting does not automatically equip a two-handed weapon while a shield is
equipped; the dropped weapon enters the backpack instead. The player may
manually equip it, which unequips the shield using the ordinary equipment rule.

Every successful cast has a log message and floating text. Weaken/Slow expiry
is logged without floating text. Choices, item moves,
buff removal and stat changes resolve synchronously with seeded RNG; animation
timing and tile/ASCII rendering never decide their results.

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

Wounded retreat stops while the player is invisible to that enemy. It resumes
if the player becomes visible again while the HP threshold still applies.
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
to hesitate. The special loot escape lasts **40 successful movement steps in total**
(including the guaranteed first step), regardless of HP and aggro range while
the player is visible. Hesitation, opened doors without movement, being cornered,
invisibility, and off-level turns do not advance the counter. Losing sight of an
invisible player suspends directed retreat without losing the loot or resetting
the one-time theft. A cornered thief fights normally until it can escape again.

On the 40th escape step, the thief anchors its home at the stopping tile and
resumes normal wandering, aggro, and combat behavior from the following turn.
The stolen item remains on the thief and the theft escape never restarts; ordinary
low-HP fleeing can still apply to monsters with `flee`. Sacred-ground protection
still prevents new thefts.

A thief with an empty equipment slot immediately equips stolen weapons, shields,
or armor and logs "<name> has equipped <item>." Monsters have one equipment slot;
existing gear is never replaced by theft. Consumables and artifacts are carried
without equipping. This uses the normal enemy equipment rules, including weapon
ATK/GRACE, armor or shield DEF, and their usual speed penalty. Bonuses apply once,
so a cornered thief can fight with the stolen gear. Death returns it through the
bag only, without an additional equipment drop. Replacing that gear later through
existing permadeath loot rules leaves the stolen item recoverable in its bag.

A red bag marks the carrier on the map in tiles and ASCII mode and in desktop
and mobile inspection. Only dropped bags on the floor in tile mode use the shaded red bag SVG.
Carrier map markers and desktop/mobile inspection retain the original flat
red silhouette in both rendering modes; ASCII floor bags retain their existing drawing. Victory skull and Alarmed markers shift to avoid overlap.
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
Each live threshold crossing also shows red rising **Enraged!** text for one
second after a short delay so it remains readable beside damage numbers.
The effect appears in tile and ASCII modes and is skipped during replay simulation.
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

## Wrestler

Sasquatch, Yeti, and Owlbear have `wrestler`. When they could otherwise melee
an adjacent, visible player, they have a **25%** chance to exchange tiles with
the player instead of attacking; both cardinal and diagonal adjacency count.
A successful swap starts a **five-turn cooldown**: the next five enemy turns
cannot activate Wrestler. Failed rolls do not start cooldown. The ability
cannot activate against an invisible/holy-ground-protected player, during
passive or summoned-inactive turns, or when a valid two-way swap is impossible.
The displaced player must be allowed onto the monster's tile; in particular,
non-swimmers cannot be wrestled into deep water. The monster must be able to
traverse onto the player's tile. NPCs, obstructing trees, forbidden sanctuary,
and blocked diagonal corners also prevent a swap. Invalid attempts consume no
RNG, and normal melee remains available.

A successful swap takes exactly one enemy action, deals no direct damage,
clears automatic travel, and does not award steps, swimming practice, items or
transitions. Both actors enter their new tile for trap and water/endurance
rules. It produces a combat log and **Swapped!** floating text, with crossing
movement animation resolved after the deterministic position change. Its
inspection displays whether Wrestler is ready or cooling down. Its
`wrestleReadyTurn` is an absolute turn deadline, initialized on spawn and
included in saves and replay snapshots. The new save schema is **56**.

## Monster invisibility

Myrka, Skerva, Kveld, Tulla, Nymph and Ghost have `invisibility`. Ghost retains
its separate Ethereal properties. While actively pursuing or
attacking a visible player, they have a **25% chance** on an otherwise eligible
action to vanish instead of moving or attacking. They remain invisible through
**three subsequent enemy turns**, and the ability is unavailable for **eight
complete turns** after activation (including when invisibility is broken early).
No RNG is consumed while invisible, cooling down, idle/passive, or while the
player is protected by invisibility or the Temple sanctuary. Existing evasion
and theft abilities remain available.

Invisible monsters still occupy their physical tile, move, take damage, and
obey ordinary AI/terrain rules. Only on the **activation turn**, a monster within two tiles can show a
translucent shimmer. On subsequent invisible turns it is entirely hidden,
regardless of distance, and cannot be inspected via hover/tap. Players may
still bump its occupied tile to attempt an attack; invisible targets have at
least **80% miss chance**, regardless of relative SPD. A miss does not reveal
the monster, while a successful hit breaks its invisibility. Invisible
monsters do not generate the "has spotted you" log. The monster also reveals
itself before its own attack or a theft attempt, including unsuccessful ones.
Expiry produces a message; activation and revealing produce a floating text
notification. Auras and markers are hidden while fully invisible.

The absolute `invisibleUntilTurn` and `invisibilityReadyTurn` deadlines are
initialized per enemy and serialized to both saves and replay snapshots.
Visual opacity is derived from current state and distance, not wall-clock
time or animation, so replay RNG is unchanged by rendering. Save schema **59**
introduces these fields and the Spider web owner ID.

## Charge and Pull

Boar and Minotaur have `charge`; Giant Spider has `pull`. In the code and some
internal descriptions, **rush** is the shared umbrella term for these two
straight-line abilities; it is not a third ability. While the player is visible
and within current aggro range, an aligned target at distance two or more can
trigger either Charge or Pull, depending on the monster. Alignment is horizontal,
vertical, or an exact diagonal.
For Charge, every tile on the line must be walkable `grass`, `cavefloor`,
`cavefloor2`, or `marble`, allowing Boars and Minotaurs to charge in caves and
Dwarven floors as well as on grass. Pull uses the same terrain set and additionally
allows `sand`, so Giant Spiders retain their broader surface coverage. Trees,
other creatures, NPCs, walls, water, furniture, and other non-eligible terrain
still break the line. Diagonal routes cannot cut blocked corners. There is no
additional distance cap beyond aggro range. Invalid routes use no RNG.

Charge has a 60% chance per eligible turn. The monster crosses the gap and stops
adjacent, then makes one melee attack with half the usual dodge chance. Before
defense, ATK is multiplied by `1 + 0.25 * (distance - 1)`, where distance counts
orthogonal or diagonal tile steps. Distance two gives +25%; three gives +50%.
Normal armor, glancing, and critical rules still apply. A surviving player hit
for positive damage is pushed one tile directly away, if traversable and free.
Water is eligible even without Swimming; blocked destinations prevent knockback.
Visually, Charge advances one tile at a time: each crossed tile takes 85 ms of
movement followed by a 35 ms pause. The melee lunge and damage feedback start
only after the final tile; successful knockback likewise appears after impact.
Movement and waiting input pause until the charge presentation is finished.
This timing is cosmetic and does not change the number of turns, RNG, combat,
or the resolved enemy position.

Pull has a 70% chance to connect. The web drags the player onto the eligible
floor tile adjacent to the spider, followed by one ordinary melee attack. The attack can
miss normally and gains no damage bonus. Both abilities replace normal movement
and allow no extra weapon-timing attacks or speed pursuit actions that turn.
There is no cooldown or use limit; fleeing along a clear eligible line remains risky.

Forced player movement refreshes visibility and camera position, grants no steps,
swimming practice, or voluntary-movement quest progress, and does not collect
items or trigger transitions. Forced water entry consumes water endurance and
can immediately cause normal drowning damage. Combat and relocation resolve
synchronously; animations never determine rules or RNG. Successful Pull visually
throws the cave-web graphic toward the original player tile for **260 ms** (formerly 420 ms), then
drags the player to the resolved destination over **360 ms**. Once the web lands,
a large **1.35-tile** web graphic covers the player above the character sprite
and surrounding canopies. It stays visible through combat and waits until the
player actually changes tile or kills the Giant Spider responsible for the web;
attacking, waiting, and using an item do not remove it. This overlay does not
root or penalize the player. The source monster ID persists in saves and replay
snapshots, so loading preserves the web and its death-based removal, while
projectile/pull timing remains presentation-only. The melee lunge and
damage text follow the drag. If Pull triggers after the player's own step,
the web-and-drag presentation takes priority over the ordinary walking pan:
the player remains visually at the web's target tile until it arrives, then
slides toward the spider. The final position and damage are already resolved
for the turn, regardless of animation timing. ASCII uses a moving `%` web glyph.
Replay simulation skips the presentation, and no animation state is saved.
Existing abilities and swimming state are saved and replayed normally, with
no new persistent flag.

## Summoning

Templates with `summon` in `abilities` specify `summonSpecies` and `summonAmount`,
and may specify `summonSpeciesOptions` to choose one species for the entire cast,
with optional `summonStrength` (defaults to 1) and `summonMsg`. On each active
aggro turn, the monster has one 10% seeded chance to summon instead of its
normal attack, shot, or chase. It can succeed only once in its lifetime.
Being out of melee range does not prevent a roll. Losing sight/concealment,
invisibility, passive behavior, and sacred-ground or rare-beast fleeing use
their normal non-combat paths without summon rolls. Extra attacks or pursuit
actions do not create additional summon rolls that turn.

| Summoner | Summoned species | Count roll | HP/ATK/DEF multiplier |
|---|---|---|---|
| Lich | Skeleton or Ghoul (equal chance per cast) | 1–3 | 1 |
| Serpent Queen | Serpent | 1–2 | 1 |
| Wolf | Wolf | 1–3 | 1/2 |

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
The Lich's chosen species is shared by the entire group; Ghouls use their
normal template stats.

Summons inherit level, level kind, and cave identity. They become Alarmed
immediately on creation, using the normal Alarmed lifetime and AGGRO bonus;
this also prevents invisible opening-critical bonuses against them. They cannot attack in
the creation turn, including through immediate retaliation or ranged attacks;
they may act on the next enemy turn. Placement and rules resolve before visual
effects. A floating Summoned! marker and a log show the actual spawned count. The
marker uses a **1000 ms** animation rather than the ordinary **650 ms** combat-text
lifetime so the label remains readable; this is presentation-only and does not
delay the summon action or monster turns. Lich and Serpent Queen use the default
hand-wave message; Wolf uses its custom
hungry-howl message. Messages support `<name>`, `<amount>`, and `<species>`.

Summons use normal XP and species loot rules. With the existing stat-based XP
formula, an unprefixed summoned Wolf yields **14 XP**, versus **16 XP**
for a normal Wolf (up from **11 XP** at 0.3 strength). The summoner's
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
is inactive. These derived effects never mutate saved base stats. Enemy tooltips display Carrion Instinct **only while the threshold is met**;
otherwise the ability is hidden, including its inactive description.

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
roll. Dwarven Mines use their own random non-Champion prefix chance: **0%**
on respite floor 1, then **11%**, **13.5%**, **16%** and **18.5%** on mine
floors 2–5 respectively, capped at **28%**. They do not
receive the Ruins' guaranteed Champions.

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

Champions also inspire non-Champion allies within a two-tile radius, granting
+2 ATK and +1 DEF while the Champion remains alive and nearby (see §20).

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

Only stats named by a prefix are rounded after applying it. Unrelated
fractional bonuses from humanoid equipment remain intact: for example, Swift
changes SPD without changing a Ratling's gear-derived ATK or DEF. The enemy
tooltip compares final stats against the pre-prefix snapshot, showing only
rounded differences of at least one stat point (positive or negative).

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

On the surface, standing in an enemy's aggro range triggers pursuit. Underground, a new target still needs a clear line of sight through walls, unless the monster is already Alarmed by noise or combat. Once a monster has seen the player or become Alarmed, it keeps pathfinding around walls and corners for as long as the player stays within its current effective AGGRO range, even without line of sight. Alarmed monsters do not randomly abandon pursuit at the outer range boundary or due to a large speed disadvantage. Losing range ends active pursuit; the existing Alarmed status expires independently under its 20-tile/level-change rules. Invisibility, Halfling forest concealment, sanctuary, and the ordinary projectile line-of-sight rules still apply. Merely hearing an alarm through a wall does not produce a false spotting message.

Movement occupancy is scoped to the currently active map (current z level), 
including NPCs only on the surface. Creatures on different floors may share x/y coordinates without
blocking each other's paths; same-floor creatures still block movement. 
The active occupancy set is rebuilt after world generation, floor changes, and
save/replay restoration without consuming RNG.

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
changing its saved base AGGRO. Alarmed monsters may pursue around sight-blocking
corners while in range, but they still respect invisibility, concealment,
sanctuary, and terrain/pathfinding rules. A bystander newly Alarmed by the
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

An already-aware **non-Alarmed** enemy standing on the outermost tile of its effective aggro
range has a 30% chance per turn to give up the chase. That outer ring is drawn
with a more transparent red than the rest of the aggro overlay.

**Non-Alarmed**, already-aware enemies can also lose interest in a chase
when the player has higher effective SPD, provided they are **more than one tile
away**. The chance is 5 percentage points per SPD advantage, capped at 50%.
A successful dodge immediately before that roll changes only the log text,
not the chance or normal turn behavior. Other losses of interest retain
`The <enemy> loses interest in the chase.` The separate 30% outer-AGGRO
check above remains unchanged and is evaluated first.

Enemy pathfinding uses breadth-first search and can route around obstacles and other enemies within a detour limit.

Both chase modifiers use effective SPD (including terrain, equipment, potions,
status effects and monster speed bonuses) and the same formula:

```text
speedChance = min(50%, max(0, fasterSPD - slowerSPD) × 5%)
```

| Effective SPD advantage | 0 or less | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10+ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Chance | 0% | 5% | 10% | 15% | 20% | 25% | 30% | 35% | 40% | 45% | 50% |

For **extra pursuit**, `fasterSPD` is the enemy's SPD and `slowerSPD` is
the player's SPD. A successful roll permits at most one additional movement
step or an attack after closing to melee range; it does not grant a second
spell, haste, rush, or ranged attack roll. Adjacent enemies use their normal
single melee action. For **losing interest**, the advantage runs in the
opposite direction (player minus enemy), but Alarmed enemies and adjacent
enemies cannot lose interest due to speed. Neither modifier consumes RNG when
its chance is zero; the remaining eligible rolls use seeded RNG as usual.

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

The surface Temple sanctuary protects the player and bars approaching monsters
within **10 tiles Chebyshev distance** of `spawnPoint`, **including tile 10**.
Monsters already inside retreat outward up to two steps per game turn,
regardless of visibility, sleeping, theft, ranged attacks or aggression; blocked
retreating monsters wait rather than fighting or teleporting. Monsters outside
cannot enter sanctuary tiles during pursuit, wandering, far-path travel or a
charge. A player inside sanctuary is treated as undetectable by all monsters,
even those with true sight: enemies abandon pursuit and use their ordinary idle
behavior instead. Roaming monsters continue wandering, `far` travelers continue
their journeys, and `homeReturn` monsters try to return to their original home
(using their normal wandering chance and radius). A home inside sanctuary or
adjacent to the protected player remains unreachable until protection ends.

An outside monster already adjacent to a protected player withdraws one step
when possible; idle movement cannot approach to an adjacent tile again, keeping
**at least two tiles of separation** without freezing unrelated wandering.
The existing visible **"retreats from the sacred ground"** message appears once
when a monster begins withdrawing, whether it was already inside or was
adjacent just outside the boundary; ordinary wandering is not logged as retreat.
Boxed-in enemies cannot attack across the boundary.

Neither melee/ranged attacks nor charge/pull abilities may hit a protected
player. Players also cannot melee-attack from sanctuary: to engage an enemy
outside, they must leave its boundary. Such a blocked player attack does not
consume a turn. All sanctuary decisions are part of deterministic turn rules,
not presentation timing.

Forest ambushes neither roll for players standing at distance 10 or less nor
spawn inside that distance from an adjacent unprotected forest tile. Underground
levels have no sanctuary. The separate 20-tile far-wandering village avoidance
rule is unchanged.

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
lowerSpread = max(1, mitigatedAtk × 0.30)
upperSpread = max(2, mitigatedAtk × 0.20)
variance = triangular(-lowerSpread, peak = 0, +upperSpread)
finalDamage = max(1, round(mitigatedAtk + variance))
```

The continuous triangular distribution peaks at zero adjustment: outcomes near
mitigated ATK are more likely than extremes. Every damage roll consumes exactly
one seeded RNG draw through the inverse CDF, independently of animations.

The minimum spread of -1/+2 preserves the old range for weak attacks. At
mitigated ATK 10 or higher, both proportional spreads apply and the range is
0.7×–1.2×. The distribution is asymmetric: before rounding its mean is
`mitigatedAtk + (upperSpread - lowerSpread) / 3`, approaching 0.9667× for strong
attacks. It replaces the old uniform additive roll with mean +0.5 damage.

| Mitigated ATK | Lower/upper spread | Rounded ordinary damage range |
|---|---|---|
| 2 | -1 / +2 | 1–4 |
| 3.33 | -1 / +2 | 2–5 |
| 10 | -3 / +2 | 7–12 |
| 50 | -15 / +10 | 35–60 |

The shared rule applies to player melee, enemy melee and fixed-ATK ranged shots.
Charge/Enrage affect ATK before this roll; critical and armor-glancing rules
then modify the rolled damage. The base minimum is 1; a later glancing hit may
still reduce it to zero under the existing armor rules.

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
**3.33 damage**. The minimum -1/+2 spread produces 2–5 rounded damage,
with a triangular peak near the mitigated value and a minimum final damage of 1.
For this example, 2/3/4/5 damage occur with probabilities approximately
0.93% / 43.06% / 44.44% / 11.57%.

The same DEF calculation applies when the player attacks a Goblin: a player
with ATK 4 hitting a Goblin with DEF 2 starts from the same `3.333...`
mitigated value.

This example isolates the damage formula. Actual spawned enemies can differ
from template stats because enemy stats receive spawn variance and humanoids
can also gain equipment bonuses.

When player wearing a brass armor is hit:
An enemy with 4 ATK has a mitigated ATK of 2 against brass armor.
Damage then applies the triangular -1/+2 spread, so 4 ATK can deal 1–4 damage,
with 2 damage occurring about 54.17% of the time. With 10 DEF, an enemy needs
5 ATK or more to guarantee at least 2 ordinary damage before glancing effects.

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
Player: 5% normally; 25% when invisible against a non-Alarmed enemy without trueSight or blind
Normal monster: 5%
Fierce monster: 10%
Deadly monster: 15%
```

`content/enemy_config.json` stores the three combat chances as
`baseCriticalHitChance`, `fierceCriticalHitChance`, and `criticalHitChance`
(the last remains the Deadly-specialist chance).

The invisibility bonus is **+20 percentage points**, assessed before the hit alarms
the target. Enemies with `trueSight` or `blind` are immune. After Alarmed resets, an invisible
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
temporary GRACE penalty = 3 while Stone Skin + 2 while Berserk
effective player weapon GRACE = max(1, weapon GRACE - gear GRACE penalty - temporary GRACE penalty)
base player delay = 6 / effective player weapon GRACE
weapon affinity = min(1, effective player weapon GRACE / 5)²
GRACE reduction = player bonus GRACE × 0.25 × weapon affinity
player delay = max(0.25, base delay - GRACE reduction)
```

This makes both racial and level GRACE provide almost no benefit with slow
weapons and progressively more benefit with graceful weapons. A GRACE 5 or
higher weapon receives the full reduction. The player's displayed GRACE is
weapon GRACE + racial GRACE + level GRACE - gear GRACE penalty - temporary
GRACE penalty, with a minimum
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
- each outstanding `playerremains` is marked by a small, semi-transparent 💀 on
  the corresponding floor of the full world map and the nearby side minimap.
  Multiple deaths may leave multiple markers; each disappears as soon as its
  remains are recovered. The marker points to the **retrievable remains**, so
  drowning deaths mark the safe shore instead of the underwater death tile.
  When no backpack item can drop, no remains or marker are created. The marker
  never reveals new terrain, affects gameplay or consumes RNG; it is derived
  from the already-persisted ground objects in current saves and replay
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

Physical artifact weapons, shields and armor can be equipped while
**unidentified**. Their actual base stats, magic bonuses, penalties and curses
apply immediately, but the equipped slot, inspection text and equipment logs
continue to show `Unidentified <noun>` and `???` instead of revealing the
hidden enchantments, curse or dwarven owner. Equipping and unequipping costs
the usual item-action turn and **does not identify** the artifact. Players may
infer some properties from combat or character stats; explicit identification
remains necessary to reveal the item's true description. The identification
flag and equipped item effects persist across saves and replay.

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
On touch screens, the trade panel fills the available height: both stock
columns have independently scrolling lists rather than the 280px desktop cap,
and the Close control remains visible above the bottom message log.
The trade panel shows item/service prices but not a separate player-gold total;
current gold remains visible in the HUD for merchants and service providers.
Touch devices retain the existing full-screen layout for the other dialogs.

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
| Prolonged Hammer | 3 | 10 | 1 | Yes |
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

Prolonged Hammer has a Lucerne-style silhouette: a thin long handle, compact
pronged hammer face, small rear peen and a long spike above the head.
It offers tier-3 heavy damage at low GRACE: 10 ATK, 1 GRACE, two-handed, and
110g base purchase value. It is a weaker counterpart to the tier-4 War Hammer
(12 ATK, 1 GRACE). Compared with the tier-3 Lance (9 ATK, 2 GRACE), it trades
faster attack timing for one more ATK. It occupies both hands and enters the
ordinary tier-3-and-higher weapon-generation pools, including humanoid gear and
loot. Its handle and peen are visual features: melee range and door-breaching
rules remain those of an ordinary two-handed weapon. The transparent 24×24 SVG
is `img/icons/Prolonged Hammer.svg`; magic variants retain the same base icon.

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
have the penalties above. Armor artifacts inherit the exact SPD and GRACE penalties of their normal base,
not a universal −1 SPD cost. The same seven ordinary armor bases retain `gracePenalty: 1`; this is
independent of their new total SPD penalties. Built-in GRACE penalties are
omitted from inventory and trade stat lines.

---

# 36. Equipment Modifiers

Ordinary generated weapons, shields and armor can receive **one** prefix. Under
normal world rules its chance is `min(90%, 40% + 2% × generation MF)`. The six
prefixes are equally likely once a modifier is selected. The Merchant's guaranteed
enchanted weapon always has a prefix. Its purchase price is the greater of the
normal configured price and its selling price plus 1g, preventing immediate
buy/sell profit when an exceptional modifier promotes a cheap base to tier 5. Base item tier does not limit the bonus.

| Prefix | Equipped effect | Ordinary range at MF 0, without monster quality | Exceptional range |
|---|---|---:|---:|
| Mighty | Player ATK | +1–10 | +11–20 |
| Sturdy | Player DEF | +1–10 | +11–20 |
| Swift | Player SPD; weapon GRACE is unchanged | +1–10 | +11–20 |
| Lucky | Player MF | +1–10 | +11–20 |
| Resilient | Maximum HP | +10–59 | +60–100 |
| Profound | Earned XP | +5–15% | +16–30% |

Every prefix may appear on weapons, shields or armor. Backpack gear is inactive;
equipped bonuses add across slots. Artifact effects use their separate catalog.
There is no randomly selected GRACE prefix in `content/item_modifiers.json`.

## Ordinary amounts and Magic Find

Within the ordinary branch, ATK, DEF, SPD and MF use these thresholds:

| Bonus | Chance at generation MF 0, without monster quality |
|---|---:|
| +1 | 45% |
| +2 | 30% |
| +3 | 15% |
| +4 | 7% |
| +5 | 2% |
| +6–10 | 1% combined; 0.2% each |

Their inclusive 1–100 roll increases by `round(generation MF × 0.5)` plus the
monster quality boost below, capped at 100 before applying the thresholds. MF
changes probabilities, not the ordinary +10 maximum. At MF 10 without monster
quality, +6–10 has 6% combined probability within the ordinary branch.

Resilient uses a seeded uniform `U` in `[0,1)`:

```text
quality = min(1 - epsilon, U + monster quality boost / 100)
HP bonus = min(100, 10 + floor(50 × quality^5) + floor(generation MF × 0.3))
```

Without monster quality, the MF-0 ordinary range is +10–59, with approximately
45.7% giving +10 HP. MF 10 gives +13–62; MF 20 gives +16–65. The final +100 HP
cap applies to both branches. An ordinary MF-adjusted result above +59 also
promotes the item to tier 5; promotion does not require the exceptional gate.

Ordinary Profound uses `5 + min(10, floor(min(1, U + boost / 100) × 11))`.
Without monster quality, every whole value from +5% to +15% is equally likely.
MF does not raise XP strength. Equipped XP percentages add before award rounding:
+10% on a weapon and +15% on armor produce +25%, so 100 base XP becomes 125
without a racial XP bonus. Profound retains a separate ordinary numeric pricing
roll; its actual XP percentage determines promotion, not that pricing amount.

## Exceptional bonuses and tier-5 promotion

Each selected prefix first tests an exceptional gate. Without a monster source,
or for a tier-1 monster, this is **0.10%**. Each additional monster tier adds
**0.02 percentage points**, reaching **0.18%** at tier 5. MF never increases this
gate; it can still increase the chance to receive a prefix at all.

Exceptional values are picked with decreasing weights:

```text
weight(value) = maximum + 1 - value
```

For ATK/DEF/SPD/MF, +11 has weight 10 and +20 weight 1 (total 55). For HP,
+60 has weight 41 and +100 weight 1 (total 861). For XP, +16% has weight 15 and
+30% weight 1 (total 120). The largest bonuses are therefore the rarest.
At MF 0 with no monster boost, approximately one in 2,500 ordinary generated
gear items enters the exceptional branch, counting all six prefix types. A
specific Mighty +20 is approximately one in 825,000 such items. These are
probabilities, not guarantees or pity counters.

Any final bonus above its old ceiling (**+10 ATK/DEF/SPD/MF, +59 HP, +15% XP**)
sets the finished item's tier to **5**. Existing tier coloring makes its name
red in inventory, equipment, trade and item logs. Base ATK/DEF, GRACE, speed
penalties, hand requirements, base purchase value and base-icon lookup remain
unchanged. Tier-based selling uses the promoted tier. A base stat above a ceiling
alone does not promote an item; the comparison is against its prefix bonus.

The rolled bonus and tier are ordinary item fields preserved through saves,
replay starting snapshots, equipment swaps, theft and drops. No additional
exceptional-item flag or reroll-on-load logic exists.

## Monster quality

The source monster's original tier improves ordinary quality slightly, independently
of player MF. It also sets the exceptional chance:

| Monster tier | Ordinary quality boost | Exceptional gate per selected prefix |
|---|---:|---:|
| 1 | +0 | 0.10% |
| 2 | +1 | 0.12% |
| 3 | +2 | 0.14% |
| 4 | +3 | 0.16% |
| 5 | +4 | 0.18% |

For flat stats, boost is added to the 1–100 roll; HP and XP use its normalized
value before their amount formulas. Worn humanoid equipment is rolled once
using monster tier and generation MF 0. Better gear also strengthens its wearer
under the normal partial equipment-effectiveness rule. The exact same item drops;
killing a monster does not reroll or improve it. Chest gear uses player MF,
without a monster-source boost. Guaranteed Merchant gear has no monster boost.

## Worked examples and roll chances

The following chances include the chance of getting a modifier, selecting that
prefix, and rolling the exact bonus. They assume the stated base item has
**already been selected**, generation MF 0 and no monster-source boost, except
the explicitly marked MF-10 row. They are not chances per kill and do not include
the chance of selecting that particular weapon/armor/shield from the base pool.

| Selected base item | Prefix | Equipped result | Chance of this prefix and exact bonus | Approximately 1 in |
|---|---|---|---:|---:|
| Prolonged Hammer: ATK 10, GRACE 1, tier 3 | Mighty +4 | ATK 14, GRACE 1, tier 3 | 0.46620000% | 215 |
| Prolonged Hammer: ATK 10, GRACE 1, tier 3 | Mighty +20 | ATK 30, GRACE 1, **tier 5/red**, two-handed | 0.00012121% | 825,000 |
| Armor: DEF 4, tier 2 | Sturdy +12 | DEF 16, **tier 5/red** | 0.00109091% | 91,667 |
| Dagger: ATK 2, GRACE 5, tier 1 | Swift +11 | Player SPD +11; base ATK/GRACE unchanged; **tier 5/red** | 0.00121212% | 82,500 |
| Shield: tier 1 | Lucky +15 | Player MF +15, **tier 5/red** | 0.00072727% | 137,500 |
| Armor at generation MF 10 | Resilient +62 | Maximum HP +62, **tier 5/red** | 0.04073653% | 2,455 |
| Weapon: tier 2 | Profound +30% | 100 base XP becomes 130; **tier 5/red** | 0.00005556% | 1,800,000 |

The MF-10 Resilient +62 chance counts both possible routes: the top ordinary
MF-adjusted HP roll and an exceptional +62 roll. Mighty +4 includes the 99.9%
chance of taking the ordinary branch. Exact maximum rolls are extremely rare;
a +20 flat-stat bonus is not a reward to expect in a typical run.

## Actual exceptional gear drop chance per humanoid kill

At player MF 0, with normal world traits and ordinary humanoid equipment rules,
the two equipment-generation attempts give `1 - (1 - p)^2` chance of wearing
gear, where `p = 45% + 3% × monster tier`. Worn equipment drops as the same item.
The following probabilities count **any base item and any of the six prefixes**,
but require the exceptional branch (+11–20 flat stats, +60–100 HP, or +16–30% XP):

| Monster tier | Chance of wearing/dropping gear | Exceptional chance per selected prefix | Exceptional gear per kill | Approximately 1 in kills |
|---|---:|---:|---:|---:|
| 1 | 72.96% | 0.10% | 0.029184% | 3,427 |
| 2 | 75.99% | 0.12% | 0.036475% | 2,742 |
| 3 | 78.84% | 0.14% | 0.044150% | 2,265 |
| 4 | 81.51% | 0.16% | 0.052166% | 1,917 |
| 5 | 84.00% | 0.18% | 0.060480% | 1,653 |

For a tier-5 humanoid at MF 0, a **Mighty +20 on any base item** has probability
`84% × 40% × (1/6) × 0.18% × (1/55)`, or approximately **0.00018327%**:
**one in 545,635 kills**. Requiring a specific base weapon reduces that chance
further according to the weapon-type and weighted base-item selection rules.

These are generation probabilities, not a reroll on death. An enemy's equipment
is stored when it is created. Already-worn gear, replacements and stolen items
retain their own existing rolls. At nonzero player MF, gear availability can
increase; ordinary chest HP rolls above +59 can also create tier-5 items without
entering the exceptional branch. These figures are not general artifact, chest,
or all-enemy drop rates.
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

Passive trinkets work while simply carried. **Equippable artifacts in the
backpack are inert**, both for their bonuses and their curses: curse timers
advance only while equipped (or while carrying a passive trinket), and a
backpack curse does not trigger. An equipped item's timer resumes after it
is re-equipped.

---

# 38. Artifact Generation

Artifact generation uses separate content pools for:

- standalone non-gear nouns (gear artifact nouns come directly from the three normal gear catalogs)
- prefixes
- epithets
- dwarven names
- dwarven vocations
- effects
- curses
- description fragments

Current content includes approximately:

```text
99 standalone artifact nouns, plus eligible gear names drawn from the weapon, shield, and armor catalogs
17 artifact prefixes
20 epithets
792 Dwarf names
228 Dwarf vocations
14 artifact effects
8 curse definitions
```

Artifact gear bases are selected only if their ordinary gear tier is no higher
than the rolled artifact effect tier. A selected gear noun retains its **full
ordinary base properties**, including weapon ATK/GRACE and two-handed status,
shield DEF and shield SPD/GRACE penalties, or armor DEF and its exact SPD/GRACE
penalties. The rolled artifact effect then adds its own independent bonuses (including
SPD, which affects the player's movement) and curse; it never replaces the
base statistics. For example, a Brigandine artifact
starts with **12 DEF and −2 SPD** and adds any enchanted DEF on top. Shield
and weapon artifacts retain normal physical gear behavior (including weapon
attacks on doors/crates). Trinkets have no inherent equipment stats and remain
passive in inventory. An identified gear artifact appears in its corresponding
inventory tab and compares with normal gear for upgrade suggestions. Gear-based
artifacts use their base weapon, shield or armor SVG icon rather than the
generic artifact icon; trinkets retain the generic icon, and missing gear
SVGs fall back to the generic icon. Artifact combat messages use names without
a leading `The`, including for already-named equipped artifact weapons.

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

Non-cursed artifacts use a dwarven-owner naming pattern such as:

```text
The <noun> of <Dwarf Name>     (non-gear artifacts)
<noun> of <Dwarf Name>         (weapon, shield and armor artifacts)
```

Cursed artifacts use a cursed prefix directly before the artifact noun and do
not receive a dwarven-owner name:

```text
The <Cursed Prefix> <noun>    (non-gear artifacts)
<Cursed Prefix> <noun>        (gear artifacts)
```

For example, a cursed non-gear artifact might be named `The Forgotten Amulet`,
while gear artifacts omit the leading `The` so attack logs never say
`your The Flail of ...`. If no cursed
prefix is available, the naming code falls back to the normal epithet pattern
(`<noun> of <Epithet>`) or simply `<noun>`.

Unidentified artifacts display:

```text
Unidentified <noun>
```

Their real stats/details remain hidden, unless identified.
This includes curse details and dwarven-owner names, even when the artifact
is currently equipped.

---

# 40. Artifact Identification

Artifacts begin unidentified.
Equipping unidentified artifact gear is allowed and applies its real effects,
but neither equips nor ordinary stat changes identify it.

Before identification, their stats are hidden as:

```text
???
```

A Scroll of Identification reveals:

- true name
- stats
- description
- owner/lore information

While God Mode is active, the player can identify artifacts without consuming
or possessing a Scroll of Identification. Identification otherwise follows the
ordinary item-use turn and replay rules. The bypass ends when God Mode is
disabled; identified items stay identified.

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

When its interval is reached, a curse effect triggers. Only an equipped
weapon, shield or armor artifact—or an unequipped passive trinket—advances a
curse timer. Putting equippable cursed gear into the backpack suspends its
curse without resetting elapsed active turns.

---

# 43. Loot

Enemy kills can provide:

1. Equipment/other loot
2. Artifacts (low chance)

<details>
<summary>Also</summary>
Mysterious tombstones (only liches)
</details>

Liches have an **80%** chance to give one Mysterious Tombstone directly to
the player's inventory on a credited kill, until the world's finite pool of
inscriptions is exhausted. Each inscription appears once per world in a
shuffled order. That pool is initialized from the loaded inscription catalog
when a world is generated (also when generation is retried), not when the page
first initializes the empty content placeholders.

Gold drops from enemy kills are currently **disabled** (the calculation is
still present in a code comment for easy reinstatement):

```text
random(1–5) × enemy tier, modified by Magic Find
```

Chests and Magic Find still grant gold normally; only the per-kill enemy gold
was removed.

Monster templates may define an independent `lootTable` containing a total
drop probability and a weighted list of ordinary item kinds. A successful
roll awards **one** item directly to the inventory, in addition to any
normal artifact or equipment drops. The weights choose which item drops;
they do not multiply the total drop probability. **Nymph** has a **20%**
chance to drop one Healing Herb, independently of its healing magic or
ordinary humanoid gear. **Wyrdhag** has a **20%**
total chance to drop a Life Potion, Healing Herb or Mushroom, each with equal
conditional probability (about **6⅔%** of kills per item). This loot chance
does not increase with Magic Find. Using its own healing item in combat does
not alter the separate death-drop roll.

Each generated Dwarven Fort/Ruins floor from **z:-3 through the deepest Ruins
floor** contains **1–2 loose Life Potions**, selected from reachable, safe,
unoccupied marble. The count is configured under
`dwarvenRuins.loot.lifePotionsPerFortFloor`; the separate Dwarven Mines are not
included. These supplies are ordinary ground items, not refillable containers.

Each ordinary **Library** room in the Ruins has a **30%** chance to contain
one loose rare scroll on its floor, chosen with equal weight from Fear, Chaos,
and Death Shield. Rooms get independent rolls; a successful room receives at
most one additional scroll on an accessible unoccupied floor tile. Both chance
and item kinds are configurable in `dwarvenRuins.loot.libraryScrolls`.

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

### Monster-tier equipment quality

The generation tier is an upper limit on base equipment, not a guarantee of
matching equipment. Within that eligible base-item pool, each item has weight
**2** when matching the source monster's tier, **1.5** when one tier below, and
**1** when further below. Items remain individually weighted, so tier probabilities
also depend on the number of eligible catalog entries. The fallback roll may
lower the upper limit by one, but the original monster tier still determines
quality and weights. Chest and Merchant base selections retain uniform weighting.

Monster tier additionally improves prefix strength and the exceptional gate as
specified in section 36. Player MF still does not improve worn-item modifier
quality. An exceptional roll may promote a weak base item above the source tier;
that is an intentional tier-5 quality classification, not a new base item.

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

Submerged treasure adds **15–30 ordinary surface chests** per generated world,
controlled by `surfaceLoot.submergedChests` in `content/world_generation.json`.
They spawn only in deep `water`, both in edge-connected seas and enclosed lakes,
**4–8 swimming steps from the nearest walkable dry shore**, measured across
water using eight-direction movement. Water directly beside shore is distance 1;
shore-near tiles at distances 1–3 cannot contain these chests. Small lakes and
water bodies lacking eligible positions are excluded; if a world does not have
enough eligible water, actual placement falls below the requested count rather
than violating the minimum distance. The `lakeShare` knob gives enclosed lakes a
35% share when sufficient qualifying positions exist, otherwise the remainder
can be placed in the sea (or vice versa). No ground item or occupied creature
may share a submerged chest tile. Ordinary surface chest tier uses the same
spawn-distance formula and tier config; contents, Magic Find, and gold bonuses
use the existing chest system. Chests are collected by entering their water
square and do not alter swimming or drowning mechanics. On the main view they
render half-submerged, using the same water clipping treatment as swimming
creatures. In tile mode, each chest gently bobs in place (about 1 pixel sideways
and 2 pixels vertically at 40-pixel tile size, on a 2.7-second cycle), with a
position-dependent phase. The player gently bobs in deep `water` (lakes and
seas) at a constant rate, including while drowning. Its vertical bob moves
**downward from the usual sprite position, never above it**, so the fixed
water clip cannot cut off the top of the head. River tiles retain their
half-submerged clipping but **do not bob**. Clipping and the waterline stay
anchored to the tile. Land actors, ASCII sprites, and game positions stay still;
movement is only visual: loot coordinates, swimming turns, RNG, pickup, save,
and replay rules are unchanged. They are created at world generation and
persist with the normal ground item save/replay state.

Generic z:-2 ordinary caves now use the **world-wide, area-derived reward
budget** in §15 instead of one fixed chest quota per source cave. Tier-2 and
tier-3 chests preserve the same loot selection described below. Shallow caves,
surface loot and special dungeon package chests are unaffected.

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
the last threshold. The table uses the configured percentages directly.

| Result | Cumulative upper threshold (rounded) | Chance (rounded) |
|---|---:|---:|
| Gold | 41 | 41% |
| Gear | 63.6 | 22.6% |
| Life Potion | 77.3 | 13.7% |
| Scroll of Invisibility | 80.5 | 3.2% |
| Potion of Speed | 85 | 4.5% |
| Potion of Stone Skin | 88 | 3% |
| Potion of Berserk | 91 | 3% |
| Scroll of Fear | 93 | 2% |
| Scroll of Chaos | 94.5 | 1.5% |
| Scroll of Death Shield | 95 | 0.5% |
| Scroll of Identification (`elseResult`) | 100 | 5% |

For example, a roll of 79 gives an Invisibility scroll, 86 gives Stone Skin,
and 96 reaches the Identification-scroll fallback. All new supplies use their
catalog item IDs in chest outcomes, ground pickups, inventory actions and replay.

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

While invisible, enemies without `trueSight` or `blind` never acquire or chase the player and continue to
wander normally. The following hit reactions apply to those enemies; Oculus and
blind monsters use ordinary combat. A hit on a surviving enemy, even a zero-damage glancing hit,
provokes exactly one immediate reaction instead of that enemy's wander action
for the turn. A miss causes no reaction; evasive enemies cannot use their
special dodge against an invisible attacker. An enemy killed by the attack
cannot react. A single roll gives
10% confusion (no action), then a flee chance of
`clamp(30% - 2% × enemy tier - 1% × enemy AGGRO + 0.5% × damage received, 5%, 90%)`.
On a flee result, the enemy moves one tile to an open walkable neighbor,
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
its icon is `img/icons/homecomingscroll.svg`. Its merchant price is 70g, with
nine in stock at world creation. This stock is finite and never automatically
replenished after purchases, save/load, or replay restoration. Selling a scroll
back adds exactly one scroll to the available stock. The stock config key is `scrolls.homecomingScroll`.

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

## Tactical consumables

All five items are stackable Supplies in `content/items.json`. Reading or drinking
uses one ordinary turn, with the same swimming restrictions as existing supplies.
Each has a unique transparent image shared between inventory and ground rendering,
a colored ASCII glyph (`?` for scrolls, `!` for potions), and an inspection action
that describes its rules without consuming it.

| Item | Effect | Duration | Base value / sell value |
|---|---|---|---|
| Scroll of Fear | Tier 1–3 monsters within 5 tiles flee | 10 turns | 80g / 40g |
| Scroll of Death Shield | One fatal damage event leaves the player at 1 HP | Until spent | 200g / 100g |
| Scroll of Chaos | Relocates the player and monsters within 8 tiles | Immediate | 120g / 60g |
| Potion of Stone Skin | `+6 + floor(DEF / 6)` DEF; −3 GRACE | 15 turns | 60g / 30g |
| Potion of Berserk | `+4 + floor(ATK / 6)` ATK; −3 DEF; −2 GRACE | 15 turns | 60g / 30g |

Radii use Chebyshev distance (eight-direction tile distance) on the current map
and level. Wyrdling extends Fear to 13 turns and the two potions to 19 turns.
Chaos can teleport creatures from one side of iron prison bars or a closed
barred prison door to the other, but cannot land on an impassable bar or pass
through opaque walls and ordinary shut doors. Safe landing, terrain, and
occupancy rules remain unchanged.
Chaos can teleport creatures from one side of iron prison bars or a closed
barred prison door to the other, but cannot land on an impassable bar or pass
through opaque walls and ordinary shut doors. Safe landing, terrain, and
occupancy rules remain unchanged.
It also multiplies each combat potion's entire positive stat bonus by 1.25,
rounded to the nearest integer after adding the flat and scaling portions:

```text
Stone Skin DEF bonus = round((6 + floor(DEF / 6)) × 1.25)
Berserk ATK bonus = round((4 + floor(ATK / 6)) × 1.25)
```

At 18 DEF, Stone Skin gives +11 instead of +9 DEF; at 18 ATK, Berserk gives
+9 instead of +7 ATK. Their GRACE/DEF penalties are unchanged. Fear's radius and
tier restriction, Chaos's radii and Death Shield's single charge are unchanged. As with Speed and
Invisibility, the activation action consumes the first duration turn. Fear
resolves one retreat action on that turn; its remaining timer then reads 9
(or 12 for Wyrdling). Potion counters read 14 (or 18).

**Berserk frenzy:** while Berserk is active and at least one living enemy
is adjacent, each attempted movement, wait, or ordinary consumable use has a
**25%** chance to be replaced by an immediate melee attack against a uniformly
random adjacent enemy. The attack consumes the attempted action's single turn;
an interrupted consumable is not spent. The ordinary melee attack rules and
counterattack phase still apply. With no adjacent enemy, the intended action
proceeds without a frenzy roll. Berserk cannot initiate an attack while the
player is protected by sanctuary. Berserk overrides Confusion when both might
interfere with movement. This drawback does not alter the potion's stat bonuses
or duration. RNG rolls and target choice happen at action resolution, before
animations, and are attributed to the attempted action in replay recordings.

**Fear:** every eligible monster in range is affected, including unseen or sleeping
monsters. It retreats even from an invisible player and cannot shoot, summon,
charge or pull while afraid. A monster with no retreat destination may use ordinary
adjacent melee if it can see the player; it otherwise stays put. Any positive damage,
including trap damage, ends that monster's fear immediately, even before its
action later in the same turn; misses and zero damage do not. Fear takes priority
over the immediate reaction to a non-damaging invisible hit.
Repeated casts refresh to at least the new full duration, never add durations.
Fear timers expire on elapsed world turns even if the player changes maps. A violet
face marker and a Frightened tooltip counter distinguish it from wounded fleeing.
Ordinary Ruins warnings from moving fleeing monsters still apply.

**Death Shield:** protects against melee, ranged attacks, poison, freezing,
drowning, poisonous mushrooms and dungeon traps. The charge is consumed immediately
at damage resolution; another hit or hazard in the same turn can kill the player.
Melee and ranged combat logs show the triggering hit **before** the shield-shatter
message, even when a faster weapon earns a follow-up strike. Shield resolution
still occurs synchronously before status effects, knockback and that next hit.
It neither heals further nor cures poison. There is no expiry and healing does not
recharge it. Reading another while ready consumes neither item nor turn. Its ready
status stays visible, with a distinct shield-breaking message and floating effect.

**Chaos:** the affected set is captured before anyone moves. Each actor receives a
random distinct safe destination within 8 tiles of its own starting position, in
its currently reachable terrain component on the same map/level. Connectivity uses
that actor's movement abilities and eight-direction movement; closed and locked
doors block connectivity. Landing tiles must be walkable dry ground, excluding
water, rivers, lava, ice, trap triggers and occupied tiles. NPCs never move; monsters
cannot land within the surface Temple's sanctuary. Original actor tiles remain
reserved so an actor without a valid destination can safely stay put. The player
is resolved first, then monsters in their existing stable order. Only actors with
valid destinations consume a seeded destination roll. Movement resolves together
before presentation; exploration, swimming state, occupancy and player pickup are
updated immediately. Teleportation does not automatically enter stairs or another
map. Monsters receive their ordinary action after the scroll is used.

**Combat potions:** bonuses are sampled when drunk from the corresponding current
stat excluding both combat potions. The stat used for scaling is floored at zero;
gear, racial bonuses, terrain and other existing modifiers still apply. A repeated
dose replaces the sampled bonus and refreshes duration without stacking or feeding
its own bonus back into the formula. Both potion types may coexist. GRACE penalties
stack with gear penalties in displayed GRACE and effective weapon combat timing;
the existing minimum effective weapon GRACE of 1 still applies, so slow weapons
pay less of a timing cost. Expiry or actual death removes the modifiers. Highscores
uses permanent stats, excluding both potions and their GRACE penalties.

Ordinary chests use the percentages above; guaranteed-artifact chests keep their
artifact rule. On the surface, **75%** of the nine loose Invisibility-scroll
slots instead become Identification, Fear or Chaos scrolls with respective
relative weights **3:2:1**; 25% remain Invisibility. Expected Invisibility
scrolls from these slots fall from **5.4 to 2.25 per world**. The separate
loose Speed-Potion slots keep their **40%** chance to become a tactical
consumable (Stone Skin 3, Berserk 3, Fear 2, Chaos 1.5, Death Shield 0.5).
Total loose-item counts, Life Potions, chest/crate loot and merchant stock are
unchanged. Both replacement tables are editable in `content/loot_tables.json`.

Player potion timers, exact sampled bonuses and ready shield charge, plus each
monster's remaining fear timer, initialize on new actors, persist in current saves
and replay snapshots, and restore without rerolling effects. Save version 55 rejects
older saves/replays; no conversion is provided. All item RNG and state changes run
synchronously before animations.

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
The nearby-village intuition checks the surface position **only while the
player is on z:0**; underground inspections never claim to sense a surface
village merely because the two positions share map coordinates.

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
targets retain seeded quest variety. Every individual `kill_specific` quest names a prefixed enemy. If the nearest
chosen living target lacks a prefix, accepting that quest gives it one random
non-Champion enemy prefix (with the usual stat changes) before saving its name.
Group kills and item recoveries do not require prefixed targets. Quest target ID,
position, and spawn pool are unchanged; this prevents ordinary monsters from
being described as special named individuals.
Group kills use equally close members of the same species. Ground-item delivery
candidates retain their existing rules.

Tier-5 monsters, all far-wanderers (including world-generation promotions), and
every base template with rarity <= 0.02 are excluded from new kill, group-kill,
and carried-item recovery targets. Existing active quests are preserved. When
both killing and item quests are available, killing quests retain their 50%
chance; investigation quests retain their separate 30% chance. The later rare
hunt keeps its edge-biome selection and difficulty, and its opening names the
quarry as “<monster name>, they call it.” Monster names retain their exact
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
- `ultraRare: true`

Species already represented by a living monster anywhere in the world, including
underground, are excluded. Species previously killed in this world are also
excluded, including kills by earlier permadeath characters and trap deaths.
Prefixes count as their base species. This world history persists through
save/load, replay and character changes, and resets only with a new world.
Existing active hunts retain their exact target; this restriction applies when
offering a new hunt.

The selection remains data-driven: adding or changing an enemy template automatically
changes the eligible pool. A candidate must also have at least one valid surface spawn
tile in one of its configured biomes. The spawn tile must be walkable, reachable from
the village/Hunter over ordinary surface terrain, unoccupied, and preferably very far
from the village. The desired minimum Chebyshev distance is:

`max(20, floor(min(world width, world height) × 0.35))`

Among qualifying distant tiles, the hunt uses the closest available world-edge band
and allows tiles up to 3 squares farther inward. A species with no valid tile beyond
the minimum village distance is skipped. If the eligible pool is empty or no
candidate can be placed that far away, the Hunter postpones the hunt without
spawning a duplicate or moving the quarry closer.

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
has `rarity <= 0.02`, independent of the `ultraRare` uniqueness flag, quest
membership, prefix, humanoid type and wander mode. Current species: Myrka,
Vampire, NULK, SKELD, DRUSK, GAUR, ASHFANG,
MIREHOWL, NHALUUN. Kveld and other more common templates retain normal AI.
Underground encounters use normal AI; an off-level flight pauses until returning.

Two sightings precede ordinary combat. An unaware, armed beast notices a visible,
unconcealed player within 5 tiles. The first sighting cannot be hit or cornered;
the second can be caught by reaching adjacency or blocking every outward step.
Caught beasts become aware and Alarmed; a third approach uses ordinary combat.
A visible attack can start the flight before damage or evasion. An invisible
attacker cannot start a sighting or directed escape, and can strike a beast
without triggering first-sighting flight protection. Becoming invisible during an
existing flight pauses its remaining turns and removes the temporary speed bonus;
the beast resumes its remaining escape when it can see the player again. Attacking
it while unseen cancels that flight and resolves the normal invisible attack.
Forest concealment and invisibility alone never start a sighting. Active visible
flight takes priority over temple flight and idle AI.

The first steps occur immediately, including when a wander step enters sighting
range. Flight itself deals no damage, sets no alarm or spotted message, and leaves
no tracks. Each flee step deterministically chooses a legal neighboring tile that
strictly increases Chebyshev distance from the player and prefers the direction most
directly away from the player. This prevents arbitrary sideways/diagonal bolts when a
straight escape is open; terrain and world edges force the next-best legal direction.
If no outward step exists, the normal catch/slip rules apply. Far paths are cleared when flight starts; normal far targeting
and tracks resume afterward.

Configuration in `content/enemy_config.json`:

```json
"rareFlee": {
  "maxRarity": 0.02,
  "sightings": 2,
  "sightRange": 5,
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
and should be drunk before approaching. Rare sightings begin only at gaps of 5 or
less, keeping the beast close enough to be visually readable when the flight message
appears. The second sighting remains a speed chase: boosted or naturally fast
characters can catch it in open terrain, while terrain and obstacles change the
outcome. Neither natural speed nor a potion defeats the first escape.

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
other wander modes produce no tracks and consume no track RNG. Unfrozen
rivers and other open water do not retain tracks or consume track RNG; frozen
river tiles do. Tracks occupy the
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
| 0–59 | Fresh wolf tracks lead northeast. |
| 60–179 | The wolf tracks lead northeast. |
| 180–239 | Fading wolf tracks lead northeast. |
| 240 | Track removed |

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

**Generic z:-2 static spoor** is separate from these dynamic surface trails.
It is permanent, has no freshness stages, uses the same eight directions and
Tracking knowledge rules, and hints at a species actually generated within the
connected cave complex. It never implies the creature still occupies the
indicated direction; see the Deep Caves 2.0 population rules in §15.

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
**40 tiles Chebyshev distance** can answer, regardless of line of sight, darkness, forest,
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

## One-time Dwarven Fort hint

While the surface fort entrance is undiscovered, each eligible Merchant bump
conversation or adjacent shop opening has a **50%** chance to add this line:

> They say the old dwarven fort still holds a fortune. I've sold supplies to
> plenty who went looking. Few came back.

Existing dialogue stays in the normal conversation. A failed roll gives no hint
and permits another attempt. The successful interaction discovers the **5×5
surface area** centered on the fort entrance, using the same radius-2 reveal
mechanism as the Old Hunter's cave investigation. It exposes the entrance and
nearby terrain on the map, not the underground fort or a route across the world.
A separate log confirms that the Merchant marked the ruins on the map.

The world-level `merchantFortHintGiven` flag becomes true on success, suppressing
all further hint dialogue and hint RNG rolls. Already-discovered entrances,
missing entrances, other NPCs and off-surface interactions do not roll. Adjacent
shop openings retain their existing zero-turn cost, so reopening permits free
retries before success. Bump conversations retain their normal turn behavior.

The flag starts false for each genuinely new world and remains unchanged through
normal death and new characters reusing a permadeath world. Current saves store
it beside Merchant stock; restoration and replay starting snapshots preserve it.
Replay shop-opening actions mirror the hint roll and discovery even when the
trade overlay is suppressed. Bump interactions replay through ordinary movement.
Chance, reveal radius and the hint line are configured on the Merchant template
in `content/npcs.json` under `fortHint`.

Configured fixed stock includes a **Two-handed Sword for 600g**. Scroll stock at
world creation is **9 Homecoming**, **6 Identification**, and **3 Invisibility**.
Homecoming scrolls are finite: an exhausted stack remains in saved stock with
count zero and is hidden from trade. Restoration does not replenish it. Selling
a scroll back adds exactly one; an empty stack cannot be purchased.

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
and cannot be sold. Homecoming costs 70g to buy; its nine-scroll initial stock
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

Current save version (defined in `src/version.js`):

```text
103
```

The game release version changes for each deployment. The save format changes
only when stored data or replay action/turn rules become incompatible.
Generation-only changes keep the format: saves store the complete generated
world and current RNG state, and replays load their complete initial snapshot
rather than rerunning generation. Optional cave metadata stored in existing
cave descriptors does not require a new format. Incompatible required fields,
terrain encodings or gameplay/RNG changes during recorded turns still require
review and, when incompatible, a save-version bump.

The loader retains its exact-version check; this does not introduce migration
or acceptance of differently numbered saves.

Version 82 introduces optional Crusher mechanisms in Dwarven Ruins,
including their pressure-plate and scored-track terrain codes, warning and
cooldown state, and the persistent already-impacted monster IDs. The hazard
ticks only on the game's authoritative action count. Existing traps keep their
numerical-DEF bypass, and saves/replays from earlier schemas are rejected.

Version 81 introduces optional two-sided crossfire prison galleries in deep
Dwarven Ruins. Geometry, shooters, and guarded treasure are generated in the
seeded world and restored in normal room/monster/ground-item state; there
are no new runtime statuses. The changed world-generation results require
the current save/replay schema; no old-save compatibility layer is added.

Version 80 enforces the depth-scaled functional Prison quota when generating
new Dwarven Ruins and makes existing spike/arrow trap hits bypass numeric DEF.
Prison cell rewards and ranged occupants now draw from the same floor-level
loot and enemy budgets as ordinary features. The changes alter seeded
world-generation and combat outcomes, so old replay/save formats are not
supported. No new runtime hazard flags or timers are introduced in this batch.

Version 79 replaces the binary 25% chase/escape thresholds with a capped 5%
chance per effective SPD point of advantage. This changes seeded enemy-turn RNG
and replay outcomes; no new gameplay state is saved, and older save/replay
schema versions are not supported.

Version 78 adds the persistent smashed-crate terrain code and changes seeded
trap placement to exclude dead ends and skippable corners. Current saves and
replay snapshots restore debris directly; older versions are rejected without
migration.

Version 77 adds a guaranteed royal cache and 2–3 Tier-4 defenders to the
optional final-floor throne hall. Its unopened chest persists with the floor's
other ground objects; opening uses seeded RNG and cannot be repeated after a
save/load. The additional guard rolls alter world-generation and replay RNG.
Only gear artifact names omit the leading `The`; non-gear names retain it.
Current-version save fixtures are refreshed without old-save compatibility.

Version 72 increases the Death Bolt selection weight within ordinary spell
choices, altering replay RNG outcomes. Trap fatality messages now follow the
impact log; Weaken/Slow cast logs use exact stat losses, and their expiry
floating text is removed. Ordinary ice inspection no longer discloses break
probabilities. No new saved fields or conversion from older saves are added.

Version 71 protects Dwarven Ruins room walls, entrances and progression gates
against accidental corridor cuts and diagonal bypasses during world generation.

Version 70 makes the guaranteed throne hall an optional single-entrance side
branch instead of an intermediate room on the route to the collapsed mine.
Dwarven Ruins floors also have more rooms and optional branches. The seeded
world-generation graph and persisted landmark recipe have changed; current
saves and replay snapshots use the new version without old-save conversion.

Version 69 moves the guaranteed final-floor defensive encounter into the
reserved throne hall. This changes vault selection, tactical monster positions,
selected monster families and seeded generation ordering, so the current
save/replay version is advanced; older saved worlds are not migrated.

Version 68 adds two new Dwarven Ruins terrain encodings, the permanent stone
throne (solid to movement but transparent to sight and missiles) and its
walkable ceremonial dais. The throne anchor is now physically occupied by
terrain; an 8-cell dais surrounds it. Current saves persist exact per-level
underlays and landmark facing; orientation is resolved from saved metadata,
without rerunning the room recipe or consuming seeded RNG. No conversion from
earlier layouts/saves is supported.

Version 67 adds a deterministic final-floor Dwarven Throne Hall layout and
persists its landmark geometry, facing and access ports in every generated
Ruins floor's current-save metadata. The extra generated room changes the
initial RNG and world-generation contract; no older-save conversion is added.
The smoke-test import fixture remains a synthetic old-layout world marked with
the current schema only for save-import regression testing, not a sample
newly generated Ruins stratum.

Version 66 changes the seeded spell-selection rules to give eligible low-HP
Sacrifice and Teleport fixed 30% and 20% chances on one survival roll before
ordinary magic. If only one spell is available, its share does not increase.
The changed RNG sequence requires a new save/replay version; older saves are
not supported.

Version 65 updates starting player SPD, monster template base SPD, spell-selection
weights, and Death Bolt damage; replay rules change, so the save version is
bumped with no compatibility code for older saves.

Saves are JSON files. Version 63 adds the generic monster `lowHpTeleportUsed` flag to saved
enemies and replay initial states. Sacrifice needs no persistent flag because
it immediately removes the victim and heals the caster through existing state.
Low-HP Teleport and Sacrifice use a separate seeded survival roll. No survival
RNG is consumed if neither has a valid target. Their spell eligibility, one-use
Teleport flag, and healing effects persist correctly in current saves and replays. No migration of older saves is provided.

Version 62 adds generic monster `immunityUsed` and
`immunityUntilTurn` fields to saved enemies and replay initial states. An
absolute turn deadline, not animation timing, determines when immunity ends.
No migration of older saves is provided.

Version 61 uses the generic `weakenTurns` and `slowTurns`
player counters and shared ability-based spell selection. Equipped and backpack
items, temporary buffs, and monster abilities retain their existing exact save
and replay representation. Older save/replay initial states are rejected rather
than migrated.

Version 58 adds the per-monster `hasteReadyTurn`, `healSelfReadyTurn` and
`healSelfUsed` fields to current saves and replay snapshots. The Champion's
Inspired buff is derived from living, nearby allies and adds no saved flag.
Version 57 adds the monster-applied player status counters and the Root,
Petrifying Gaze and Wail ready-turn deadlines; Berserk frenzy resolves from
the saved Berserk duration and the replay's seeded RNG.

Version 56 adds the absolute `wrestleReadyTurn` deadline to saved monsters,
including replay initial states. Wrestler activation is deterministic and its
five-turn cooldown remains intact after loading. Murkspawn's Swimming is stored
in the existing monster abilities array. Older versions are rejected rather
than converted.

NPC restoration preserves the saved list exactly, including a valid empty list.
Loading does not generate replacement NPCs or consume NPC-placement RNG; a
missing or invalid NPC list is rejected. This keeps save/load and replay
consistent even when the current world state deliberately has no NPCs.

Version 52 adds each enemy's `theftEscapeSteps` counter, initialized to zero,
advanced only by successful special thief-escape moves, and saved/restored for
current saves and replay snapshots. The 40-step limit ends forced loot escape
without destroying the stolen item or altering ordinary wounded flight. The
save/replay version is bumped; no older-save compatibility is added.

Version 51 adds the explicit persistent `player.highscoresDisqualified` flag.
Current saves and replay starting snapshots must contain a boolean value; no
older-save compatibility path is added. Live loads reconcile the flag against
the browser's exclusion ledger, while replay initialization/restoration reads
only the saved flag. Online cutoffs and request state are not gameplay save data.

Version 50 changes adjacent-step cracking from guaranteed to an 85% roll.
Failed spread checks leave intact ice unchanged and skip the extra break roll.
The changed conditional RNG sequence requires current-version saves and replay
starting snapshots; no new persistent fields are added.

Version 49 adds the same-step 10% break recheck only when moving from cracking
ice onto intact ice. The origin terrain is transient action context, reconstructed
from movement during replay rather than saved as a player flag. The additional
conditional RNG call changes the replay contract; older saves and replay
starting snapshots are rejected.

Version 48 adds the 1% instant-break check and one-ring neighboring collapse.
Their map changes use the existing surface grid and cold underlays; no new
persistent fields are required. The new RNG order changes the replay contract,
so older saves and replay starting snapshots are rejected.

Version 47 adds deterministic cracking when the player steps onto ice beside
cracking ice. The guaranteed transition replaces a random roll, changing the
replay RNG contract without adding persistent fields. Older saves and replay
starting snapshots are rejected.

Version 46 adds ice/cracking-ice surface tile codes and the seeded per-turn
ice RNG contract. The existing surface grid, terrain underlays and swimming/
freezing fields preserve all ice and cold-water state; older saves and replay
starting snapshots are rejected.

Version 45 restores the one-tile flee response to invisible attacks. Its
additional seeded destination roll changes the replay RNG contract; older saves
and replay snapshots are rejected.

Version 44 adds world-level killed-species history for rare-hunt eligibility.
It is independent of the current character's Bestiary/Tracking knowledge and
is captured in replay snapshots. Older saves are rejected without migration.

Version 43 adds the world-level Merchant fort-hint flag. It persists with the
surface discovery grid through save/load and replay and does not reset when
a new character reuses the same world. Older saves are rejected without migration.

Version 42 changes deterministic damage outcomes to triangular proportional
variance with a minimum spread. Older recordings use different combat results
and are rejected without migration; persisted item fields remain unchanged.

Version 41 establishes the expanded gear-bonus RNG contract: older snapshots
and recordings are rejected because their loot rolls consume a different random
sequence. Item fields remain unchanged; there is no migration.

Version 40 distinguishes barred prison doors from solid doors in saved
terrain. Version 39 stores the dungeon-package shortcut registry and each deep
level's package identity; versions 34–38 introduced the Ruins lift, traps, distinct
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

Current gameplay state requires **version 43** saves. Other versions are rejected
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

`src/fov.js` computes a circular **eight-tile** sight radius around the player
in ordinary underground areas and **five tiles** in the Dwarven Mines; the
mine radius is configured by `dwarvenMines.visibilityRadius` in
`content/world_generation.json`. The game has no facing direction, so sight extends in all
directions. Sight lines stop at cave walls, dwarven walls, mountain stone,
crypt niches, boulders, the Black Pillar, and closed/locked solid Dwarven doors.
Prison bars and closed/locked barred prison doors allow sight and projectiles
through, but block creature movement until a prison door is opened. Open and breached
doors do **not** block sight. Opening, unlocking, or breaching a door
immediately invalidates the cached underground FOV so tiles behind it become visible
in the same action, even though the player has not moved. Closing an
intact open door likewise invalidates the cached FOV, hiding tiles behind
solid doors without altering the barred-door view. The blocking wall face itself
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
On the surface, a discovered sand tile that has been dug shows its darker
excavated appearance on both minimaps and the full map, matching the main
canvas. This uses the already persisted `dugSandTiles` state; digging updates
the active map immediately without revealing any undiscovered tiles.
The active minimap cache also checks the map and discovery-grid identities,
because generic and Crypt z:-2 maps can have the same depth and cave index.

The desktop side minimap follows the player by default, but dragging directly
on it pans its view of the currently active floor with mouse or touch. Panning
is clamped to map bounds; double-clicking the side minimap recenters on the
player and resumes following. Changing the active floor or map also resumes
following. Side-map panning is UI-only and does not move the character, reveal
unexplored terrain, affect world-map browsing, or consume replay RNG.

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

Compact badges sit inside the bottom-left of the actual tile canvas in both tile
and ASCII modes, rather than merely using the outer desktop stage bounds. Their
layout follows the canvas's live displayed rectangle during viewport resizing, even
before the camera-size calculation settles, so they never drift into the surrounding
overlay area. Only active effects
appear; the strip disappears when empty. Backgrounds are 70% opaque (90% when
hovered, focused, or inspected); text and icons remain fully opaque. Badges wrap
upward on narrow screens without resizing the canvas.
Hover, keyboard focus, or tap reveals details above the row. Tap again, tap
outside, or press Escape to dismiss. Inspecting a badge does not spend a turn.

| Effect | Counter |
|---|---|
| Freezing | `hit in Nt`: cold turns until the next damage tick, calculated as the configured damage interval minus the current cold counter. This is not an expiry timer. |
| Temporary ATK / DEF / SPD penalty | Remaining turns; penalties with the same stat and expiry share a badge showing their combined amount. Different expiries stay separate. No artifact identity is revealed. |
| Berry regeneration | Remaining duration, including duration added by further berries. |
| Invisibility | Remaining duration; god-mode invisibility shows `∞` while enabled. |
| Speed potion | Remaining duration. |
| Root | Remaining turns: walking blocked, melee/item use allowed. |
| Petrifying Gaze | Remaining turns: −3 SPD / −3 GRACE. |
| Mummy Curse | Remaining turns: −2 ATK. |
| Confusion | Remaining turns: 40% redirected walk attempts, ending early when its Banshee dies. |
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
four-pixel steps from 20 to 96. Wide layouts whose primary pointer is not
coarse use the desktop overlay layout; this includes keyboard/headless contexts
that report no primary pointer, while coarse-pointer/touch layouts remain on the
mobile rules. Desktop `#root` has no outer padding and the stage fills the entire
browser viewport, including the area behind the top HUD.
The HUD is a fixed overlay centered at the top and does not reserve camera
height. Wide desktop layouts keep the HUD on one row; narrow-window/mobile rules
may wrap it. HUD presentation never resizes the map. The full-viewport desktop
stage deliberately avoids creating a separate stacking context so modal overlays
inside it can still cover gameplay-side overlays such as the minimap, keyboard
hints and message log.
Map tiles remain square, unscaled canvas pixels: if the available width or height
is not an exact multiple of the tile size, the camera renders one extra edge
column/row and the stage symmetrically clips the sub-tile excess. This avoids
grey side/bottom gutters without distorting terrain; at most part of one tile is
clipped at each pair of opposite edges. Canvas HUD elements that hug an edge,
including the underground `Z` depth badge, are positioned against the **visible**
canvas bounds rather than the oversized render buffer so this deliberate clipping
cannot trim them after resize or zoom. A cramped window caps the effective tile size
so at least seven columns fit; desktop otherwise has no 50-tile camera cap, so
wide and tall monitors expose additional map instead of leaving unused space.
The right-side minimap and keyboard hints are fixed overlays and never reserve
canvas width. Expanding or collapsing either panel therefore does not resize the
camera or make the map jump. Coarse-pointer layouts retain the 16-column
baseline scaling and 7–50-column bounds, while the existing vertical drag still
controls visible rows. Pointer hit testing uses the canvas's actual
displayed-to-buffer ratio. Zoom is presentation-only: it does not change world
coordinates, gameplay RNG, save data, or the separate world-map zoom.
Rasterized terrain and item image caches are rebuilt when tile size changes.

Wheel zoom listens only on the game canvas: scrolling over the message log,
inventory, trade panels, or other scrollable content keeps its usual behavior.
The separate full-map wheel zoom still applies when the map is open. Ctrl/Meta
wheel remains available for browser zoom. Small trackpad deltas accumulate
before each tile-size step. Desktop inspection tooltips remain overlays above
the canvas and side panels; near the right or top edge they flip/clamp back into
the visible canvas instead of being clipped by the browser edge.

On desktop the message log floats as a narrow, taller panel along the lower-left
side of the canvas rather than consuming camera height. It keeps its original
40 px bottom inset relative to the stage instead of shifting in response to
active-status badges. Very tall status strips may therefore overlap the log.
Its panel background is semi-transparent so terrain remains perceptible beneath
it, while the log itself remains scrollable and continues to intercept
pointer/wheel input normally. A top-right resize grip lets the player change both
width and height without resizing the game camera; the grip is inset from the
native vertical scrollbar so the scrollbar cannot cover its visible or clickable
area. The default is 420×260 px; resizing is bounded to at least 300×120 px when
space permits, at most 80% of the stage width and 60% of its height, and always
kept inside the stage. The bottom anchor is preserved while resizing, so the
panel grows upward/rightward without moving its resting position. The resize is
presentation-only and is not saved or replayed.
The newest entry stays
fully bright, the second- and third-newest use slightly lower brightness, and
older history is further dimmed and mildly desaturated. Loot messages use white
as their base text color; when the looted object has an item tier, the item name
uses the same tier color as inventory/equipment UI. Mobile keeps its existing
separate log layout and safe-area behavior. Touch/narrow safe-area measurements
are applied after layout settles and only when their measured dimensions change,
so HUD/log resizing cannot feed back into the same resize-observer cycle.

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

`G` requests activation of a developer/debug mode. In live play, enabling
it first opens a confirmation explaining that the current character will be
**permanently disqualified from Highscores**, even after disabling God Mode,
refreshing, or loading a save from before its activation. Cancelling does not
change the world, character, leaderboard eligibility, replay actions, turns,
or RNG. Acceptance disqualifies the character before applying the debug buffs.
Recorded God Mode actions are replayed without a confirmation or browser-ledger
writes. Disabling an active God Mode needs no confirmation and cannot undo the
exclusion. Once enabled, God Mode makes the player invisible. Pressing
`G` again turns god mode and its invisibility off, restoring normal movement
restrictions and drowning. Revealed maps and granted stats/gold remain.
Enabling God Mode also permanently teaches the character **Tracking** using
the same learned-skill flag as the Old Hunter. This persists in saves/replay.
It also permits artifact identification without a Scroll of Identification,
while preserving the ordinary identification turn and saved item state.
Holding the key does not trigger repeated toggles. The key press is a replay
action; older recordings that toggled only god-mode invisibility still replay
with their original behavior. The visibility flag is saved; older god mode
saves load with invisibility on.

While God Mode is active, hidden **Page Down / Page Up** controls instantly
move to the next generated lower / higher z level without a turn or RNG roll,
skipping non-playable depths. For example, Page Down on the surface goes from
z:0 to z:-1. The player retains the exact same x/y coordinates, even inside
solid rock, and can walk out through it using God Mode movement. Returning to
the surface retains the world's current terrain, including changes made while
generating landmarks and by subsequent gameplay. Debug travel
uses the generic depth chain, not the separate crypt map; pending warnings
on the departed level are canceled. The action is recorded for replay, but
does not appear in the in-game control hints.

It:

- reveals generated maps
- sets HP to 500
- sets base ATK to 50
- sets base DEF to 50
- sets base SPD to 50
- sets MF to 25
- sets gold to 500

This is a development feature, not normal gameplay.

Enabling it permanently excludes this character from future Highscores
submissions, even after disabling it or loading an earlier save on the same
browser. Existing legitimate milestones remain. The exclusion is saved and
replayed; playback never modifies the browser's live exclusion ledger.

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
- [x] Procedural surface; selectable XS–XXL world size (260×260 L default)
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
  becomes visible in tile-image mode (or its darker background in ASCII mode),
  including both minimaps and the full map once that tile is discovered.
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
  version: 3,
  initialState,
  actions: [],
  rng: [],
  idleRng: []
}
```

The replay tape format version is independent of the current game save schema version (97).
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

Service-worker registration is disabled under Cypress so browser tests execute
current server files and network-response fixtures. Graveyard and startup
response-fixture tests also bypass browser/service-worker caches through CDP,
including workers left by earlier runs.

Cypress world-generation diagnostics record the seed, configured dimensions
and active trait names before each call to `generateNewWorld()`, including
calls that fail before a map is produced. The global support file shows each
seed in the Cypress Command Log and prints `[worldgen]` JSON lines to the
terminal/GitHub Actions job log after each test, including failed tests. Each
line identifies the spec, test and result. Multiple generation calls retain
separate entries, so tests that change the seed report the seed actually used.
The notification is test-only, consumes no RNG and adds no save/replay fields.
These diagnostics do not pin seeds or retry failed generation.

E2E tests that start a world through Begin must wait for the loading overlay
to close before reading or modifying generated map state. Mechanics fixtures
use controlled terrain; procedural-generation tests check generated terrain
separately.

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

Malformed RNG boundaries before the first action abort playback with a visible
desync message and restore the live recording, as do later replay mismatches.

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
The HUD button remains reachable during character selection. Character
selection keeps its panel below the desktop HUD, while narrow-window dialogs
reserve the measured HUD area above their content.
Opening/closing never consumes a game turn or changes replay/save state. The
overlay fills the viewport with one scrolling records list; its title and X
close control remain visible.

Architecture: GitHub Pages -> lazily loaded, pinned Supabase browser JS SDK
(`src/supabase.js`) -> Supabase Data API -> PostgreSQL `death_records`. There
is no backend, account, service key, build step, reward, or gameplay dependency.
Edit `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` at the top of
`src/supabase.js`. Both Graveyard and Highscores use its shared client,
SDK initialization, browser identity and offline/replay guards. Use the Project
URL and browser publishable key (or legacy
anon key), **never** a secret/service_role key. The schema, policies, indexes,
validation and pre-request rate limit are in `supabase-graveyard.sql`: paste it
into the Supabase SQL Editor of a new project. Keep the Data API enabled. No
other dashboard configuration is required for a new default project. If the
project already has a `pgrst.db_pre_request` hook, compose the checks rather
than overwrite it.
The database uses a nullable JSONB `strongest_enemy_killed` column with bounded
name, species, tier, strength and stat snapshot validation. The client submits
integers for the tier, strength and four stats even if the underlying monster
stats are fractional; this also works with the original all-integer constraint.
The earlier `supabase-graveyard-strongest-decimals.sql` migration allowed decimals
in stat fields, but is **not required** for current client submissions. Existing
databases must still have the `strongest_enemy_killed` JSONB column and its
corresponding constraint. Older online records display “None”. The frontend
includes the column in both death submission and Graveyard queries.

For an existing database, also run
`supabase-graveyard-add-world-death-fields.sql` **before deploying this
client**. It adds nullable `dropped_item` (JSONB), `world_traits` (JSONB)
and `world_size` (text) columns; older rows continue to be readable. The
migration is supplied alongside the changed source files. New projects need
these columns in their baseline schema or must apply the same migration.

For an existing Graveyard database, apply `supabase-graveyard-drowning.sql`
before deploying the client so its cause constraint accepts drowning deaths.
For poison support, `death_cause_check` must also allow `poison` in both
existing and new databases before deploying the poison client. The current
`supabase-graveyard.sql` and the drowning migration allow `drowning` but not
`poison`; a poison migration is not present in this repository.

For Dwarven Ruins trap deaths, apply `supabase-graveyard-dungeon-traps.sql`
to existing databases. It extends `death_cause_check` to allow the existing
`dungeon trap` cause (used by wall arrows and spikes) and extends
`death_position_check` from the original shallow levels (z:0 through -3) to
chain floors down to z:-32, while retaining JSON shape, coordinates, level
kind and payload-length checks. This is a database migration; the client
continues to send the real cause and z level. Without the migration,
PostgREST returns HTTP 400 for trap fatalities in the deeper ruins.

The client maps accepted `dungeon trap` records to the display label
**Dungeon trap**. The hotfix refreshes the service-worker asset cache so
clients load the corrected `src/graveyard.js` without a game version bump.

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
incremented before snapshot. Player stats, equipment and location are captured
before XP/max-HP penalties, backpack drops, teleport, corpse transfer, or
character reset. The `dropped_item` field is attached **after** the actual
non-permadeath item-loss roll; it contains one lost item (with its identity,
item details and stat line), or null when nothing was dropped or on permadeath.
This changes neither the loss probability nor gameplay RNG.
The mode is read from `player.permadeath` directly; non-permadeath deaths each
produce a separate event and the same character continues; a permadeath
produces exactly one final event. Requests are fire-and-forget. New death
submissions include the saved `character_id`, matching Highscores milestones
for that character rather than the browser-wide `player_id`. Apply
`supabase-highscores-permadeath-deaths.sql` before deploying the client: it
adds this nullable Graveyard column, its narrow insert grant and a partial
index covering permadeath deaths only. Historical rows with no character ID
remain unmatchable. Graveyard's read view and other policies are unchanged.

Exact uploaded columns (apart from server-generated `id` and `created_at`):
`death_event_id`, `killed_at`, `last_position` (x/y/z, level kind, tile/biome),
`player_id`, `character_id`, `character_name`, `race` (game race ID), `permadeath`, `level`,
`cumulated_xp` (`totalXpEarned`), `death_number`, `killer_name`,
`killer_prefix`, `cause_of_death` (`enemy`, `poisonous_mushroom`, `freezing`,
`drowning` (shown as Drown), `poison` (shown as Poisoned to death),
`dungeon trap` (shown as Dungeon trap),
or legacy/unknown `environment`), `max_hp`, `atk`,
`def`, `spd`, `grace`, `gold`, `weapon`, `armor`, `shield` (base equipment
names), `equipment` (JSONB equipped-item snapshots with base/name, actual
ATK/DEF/SPD/GRACE, speed penalty, tier, modifiers, XP bonus, replay ID if
present, artifact effect ID when present, and the inventory-formatted
`stat_line`), `artifacts` (compact JSONB artifact inventory snapshots with
their `stat_line`), `steps_taken`,
`creatures_slain`, `strongest_enemy_killed` (name, species, integer tier,
rounded integer strength and independently rounded integer ATK/DEF/SPD/GRACE),
`turn_count` (turns in the current page session, reset on
load), `world_seed` (original seed restored from saves), `world_size` (the
selected XS–XXL preset), `world_traits` (JSONB array of actual selected trait
names and resolved additive effects, or an empty array for normal worlds),
`dropped_item` (nullable compact JSONB snapshot of what the player lost),
and `game_version`
(the current release version from `src/version.js`). `WORLD_SEED` is reassignable so
loading a save restores its original seed instead of reporting the new page
load's seed. The service worker imports that same version file for its cache
name; bump `src/version.js` for each release. Registration bypasses the HTTP
cache for service-worker imports so a changed version file triggers an update
even when `sw.js` itself has not changed. Playtime is not recorded:
there is no reliable persisted playtime counter. Neither full saves nor
replay/RNG histories are uploaded. The existing service worker precaches
`src/supabase.js`, `src/graveyard.js`, `src/version.js`, and CSS under the current versioned cache.
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

## Online Highscores (optional)

The desktop/mobile HUD has a 🏆 button with the tooltip **Highscores**, available
during character selection as well as play. It opens a Graveyard-style dialog
with Non-permadeath and Permadeath mode buttons. Rows show rank, character/race,
level and rounded permanent strength; expanded rows show the character's
stats, equipment, artifacts, achievements, world details, version and date,
without a redundant level-up achievement label. Permadeath rows show 💀
when a matching permadeath death is recorded; an unmarked row is not proof
that the character is still alive (including older deaths, offline deaths or
failed uploads). Non-permadeath rows never show death markers. Remote text
is rendered as text, never HTML, and long names/stat lines wrap within the scrollable list.
Narrow HUD action rows wrap to keep the trophy reachable with Replay visible.

The title, mode controls and close button remain outside the scrolling list on
desktop and mobile. Escape, X or clicking the backdrop closes it; keyboard
focus stays within the dialog and returns to the previous control on close.
Highscores and Graveyard are mutually exclusive. Opening during live play clears
queued movement and hides touch controls; it consumes no turn or RNG and blocks
live gameplay keys. Recorded replay actions continue normally if the dialog is
opened during playback, but its unavailable state makes no online query.

An unidentified artifact remains unidentified in public highscore snapshots. 
The expanded equipment/artifact rows show only its generic `Unidentified <noun>` name and `???`, 
never the dwarven owner's name, hidden curse or item bonuses. Secret item fields are
removed before submission; the ordinary character-level permanent stats and
ranking remain visible and use the item's real equipped effects.

Each mode has its own top ten: permadeath and non-permadeath. Cursed and normal
worlds share their mode board. Ranking uses level first, then exact permanent
`ATK + DEF + SPD + GRACE`; exact ties prefer the earlier server receipt, then
record ID. Only display values may be rounded. Maximum HP, MF, XP and gold do
not contribute. Historical achievements remain after death.

`playerPermanentStats()` reuses the ordinary player formulas without terrain,
potions, temporary curse debuffs, frozen-water penalties or carried-item speed
effects. Permanent race/level bonuses, equipped modifiers, active artifact
ATK/DEF, shield/armor penalties, SPD's minimum of 1, and GRACE's minimum of 0
remain. Unarmed GRACE and artifact-weapon handling match the current character
stat formula. The calculation changes no state or RNG. Artifact SPD bonuses contribute to permanent SPD and highscore ranking strength
through the normal player speed formula.

`supabase-highscores.sql` creates `highscore_records` and the read-only
`highscores_top_ten(p_permadeath)` RPC. The query selects each character's
highest-level milestone before sorting and limiting to ten. Character IDs, not
names, identify records. The separate
`highscores_permadeath_top_ten()` RPC uses the same ranking, then adds an
`is_dead` boolean through at most ten indexed `death_records` lookups. Only
the permadeath board invokes it; normal-mode reads use the original RPC and
never query Graveyard. The death marker updates when the board is refreshed,
without polling or an additional client request. One immutable snapshot is
permitted per character and level, so a repeat cannot replace its equipment
or strength. Numeric stats retain fractions and the database generates their
summed strength.

Startup fetches both boards once without delaying boot, character creation,
loading, or world generation. Fewer than ten entries permit any new milestone;
full boards compare the character's level and exact strength with tenth place.
A failed or unfinished read leaves the cutoff unknown and permits submission.
The cached cutoff is only an optimization: other players can displace a result
before it is posted. There is no polling or automatic post-insert refresh.
Opening the dialog or switching mode fetches the currently selected board.
Late responses cannot replace another mode's list or reopen a closed dialog.
Loading, empty, offline and failed-query states are shown in the dialog.

Only a live level-up triggers a submission. One XP award granting several
levels captures one deep-cloned final-level snapshot after all gains resolve.
Gear changes, XP without leveling, death, save/load, and reconnect do not send
milestones. The snapshot includes Graveyard-style equipment, artifacts, world
details, and achievements, without killer/cause/location/drop fields. Changing
characters during a pending request cannot change its captured identity/data.

`src/highscores.js` contains ranking, eligibility, submission and UI code in one
file. Both online features use the configured client and timeout from
`src/supabase.js`, which creates the client using `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY`. Graveyard's item snapshot serializers remain shared.
Highscores reads through
`client.rpc('highscores_top_ten', {p_permadeath})` and sends milestones through
`client.from('highscore_records').insert(record)`.
Offline actions skip network work; failed submissions are neither
queued nor automatically retried. Playback guards run before snapshot/storage
work and again before a pending insert. No gameplay RNG, turns or rules depend
on network timing. The shared transport and Highscores scripts are precached
for offline play. Extracting the client changes no database schema or save format.

God-mode activation is gated by an explicit live-play confirmation warning
that Highscores eligibility is permanently lost, including across rollback to
earlier saves. Declining does not record a replay action or set the exclusion
flag. Replay playback skips the prompt but applies previously accepted actions.
God-mode activation sets `highscoresDisqualified` before its stat grants. It
survives disabling god mode, death and saves. A browser-local ledger also blocks
earlier live saves of the same character, with an in-memory fallback when
storage fails. Replay applies the saved flag and recorded god-mode actions but
never reads/writes that ledger; live-snapshot restoration remains exact. New
characters start eligible. Clearing browser data, another browser or edited
saves can bypass local history: this is not authoritative cheat protection.

Install `supabase-highscores.sql` first, then
`supabase-highscores-enable-writes.sql`. The follow-up adds only Highscores
objects and permissions. A dedicated BEFORE INSERT statement trigger calls
`private.limit_highscore_writes()` once per insert statement. No Graveyard
function, table, secret, trigger, grants, or authenticator hook setting is changed.
Highscores generates and preserves its own `private.highscore_secret` and has a
separate quota of **60 committed write requests per IP per UTC hour**, shared
across both modes. Only the HMAC of the forwarded address is stored. The same
gateway/header trust and shared-NAT limitations as Graveyard apply. Counters
are transactional: failed or rejected inserts roll back their increments.
The trigger also applies to administrative inserts, which need request headers.

An earlier draft extended the Graveyard hook. If already applied, run the
optional `supabase-highscores-restore-graveyard.sql` repair before the corrected
write migration. It restores the exact original function supplied for this
project without deleting records/counters. Both scripts detect the earlier
draft to prevent accidental repairs or double counting. Fresh installations
skip the repair entirely.

Browser roles can insert only the snapshot payload columns. IDs and timestamps
remain server-generated; strength is calculated by the database. Direct table
reads, updates and deletes remain denied; reads use the bounded RPC. Duplicate
milestones and multi-row submissions remain rejected. The follow-up is safe to
reapply without clearing counters, checks the foundation and pgcrypto,
and reloads the API schema. No game/save-format change is required. See
`HIGHSCORES_SETUP.md` for installation and database verification. For the optional permadeath skull marker, apply
`supabase-highscores-permadeath-deaths.sql` after the Highscores migrations and
before deploying the changed browser client. It adds no permission to edit or
delete records and does not alter either write rate limiter. The marker is
informational: without authenticated identities, public clients can forge
Graveyard submissions using visible character IDs. The existing Highscores
migrations were tested locally; the death-marker migration has not been applied
to the live Supabase project.

---

# 85. Cursed World

## Selection

The **Cursed world** checkbox in character creation is off by default.
The Cursed world label has a brown desktop tooltip warning that the mode may
be unbalanced. On mobile-sized or touch screens, the World size selector appears separately and
the three checkboxes form separate full-width rows. The warning appears below
them only while Cursed world is checked.
The desktop tooltip is anchored to
the Cursed world label; each checkbox sits beside its text with a small fixed
gap. With the checkbox off, generation
uses the base configuration and logs no trait line.
The mobile checkbox layout and the warning's checked/unchecked visibility
are covered by `tests/e2e/startup-ui.cy.js` and
`tests/e2e/cursed-world-options.cy.js`.
After a valid name/race is confirmed, a cursed world draws the requested
number of traits before world generation. All generation retries use the
same resolved effects. Each nonempty `flavor_text` is logged on a new line
after the introductory story text, in selected order. A trait without
`flavor_text` is silent but fully active. The flavor describes evidence in the
world rather than revealing the changed parameter.

`content/world_traits.json` is an object:

```json
{
  "traits_per_world": {"count": "random", "min": 3, "max": 6},
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
`world_generation.json`. `_note` is
metadata for developers and is not an effect or a player-facing flavor line.
`count` may be an integer **3–6**, or `"random"` to draw an integer inclusively from `min` to
`max` (default **3–6**). The chosen count is fixed for this world. Candidates
are drawn without replacement using the seeded gameplay RNG. The optional
positive `weight` defaults to `1`; `the_bell_is_guarded` uses `0.25` so it is
less likely to be drawn.

`exclusiveGroup` prevents two entries in the same group from being active
(e.g. two competing snow climates). `excludes` can name further incompatible
trait IDs. If a conflicting pair appears in the initial draw, a trait marked
`direction: "one_way"` wins against `"two_way"`, independent of draw order.
The other candidate is dropped; the selection fills the empty slot with the
next nonconflicting candidate, if available. The current 41-entry pool has
ample room to reach the configured 3–6 active traits. Group conflicts do not
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

World size is *not* an effect. Cursed traits only change numeric parameters
in `content/world_generation.json`; the independent size preset is applied
when preparing the world's map dimensions. This keeps size deterministic and
prevents trait selection from silently changing the map area. Save/replay
snapshots already preserve the actual dimensions of the generated map.

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
| Climate and dryness | `cold_world`, `wild_weather`, `drought` | Snow expands near the Temple, snow parameters vary both ways, or water and forage become scarce. The two snow climates conflict; specific cold wins. |
| Cave extent | `hollow_world`, `shallow_earth`, `great_caverns`, `world_beneath_the_world` | Deep layouts enlarge; shallow passages contract with more caves and additional entrances; all caves open up; or more branches, threats and chests appear. These share a cave scale exclusion group. The guaranteed grotto/burrow pair still uses different algorithms. |
| Deep cave character | `wormways`, `halls_below`, `flooded_depths`, `fungal_bloom`, `deep_bounty` | Optional branches favor burrows or grottos, more grotto water forms, Fungus is more common, or supplies and threats increase together. Wormways and Halls Below conflict; guaranteed distinct z:-2 caves remain. |
| Forest and wildlife | `ancient_wilderness`, `eyes_in_the_trees`, `wild_frontier`, `migration_season`, `restless_wilds`, `great_migration`, `watchful_world`, `beast_kingdom` | Ancient forest/ambush/rough terrain vary; mobile enemies promote to roam/far; grouped migrants start near edges; enemy aggro reach grows by one. Beast Kingdom increases the share of non-humanoid surface spawns without raising their total count. Forest and migration themes each have a conflict group. |
| Surface water | `drowned_lands` | More inland lakes and river sources; more submerged chests, biased toward inland lakes when suitable water tiles exist. Drought excludes this trait. Swimming rules and ice mechanics are unchanged. |
| Enemy quality | `champions_age`, `mundane_age`, `wild_blood`, `uncertain_blood`, `things_below` | Random prefixes rise or fall; Mundane Age raises ordinary surface density; variance broadens; Things Below shifts density underground. The optional deep Champion encounter is independent of random prefix odds. Elite ages conflict. |
| Equipment and money | `treasure_age`, `age_of_rust`, `relic_world`, `cursed_riches`, `poor_kingdom` | Better modifier rolls carry more elite enemies, common tier-one junk weapons offset weaker modifiers, artifacts rise alongside danger, richer gear brings more curses, or chest gold shrinks. Merchant prices do not change. These five share a wealth conflict group. |
| Supplies and digging | `herbal_bloom`, `blighted_harvest`, `buried_age`, `treasure_at_the_edges`, `far_fortune`, `strange_fortune` | Herbs/mushrooms and Fungus rise while loose life potions fall; forage yields less and mushrooms poison more often; loot moves underground, toward edges, or farther from the village; supply composition changes. Herbal/Blighted/Fungal themes conflict as harvest traits. Drought excludes all three to avoid contradictory or near-empty forage. |
| Dwarven fort | `underkings_legacy`, `haunted_hold`, `grand_delving` | A larger intact fort, a ghost-heavy fort, or a wider mountain excavation. They conflict as fort variants. |
| Story hazard | `the_bell_is_guarded` | Additional and stronger bell guardians; this specific quest hazard is less likely to roll. |

The legacy names *The Unfallen Hold* and *Underking's Legacy* are represented
by `underkings_legacy`. *No Safe Woods* is folded into `eyes_in_the_trees`;
*Rich and Cruel* into `cursed_riches`. This avoids duplicate effects and
reduces extreme combinations. The unrelated `surfaceEnemies.prefixChance`
and cave prefix chances remain separate; `champions_age` and `wild_blood`
affect the random rolls, not the optional deep cave Champion encounter.

The generation code reads neutral values from `world_generation.json` on every
world. `caves.shallow.extraEntranceChance` controls optional second entrances
(the first cave still gets its guaranteed second entrance). Surface enemy
density, far/roam promotion, and migrant group count/size use
`surfaceEnemies.*`; migrant edge width, local radius, spacing, and maximum
tier are also configured there. Only mobile home/roam templates are promoted;
immobile enemies stay still. Migrants select legal surface edge sites and use
the existing opposite-edge `far` path logic.
Beast Kingdom changes only the **relative** template-selection weight of
non-humanoids from 1× to 2.5×, with no new enemies or extra population.
Humanoids are still possible, but dropped equipment is less plentiful.
It conflicts with Drought, whose weighting favors humanoids. This is a
species-composition choice, not a change to underground or mandatory spawns.
Drowned Lands lowers the lake noise threshold from 0.72 to 0.66, raises lake
carving from 0.40 to 0.44, and raises maximum river sources from 14 to 17.
Its submerged-chest budget rises from 15–30 to 20–38, with target lake share
35% → 55%. This share is conditional on having eligible submerged tiles
4–8 swimming steps from shore; chests are never placed on land or closer to
shore just to reach the budget. Stronger lake carving can reduce accessible
land, so normal landmark reachability checks still apply. Water inside the
cold region freezes under the general lake-ice rules (§12), including with
Drowned Lands; this trait adds no separate ice or drowning modifiers.
Forest ambush odds are additive: `eyes_in_the_trees` raises 4% to 13%,
`wild_frontier` raises 4% to 8%, and `drought` raises 4% to 11%.
The first two conflict as forest traits, but either can stack with Drought,
giving 20% or 15%, respectively. These are roll chances before checking for
an available adjacent spawn tile.
`surfaceLoot.looseHerbs/looseMushrooms` control additional loose supplies.
`cavePopulation.ecosystem.stairClearance` and `spacing` control ordinary
z:-2 ecosystem spawn safety and crowding. Champion escorts and tier-4 threats
are optional and draw from the same population threat budget.

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
the hut copy tier one. World size presets live in `map_config.json` and are independent of all
cursed traits. Neutral generation values reproduce the normal world's
probabilities and counts.

Drought lowers lake carving and river sources, reduces the water elevation
threshold, widens the sand band, cuts forest forage and cave Fungus, and
raises forest ambush chance. It leaves the frozen-river guarantee active. Its
non-humanoid rarity multiplier is 0.4 and prepared humanoid HP multiplier is
0.85; the equipment roll rises from `0.45 + 0.03 × tier` to
`0.61 + 0.03 × tier`, with weapon share rising from 50% to 70%. It excludes
Herbal Bloom, Blighted Harvest, Fungal Bloom, Flooded Depths,
Beast Kingdom and Drowned Lands. Ordinary
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
regenerated on load. No additional world-size persistence flag is necessary:
`mapWidth`, `mapHeight` and the serialized map contain the selected size.
Replay initial states carry those same dimensions; a permadeath restart
reuses the existing dimensions rather than changing them. Updating base JSON later can change how a saved offset
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
