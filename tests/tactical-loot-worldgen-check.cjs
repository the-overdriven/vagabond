// node tests/tactical-loot-worldgen-check.cjs
const {run,context}=require('./helpers/node-game-runtime.cjs')
const assert=require('node:assert/strict')
;(async()=>{
 await run('loadContent()');run('log=()=>{};renderInventory=()=>{};replayAnimationsDisabled=true;replayRecording=false;raceOpen=false')
 for(const seed of [12345,992341]){
  run(`WORLD_SEED=${seed};rngState=WORLD_SEED;applyWorldTraits([],'XS');player.inventory=[];player.curseDebuffs=[];player.poisonTurns=0;player.berryRegenTurns=0;enemies=[];groundItems=[];occupied=new Set()`)
  await run('generateNewWorld()')
  assert(run('validateDwarvenRuinsStratum().ok'),'ruins keys, required locations, routes and safety')
  assert(run(`(() => {
    const floors=[-3,...deepLevels.filter(l=>l.dungeonPackage==='dwarvenRuins').map(l=>-(l.dungeonFloor+3))]
    return floors.every(z=>groundItems.filter(g=>g.kind==='dwarvenstove'&&g.level===z).length===1) &&
      deepLevels.filter(l=>l.dungeonPackage==='dwarvenRuins').every(l=>
        l.rooms.filter(r=>r.archetype==='Kitchen').length===1)
  })()`),'exactly one kitchen stove on each Fort/Ruins floor')
  run('rotateGeneratedWorld(1)')
  assert(run('validateDwarvenRuinsStratum().ok'),'kitchen positions remain valid after rotation')
  run('loadGameFromObject(JSON.parse(JSON.stringify(buildSaveObject())),{isReplayInit:true})')
  assert(run('validateDwarvenRuinsStratum().ok'),'kitchen rooms and stoves survive save/load')
  assert(run('isBigBellReachableFromTemple() && isSurfacePointReachableFromTemple(dwarvenRuin.x,dwarvenRuin.y)'),'surface quest and fort reachable')
  assert(run(`groundItems.filter(g=>TACTICAL_CONSUMABLE_KINDS.includes(g.kind)).every(g=>g.level===undefined&&TILE[surfaceMap[g.y]?.[g.x]]?.walk)`),'new loose drops valid on surface')
  console.log('PASS generated world '+seed+': ruins validation, fort/bell reachability, valid loose supplies')
 }
})().catch(e=>{console.error(e);process.exitCode=1})
