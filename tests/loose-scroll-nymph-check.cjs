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
  assert.equal(nymph.lootTable?.[0]?.chance,0.2)
  assert.equal(nymph.lootTable[0].items.length,1)
  assert.equal(nymph.lootTable[0].items[0].kind,'herb')

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
      return [0,0.51,0.75,0.9].map(value=>{
        rng=()=>value
        return rollLooseSupplyKind('scrollOfInvisibility')
      }).concat([rollLooseSupplyKind('speedpotion')])
    } finally {rng=previousRng;chance=previousChance}
  })()`)))
  assert.deepEqual(rolls,['idscroll','scrollOfFear','scrollOfChaos','scrollOfFireball','speedpotion'],
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
      ['scrollOfInvisibility','idscroll','scrollOfFear','scrollOfChaos','scrollOfFireball'].includes(kind)),
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
  assert.equal(run('itemDefinition("meat").icon'),'img/icons/meat.svg')
  assert.ok(run('itemIconHTML({kind:"meat"})').includes('img/icons/meat.svg'))
  for(const t of templates) {
    if (t.name in meatDrops) {
      assert.equal(t.humanoid,false,`${t.name} is not humanoid`)
      assert.deepEqual(t.lootTable[0],{chance:1,items:[{kind:'meat',weight:1,count:meatDrops[t.name]}]},
        `${t.name} has its exact guaranteed drop`)
      run(`player.inventory=[];chance=p=>p===1;lootFromEnemy({name:${JSON.stringify(t.name)},baseName:${JSON.stringify(t.name)},tier:${t.tier},humanoid:false})`)
      assert.equal(run('player.inventory.find(it=>it.kind==="meat")?.count'),meatDrops[t.name],
        `${t.name} gives exactly the configured quantity`)
    } else if (!t.humanoid) {
      assert.equal(t.lootTable?.some(drop=>drop.items?.some(item=>item.kind==='meat'))||false,false,
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
  const materialDrops = {
  Snake:['shedSkin',0.50,1],Scarab:['chitin',0.40,1],'Giant Bug':['chitin',0.50,1],
  Witherpod:['blightedRoot',0.50,1],Cobra:['venomGland',0.55,1],
  Scorpion:['venomGland',0.60,1],Dreadling:['blightedRoot',0.45,1],
  'Giant Spider':['spiderSilk',0.70,1],NULK:['rareTrophy',1,1],
  SKELD:['rareTrophy',1,1],DRUSK:['rareTrophy',1,1],GAUR:['rareTrophy',1,1],
  ASHFANG:['rareTrophy',1,1],MIREHOWL:['rareTrophy',1,1],NHALUUN:['rareTrophy',1,1],
  Vrakeber:['amethyst',0.40,1],Bellroach:['chitin',0.65,1],
  Tholosum:['chitin',0.75,2],Xibal:['venomGland',0.60,1]
}
  assert.equal(Object.keys(materialDrops).length,19,'exactly nineteen selected non-meat species')
  const sellValues={shedSkin:4,chitin:5,blightedRoot:6,venomGland:10,spiderSilk:12,rareTrophy:60,amethyst:16}
  for (const [kind,value] of Object.entries(sellValues)) {
    assert.equal(run(`itemDefinition(${JSON.stringify(kind)})?.sellValue`),value,`${kind} trade value`)
    assert.equal(run(`itemDefinition(${JSON.stringify(kind)})?.stackable`),true,`${kind} is stackable`)
    if (kind!=='amethyst') {
      assert.equal(run(`itemDefinition(${JSON.stringify(kind)})?.icon`),`img/icons/${kind}.svg`,`${kind} artwork`)
      assert.ok(run(`itemIconHTML({kind:${JSON.stringify(kind)}})`).includes(`img/icons/${kind}.svg`),`${kind} uses its artwork`)
    }
  }
  for (const [species,[kind,probability,count]] of Object.entries(materialDrops)) {
    const template=templates.find(t=>t.name===species)
    assert(template && !template.humanoid,`${species} is non-humanoid`)
    assert.deepEqual(template.lootTable[0],{chance:probability,items:[{kind,weight:1,count}]},
      `${species} has the exact independent material drop chance and quantity`)
    run(`player.inventory=[];chance=p=>p===${probability};lootFromEnemy({name:${JSON.stringify(species)},
      baseName:${JSON.stringify(species)},tier:${template.tier},equipment:null,humanoid:false})`)
    assert.deepEqual(JSON.parse(JSON.stringify(run('player.inventory.map(i=>({kind:i.kind,count:i.count}))'))),
      [{kind,count}],`${species} awards the whole material stack`)
    run(`player.inventory=[];chance=()=>false;lootFromEnemy({name:${JSON.stringify(species)},
      baseName:${JSON.stringify(species)},tier:${template.tier},equipment:null,humanoid:false})`)
    assert.equal(run('player.inventory.length'),0,`${species} does not drop when the roll fails`)
    if (probability<1) {
      // Use the actual chance() and controlled RNG values at the precise boundary.
      run(`player.inventory=[];chance=p=>rng()<p;rng=()=>${probability-0.000001};
        lootFromEnemy({name:${JSON.stringify(species)},baseName:${JSON.stringify(species)},
          tier:${template.tier},equipment:null,humanoid:false})`)
      assert.equal(run(`player.inventory.some(i=>i.kind===${JSON.stringify(kind)})`),true,
        `${species} succeeds just below its chance threshold`)
      run(`player.inventory=[];rng=()=>${probability};
        lootFromEnemy({name:${JSON.stringify(species)},baseName:${JSON.stringify(species)},
          tier:${template.tier},equipment:null,humanoid:false})`)
      assert.equal(run(`player.inventory.some(i=>i.kind===${JSON.stringify(kind)})`),false,
        `${species} fails at its exact chance threshold`)
    }
  }
  // Successful rolls follow game RNG, including after save/load, without new state.
  const repeat=()=>JSON.parse(JSON.stringify(run(`(()=>{
    chance=p=>rng()<p;let results=[];rngState=859413
    for (const name of ['Snake','Scarab','Giant Spider','Tholosum','NULK','Vrakeber']) {
      player.inventory=[]
      const t=ENEMY_TEMPLATE_BY_NAME[name]
      lootFromEnemy({...t,baseName:name,equipment:null})
      results.push({name,inventory:player.inventory.map(i=>[i.kind,i.count])})
    }
    return {results,rngState}
  })()`)))
  assert.deepEqual(repeat(),repeat(),'identical seeds reproduce identical material drops')
  run(`player.inventory=[];groundItems=[];chance=p=>p===0.75;
    const t=ENEMY_TEMPLATE_BY_NAME.Tholosum
    const e={...t,baseName:'Tholosum',x:player.x,y:player.y,
      level:currentZ,levelKind:currentLevelKind(),caveIndex:currentCave,equipment:null}
    lootFromEnemy(e,true);lootFromEnemy(e,true)`)
  assert.equal(run('groundItems.filter(g=>g.item?.kind==="chitin").length'),1,
    'multiple two-chitin drops combine into one ground stack')
  assert.equal(run('groundItems[0].item.count'),4,'two Tholosums yield four chitin')
  run('const materialSave=buildSaveObject();loadGameFromObject(materialSave,{isReplayInit:true})')
  assert.equal(run('groundItems.find(g=>g.item?.kind==="chitin")?.item.count'),4,
    'material stack survives save/load and replay initialization')
  run('lootSkeletonOrForage()')
  assert.equal(run('player.inventory.find(i=>i.kind==="chitin")?.count'),4,
    'ground material is recovered as one inventory stack')
  assert.equal(run('groundItems.some(g=>g.item?.kind==="chitin")'),false)
  assert.equal(templates.find(t=>t.name==='Fungus').lootTable,undefined,
    'Fungus retains its dedicated mushroom drop with no alternate loot table')
  run(`player.inventory=[];chance=()=>false;rng=()=>0;
    lootFromEnemy({...ENEMY_TEMPLATE_BY_NAME.Fungus,baseName:'Fungus',equipment:null})`)
  assert.equal(run('player.inventory.find(i=>i.kind==="mushroom")?.count'),1,
    'Fungus still guarantees mushrooms even with every loot-table chance failing')
  assert.deepEqual(templates.find(t=>t.name==='Nymph').lootTable[0],
    {chance:0.2,items:[{kind:'herb',weight:1}]},'existing Nymph loot stays unchanged')
  assert.equal(templates.find(t=>t.name==='Wyrdhag').lootTable[0].chance,0.2,
    'existing Wyrdhag loot chance stays unchanged')
  assert.deepEqual(templates.find(t=>t.name==='Giant Spider').lootTable[1],
    {chance:0.55,items:[{kind:'venomGland',weight:1,count:1}]},
    'Giant Spider can drop venom independently of its silk')
  console.log('PASS nymph, Fungus, meat, alternative materials, seeded loot, stacking, save/replay, and scroll composition')
})().catch(e=>{console.error(e.stack);process.exitCode=1})
