const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const root=path.resolve(__dirname,'..')
// Exercise global browser buffering and terminal forwarding without a browser.
let before,after,listen,taskArgs;const commandLog=[]
const support={beforeEach:fn=>before=fn,afterEach:fn=>after=fn,Cypress:{spec:{relative:'tests/e2e/example.cy.js'},on:(name,fn)=>{assert.equal(name,'window:before:load');listen=fn},log:entry=>commandLog.push(entry)},cy:{task:(name,data)=>{assert.equal(name,'logWorldGenerationSeeds');taskArgs=data;return null}}}
vm.runInNewContext(fs.readFileSync(path.join(root,'tests/support/e2e.js'),'utf8'),support)
before();const listeners={};listen({addEventListener:(name,fn)=>listeners[name]=fn})
for(const seed of [-1,12345])listeners['vagabond:world-generation']({detail:{seed,width:184,height:184,traits:['hollow_world']}})
after.call({currentTest:{fullTitle:()=> 'startup fails',state:'failed'}})
assert.deepEqual(Array.from(taskArgs.generations,g=>g.seed),[-1,12345]);assert.equal(taskArgs.state,'failed');assert.equal(commandLog.length,2)
before();taskArgs=null;after.call({});assert.equal(taskArgs,null,'tests without generation do not repeat old seeds')
// Exercise the actual config task and verify its output is useful in CI.
const output=[];let config,tasks
vm.runInNewContext(fs.readFileSync(path.join(root,'cypress.config.js'),'utf8'),{require:name=>{assert.equal(name,'cypress');return {defineConfig:c=>{config=c;return c}}},module:{exports:{}},console:{log:s=>output.push(s)}})
config.e2e.setupNodeEvents((name,handlers)=>{assert.equal(name,'task');tasks=handlers})
assert.equal(tasks.logWorldGenerationSeeds({spec:'example.cy.js',test:'startup',state:'failed',generations:[{seed:12345,width:184,height:184,traits:[]}]}),null)
assert(output[0].includes('[worldgen]')&&output[0].includes('"seed":12345')&&output[0].includes('"state":"failed"'))
// Exercise the real game entry point with image preparation forced to fail.
const {run,context}=require('./helpers/node-game-runtime.cjs')
;(async()=>{
 await run('loadContent()')
 const events=[];context.Cypress={};context.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail}};context.dispatchEvent=e=>events.push(e)
 const beforeRng=run('rngState');run("WORLD_SEED=-12345;CaveSilhouettes.prepare=async()=>{throw Error('expected preparation failure')}")
 await assert.rejects(run('generateNewWorld()'),/expected preparation failure/)
 assert.equal(events.length,1);assert.equal(events[0].detail.seed,-12345);assert.equal(run('rngState'),beforeRng)
 context.Cypress=undefined
 await assert.rejects(run('generateNewWorld()'),/expected preparation failure/)
 assert.equal(events.length,1,'normal gameplay emits no diagnostic events')
 console.log('PASS seed captured before failure, unchanged RNG, multiple seeds, failed-test CI output, buffer reset, no gameplay notification')
})().catch(e=>{console.error(e);process.exitCode=1})
