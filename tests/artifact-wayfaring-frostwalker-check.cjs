'use strict'
const fs=require('node:fs')
const {run,context}=require('./helpers/node-game-runtime.cjs')
context.frostFixture=require('./saves/Tester_start.json')
;(async()=>{
  await run('loadContent()');run('log=()=>{}')
  run(fs.readFileSync(require.resolve('./helpers/frostwalker-checks.js'),'utf8'))
  await run('frostwalkerChecks(frostFixture)')
  console.log('PASS Frostwalker: deadlines, force entry, drowning, shared maps, pathfinding, save and replay')
})().catch(err=>{console.error(err);process.exitCode=1})
