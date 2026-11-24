'use strict'
const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const eq=(code,val,msg)=>assert.deepEqual(JSON.parse(JSON.stringify(run(code))),val,msg)
;(async()=>{
  await run('loadContent()')
  context.fixture=require('./saves/Tester_start.json')
  run(`globalThis.cleanC=()=>{loadGameFromObject(structuredClone(fixture),{isReplayInit:true});log=()=>{};
    replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;replaySimulationMode=false;
    enemies=[];npcs=[];groundItems=[];occupied=new Set();player.inventory=[];player.equip={weapon:null,shield:null,armor:null};
    player.race='human';player.hp=200;player.maxHp=200;player.baseAtk=10;player.swimming=10;player.godMode=false;player.invisibleTurns=0;
    player.rootTurns=0;player.poisonTurns=0;currentZ=0;map=surfaceMap;player.x=40;player.y=40;turnCount=0;
    for(let y=25;y<=55;y++)for(let x=25;x<=85;x++){map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))}
    player.wayfaring=ArtifactWayfaring.freshState();discovered.forEach(r=>r.fill(false));discoverPlayerSight('arrival');
    globalThis.sampleC=id=>makeArtifactTrinket('Feather',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id);
    globalThis.foeC=(name,x,y)=>{const t=ENEMY_TEMPLATE_BY_NAME[name];const e=addEnemy({...t,baseName:name,x,y,level:0,alive:true,hp:300,maxHp:300,aware:true,equipment:null,homeX:x,homeY:y,homeTileType:'grass'});occupied.add(keyXY(x,y));return e};
    };cleanC();globalThis.originalChance=chance;globalThis.originalRand=randInt;globalThis.actualPhase=resolveEnemyPhase;globalThis.phaseCalls=0;resolveEnemyPhase=()=>{phaseCalls++}`)
  // Longstrider counts only normal moves, and skips only the enemy response.
  run(`player.inventory=[sampleC('longstrider')];randInt=(a,b)=>a;player.poisonTurns=3;player.speedPotionTurns=10`)
  for(let i=0;i<4;i++) await run('tryMove(1,0)')
  eq('phaseCalls',4);eq('player.wayfaring.longstriderSteps',4)
  run(`map[40][45]='cavewall'`);await run('tryMove(1,0)');eq('player.wayfaring.longstriderSteps',4);eq('turnCount',4)
  run(`map[40][45]='grass';player.poisonTurns=2`);let hp=run('player.hp');await run('tryMove(1,0)')
  eq('phaseCalls',4);eq('turnCount',5);eq('player.poisonTurns',1);eq('player.hp',hp-1);eq('player.speedPotionTurns',5);eq('player.wayfaring.longstriderSteps',0);eq('player.wayfaring.longstriderThreshold',5)
  // Both powers use previous-turn discovery; opposing rolls cancel.
  run(`cleanC();player.inventory=[sampleC('never_look_back')];phaseCalls=0;chance=p=>p===.25;player.poisonTurns=2;player.speedPotionTurns=5;player.wayfaring.cooldowns.fake=10;player.wayfaring.discoveredPrevious=false;enemyTurn()`)
  eq('phaseCalls',2);eq('turnCount',1);eq('player.poisonTurns',1);eq('player.speedPotionTurns',4);eq('ArtifactWayfaring.cooldownRemaining("fake")',9)
  run(`chance=p=>p===.5;player.wayfaring.discoveredPrevious=true;enemyTurn()`);eq('phaseCalls',2);eq('turnCount',2);eq('player.poisonTurns',0)
  run(`player.inventory.push(sampleC('longstrider'));player.wayfaring.longstriderSkip=true;player.wayfaring.discoveredPrevious=false;chance=p=>p===.25;enemyTurn()`);eq('phaseCalls',3)
  eq('artifactIsCursed(sampleC("never_look_back"))',true)
  // Both identified and unidentified Never Look Back effects are log-only, even with animations enabled.
  for(const known of [true,false]) {
    run(`cleanC();player.inventory=[sampleC('never_look_back')];player.inventory[0].identified=${known};
      replayAnimationsDisabled=false;damageAnims=[];globalThis.phaseLogs=[];log=(message,tone)=>phaseLogs.push([message,tone]);
      player.wayfaring.discoveredPrevious=false;chance=p=>p===.25`)
    eq('ArtifactWayfaring.enemyPhases()',2)
    eq('phaseLogs',[[known?'Never Look Back gives enemies an additional turn!':'A strange power gives enemies an additional turn!','bad']])
    run('player.wayfaring.discoveredPrevious=true;chance=p=>p===.5')
    eq('ArtifactWayfaring.enemyPhases()',0)
    eq('phaseLogs[1]',[known?'Never Look Back quickens your actions!':'A strange power quickens your actions!','good'])
    eq('damageAnims.length',0)
    run(`player.inventory.push(sampleC('longstrider'));artifactAbilityMessage('longstrider','Longstrider grants a swift step!','A strange power quickens your step!')`)
    eq('damageAnims.map(p=>p.amount)',['Longstrider'])
  }
  // Real enemy AI: one adjacent ordinary foe receives two independent actions,
  // then none on a skipped phase. The same world still ticks poison once.
  run(`cleanC();resolveEnemyPhase=actualPhase;player.inventory=[sampleC('never_look_back')];globalThis.foe=foeC('Goblin',41,40);foe.abilities=[];foe.alarmed=true;
    globalThis.realEnemyAttack=enemyAttackPlayer;globalThis.attackCalls=0;enemyAttackPlayer=()=>{attackCalls++;return false};chance=p=>p===.25;enemyTurn()`)
  eq('attackCalls',2);eq('turnCount',1)
  run(`player.wayfaring.discoveredPrevious=true;chance=p=>p===.5;enemyTurn();enemyAttackPlayer=realEnemyAttack;resolveEnemyPhase=()=>phaseCalls++`)
  eq('attackCalls',2);eq('turnCount',2)

  // Real misses and movement controls; no stacking within one power, but one from each.
  run(`cleanC();player.inventory=[sampleC('windwalker')];player.equip.armor={kind:'artifact',artifactSlot:'armor',base:'Tunic',name:'Test',identified:true,abilityId:'elusive',def:1};globalThis.foe=foeC('Goblin',41,40);chance=()=>true;enemyAttackPlayer(foe,true);enemyAttackPlayer(foe,true)`)
  eq('player.wayfaring.windwalkerReady && player.artifactElusiveReady',true)
  await run('tryMove(-1,0)');eq('player.x',39);eq('turnCount',0);eq('player.wayfaring.windwalkerReady',false);eq('player.artifactElusiveReady',true)
  await run('tryMove(-1,0)');eq('player.x',38);eq('turnCount',0);eq('player.artifactElusiveReady',false)
  await run('tryMove(-1,0)');eq('turnCount',1)
  run(`player.wayfaring.windwalkerReady=true;chance=()=>false;enemyTurn()`);eq('player.wayfaring.windwalkerReady',false)
  // Prepared crits are single use and separate; no forced/other-floor or non-swimming triggers.
  run(`cleanC();player.inventory=[sampleC('skirmisher'),sampleC('tidefang')];foe=foeC('Goblin',41,40);chance=()=>false`)
  await run('tryMove(-1,0)');eq('player.wayfaring.skirmisherReady',true);eq('player.wayfaring.tidefangReady',false)
  // Equip a bow without consuming the preparation; actual shot consumes it on a miss.
  run(`player.equip.weapon=makeShortBowItem();player.inventory.push(createItem('arrows',{count:4}));chance=()=>true;shootEnemy(foe)`)
  eq('player.wayfaring.skirmisherReady',false)
  run(`player.wayfaring.skirmisherReady=true;globalThis.critRolls=[];chance=p=>{critRolls.push(p);return false};shootEnemy(foe)`)
  assert(run('critRolls.some(p=>Math.abs(p-(BASE_CRIT_CHANCE+.20))<1e-8)'),'actual bow shot includes Skirmisher critical chance')
  eq('player.wayfaring.skirmisherReady',false)
  run(`cleanC();player.inventory=[sampleC('tidefang')];map[40][40]='water';player.swimPosition={x:40,y:40,z:0};foe=foeC('Goblin',42,40);chance=()=>false`)
  await run('tryMove(1,0)');eq('player.wayfaring.tidefangReady',true)
  run(`globalThis.critRolls=[];chance=p=>{critRolls.push(p);return false}`);await run('playerAttackEnemy(foe)');assert(run('critRolls.some(p=>Math.abs(p-(BASE_CRIT_CHANCE+.20))<1e-8)'),'actual melee strike includes Tidefang critical chance');eq('player.wayfaring.tidefangReady',false)
  run(`player.x=40;map[40][40]='ice';player.wayfaring.tidefangReady=false;finishPlayerStep(41,40)`);eq('player.wayfaring.tidefangReady',false)
  // Root immunity applies to existing and incoming root. Pull is rounded, ATK-adjusted, and no distant melee hit.
  run(`cleanC();player.rootTurns=3;carryItem(sampleC('escape_artist'));foe=foeC('Dreadling',41,40);chance=()=>true;applyEnemyContactStatuses(foe)`);eq('player.rootTurns',0)
  run(`cleanC();player.inventory=[sampleC('escape_artist')];foe=foeC('Giant Spider',35,40);foe.aggro=6;player.baseAtk=enemyAtk(foe);randInt=(a,b)=>50;chance=p=>p===.70`)
  eq('ArtifactWayfaring.webPullDistance(foe,4)',2)
  hp=run('player.hp');eq('tryEnemyRush(foe)',true);eq('player.x',38);eq('player.hp',hp,'spider must not attack from distance three')
  run(`player.baseAtk=enemyAtk(foe)+20;player.x=40;randInt=(a,b)=>75`);eq('ArtifactWayfaring.webPullDistance(foe,4)',0)
  // Resistance feedback follows the entire Web! popup, even after a queued attack.
  for (const [animated, hidden, zero] of [[true,false,false],[true,true,true],[false,false,false]]) {
    run(`cleanC();player.inventory=[sampleC('escape_artist')];player.inventory[0].identified=${!hidden};
      foe=foeC('Giant Spider',35,40);foe.aggro=6;player.baseAtk=enemyAtk(foe)+${zero?20:0};
      randInt=(a,b)=>50;chance=p=>p===.70;clearEnemyAnims();damageAnims=[];projectileAnims=[];
      globalThis.pullLogs=[];log=message=>pullLogs.push(message);replayAnimationsDisabled=${!animated};
      queueEnemyAttackPresentation(500)`)
    eq('tryEnemyRush(foe)',true);eq('player.x',zero?40:38)
    eq('pullLogs.some(message=>message.includes("resists the pull")||message.includes("resist the pull"))',true)
    if(animated) {
      eq(`(() => {const web=damageAnims.find(p=>p.amount==='Web!'),
        resist=damageAnims.find(p=>p.amount===${JSON.stringify(hidden?'Magic!':'Escape Artist')});
        return !!web && !!resist && web.delay>SPIDER_WEB_THROW_MS &&
          resist.start+resist.delay>=web.start+web.delay+web.duration && resist.x===player.x})()`,true)
    } else eq('damageAnims.length',0)
  }
  // Persist the counters and both free steps. Replay real moves with unmocked RNG and AI.
  run(`cleanC();resolveEnemyPhase=actualPhase;randInt=originalRand;chance=originalChance;player.inventory=[sampleC('longstrider'),sampleC('never_look_back'),sampleC('windwalker'),sampleC('skirmisher')];
    player.equip.armor={kind:'artifact',artifactSlot:'armor',base:'Tunic',name:'Test',identified:true,abilityId:'elusive',def:1};
    player.wayfaring.windwalkerReady=true;player.artifactElusiveReady=true;player.wayfaring.skirmisherReady=true;player.wayfaring.longstriderThreshold=5;player.wayfaring.longstriderSteps=4;startReplayRecording()`)
  const initial=JSON.parse(JSON.stringify(run('buildSaveObject()')));context.initial=initial
  run('loadGameFromObject(structuredClone(initial),{isReplayInit:true})');eq('player.wayfaring.windwalkerReady && player.artifactElusiveReady && player.wayfaring.skirmisherReady',true)
  run('replayRecording=false;replayAnimationsDisabled=true;replaySimulationMode=false;startReplayRecording()')
  for(let i=0;i<15;i++)await run('tryMove(1,0)')
  const end=run('JSON.stringify({x:player.x,hp:player.hp,turn:turnCount,state:player.wayfaring,elusive:player.artifactElusiveReady})')
  const record=JSON.parse(JSON.stringify(run('replayData')));context.record=record;assert.equal(record.actions.length,15);const savedRng=run('rngState')
  run('globalThis.snapshotC=structuredClone(buildSaveObject());loadGameFromObject(snapshotC,{isReplayInit:true})')
  eq('JSON.stringify({x:player.x,hp:player.hp,turn:turnCount,state:player.wayfaring,elusive:player.artifactElusiveReady})',end);eq('rngState',savedRng)
  run('loadGameFromObject(structuredClone(record.initialState),{isReplayInit:true});activeReplay=record;replayRngIndex=0;replayPlaying=true;replayRecording=false;replayAnimationsDisabled=true;replaySimulationMode=true')
  for(const action of record.actions)await run(`runReplayAction(${JSON.stringify(action)})`)
  eq('JSON.stringify({x:player.x,hp:player.hp,turn:turnCount,state:player.wayfaring,elusive:player.artifactElusiveReady})',end);eq('replayRngIndex',record.rng.length)
  run(`cleanC();player.godArtifactStockGranted=false;grantGodArtifactStock()`)
  for(const id of ['longstrider','never_look_back','windwalker','skirmisher','tidefang','escape_artist'])eq(`merchantStock.filter(i=>i.godTestArtifact&&i.abilityId==='${id}').length`,1)
  console.log('PASS Batch C: six powers, enemy phases, world clocks, free-step stacking, root/web, stock, save and replay')
})().catch(e=>{console.error(e);process.exitCode=1})
