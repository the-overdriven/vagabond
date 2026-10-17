// Shared Node/Cypress rule tests for generic low-HP monster escape and sacrifice.
function enemySurvivalTeleportCheck() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  const original={chance,pick,rng}
  try {
    setupEnemySpellArena()
    const caster=makeSpellTestEnemy('Skeleton',['lowHpTeleport'],39,40)
    check(ENEMY_TEMPLATE_BY_NAME.Lich.abilities.includes('lowHpTeleport'),'Lich has generic escape spell')
    check(tileInspectInfo(caster.x,caster.y).html.includes('Low-HP Teleport'), 'ability is visible in inspected monster tooltip')
    check(!availableEnemySpells(caster).includes('lowHpTeleport'),'not eligible while healthy')
    caster.hp=Math.ceil(caster.maxHp*.25)
    check(!availableEnemySpells(caster).includes('lowHpTeleport'),'threshold is strictly below 25%')
    caster.hp=Math.ceil(caster.maxHp*.25)-1
    // Expand the arena and keep several isolated unsafe tiles nearby.
    for(let y=20;y<=60;y++)for(let x=20;x<=60;x++)map[y][x]='grass'
    const destinationChoices=lowHpTeleportDestinations(caster)
    check(destinationChoices.length>0,'connected safe destinations exist')
    check(destinationChoices.every(d=>isWalkable(d.x,d.y) &&
      Math.max(Math.abs(d.x-player.x),Math.abs(d.y-player.y)) >
      Math.max(LOW_HP_TELEPORT_MIN_DISTANCE,effectiveAggroRange(caster)+2)),
      'every destination lies strictly beyond effective aggro and minimum escape range')
    rng=()=>0.35 // Teleport's fixed 20% slice is [0.30, 0.50).
    pick=choices=>choices[0]
    caster.animStart=0;caster.attackStart=0;caster.hasteAnim={start:0,duration:10000}
    const before=turnCount, oldX=caster.x, oldY=caster.y
    check(tryEnemySpell(caster),'generic escape casts through spell pool')
    check(caster.lowHpTeleportUsed&&caster.x!==oldX&&caster.y!==undefined&&
      (caster.homeX!==oldX||caster.homeY!==oldY),'escapes once and updates return-home anchor')
    check(!occupied.has(keyXY(oldX,oldY))&&occupied.has(keyXY(caster.x,caster.y)),
      'occupancy is transferred, not duplicated')
    check(turnCount===before&&!caster.aware,'no extra game turn; pursuit is broken')
    check(caster.animStart===undefined&&caster.attackStart===undefined&&!caster.hasteAnim,'teleport clears old movement and attack visuals')
    check(damageAnims.some(a=>a.amount==='Vanished!')&&damageAnims.some(a=>a.amount==='Teleported!'),
      'visual text shows at both old and new tile')
    const saved=JSON.parse(JSON.stringify(buildSaveObject()))
    check(saved.enemies[0].lowHpTeleportUsed,'teleport usage is serialized')
    loadGameFromObject(saved,{isReplayInit:true})
    const restored=enemies[0]
    check(restored.lowHpTeleportUsed&&restored.homeX===restored.x&&restored.homeY===restored.y,
      'teleported location and used flag restore')
    check(!availableEnemySpells(restored).includes('lowHpTeleport'),'cannot teleport again after load')

    setupEnemySpellArena()
    const blocked=makeSpellTestEnemy('Skeleton',['lowHpTeleport'],39,40)
    blocked.hp=1
    // Temporarily narrow the map to a tiny connected component.
    for(let y=15;y<=65;y++)for(let x=15;x<=65;x++)map[y][x]='mountain'
    for(let y=39;y<=41;y++)for(let x=38;x<=41;x++)map[y][x]='grass'
    chance=()=>{throw Error('invalid escape must not consume a spell RNG roll')}
    check(!availableEnemySpells(blocked).includes('lowHpTeleport')&&!tryEnemySpell(blocked),
      'no reachable escape tile means no cast or RNG')
    // No player sanctuary escape and no teleport against invisibility.
    setupEnemySpellArena()
    const hider=makeSpellTestEnemy('Skeleton',['lowHpTeleport'],39,40);hider.hp=1
    player.invisibleTurns=5
    check(!tryEnemySpell(hider),'invisibility prevents targeted teleport cast')
  }finally{chance=original.chance;pick=original.pick;rng=original.rng}
}

function enemySurvivalSacrificeCheck() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  const original={chance,pick,rng}
  try {
    setupEnemySpellArena()
    const caster=makeSpellTestEnemy('Skeleton',['sacrifice'],39,40)
    const victim=makeSpellTestEnemy('Ghoul',[],37,40)
    check(ENEMY_TEMPLATE_BY_NAME.Lich.abilities.includes('sacrifice'),'Lich has generic sacrifice')
    caster.hp=Math.ceil(caster.maxHp*.5)
    check(!availableEnemySpells(caster).includes('sacrifice'),'no cast at exactly 50%')
    caster.hp=Math.ceil(caster.maxHp*.5)-1
    victim.hp=11
    const beforeHp=caster.hp, beforeKills=player.kills, beforeXp=player.totalXpEarned
    const beforeGround=groundItems.length
    const beforeTurn=turnCount
    rng=()=>0.10 // Sacrifice's fixed 30% slice is [0, 0.30).
    pick=opts=>opts[0]
    check(tryEnemySpell(caster),'sacrifice is available to other species')
    check(caster.hp===Math.min(caster.maxHp,beforeHp+11),'transfers victim current HP, capped by missing HP')
    check(!victim.alive&&!enemies.includes(victim),'victim removed')
    check(player.kills===beforeKills && player.totalXpEarned===beforeXp &&
      groundItems.length===beforeGround,'no XP, kill credit or generated loot')
    check(turnCount===beforeTurn && damageAnims.some(a=>a.amount==='Sacrificed!') &&
      damageAnims.some(a=>a.amount===`+${Math.min(caster.maxHp-beforeHp,11)} HP`),'same-turn animation and heal text')
    check(!availableEnemySpells(caster).includes('sacrifice'),'needs a fresh nearby victim')

    setupEnemySpellArena()
    const lich=makeSpellTestEnemy('Lich',['sacrifice'],39,40)
    lich.hp=30
    const guard=makeSpellTestEnemy('Goblin',['deathShield'],38,40)
    guard.hp=100;guard.maxHp=100;guard.carriedDungeonKey={keyId:'gate'}
    chance=()=>{throw Error('protected victim must not consume spell RNG')}
    check(!tryEnemySpell(lich),'critical key bearer cannot be sacrificed')
    guard.carriedDungeonKey=null
    guard.stolenItem={name:'stolen quest token'}
    check(!tryEnemySpell(lich),'stolen item remains recoverable')
    guard.stolenItem=null
    guard.immunityUsed=true;guard.immunityUntilTurn=turnCount+5
    check(!tryEnemySpell(lich),'immune victim cannot be sacrificed')
    guard.immunityUntilTurn=0
    oldHunterQuest={state:'active',type:'rare_hunt',targetEnemyId:guard.id}
    check(!tryEnemySpell(lich),'Old Hunter quest target cannot vanish')
    oldHunterQuest=null
    fishermanQuest={state:'active',targetId:guard.id}
    check(!tryEnemySpell(lich),'Fisherman quest target cannot vanish')
    fishermanQuest=null
    guard.x=20;guard.y=20
    check(!tryEnemySpell(lich),'distant monster out of range')
    guard.x=37;guard.y=40;map[40][38]='mountain'
    check(!tryEnemySpell(lich),'wall blocked target cannot be consumed')
    map[40][38]='grass'
    rng=()=>0.10 // Sacrifice's fixed 30% slice is [0, 0.30).
    pick=opts=>opts[0]
    check(tryEnemySpell(lich),'eligible target can be sacrificed after protections clear')
    check(!guard.alive&&!guard.deathShieldUsed,'sacrifice does not incorrectly spend Death Shield')
  }finally{chance=original.chance;pick=original.pick;rng=original.rng;oldHunterQuest=null;fishermanQuest=null}
}

async function enemySurvivalReplayCheck() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  setupEnemySpellArena()
  const lich=makeSpellTestEnemy('Lich',['lowHpTeleport','sacrifice'],39,40)
  const ally=makeSpellTestEnemy('Ghoul',[],38,40)
  lich.hp=25;ally.hp=1
  // Keep the player reasonably safe while recording attacks against the Lich.
  player.baseAtk=1;player.hp=5000;player.maxHp=5000
  for(let y=19;y<=61;y++)for(let x=19;x<=61;x++)map[y][x]='grass'
  rngState=5
  const state=()=>JSON.stringify({turn:turnCount,hp:player.hp,kills:player.kills,
    monsters:enemies.map(e=>[e.id,e.x,e.y,e.hp,e.alive,e.lowHpTeleportUsed,e.homeX,e.homeY])})
  startReplayRecording()
  const trace=[]
  for(let i=0;i<23;i++) {await tryMove(-1,0);trace.push(state())}
  check(trace.some(s=>JSON.parse(s).monsters.length===1),'actual seeded turns include sacrifice')
  check(trace.some(s=>JSON.parse(s).monsters.some(e=>e[5]===true)),'actual seeded turns include escape')
  const expected=state(),save=JSON.parse(JSON.stringify(buildSaveObject()))
  const recording=JSON.parse(JSON.stringify(replayData))
  loadGameFromObject(recording.initialState,{isReplayInit:true})
  replayPlaying=true;replayRecording=false;replaySimulationMode=true;replayAnimationsDisabled=true
  activeReplay=recording;replayRngIndex=0
  try {
    const actual=[]
    for(const action of recording.actions){await runReplayAction(action);actual.push(state())}
    check(JSON.stringify(actual)===JSON.stringify(trace),'replay matches every turn and both spell outcomes')
    check(state()===expected && replayRngIndex===recording.rng.length,'replay RNG stays synchronized')
  }finally{replayPlaying=false;replaySimulationMode=false;activeReplay=null}
  loadGameFromObject(save,{isReplayInit:true})
  check(state()===expected&&rngState===save.rngState,'current save restores final state and RNG')
}
// Survival is one fixed-probability roll (30% Sacrifice + 20% Teleport)
// before normal magic. An unavailable ability does not inherit that slice.
function enemySurvivalWeightsCheck() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  const original={rng,chance,pick}
  try {
    check(ENEMY_SPELL_CHANCE===0.20&&ENEMY_SURVIVAL_CAST_CHANCES.sacrifice===0.30&&
      ENEMY_SURVIVAL_CAST_CHANCES.lowHpTeleport===0.20,
      'survival roll gives sacrifice 30%, teleport 20%, regular spells 20% on fallback')
    const both=['sacrifice','lowHpTeleport']
    for (const [value,expected] of [[0,'sacrifice'],[0.29999,'sacrifice'],
      [0.30,'lowHpTeleport'],[0.49999,'lowHpTeleport'],[0.50,null],[0.999,null]]) {
      let rolls=0
      rng=()=>{rolls++;return value}
      check(rollEnemySurvivalSpell(both)===expected&&rolls===1,
        'fixed 30/20/50 distribution with one seeded RNG roll')
    }
    // Non-eligible choices are misses, rather than adding their probability
    // to the remaining spell; this matters especially above 25% HP.
    rng=()=>0.35
    check(rollEnemySurvivalSpell(['sacrifice'])===null,
      'lone sacrifice is 30% instead of an accidental 50%')
    rng=()=>0.10
    check(rollEnemySurvivalSpell(['lowHpTeleport'])===null,
      'lone teleport is 20% instead of an accidental 50%')
    rng=()=>0.15
    check(rollEnemySurvivalSpell(['sacrifice'])==='sacrifice',
      'sacrifice retains its fixed 30% when teleport is unavailable')
    rng=()=>0.40
    check(rollEnemySurvivalSpell(['lowHpTeleport'])==='lowHpTeleport',
      'teleport retains its fixed 20% when sacrifice is unavailable')
    rng=original.rng

    // Generic non-lich creature supports both survival and normal magic.
    setupEnemySpellArena()
    const caster=makeSpellTestEnemy('Skeleton',['sacrifice','weaken'],39,40)
    const victim=makeSpellTestEnemy('Ghoul',[],37,40)
    caster.hp=1
    rng=()=>0.75
    const attempts=[]
    chance=p=>{attempts.push(p);return p===ENEMY_SPELL_CHANCE}
    pick=choices=>choices[0]
    check(tryEnemySpell(caster) && player.weakenTurns===5 && victim.alive,
      'failed survival roll permits one ordinary cast')
    check(attempts.length===1 && attempts[0]===0.2,
      'normal magic checks its 20% gate only after survival fails')

    setupEnemySpellArena()
    const caster2=makeSpellTestEnemy('Skeleton',['sacrifice','weaken'],39,40)
    const victim2=makeSpellTestEnemy('Ghoul',[],37,40)
    caster2.hp=1
    rng=()=>0.10
    const successful=[]
    chance=p=>{successful.push(p);return false}
    check(tryEnemySpell(caster2) && !victim2.alive && player.weakenTurns===0,
      'survival cast preempts ordinary magic')
    check(successful.length===0,
      'successful survival uses entire action without ordinary spell roll')

    rng=original.rng
    setupEnemySpellArena()
    const healthy=makeSpellTestEnemy('Skeleton',['sacrifice','weaken'],39,40)
    rng=()=>{throw Error('healthy caster must not consume survival RNG')}
    const healthyChecks=[]
    chance=p=>{healthyChecks.push(p);return false}
    check(!tryEnemySpell(healthy) && healthyChecks.length===1 && healthyChecks[0]===0.2,
      'healthy caster rolls only ordinary spell gate')

    // One roll per monster action even when only a non-eligible slice is hit.
    rng=original.rng
    setupEnemySpellArena()
    const noVictim=makeSpellTestEnemy('Skeleton',['lowHpTeleport'],39,40)
    noVictim.hp=1
    for(let y=20;y<=60;y++)for(let x=20;x<=60;x++)map[y][x]='grass'
    let numberOfRolls=0
    rng=()=>{numberOfRolls++;return 0.1}
    chance=()=>{throw Error('no ordinary magic is available')}
    check(!tryEnemySpell(noVictim)&&numberOfRolls===1,
      'ineligible sacrifice slice yields no cast, and does not reroll teleport')
  } finally {rng=original.rng;chance=original.chance;pick=original.pick}
}
if(typeof module!=='undefined')module.exports={enemySurvivalTeleportCheck,enemySurvivalSacrificeCheck,enemySurvivalReplayCheck,enemySurvivalWeightsCheck}
