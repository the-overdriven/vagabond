// Batch 6: tests of reusable immunity on the actual save/replay/combat code.
async function enemyImmunityRulesCheck() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  const old={chance,pick}
  try {
    setupEnemySpellArena()
    const e=makeSpellTestEnemy('Skeleton',['immunity','deathShield'],39,40)
    check(ENEMY_TEMPLATE_BY_NAME.Lich.abilities.includes('immunity'),'Lich opts into generic immunity')
    check(availableEnemySpells(e).includes('immunity'),'any species can use immunity')
    chance=p=>p===ENEMY_SPELL_CHANCE;pick=a=>a[0]
    check(tryEnemySpell(e),'immunity casts from the shared spell pool')
    check(e.immunityUsed&&enemyImmunityActive(e)&&e.immunityUntilTurn===5,'one-use immunity protects five actions')
    check(damageAnims.some(a=>a.amount==='Immune!'),'cast is animated')
    check(!availableEnemySpells(e).includes('immunity'),'cannot cast again while active')
    const hp=e.hp
    chance=()=>{throw Error('immune hit must not roll RNG')}
    await playerAttackEnemy(e)
    check(e.hp===hp&&!e.deathShieldUsed,'immunity blocks melee without spending Death Shield')
    check(damageAnims.filter(a=>a.amount==='Immune!').length>=2,'blocked hit has floating feedback')
    chance=()=>false
    for(let t=1;t<5;t++) {
      enemyTurn()
      check(enemyImmunityActive(e)&&e.immunityUntilTurn-turnCount===5-t,'five-turn immunity has correct remaining count at turn '+t)
      const before=e.hp
      await playerAttackEnemy(e)
      check(e.hp===before,'all five player attacks are absorbed')
    }
    enemyTurn()
    check(!enemyImmunityActive(e)&&e.immunityUntilTurn===0&&e.immunityUsed,'immunity expires after five spent turns')
    check(!availableEnemySpells(e).includes('immunity'),'one-use cast never becomes eligible again')
    chance=()=>false
    const before=e.hp
    await playerAttackEnemy(e)
    check(e.hp<before,'attacks work after immunity expires')
    e.hp=1;e.deathShieldUsed=false
    await playerAttackEnemy(e)
    check(e.hp===1&&e.deathShieldUsed,'death shield still works on first lethal hit after immunity')
    const snap=JSON.parse(JSON.stringify(buildSaveObject()))
    loadGameFromObject(snap,{isReplayInit:true})
    check(enemies[0].immunityUsed===true&&enemies[0].immunityUntilTurn===0,'spent immunity persists')
    setupEnemySpellArena()
    const ai=makeSpellTestEnemy('Skeleton',['immunity'],39,40)
    chance=p=>p===ENEMY_SPELL_CHANCE
    pick=options=>options[0]
    const playerHp=player.hp
    enemyTurn()
    check(ai.immunityUsed&&ai.immunityUntilTurn===turnCount+5&&player.hp===playerHp,
      'generic immunity cast by live AI replaces the adjacent melee attack')
  }finally{chance=old.chance;pick=old.pick}
}

function enemyImmunityTrapCheck() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  const oldRng=rng
  try {
    const level=trapFixture()
    level.traps=[{id:'spike',type:'spikes',trigger:{x:11,y:12}}]
    map[12][11]='dwarvenspikes'
    const e=addEnemy({id:'enemy_immunity_trap',name:'Skeleton',baseName:'Skeleton',abilities:['immunity','deathShield'],
      hp:40,maxHp:40,atk:2,def:1,spd:1,grace:2,aggro:2,tier:2,level:-4,levelKind:'chain',
      x:11,y:12,alive:true,aware:true,homeX:11,homeY:12,homeTileType:'marble',immunityUsed:true,immunityUntilTurn:turnCount+5})
    rng=()=>{throw Error('immune trap must not roll combat RNG')}
    DungeonTraps.onEntry(e,10,12)
    check(e.hp===40&&!e.deathShieldUsed&&e.alive,'spikes blocked before RNG; death shield remains')
    check(damageAnims.some(a=>a.amount==='Immune!'),'trap displays immunity effect')
    rng=()=>0.5
    e.immunityUntilTurn=0
    DungeonTraps.onEntry(e,10,12)
    check(e.hp<40,'spikes again deal damage after immunity ends')
  }finally{rng=oldRng}
}

async function enemyImmunityReplayCheck() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  const old={chance,pick}
  try {
    setupEnemySpellArena()
    const e=makeSpellTestEnemy('Skeleton',['immunity','deathShield'],39,40)
    chance=p=>p===ENEMY_SPELL_CHANCE;pick=a=>a[0]
    check(tryEnemySpell(e),'setup cast')
    chance=old.chance;pick=old.pick
    const start=JSON.parse(JSON.stringify(buildSaveObject()))
    loadGameFromObject(start,{isReplayInit:true})
    replayAnimationsDisabled=true
    check(enemies[0].immunityUntilTurn===5&&enemies[0].immunityUsed,'active deadline and consumed cast restore')
    const state=()=>JSON.stringify({turn:turnCount,player:[player.x,player.y,player.hp],
      foes:enemies.map(x=>[x.id,x.hp,x.immunityUntilTurn,x.immunityUsed,x.deathShieldUsed])})
    rngState=87
    startReplayRecording()
    const trace=[]
    for(let i=0;i<7;i++){
      await tryMove(-1,0)
      trace.push(state())
    }
    const expected=state(), saved=JSON.parse(JSON.stringify(buildSaveObject()))
    const tape=JSON.parse(JSON.stringify(replayData))
    check(tape.actions.length===7,'all blocked melee actions are replay recorded')
    loadGameFromObject(tape.initialState,{isReplayInit:true})
    replayAnimationsDisabled=true
    activeReplay=tape;replayPlaying=true;replayRecording=false;replaySimulationMode=true;replayAnimationsDisabled=true;replayRngIndex=0
    try{
      const actual=[]
      for(const action of tape.actions){await runReplayAction(action);actual.push(state())}
      check(JSON.stringify(trace)===JSON.stringify(actual),'every immunity frame of gameplay replays identically')
      check(replayRngIndex===tape.rng.length,'no replay RNG desync')
      check(state()===expected,'final state matches')
    }finally{replayPlaying=false;replaySimulationMode=false;activeReplay=null}
    loadGameFromObject(saved,{isReplayInit:true})
    check(state()===expected&&rngState===saved.rngState,'current save restores turn deadline and final state')
  }finally{chance=old.chance;pick=old.pick}
}
if(typeof module!=='undefined')module.exports={enemyImmunityRulesCheck,enemyImmunityTrapCheck,enemyImmunityReplayCheck}
