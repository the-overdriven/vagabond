const fs=require('node:fs'),path=require('node:path')
const {run,context}=require('./helpers/node-game-runtime.cjs')
async function main(){
  await run('loadContent()')
  context.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
  run('loadGameFromObject(fixture,{isReplayInit:true});log=()=>{}')
  run(fs.readFileSync(path.join(__dirname,'helpers/enemy-spell-checks.js'),'utf8'))
  run(fs.readFileSync(path.join(__dirname,'helpers/gear-auto-equip-checks.js'),'utf8'))
  run('gearAutoEquipShieldConflictCheck()')
  console.log('PASS gear auto-equip conflict, save/load, and one-handed/two-handed cases')
}
main().catch(err=>{console.error(err.stack);process.exitCode=1})
