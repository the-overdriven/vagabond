const fs=require('node:fs'),path=require('node:path')
const {run,context}=require('./helpers/node-game-runtime.cjs')
async function main() {
  await run('loadContent()')
  context.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
  run('loadGameFromObject(fixture,{isReplayInit:true});log=()=>{}')
  run(fs.readFileSync(path.join(__dirname,'helpers/enemy-spell-checks.js'),'utf8'))
  for(const name of ['genericEnemySpellChecks','enemyDisarmChecks','enemyDispelChecks','enemySpellEligibilityChecks','enemySpellReplayChecks']) {
    await run(name+'()')
    console.log('PASS '+name)
  }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1})
