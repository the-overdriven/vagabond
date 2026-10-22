'use strict'

const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const plain=value=>JSON.parse(JSON.stringify(value))

;(async()=>{
  await run('loadContent()')
  context.fixture=require('./saves/Tester_start.json')
  run(`loadGameFromObject(fixture,{isReplayInit:true});
    enemies=[];occupied=new Set();turnCount=70;currentZ=0;currentCave=-1;map=surfaceMap;
    player.x=40;player.y=40;player.hp=1000;player.maxHp=1000;
    player.invisibleTurns=0;player.godMode=false;replayRecording=false;
    log=()=>{};spawnDamageNumber=()=>{};chance=()=>true;
    playerHiddenFromEnemy=()=>false;playerInsideSanctuary=()=>false;
    enemyInsideSanctuary=()=>false;
    for(let y=36;y<=45;y++)for(let x=36;x<=45;x++)map[y][x]='grass';
    const t=ENEMY_TEMPLATE_BY_NAME.Marsutal;
    globalThis.m=addEnemy({...t,name:t.name,baseName:t.name,
      x:42,y:40,homeX:42,homeY:40,level:0,alive:true,
      hp:t.hp,maxHp:t.hp,equipment:null});
    occupied.add(keyXY(42,40));`)
  assert(run('tryPrepareEnemyBurrow(m)'))
  run('player.x=42;player.y=40')
  context.prepared=plain(run('buildSaveObject()'))
  const resolve=miss=>plain(run(`(()=>{
    loadGameFromObject(prepared,{isReplayInit:true});
    log=()=>{};spawnDamageNumber=()=>{};playerInsideSanctuary=()=>false;
    enemyInsideSanctuary=()=>false;
    const buried=enemies.find(e=>e.baseName==='Marsutal');
    let accuracyChecks=0;
    chance=p=>{if(Math.abs(p-0.1)<0.001)accuracyChecks++;return ${miss}};
    turnCount=73;resolveEnemyTelegraphIfPending(buried);
    return {hp:player.hp,x:player.x,y:player.y,mx:buried.x,my:buried.y,
      pending:buried.pendingAbility,accuracyChecks,rngState};
  })()`))

  const hit=resolve(false)
  assert(hit.hp<1000,'fixed-accuracy collision applies real melee damage')
  assert.notDeepEqual([hit.x,hit.y],[42,40],'hit shoves the player')
  assert.deepEqual([hit.mx,hit.my],[42,40],'monster emerges at marked origin')
  assert.equal(hit.accuracyChecks,1,'the attack rolls exactly one 90% accuracy check')
  assert.equal(hit.pending,null)
  assert.deepEqual(resolve(false),hit,'same saved state replays an identical shove and RNG result')

  const missed=resolve(true)
  assert.equal(missed.hp,1000)
  assert.deepEqual([missed.x,missed.y],[42,40],'miss never shoves')
  assert.notDeepEqual([missed.mx,missed.my],[42,40],'miss cannot overlap player')
  assert.equal(missed.accuracyChecks,1,'miss also consumes only one attack')
  assert.equal(missed.pending,null)

  const waiting=plain(run(`(()=>{
    loadGameFromObject(prepared,{isReplayInit:true});
    log=()=>{};playerInsideSanctuary=()=>false;enemyInsideSanctuary=()=>false;
    const buried=enemies.find(e=>e.baseName==='Marsutal');
    for(const [dx,dy] of DIRS8)map[40+dy][42+dx]='cavewall';
    const hp=player.hp,random=rngState;
    turnCount=73;resolveEnemyTelegraphIfPending(buried);
    return {hp:player.hp,previousHp:hp,x:buried.x,y:buried.y,
      pending:buried.pendingAbility?.type,random,rngState};
  })()`))
  assert.deepEqual([waiting.x,waiting.y],[-1,-1],
    'zero walkable shove tiles keep the monster underground')
  assert.equal(waiting.pending,'burrow')
  assert.equal(waiting.hp,waiting.previousHp)
  assert.equal(waiting.rngState,waiting.random,'blocked shove does not consume RNG')
  console.log('PASS 90% Burrow collision, shove, miss, blocked fallback and save/replay')
})().catch(error=>{console.error(error.stack);process.exitCode=1})
