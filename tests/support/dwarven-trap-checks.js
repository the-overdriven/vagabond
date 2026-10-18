function trapCornerChecks() {
  const check = (ok, msg) => { if (!ok) throw Error(msg) }
  const dirs = [[0,-1],[1,0],[0,1],[-1,0]]
  for (let rotation = 0; rotation < 4; rotation++) {
    const a = dirs[rotation], b = dirs[(rotation + 1) % 4]
    const terrain = Array.from({length:7}, () => Array(7).fill('dwarvenwall'))
    terrain[3][3] = 'marble'
    terrain[3+a[1]][3+a[0]] = 'marble'
    check(!DungeonTraps.usefulTriggerTile(terrain,3,3),'dead-end alcove rejected')
    terrain[3+b[1]][3+b[0]] = 'marble'
    check(DungeonTraps.usefulTriggerTile(terrain,3,3),'narrow corridor bend retained')
    terrain[3+a[1]+b[1]][3+a[0]+b[0]] = 'marble'
    check(!DungeonTraps.usefulTriggerTile(terrain,3,3),'skippable inside corner rejected in every rotation')
    terrain[3+b[1]][3+b[0]] = 'dwarvenwall'
    terrain[3-a[1]][3-a[0]] = 'dwarvendoorlocked'
    check(DungeonTraps.usefulTriggerTile(terrain,3,3),'straight corridor with locked-door exit retained')
    terrain[3-a[1]][3-a[0]] = 'dwarvendoorclosed'
    check(DungeonTraps.usefulTriggerTile(terrain,3,3),'closed-door exit retained')
    terrain[3+b[1]][3+b[0]] = 'marble'
    check(DungeonTraps.usefulTriggerTile(terrain,3,3),'junction retained')

    // A second, independent check protects the emitter. An arrow wall in a
    // one-tile room partition turns a corridor into a false dead end even
    // though its pressure plate has multiple legal exits (save seed 1334870591).
    const wall = Array.from({length:9}, () => Array(9).fill('cavewall'))
    const x=4,y=4, dx=a[0],dy=a[1]
    wall[y][x]='dwarvenwall'
    wall[y+dx][x-dy]='dwarvenwall'
    wall[y-dx][x+dy]='dwarvenwall'
    wall[y+dy][x+dx]='marble'
    wall[y+2*dy][x+2*dx]='marble'
    wall[y-dy][x-dx]='marble'
    check(!DungeonTraps.usefulProjectileEmitterTile(wall,x,y,dx,dy),
      'arrow emitter cannot terminate a corridor against a walkable room')
    wall[y-dy][x-dx]='cavewall'
    check(DungeonTraps.usefulProjectileEmitterTile(wall,x,y,dx,dy),
      'properly backed perimeter-wall emitter remains eligible')
    wall[y-dy][x-dx]='dwarvenwall'
    check(DungeonTraps.usefulProjectileEmitterTile(wall,x,y,dx,dy),
      'thick stone-backed emitter remains eligible')
  }
  // Exact shape of the saved z:-5 incident: two corridor rows end in
  // a two-cell stone cap. Three local exits are not three useful routes.
  const culdesac=Array.from({length:13},()=>Array(17).fill('dwarvenwall'))
  for(let y=5;y<=6;y++)for(let x=2;x<=12;x++)culdesac[y][x]='marble'
  check(DungeonTraps.usefulTriggerTile(culdesac,11,5),'old validator accepts shallow pocket')
  check(!DungeonTraps.usefulThroughRoute(culdesac,11,5),'new validator rejects the dead end')
  check(DungeonTraps.usefulThroughRoute(culdesac,7,5),'middle of through-like passage remains available')
  return true
}

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
    const e=monster(abilities);enemies=[e];finishEnemyMove(e,10,12)
    check(abilities.includes('ethereal') ? e.hp===100 : e.hp<100,
      'ethereal creatures ignore spikes; ordinary and flying enemies are hit')
  }
  // The arrow must phase through a ghost and continue to a physical target.
  // Do this below using the normal projectile path, not a direct hit shortcut.
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
  // A fatal arrow must announce the damage before the death; drops and
  // credit still resolve in the same action.
  blocker.hp=1
  const oldLog=log, messages=[]
  log=text=>messages.push(text)
  DungeonTraps.onEntry(player,14,12)
  log=oldLog
  const impact=messages.findIndex(text=>text.includes('damage from a wall arrow'))
  const death=messages.findIndex(text=>text.includes('is killed by a trap'))
  check(impact>=0&&death>impact,'wall arrow damage precedes trap death message')
  const ghost=monster(['ethereal']);ghost.id='ghost-arrow';ghost.x=11;ghost.hp=100
  const physicalBehind=monster([]);physicalBehind.id='behind-ghost';physicalBehind.x=12
  enemies=[ghost,physicalBehind];DungeonTraps.onEntry(player,14,12)
  check(ghost.hp===100 && physicalBehind.hp<100,
    'ethereal ghosts do not intercept arrows; the next physical monster is hit')
  const freshBlocker=monster([]);freshBlocker.x=12;enemies=[freshBlocker]
  const blockedHp=freshBlocker.hp;groundItems=[{kind:'potion',x:11,y:12,level:-4,levelKind:'chain'}]
  DungeonTraps.onEntry(player,14,12);check(freshBlocker.hp===blockedHp,'ground item blocks arrow')
  groundItems=[];map[12][11]='dwarvendoorclosed';DungeonTraps.onEntry(player,14,12);check(freshBlocker.hp===blockedHp,'closed door blocks arrow')
  check(!UndergroundFov.canSee(map,10,12,12,12),'door blocks shared FOV')
  check(!UndergroundFov.canSee(map,8,12,10,12),'emitter retains wall sight blocking')
  check(!DungeonTraps.safeSpawn(15,12,-4)&&!DungeonTraps.safeSpawn(17,12,-4)&&DungeonTraps.safeSpawn(18,12,-4),'spawn exclusion radius')
  rng=oldRng
  return {movement:true,forced:true,flyingHitEtherealImmune:true,noKillCredit:true,projectileBlocking:true,pathfinding:true,fov:true}
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
    const requiredKeys=groundItems.filter(g=>g.level===z &&
      (g.kind==='dwarvenkey' || g.dungeonKey?.kind==='dwarvenkey'))
    const required=[...l.caves[0].entrances,...requiredKeys]
    if(dwarvenRuinsLiftShortcut())required.push(...[dwarvenRuinsLiftShortcut().upper,dwarvenRuinsLiftShortcut().lower].filter(p=>p.z===z))
    check(required.every(p=>reachable.has(keyXY(p.x,p.y))),'stairs, keys, lift accessible while avoiding every trap')
    for(const t of l.traps){
      check(DungeonTraps.isTrigger(l.map[t.trigger.y][t.trigger.x]),'mechanism has readable trigger')
      check(DungeonTraps.usefulThroughRoute(l.map,t.trigger.x,t.trigger.y),'final trigger is on a meaningful through-route')
      check(!groundItems.some(g=>g.level===z&&g.x===t.trigger.x&&g.y===t.trigger.y),'no ground object on trigger')
      check(enemies.filter(e=>e.level===z).every(e=>DungeonTraps.safeSpawn(e.x,e.y,z)),'no monster starts near trap')
      if(t.emitter){
        check(l.map[t.emitter.y][t.emitter.x]==='dwarvenarrowwall','projectile mechanism retains emitter')
        check(Math.abs(t.emitter.x-t.trigger.x)+Math.abs(t.emitter.y-t.trigger.y)>=1 &&
          Math.abs(t.emitter.x-t.trigger.x)+Math.abs(t.emitter.y-t.trigger.y)<=5,
          'wall-arrow plate is one to five tiles from emitter')
        // On the committed map the emitter has replaced the original wall;
        // test its backing separately without changing that tile.
        const {x,y}=t.emitter,{dx,dy}=t.direction
        check(['dwarvenwall','cavewall'].includes(l.map[y-dy]?.[x-dx]),
          'projectile emitter cannot point from a thin wall into a corridor dead end')
      }
    }
  }
  WORLD_SEED=seed;rngState=seed;await generateNewWorld();check(summarize()===original,'same seed reproduces mechanisms and terrain')
  const save=JSON.parse(JSON.stringify(buildSaveObject()));loadGameFromObject(save,{isReplayInit:true});check(summarize()===original,'all mechanisms survive save')
  cfg.levelCountRange=range
  return {seed,count,traps:deepLevels.slice(2).map(l=>l.traps.length)}
}
module.exports={trapCornerChecks,trapFixture,trapRuleChecks,trapPersistenceChecks,trapGenerationChecks}
