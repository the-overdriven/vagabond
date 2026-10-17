const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const {run,context}=require('./helpers/node-game-runtime.cjs')
async function main(){
  await run('loadContent()')
  assert.equal(run('player.baseSpd'),5,'new characters start at 5 base SPD')
  for(const [name,speed] of [['Wolf',6],['Lich',5],['DRUSK',4],['Fungus',2]]){
    context.monsterName=name
    assert.equal(run('ENEMY_TEMPLATE_BY_NAME[monsterName].spd'),speed,
      name+' receives +2 base SPD')
  }
  context.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
  assert.equal(context.fixture.version,run('SAVE_VERSION'))
  run('loadGameFromObject(fixture,{isReplayInit:true})')
  assert.equal(run('player.baseSpd'),5,'current save retains new base SPD')
  const saved=JSON.parse(JSON.stringify(run('buildSaveObject()')))
  context.saved=saved
  run('loadGameFromObject(saved,{isReplayInit:true})')
  assert.equal(run('player.baseSpd'),5,'restoration does not reapply base SPD boost')
  assert.deepEqual(run('enemies.map(e=>e.spd)'),saved.enemies.map(e=>e.spd),'monster SPD persists without duplication')
  console.log('PASS new player and monster SPD, save and restore')
}
main().catch(error=>{console.error(error.stack);process.exitCode=1})
