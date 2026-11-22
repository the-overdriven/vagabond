'use strict'
const fs=require('node:fs')
const {run,context}=require('./helpers/node-game-runtime.cjs')
context.scoutingFixture=require('./saves/Tester_start.json')
;(async()=>{
  await run('loadContent()');run('log=()=>{};sideMini.getClientRects=()=>[]')
  run(fs.readFileSync(require.resolve('./helpers/wayfaring-scouting-checks.js'),'utf8'))
  await run('wayfaringScoutingChecks(scoutingFixture)')
  console.log('PASS Batch H: connected scouting, remote scene vision, cave survey, stock, save and replay')
})().catch(err=>{console.error(err);process.exitCode=1})
