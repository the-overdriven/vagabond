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
