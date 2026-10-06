function trapFixture() {
  replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true
  raceOpen=invOpen=tradeOpen=mapOpen=false;stopAttackAnimation();stopCameraAnimation()
  currentZ=-4;currentCave=-1;enemies=[];groundItems=[];occupied.clear()
  const terrain=blankCaveMap()
  for(let y=8;y<=18;y++)for(let x=8;x<=35;x++)terrain[y][x]='marble'
  const level={map:terrain,caveMaps:[terrain],caves:[{dwarvenRuins:true,dungeonPackage:'dwarvenRuins',x:10,y:12,entrances:[]}],
    discovered:Array.from({length:MAP_H},()=>Array(MAP_W).fill(true)),kind:'dwarvenRuins',dungeonPackage:'dwarvenRuins',traps:[]}
  deepLevels[2]=level;map=terrain;undergroundDiscovered=level.discovered
  player.x=10;player.y=12;player.hp=player.maxHp=1000;player.godMode=false;player.invisibleTurns=0;player.poisonTurns=0
  player.equip={weapon:null,armor:null,shield:null,blackkey:null};player.inventory=[];player.curseDebuffs=[]
  return level
}

async function trapRuleChecks() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)},l=trapFixture(),oldRng=rng
  rng=()=>0.5
  l.traps=[{id:'spike',type:'spikes',trigger:{x:11,y:12}}];map[12][11]='dwarvenspikes'
  const before=player.hp;await tryMove(1,0);check(player.hp<before&&player.x===11,'normal movement triggers reusable spikes')
  const once=player.hp;DungeonTraps.onEntry(player,11,12);check(player.hp===once,'standing/restore does not retrigger')
  player.x=10;forcePlayerPosition(11,12);check(player.hp<once,'forced movement triggers spikes')
  player.x=10;check(!playerPathCanTraverse(11,12),'auto-travel excludes trigger')
  const route=findPlayerPath(12,12);check(route&&route.every(p=>p.x!==11||p.y!==12),'auto-travel routes around trap')
  const monster=abilities=>({id:'enemy_1',name:'Goblin',baseName:'Goblin',hp:100,maxHp:100,atk:2,def:1,spd:1,grace:2,aggro:2,tier:2,abilities,level:-4,levelKind:'chain',x:11,y:12,alive:true,wander:false,humanoid:true})
  for(const abilities of [[],['fly'],['ethereal']]){
    const e=monster(abilities);enemies=[e];finishEnemyMove(e,10,12);check(e.hp<100,'all movement abilities trigger spikes')
  }
  const e=monster([]);e.hp=1;e.stolenItem={kind:'potion',count:1};enemies=[e]
  const xp=player.xp,kills=player.kills,species=JSON.stringify(player.killsBySpecies),strongest=JSON.stringify(player.strongestEnemyKilled)
  finishEnemyMove(e,10,12)
  check(!e.alive&&!enemies.includes(e),'trap kills enemy')
  check(player.xp===xp&&player.kills===kills&&JSON.stringify(player.killsBySpecies)===species&&JSON.stringify(player.strongestEnemyKilled)===strongest,'no trap XP, kill or bestiary credit')
  check(groundItems.some(g=>g.kind==='stolenloot'),'trap death still returns stolen item')
  groundItems=[];map[12][11]='marble'
  l.traps=[{id:'arrow',type:'projectile',trigger:{x:15,y:12},emitter:{x:9,y:12},direction:{dx:1,dy:0},range:12}]
  map[12][15]='dwarvenpressureplate';map[12][9]='dwarvenarrowwall'
  const blocker=monster([]);blocker.x=12;enemies=[blocker];player.x=15
  const hp=player.hp;DungeonTraps.onEntry(player,14,12);check(blocker.hp<100&&player.hp===hp,'first creature intercepts arrow')
  const blockedHp=blocker.hp;groundItems=[{kind:'potion',x:11,y:12,level:-4,levelKind:'chain'}]
  DungeonTraps.onEntry(player,14,12);check(blocker.hp===blockedHp,'ground item blocks arrow')
  groundItems=[];map[12][11]='dwarvendoorclosed';DungeonTraps.onEntry(player,14,12);check(blocker.hp===blockedHp,'closed door blocks arrow')
  check(!UndergroundFov.canSee(map,10,12,12,12),'door blocks shared FOV')
  check(!UndergroundFov.canSee(map,8,12,10,12),'emitter retains wall sight blocking')
  check(!DungeonTraps.safeSpawn(15,12,-4)&&!DungeonTraps.safeSpawn(17,12,-4)&&DungeonTraps.safeSpawn(18,12,-4),'spawn exclusion radius')
  rng=oldRng
  return {movement:true,forced:true,flyAndEthereal:true,noKillCredit:true,projectileBlocking:true,pathfinding:true,fov:true}
}

async function trapPersistenceChecks() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)},l=trapFixture()
  l.traps=[{id:'spike',type:'spikes',trigger:{x:11,y:12}}];map[12][11]='dwarvenspikes'
  l.traps.push({id:'arrow',type:'projectile',trigger:{x:12,y:12},emitter:{x:12,y:9},direction:{dx:0,dy:1},range:12})
  map[12][12]='dwarvenpressureplate';map[9][12]='dwarvenarrowwall'
  startReplayRecording()
  await tryMove(1,0);await tryMove(1,0);await tryMove(1,0);await tryMove(-1,0)
  const tape=JSON.parse(JSON.stringify(replayData))
  const result=()=>JSON.stringify({hp:player.hp,x:player.x,y:player.y,turn:turnCount,terrain:encodeTileGrid(map,'#'),traps:deepLevels[2].traps})
  const expected=result(),rngEnd=rngState,save=JSON.parse(JSON.stringify(buildSaveObject()))
  loadGameFromObject(save,{isReplayInit:true});check(result()===expected&&rngState===rngEnd,'save restores trap and actor without damage or RNG')
  loadGameFromObject(tape.initialState,{isReplayInit:true});replayAnimationsDisabled=true;raceOpen=false
  activeReplay=tape;replayPlaying=true;replayRecording=false;replayRngIndex=0
  for(const action of tape.actions)await runReplayAction(action)
  check(replayRngIndex===tape.rng.length,'replay consumes exact recorded RNG tape')
  check(result()===expected,'actual replay reproduces damage, terrain and mechanism')
  replayPlaying=false;activeReplay=null
  return {save:true,replay:true,rngCalls:tape.rng.length}
}

async function trapGenerationChecks(seed=12345,count=3,traits=[]) {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  replayRecording=false;replayPlaying=false;currentZ=0;map=surfaceMap
  applyWorldTraits(traits.map(name=>{const t=structuredClone(WORLD_TRAITS.find(t=>t.name===name));t.effects.forEach(e=>{if(Array.isArray(e.value))e.value=(e.value[0]+e.value[1])/2});return t}))
  const cfg=WORLD_GEN_CONFIG.dungeons.dwarvenRuins,range=cfg.levelCountRange
  cfg.levelCountRange=[count,count];WORLD_SEED=seed;rngState=seed;await generateNewWorld()
  const summarize=()=>JSON.stringify(deepLevels.slice(2).map(l=>({terrain:encodeTileGrid(l.map,'#'),traps:l.traps})))
  const original=summarize()
  check(deepLevels.length-2===count,'requested ruins floor count')
  for(let i=2;i<deepLevels.length;i++){
    const l=deepLevels[i],z=chainZForDepth(i+2),entry=l.caves[0].entrances[0]
    check(l.traps.length>=2&&l.traps.length<=4,'configured trap count')
    check(new Set(l.traps.map(t=>t.type)).size===2,'both trap types generated')
    const blocked=new Set(l.traps.map(t=>keyXY(t.trigger.x,t.trigger.y)))
    const reachable=DungeonTraps.safeReachable(l.map,entry,blocked)
    const required=[...l.caves[0].entrances,...groundItems.filter(g=>g.level===z)]
    if(dwarvenRuinsLiftShortcut())required.push(...[dwarvenRuinsLiftShortcut().upper,dwarvenRuinsLiftShortcut().lower].filter(p=>p.z===z))
    check(required.every(p=>reachable.has(keyXY(p.x,p.y))),'stairs, keys, lift accessible while avoiding every trap')
    for(const t of l.traps){
      check(DungeonTraps.isTrigger(l.map[t.trigger.y][t.trigger.x]),'mechanism has readable trigger')
      check(!groundItems.some(g=>g.level===z&&g.x===t.trigger.x&&g.y===t.trigger.y),'no ground object on trigger')
      check(enemies.filter(e=>e.level===z).every(e=>DungeonTraps.safeSpawn(e.x,e.y,z)),'no monster starts near trap')
      if(t.emitter)check(l.map[t.emitter.y][t.emitter.x]==='dwarvenarrowwall','projectile mechanism retains emitter')
    }
  }
  WORLD_SEED=seed;rngState=seed;await generateNewWorld();check(summarize()===original,'same seed reproduces mechanisms and terrain')
  const save=JSON.parse(JSON.stringify(buildSaveObject()));loadGameFromObject(save,{isReplayInit:true});check(summarize()===original,'all mechanisms survive save')
  cfg.levelCountRange=range
  return {seed,count,traps:deepLevels.slice(2).map(l=>l.traps.length)}
}
module.exports={trapFixture,trapRuleChecks,trapPersistenceChecks,trapGenerationChecks}
