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
    const ruins=deepLevels.filter(l=>l.dungeonPackage==='dwarvenRuins')
    const ruinsZs=new Set(ruins.map(l=>-(l.dungeonFloor+3)))
    return groundItems.filter(g=>g.kind==='dwarvenstove'&&g.level===-3).length===1 &&
      ruins.every(l=>{
        const z=-(l.dungeonFloor+3)
        const kitchens=l.rooms.filter(r=>r.archetype==='Kitchen')
        const stoves=groundItems.filter(g=>g.kind==='dwarvenstove'&&g.level===z)
        return kitchens.length<=1&&kitchens.length===stoves.length
      }) &&
      groundItems.filter(g=>g.kind==='dwarvenstove').every(g=>g.level===-3||ruinsZs.has(g.level))
  })()`),'one guaranteed Fort stove and at most one kitchen stove per Ruins floor')
  run('rotateGeneratedWorld(1)')
  assert(run('validateDwarvenRuinsStratum().ok'),'kitchen positions remain valid after rotation')
  run('loadGameFromObject(JSON.parse(JSON.stringify(buildSaveObject())),{isReplayInit:true})')
  assert(run('validateDwarvenRuinsStratum().ok'),'kitchen rooms and stoves survive save/load')
  assert(run('isBigBellReachableFromTemple() && isSurfacePointReachableFromTemple(dwarvenRuin.x,dwarvenRuin.y)'),'surface quest and fort reachable')
  assert(run(`groundItems.filter(g=>g.level===undefined&&TACTICAL_CONSUMABLE_KINDS.includes(g.kind)).every(g=>TILE[surfaceMap[g.y]?.[g.x]]?.walk)`),'new loose drops valid on surface')
  console.log('PASS generated world '+seed+': ruins validation, fort/bell reachability, valid loose supplies')
 }
 for(const kitchenChance of [0,1]){
  run(`WORLD_SEED=12345;rngState=WORLD_SEED;applyWorldTraits([],'XS');
    WORLD_GEN_CONFIG.dungeons.dwarvenRuins.kitchenChance=${kitchenChance};enemies=[];groundItems=[];occupied=new Set()`)
  await run('generateNewWorld()')
  assert(run('validateDwarvenRuinsStratum().ok'),'valid floor layouts with forced kitchen probability '+kitchenChance)
  assert(run(`deepLevels.filter(l=>l.dungeonPackage==='dwarvenRuins').every(l=>
    l.rooms.filter(r=>r.archetype==='Kitchen').length===${kitchenChance})`),
    'forced kitchen probability '+kitchenChance+' controls every deeper floor')
 }
 run('WORLD_GEN_CONFIG.dungeons.dwarvenRuins.kitchenChance=0.35')
 console.log('PASS guaranteed Fort stove and optional Ruins kitchens at 0%, 35%, and 100%')
})().catch(e=>{console.error(e);process.exitCode=1})
