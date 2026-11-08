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
  const meatDrops = {
  'Giant Rat':1,'Giant Bat':1,Boar:2,Wolf:1,Hogwyrm:2,Jackal:1,Hyena:1,Vulture:1,'Giant Toad':1,
  'Giant Crab':2,Murkspawn:1,Owlbear:3,Serpent:2,Lion:2,Chupacabra:1,Harpy:1,'White Tiger':2,
  'Bog Spitter':1,Thornmaw:1,Glaber:1,Tmusapod:1,Adelocosa:1,Barolg:1,Alacran:1,Amplyg:1,
  Wyvern:3,Manticore:2,Spineback:1,Marsutal:1,Trogloraptor:1,Sifulian:1,Akravis:1
}
  const templates=JSON.parse(JSON.stringify(run('ENEMY_TEMPLATES')))
  assert.equal(Object.keys(meatDrops).length,32)
  assert.equal(run('itemDefinition("meat").stackable'),true)
  assert.equal(run('itemDefinition("meat").sellValue'),2)
  assert.equal(run('itemDefinition("meat").icon'),null)
  assert.equal(run('itemIconHTML({kind:"meat"})'),'')
  for(const t of templates) {
    if (t.name in meatDrops) {
      assert.equal(t.humanoid,false,`${t.name} is not humanoid`)
      assert.deepEqual(t.lootTable,{chance:1,items:[{kind:'meat',weight:1,count:meatDrops[t.name]}]},
        `${t.name} has its exact guaranteed drop`)
      run(`player.inventory=[];chance=p=>p===1;lootFromEnemy({name:${JSON.stringify(t.name)},baseName:${JSON.stringify(t.name)},tier:${t.tier},humanoid:false})`)
      assert.equal(run('player.inventory.find(it=>it.kind==="meat")?.count'),meatDrops[t.name],
        `${t.name} gives exactly the configured quantity`)
    } else if (!t.humanoid) {
      assert.equal(t.lootTable?.items?.some(item=>item.kind==='meat')||false,false,
        `${t.name} must not drop meat`)
    }
  }
  run(`player.inventory=[];groundItems=[];chance=p=>p===1;
    lootFromEnemy({name:'Wyvern',baseName:'Wyvern',tier:4,humanoid:false,
      x:player.x,y:player.y,level:currentZ,levelKind:currentLevelKind(),caveIndex:currentCave},true)`)
  assert.equal(run('groundItems.filter(g=>g.item?.kind==="meat").length'),1,
    'the ground receives one stack rather than multiple entries')
  assert.equal(run('groundItems.find(g=>g.item?.kind==="meat")?.item.count'),3)
  run('const meatSave = buildSaveObject();loadGameFromObject(meatSave,{isReplayInit:true})')
  assert.equal(run('groundItems.find(g=>g.item?.kind==="meat")?.item.count'),3,
    'meat stack survives a save and load')
  run('lootSkeletonOrForage()')
  assert.equal(run('player.inventory.find(it=>it.kind==="meat")?.count'),3,
    'foraging picks up all three cuts in one action')
  assert.equal(run('groundItems.some(g=>g.item?.kind==="meat")'),false)
  console.log('PASS nymph/herb loot, meat drop stacks, and surface scroll composition')
})().catch(e=>{console.error(e.stack);process.exitCode=1})
