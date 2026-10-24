'use strict'

const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')

;(async()=>{
  await run('loadContent()')
  context.fixture=require('./saves/Tester_start.json')
  run(`loadGameFromObject(fixture,{isReplayInit:true});
    log=()=>{};player.inventory=[];
    currentZ=0;map=surfaceMap;replayRecording=false;`)

  const nymph=run('ENEMY_TEMPLATE_BY_NAME.Nymph')
  assert.equal(nymph.lootTable?.chance,0.2)
  assert.equal(nymph.lootTable.items.length,1)
  assert.equal(nymph.lootTable.items[0].kind,'herb')

  run(`chance=p=>p===0.2;
    lootFromEnemy({name:'Nymph',baseName:'Nymph',tier:2,equipment:null,humanoid:true});`)
  assert.equal(run('player.inventory.filter(i=>i.kind===\'herb\').length'),1,
    'nymph drops one herb on the successful configured independent roll')
  run(`player.inventory=[];chance=()=>false;
    lootFromEnemy({name:'Nymph',baseName:'Nymph',tier:2,equipment:null,humanoid:true});`)
  assert.equal(run('player.inventory.length'),0,'nymph may leave no herb')

  assert.equal(run('LOOSE_SCROLL_VARIANTS.chance'),0.75)
  assert.equal(run('LOOSE_CONSUMABLE_VARIANTS.chance'),0.4,
    'speed-potion tactical conversion remains unchanged')
  const rolls=JSON.parse(JSON.stringify(run(`(()=>{
    const previousRng=rng,previousChance=chance
    try {
      chance=p=>p===0.75
      return [0,0.51,0.9].map(value=>{
        rng=()=>value
        return rollLooseSupplyKind('scrollOfInvisibility')
      }).concat([rollLooseSupplyKind('speedpotion')])
    } finally {rng=previousRng;chance=previousChance}
  })()`)))
  assert.deepEqual(rolls,['idscroll','scrollOfFear','scrollOfChaos','speedpotion'],
    'the diversified scroll pool does not alter speed-potion conversions')
  assert.equal(run('rollLooseSupplyKind(\'herb\')'),'herb')
  const generated=JSON.parse(JSON.stringify(run(`(()=>{
    chance=p=>rng()<p
    return [67893,1663823486,12345].map(seed=>{
      const generate=()=>{
        rngState=seed
        return Array.from({length:WORLD_GEN_CONFIG.surfaceLoot.looseScrolls},
          ()=>rollLooseSupplyKind('scrollOfInvisibility'))
      }
      const first=generate(),second=generate()
      return {seed,first,second}
    })
  })()`)))
  for(const result of generated) {
    assert.equal(result.first.length,9,'world retains its original loose scroll budget')
    assert.deepEqual(result.first,result.second,'fixed seed reproduces the same supply table')
    assert(result.first.every(kind=>
      ['scrollOfInvisibility','idscroll','scrollOfFear','scrollOfChaos'].includes(kind)),
      'only approved scroll kinds appear in the converted slots')
  }
  const pickup=JSON.parse(JSON.stringify(run(`(()=>{
    const oldGround=groundItems,oldInventory=player.inventory
    const oldX=player.x,oldY=player.y,oldZ=currentZ,oldMap=map
    try {
      currentZ=0;map=surfaceMap;player.x=166;player.y=17;player.inventory=[]
      const oldTerrain=map[17][166],oldAdjacent=map[17][167]
      map[17][166]='ice';map[17][167]='ice'
      groundItems=[{x:166,y:17,kind:'idscroll'},
        {x:167,y:17,kind:'homecomingscroll'}]
      const beforeRng=rngState,beforeTurn=turnCount
      checkGroundAt(166,17)
      player.x=167;checkGroundAt(167,17)
      const result={kinds:player.inventory.map(it=>it.kind).sort(),
        remaining:groundItems.length,spentTurn:turnCount-beforeTurn,
        spentRng:rngState!==beforeRng}
      map[17][166]=oldTerrain;map[17][167]=oldAdjacent
      return result
    } finally {
      groundItems=oldGround;player.inventory=oldInventory
      player.x=oldX;player.y=oldY;currentZ=oldZ;map=oldMap
    }
  })()`)))
  assert.deepEqual(pickup,{kinds:['homecomingscroll','idscroll'],remaining:0,
    spentTurn:0,spentRng:false},'scrolls on surface ice can be collected without extra turns or RNG')
  console.log('PASS nymph herb loot and diversified surface scroll composition')
})().catch(e=>{console.error(e.stack);process.exitCode=1})
