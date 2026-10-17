// Deterministic rules, save/load and recorded replay; no browser presentation.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const {run,context} = require('./helpers/node-game-runtime.cjs')
async function main() {
  await run('loadContent()')
  run('originalChanceForSupport=chance')
  context.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
  context.fixture.version=run('SAVE_VERSION')
  function reset() {
    run(`(() => {loadGameFromObject(fixture,{isReplayInit:true});
      logHistory=[];log=m=>logHistory.push(m);chance=()=>false;
      enemyIsVisibleOnMainView=()=>true;
      currentZ=0;currentCave=-1;map=surfaceMap;spawnPoint={x:5,y:5};
      player.x=40;player.y=40;player.hp=5000;player.maxHp=5000;player.godMode=false;
      player.invisibleTurns=0;player.godInvisible=false;player.race='human';
      player.equip={weapon:null,armor:null,shield:null,blackkey:null};
      replayRecording=false;replayPlaying=false;replayData=null;replayAnimationsDisabled=true;
      enemies=[];occupied=new Set();npcs=[];turnCount=0;deathTransition=null;
      for(let y=30;y<=50;y++)for(let x=30;x<=50;x++){
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))}
      nextEnemyId=1;
      addSupportEnemy=(name,x,y,prefix=null)=>{
        const t=ENEMY_TEMPLATE_BY_NAME[name];if(!t)throw Error('missing '+name);
        const e=addEnemy({...t,baseName:name,name,x,y,hp:t.hp,maxHp:t.hp,
          alive:true,level:0,homeX:x,homeY:y,homeTileType:'grass',
          prefix,equipment:null,aware:true});
        occupied.add(keyXY(x,y));return e
      }
    })()`)
  }
  reset()
  for (const name of ['Gravehound','White Tiger']) {
    context.name=name
    assert(run('ENEMY_TEMPLATE_BY_NAME[name].abilities.includes("haste")'),name+' gains haste')
  }
  assert(run('ENEMY_TEMPLATE_BY_NAME.Nymph.abilities.includes("healSelf")'))
  reset();run('leader=addSupportEnemy("Orc",38,40,"Champion");ally=addSupportEnemy("Wolf",39,40);ally2=addSupportEnemy("Ratling",39,39);secondLeader=addSupportEnemy("Skeleton",38,39,"Champion")')
  const basic=run('ally.atk'),basicDef=run('ally.def')
  assert.equal(run('enemyAtk(ally)'),basic+2)
  assert.equal(run('enemyDef(ally)'),basicDef+1)
  assert.equal(run('enemyAtk(leader)'),run('leader.atk'),'Champion does not buff itself')
  assert(!run('tileInspectInfo(leader.x,leader.y).html.includes("Inspired aura")'),'Champion tooltip omits redundant aura')
  assert(run('tileInspectInfo(ally.x,ally.y).html.includes("Inspired")'),'followers retain Inspired tooltip')
  assert.equal(run('enemyDef(secondLeader)'),run('secondLeader.def'),'Champions do not buff other champions')
  run('secondLeader.alive=false');assert.equal(run('enemyAtk(ally)'),basic+2,'two simultaneous auras do not stack')
  run('leader.x=30;leader.y=30');assert.equal(run('enemyAtk(ally)'),basic,'leaving radius removes buff at once')
  assert.equal(run('enemyDef(ally)'),basicDef)
  run('leader.x=38;leader.y=40');assert.equal(run('enemyAtk(ally)'),basic+2)
  const supportSave=JSON.parse(JSON.stringify(run('buildSaveObject()')))
  const recipient=supportSave.enemies.find(e=>e.id===run('ally.id'))
  assert(!Object.hasOwn(recipient,'inspired'),'Derived aura does not persist on recipient')
  context.saved=supportSave
  run('loadGameFromObject(saved,{isReplayInit:true});ally=enemies.find(e=>e.id===saved.enemies.find(e=>e.baseName==="Wolf").id)')
  assert.equal(run('enemyAtk(ally)'),basic+2,'aura restored from leader proximity')
  run('leader=enemies.find(e=>e.prefix==="Champion" && e.baseName==="Orc");leader.hp=0;killEnemy(leader,false)')
  assert.equal(run('enemyAtk(ally)'),basic,'killing champion removes aura')
  assert(run("logHistory.some(m=>m.includes('followers lose their inspiration'))"),'loss logged')
  console.log('PASS Inspired: +2 ATK/+1 DEF, no stacking, immediate removal, save/load, logs')

  for (const name of ['Gravehound','White Tiger']) {
    reset(); context.name=name
    run('hasted=addSupportEnemy(name,36,40);turnCount=1;chance=p=>p===0.20')
    assert(run('tryEnemyHaste(hasted,4)'),name+' haste triggered')
    assert.equal(run('hasted.x'),38,'moves exactly two tiles')
    assert.equal(run('hasted.hasteReadyTurn'),7)
    assert(run("logHistory.some(m=>m.includes('unnatural haste'))"))
    const cdSave=JSON.parse(JSON.stringify(run('buildSaveObject()')))
    assert.equal(cdSave.enemies[0].hasteReadyTurn,7)
    context.saved=cdSave;run('loadGameFromObject(saved,{isReplayInit:true});hasted=enemies[0];turnCount=2;rolls=0;chance=()=>{rolls++;return true}')
    assert(!run('tryEnemyHaste(hasted,2)'),'distance 2 has no burst')
    assert(!run('tryEnemyHaste(hasted,3)'),'cooldown prevents reroll')
    assert.equal(run('rolls'),0,'no RNG consumed on ineligible turns')
    run('hasted.x=36;hasted.y=40;turnCount=7')
    assert(run('tryEnemyHaste(hasted,4)'),'ready after five complete cooldown turns')
    assert.equal(run('hasted.x'),38)
    console.log('PASS Haste:',name,'two-tile sprint, cooldown, no extra attacks, save/restore')
  }
  reset();run('hasted=addSupportEnemy("Gravehound",37,40);chance=()=>true;turnCount=1')
  assert(!run('tryEnemyHaste(hasted,3)') || run('hasted.x===39'),'burst cannot strike adjacent player')
  reset();run('hasted=addSupportEnemy("Gravehound",37,40);player.invisibleTurns=3;chance=()=>true;enemyTurn()')
  assert(run('hasted.x') <= 37,'invisible player is not chased (idle wandering is permitted)')
  reset();run('hasted=addSupportEnemy("Gravehound",37,40);spawnPoint={x:40,y:40};chance=()=>true;enemyTurn()')
  assert(run('hasted.x') < 37,'monster retreats rather than pursuing a protected player')
  reset();run('hasted=addSupportEnemy("Gravehound",37,40);chance=p=>p===0.20;enemyTurn()')
  assert.equal(run('hasted.x'),39,'real AI selects haste and makes two movement actions')
  assert.equal(run('turnCount'),1)
  console.log('PASS Haste: actual AI, invisibility and sanctuary gating')

  reset();run('nymph=addSupportEnemy("Nymph",39,40);nymph.hp=13;turnCount=1;chance=p=>p===0.25')
  assert(run('tryEnemyHealSelf(nymph)'))
  assert.equal(run('nymph.hp'),20,'7 HP restored')
  assert.equal(run('nymph.healSelfReadyTurn'),7)
  assert.equal(run('nymph.healSelfUsed'),true)
  assert(run("logHistory.some(m=>m.includes('healing magic'))"))
  const healSave=JSON.parse(JSON.stringify(run('buildSaveObject()')))
  assert.equal(healSave.enemies[0].healSelfUsed,true)
  context.saved=healSave;run('loadGameFromObject(saved,{isReplayInit:true});nymph=enemies[0];nymph.hp=1;turnCount=100;chance=()=>true')
  assert(!run('tryEnemyHealSelf(nymph)'),'once per lifetime through reload')
  assert.equal(run('nymph.hp'),1)
  reset();run('nymph=addSupportEnemy("Nymph",39,40);nymph.hp=14;chance=()=>true')
  assert(!run('tryEnemyHealSelf(nymph)'),'at exactly half HP it does not heal')
  reset();run('nymph=addSupportEnemy("Nymph",39,40);nymph.hp=13;chance=()=>true;enemyTurn()')
  assert.equal(run('nymph.hp'),20,'real adjacent combat AI uses self heal instead of attack')
  assert.equal(run('player.hp'),5000,'healing replaces attack')
  console.log('PASS HealSelf: HP threshold, once per lifetime, exactly one action, save/load')

  // Seeded replay, including both a heal attempt and a Champion buff in combat.
  reset();run(`rngState=10321;chance=()=>false;
    nymph=addSupportEnemy('Nymph',39,40);nymph.hp=13;
    leader=addSupportEnemy('Orc',38,39,'Champion');
    hasted=addSupportEnemy('Gravehound',36,40);
    player.hp=5000;startReplayRecording()`)
  // Restore seeded chance, not a fake RNG, for both original/replay action sequences.
  run('chance=originalChanceForSupport')
  await run('tryMove(0,1)');await run('tryMove(0,1)')
  const original=run('JSON.stringify({turn:turnCount,enemy:enemies.map(e=>[e.id,e.hp,e.x,e.y,e.hasteReadyTurn,e.healSelfUsed]),hp:player.hp})')
  const replay=JSON.parse(JSON.stringify(run('replayData')));assert(replay.actions.length>0)
  context.record=replay
  run(`loadGameFromObject(record.initialState,{isReplayInit:true});replayPlaying=true;
    replayRecording=false;replaySimulationMode=true;replayAnimationsDisabled=true;
    activeReplay=record;replayRngIndex=0;`)
  for(const action of replay.actions){context.action=action;await run('runReplayAction(action)')}
  assert.equal(run('JSON.stringify({turn:turnCount,enemy:enemies.map(e=>[e.id,e.hp,e.x,e.y,e.hasteReadyTurn,e.healSelfUsed]),hp:player.hp})'),original)
  assert.equal(run('replayRngIndex'),replay.rng.length,'all recorded random rolls replayed')
  console.log('PASS actual replay: two mixed enemy turns and equal combat state')
}
main().catch(err=>{console.error(err.stack);process.exitCode=1})
