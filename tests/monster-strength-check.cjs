'use strict'
// Run: node --test tests/monster-strength-check.cjs
const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {run, context} = require('./helpers/node-game-runtime.cjs')
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'saves/Tester_start.json'), 'utf8'))
const plain = value => JSON.parse(JSON.stringify(value))

test('HP-inclusive monster strength, permanent snapshots, records and current-save restoration', async () => {
  await run('loadContent()')
  context.fixture = fixture
  run('loadGameFromObject(fixture, {isReplayInit:true})')
  const beforeRng = run('rngState')
  for (const [atk, def, spd, grace, maxHp, expected] of [
    [5,2,5,3,20,17], [10,4,5,3,50,27], [15,6,6,3,84,38],
    [20,10,5,3,150,53], [30,15,7,4,300,86], [25,5,5,1,84,44],
    [25,5,5,1,85,45], [25.2243243,5,5,1,84,45]
  ]) {
    const stats = {atk,def,spd,grace,maxHp}
    assert.equal(run(`monsterLootStrength(${JSON.stringify(stats)})`), expected)
    assert.equal(run(`monsterStrength(${JSON.stringify(stats)})`), atk+def+spd+grace)
    assert.equal(run(`Highscores.strength(${JSON.stringify(stats)})`), atk+def+spd+grace)
  }
  const templates = plain(run('ENEMY_TEMPLATES'))
  for (const t of templates) {
    assert.equal(run(`baseMonsterLootStrength(ENEMY_TEMPLATE_BY_NAME[${JSON.stringify(t.name)}])`),
      Math.round(t.atk+t.def+t.spd+t.grace+t.hp/10), t.name)
  }
  assert.equal(run('rngState'),beforeRng,'strength rules consume no RNG')

  run(`globalThis.strengthEnemy = {name:'Champion Kobold',baseName:'Kobold',tier:1,
    humanoid:true,atk:10,def:4,spd:5,grace:3,hp:1,maxHp:50,gearScale:0.5,
    shooterAbility:null}`)
  assert.deepEqual(plain(run('enemyPermanentStats(strengthEnemy)')), {atk:10,def:4,spd:5,grace:3,maxHp:50})
  run(`applyEnemyEquipment(strengthEnemy,{kind:'weapon',base:'Sabre',atk:6,spd:3,grace:3,mod:'atk',modAmt:4})`)
  assert.deepEqual(plain(run('enemyPermanentStats(strengthEnemy)')), {atk:15,def:4,spd:5,grace:1.5,maxHp:50})
  run(`Object.assign(strengthEnemy,{hp:0,alarmed:true,artifactBlindAtkPenalty:5,artifactSunderStacks:10,
    artifactSlowUntilTurn:turnCount+20,artifactPetrified:true,sleeping:true})`)
  assert.deepEqual(plain(run('enemyPermanentStats(strengthEnemy)')), {atk:15,def:4,spd:5,grace:1.5,maxHp:50})
  run(`strengthEnemy.shooterAbility='shooterArrows';strengthEnemy.shotsRemaining=0;strengthEnemy.shooterMode='melee'`)
  assert.equal(run('enemyPermanentStats(strengthEnemy).atk'),5,'assigned ranged role ignores temporary attack mode and ammunition')
  run('strengthEnemy.artifactRangedDisarmed=true')
  assert.equal(run('enemyPermanentStats(strengthEnemy).atk'),15,'permanently disarmed shooter uses melee fallback')
  run(`removeEnemyEquipmentBonuses(strengthEnemy);strengthEnemy.equipment=null;strengthEnemy.gearBonuses=null;
    applyEnemyEquipment(strengthEnemy,{kind:'armor',base:'Hauberk',def:8,gracePenalty:1,mod:'hp',modAmt:20})`)
  assert.deepEqual(plain(run('enemyPermanentStats(strengthEnemy)')), {atk:10,def:8,spd:4,grace:2,maxHp:60})

  run(`player.strongestEnemyKilled=null;
    recordStrongestEnemyKill({name:'First Banshee',baseName:'Banshee',tier:4,atk:21.2,def:2,spd:4,grace:1.35,maxHp:84,hp:0});
    recordStrongestEnemyKill({name:'Second Banshee',baseName:'Banshee',tier:4,atk:21.289643402164803,def:2,spd:4,grace:1.3976985338144003,maxHp:84,hp:0})`)
  const first = plain(run('player.strongestEnemyKilled'))
  assert.equal(first.name,'First Banshee')
  assert.equal(first.strength,37)
  assert.equal(first.stats.maxHp,84)
  assert.deepEqual(plain(run('Graveyard.snapshotStrongestEnemyKill(player.strongestEnemyKilled)')),
    {name:'First Banshee',species:'Banshee',tier:4,strength:37,stats:{atk:21,def:2,spd:4,grace:1,maxHp:84}})
  assert.equal(run('monsterLootStrength(Graveyard.snapshotStrongestEnemyKill(player.strongestEnemyKilled).stats)'),36,
    'component rounding must not overwrite authoritative score')
  assert.deepEqual(plain(run('highscoreSnapshot().strongest_enemy_killed')),first)
  run(`recordStrongestEnemyKill({name:'Durable Banshee',baseName:'Banshee',tier:4,atk:20,def:2,spd:4,grace:1,maxHp:120,hp:0})`)
  const strongest = plain(run('player.strongestEnemyKilled'))
  assert.equal(strongest.name,'Durable Banshee')
  assert.equal(strongest.strength,39)
  context.savedStrength = plain(run('buildSaveObject()'))
  assert.equal(context.savedStrength.version,run('self.VAGABOND_SAVE_VERSION'))
  assert.deepEqual(context.savedStrength.player.strongestEnemyKilled,strongest)
  run('player.strongestEnemyKilled=null;loadGameFromObject(savedStrength,{isReplayInit:true})')
  assert.deepEqual(plain(run('player.strongestEnemyKilled')),strongest)
  assert.equal(run(`Graveyard.snapshotStrongestEnemyKill({...player.strongestEnemyKilled,stats:{...player.strongestEnemyKilled.stats,maxHp:NaN}})`),null)
  assert.equal(run(`Graveyard.snapshotStrongestEnemyKill({...player.strongestEnemyKilled,strength:39.1})`),null)
  // Both upload paths use the same normalized trophy, never the player's
  // four-stat leaderboard rank. Capture their requests without a network.
  context.uploads = []
  run(`OnlineSupabase.onlineAvailable=()=>true;
    OnlineSupabase.onlinePlayerId=()=> 'mock-player'; OnlineSupabase.newId=()=> 'mock-death';
    OnlineSupabase.getOnlineClient=async()=>({from:table=>({insert:async record=>{uploads.push({table,record});return {error:null}}})});
    player.lvl=2; player.highscoresDisqualified=false;player.godMode=false;
    Graveyard.recordDeath({strongest_enemy_killed:player.strongestEnemyKilled});
    Highscores.recordLevel(player,highscoreSnapshot)`)
  await new Promise(resolve=>setImmediate(resolve))
  assert.deepEqual(context.uploads.map(row=>row.table).sort(),['death_records','highscore_records'])
  for (const upload of context.uploads) assert.deepEqual(plain(upload.record.strongest_enemy_killed), strongest)
  assert.equal(Object.hasOwn(context.uploads.find(row=>row.table==='highscore_records').record,'strength'),false)

  // Exercise the actual death path, including non-player credit and pre-death snapshot.
  run(`OnlineSupabase.onlineAvailable=()=>false;loadGameFromObject(fixture,{isReplayInit:true});
    player.strongestEnemyKilled=null;log=()=>{};replayAnimationsDisabled=true;
    globalThis.trapVictim=enemies.find(e=>e.alive&&e.level===0&&e.baseName==='Giant Bat');
    trapVictim.hp=0;killEnemy(trapVictim,false,'trap')`)
  assert.equal(run('player.strongestEnemyKilled'),null)
  run(`globalThis.creditedVictim=enemies.find(e=>e.alive&&e.level===0&&e.baseName==='Goblin');
    creditedVictim.maxHp=125;creditedVictim.hp=0;globalThis.expectedKillStats=enemyPermanentStats(creditedVictim);
    killEnemy(creditedVictim,true,'arrow')`)
  assert.deepEqual(plain(run('player.strongestEnemyKilled.stats')),plain(run('expectedKillStats')))
  assert.equal(run('player.strongestEnemyKilled.strength'),run('monsterLootStrength(expectedKillStats)'))
  assert.throws(()=>run('loadGameFromObject({...fixture,version:fixture.version-1},{isReplayInit:true})'),/different game format/)

})
