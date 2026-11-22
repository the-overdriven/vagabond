'use strict'
const fs=require('node:fs')
const {run,context}=require('./helpers/node-game-runtime.cjs')
context.stealthFixture=require('./saves/Tester_start.json')
;(async()=>{
  await run('loadContent()');run('log=()=>{}')
  run(fs.readFileSync(require.resolve('./helpers/wayfaring-stealth-checks.js'),'utf8'))
  await run('wayfaringStealthChecks(stealthFixture)')
  console.log('PASS Batch G: forest cover, observer cache, dodge, truce, stock, save and replay')
})().catch(err=>{console.error(err);process.exitCode=1})
