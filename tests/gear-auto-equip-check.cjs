const fs=require('node:fs'),path=require('node:path')
const {run,context}=require('./helpers/node-game-runtime.cjs')
async function main(){
  await run('loadContent()')
  context.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
  run('loadGameFromObject(fixture,{isReplayInit:true});log=()=>{}')
  run(fs.readFileSync(path.join(__dirname,'helpers/enemy-spell-checks.js'),'utf8'))
  run(fs.readFileSync(path.join(__dirname,'helpers/gear-auto-equip-checks.js'),'utf8'))
  run('gearAutoEquipShieldConflictCheck()')
  run('bowRequiresAmmunitionChecks()')
  console.log('PASS gear auto-equip conflict, no-ammo bow equip, save/load and shield cases')
  run('quickEquipBestLoadoutChecks()')
  await run(`(async () => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    const record=window.__quickEquipReplay,expected=window.__quickEquipExpected
    loadGameFromObject(record.initialState,{isReplayInit:true})
    replayPlaying=true;replaySimulationMode=true;replayAnimationsDisabled=true
    activeReplay=record;replayRngIndex=0
    try {
      for(const action of record.actions)await runReplayAction(action)
      check(player.equip.weapon?.base===expected.weapon&&
        player.equip.shield?.base===expected.shield&&turnCount===expected.turn,
        'replay reconstructs the full melee and shield loadout')
      check(replayRngIndex===record.rng.length,'quick loadout replays the same RNG stream')
    } finally {
      replayPlaying=false;replaySimulationMode=false;activeReplay=null
    }
  })()`)
  console.log('PASS best melee/ranged loadout shortcuts, turn cost, and deterministic replay')
}
main().catch(err=>{console.error(err.stack);process.exitCode=1})
