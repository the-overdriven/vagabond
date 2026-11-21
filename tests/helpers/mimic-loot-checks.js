// Run in the game context; force rare loot through the real initialization path.
function checkMimicRareLoot(fixture) {
  const check = (ok, message) => { if (!ok) throw Error(message) }
  const original = JSON.parse(JSON.stringify(buildSaveObject()))
  const originalChance = chance, originalRng = rng, originalPick = pick
  try {
    for (const [flint, potato] of [[false,false],[true,false],[false,true],[true,true]]) {
      loadGameFromObject(structuredClone(fixture), {isReplayInit:true})
      groundItems.push({x:10,y:10,kind:'chest',tier:3,level:-1,levelKind:'chain',
        caveIndex:-1,towerMazeMimic:true,opened:false})
      let bonusRolls = 0
      // No optional Fort mimics; the guaranteed maze mimic always rolls loot.
      // Its main reward is Identification, leaving the two bonus rolls isolated.
      rng = () => 0.999
      chance = probability => probability === 0.10 ? true : probability === 0.005
        ? [flint, potato][bonusRolls++] : originalChance(probability)
      Mimics.initialize()
      const chest = groundItems.find(g => g.isMimic && g.towerMazeMimic)
      const kinds = chest.loot.items.map(item => item.kind)
      check(bonusRolls === 2, 'exactly two independent 0.5% bonus rolls')
      check(JSON.stringify(kinds) === JSON.stringify([
        'idscroll', ...(flint ? ['flint'] : []), ...(potato ? ['potato'] : [])]),
        'mimic bonus contents use valid catalog kinds without changing the main reward')
      check(chest.loot.items.every(item => itemDefinition(item.kind)), 'every reward is in the item catalog')
      const expected = JSON.stringify(chest.loot), saved = buildSaveObject(), beforeRng = rngState
      rng = originalRng; chance = originalChance
      loadGameFromObject(saved, {isReplayInit:true})
      check(JSON.stringify(groundItems.find(g => g.id === chest.id).loot) === expected && rngState === beforeRng,
        'save/replay restoration preserves rare loot without rerolling')
    }

    // Both natural artifact categories are drawn from the real generator.
    for (const gear of [true, false]) {
      loadGameFromObject(structuredClone(fixture), {isReplayInit:true})
      groundItems.push({x:10,y:10,kind:'chest',tier:3,level:-1,levelKind:'chain',
        caveIndex:-1,towerMazeMimic:true,opened:false})
      rng = () => .999
      chance = p => p === .10 || p === .013 || (p === .5 && gear) || p === .005
      Mimics.initialize()
      const chest = groundItems.find(g => g.isMimic && g.towerMazeMimic)
      const artifact = chest.loot.items[0]
      check(artifact.kind === 'artifact' && !artifact.identified, 'mimic artifact is unidentified')
      check((artifact.artifactSlot !== 'trinket') === gear, 'mimic explicit category')
      check(chest.loot.gold === 0 && chest.loot.items.length === 3 &&
        chest.loot.items[1].kind === 'flint' && chest.loot.items[2].kind === 'potato',
        'artifact replaces main reward, keeps both independent bonuses')
      const expected = JSON.stringify(chest.loot), saved = buildSaveObject(), beforeRng = rngState
      rng = originalRng; chance = originalChance
      loadGameFromObject(saved, {isReplayInit:true})
      const restored = groundItems.find(g => g.id === chest.id)
      check(JSON.stringify(restored.loot) === expected && rngState === beforeRng, 'stored artifact survives restore')
      player.baseMf = 40
      player.inventory = []
      const beforeGold = player.gold
      Mimics.deathLoot({name:'Mimic',mimicLoot:restored.loot,x:player.x,y:player.y,level:currentZ})
      check(JSON.stringify(player.inventory[0]) === JSON.stringify(artifact), 'later MF does not reroll mimic artifact')
      check(player.gold > beforeGold, 'mimic additional gold remains')
    }

    // The final maze chest must also offer the same canonical Flint Stone.
    loadGameFromObject(structuredClone(fixture), {isReplayInit:true})
    currentZ = 0; currentCave = -1; map = surfaceMap
    player.inventory = []
    groundItems = [{kind:'chest',towerMazeTreasure:true,tier:3,
      x:player.x,y:player.y,level:0,opened:false}]
    pick = items => items.includes('flint') ? 'flint' : originalPick(items)
    checkGroundAt(player.x,player.y)
    check(player.inventory.some(item => item.kind === 'flint'), 'maze treasure can award Flint Stone')
    check(!groundItems.length, 'maze chest is consumed once')
  } finally {
    chance = originalChance; rng = originalRng; pick = originalPick
    loadGameFromObject(original, {isReplayInit:true})
  }
}
if (typeof module !== 'undefined') module.exports = {checkMimicRareLoot}
