const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
const items = JSON.parse(fs.readFileSync(path.join(root, 'content/items.json'), 'utf8'))
const sourceBetween = (start, end) => {
  const from = html.indexOf(start)
  const to = html.indexOf(end, from)
  assert(from >= 0 && to > from, `game function section ${start} exists`)
  return html.slice(from, to)
}

const actions = []
let turns = 0
const env = {
  player: {x:3,y:4,inventory:[],equip:{blackkey:null}},
  map: Array.from({length:9}, () => Array(9).fill('grass')),
  groundItems: [], currentZ:0, currentCave:-1,
  TILE:{grass:{walk:true},water:{walk:false}},
  itemDefinition:kind=>items[kind] || null,
  isStackableKind:kind=>items[kind]?.stackable === true,
  currentLevelKind:()=>null,
  onCurrentLevel:g=>g.level === 0,
  canUseItemsWhileSwimming:()=>true,
  Mining:{isMineralKind:()=>false},
  cemeteryTombstones:{},keyXY:(x,y)=>`${x},${y}`,
  recordReplayAction:a=>actions.push({...a}),
  ensureReplayItemIds:()=>{},
  artifactDisplayName:item=>item.name,
  consumeItemTurn:()=>{turns++},
  spawnPickupAnim:()=>{},log:()=>{},
  structuredClone,console
}
vm.createContext(env)
// Use the actual gameplay functions while bypassing only the DOM and turn
// renderer. The forage section below ends just before unrelated tomb logic.
const drop = sourceBetween('  function canDropInventoryItem(', '  function itemIconPath(')
const forage = sourceBetween('  function lootSkeletonOrForage() {', '    if (tomb?.odd)')
vm.runInContext(`${drop}\n${forage}\n  }`, env)
const run = code => vm.runInContext(code, env)

assert.equal(items.bigbell.droppable, false)
assert.equal(items.wheelbarrow.droppable, false)
assert.equal(Object.entries(items).filter(([,i])=>i.droppable===false).length, 2)

env.player.inventory = [{kind:'amber',name:'Amber',count:3}]
run('dropInventoryItem(0);dropInventoryItem(0)')
assert.equal(env.player.inventory[0].count,1)
assert.equal(env.groundItems[0].kind,'droppeditem')
assert.equal(env.groundItems[0].item.count,2)
assert.equal(env.groundItems.length,1)
const serialized = JSON.parse(JSON.stringify(env.groundItems))
assert.equal(serialized[0].item.count,2,'nested floor stack survives JSON serialization')
run('lootSkeletonOrForage()')
assert.equal(env.groundItems.length,0)
assert.equal(env.player.inventory[0].count,3)
assert.equal(turns,3)
assert.deepEqual(actions.map(a=>a.action||a.type),['dropItem','dropItem','forage'])

const artifact={kind:'artifact',name:'Old sword',noun:'Sword',identified:false,
  curse:{everyTurns:8,types:['hp']},curseTimer:4}
env.player.inventory=[artifact]
run('dropInventoryItem(0)')
assert.equal(env.player.inventory.length,0)
assert.deepEqual(JSON.parse(JSON.stringify(env.groundItems[0].item)),artifact)
run('lootSkeletonOrForage()')
assert.deepEqual(JSON.parse(JSON.stringify(env.player.inventory[0])),artifact)

env.player.inventory=[{kind:'blackkey',name:'Black Key'}]
env.player.equip.blackkey=env.player.inventory[0]
run('dropInventoryItem(0)')
assert.equal(env.player.equip.blackkey,null)
assert.equal(env.groundItems[0].item.kind,'blackkey')

env.player.inventory=[{kind:'bigbell',name:'Brass Bell'},{kind:'wheelbarrow',name:'Wheelbarrow'}]
env.groundItems=[]
const before=turns
run('dropInventoryItem(0);dropInventoryItem(1)')
assert.equal(turns,before)
assert.equal(env.groundItems.length,0)
assert.equal(run("canDropInventoryItem({kind:'amber',name:'Amber',droppable:false})"),false)

env.player.inventory=[{kind:'herb',name:'Healing Herb',count:1}]
env.groundItems=[{kind:'chest',x:3,y:4,level:0}]
run('dropInventoryItem(0)')
assert.equal(turns,before,'occupied floor does not consume a turn')
assert.equal(env.player.inventory.length,1)

console.log('PASS actual inventory ground-drop, pickup, serialization, item restrictions and occupied-tile rules')
