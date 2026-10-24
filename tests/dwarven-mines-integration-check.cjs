'use strict'
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const copy=value=>JSON.parse(JSON.stringify(value))

;(async()=>{
  await run('loadContent()')
  const cfg=copy(run('minePackageConfig().encounters'))
  const groups=cfg.groups
  const names=[...groups.early,...groups.middle,...groups.late]
  assert.equal(names.length,19)
  assert.equal(new Set(names).size,19,'all mine species are distinct')
  const templates=copy(run(`ENEMY_TEMPLATES.filter(t=>${JSON.stringify(names)}.includes(t.name))`))
  assert.equal(templates.length,19)
  for(const monster of templates){
    assert(monster.tier>=3&&monster.tier<=5&&monster.hp>0&&monster.atk>0)
    assert.equal(monster.humanoid,['Wyrdhag','Naledi','Troglodyte','Cave Troll'].includes(monster.name),
      'only the four mine humanoids carry normal gear')
    assert(!monster.biomes.includes('z-9'),'respite does not include mine species')
    assert(monster.abilities.every(ability=>typeof ability==='string'))
    assert(fs.existsSync(path.resolve(__dirname,'../img/enemies',monster.name.toLowerCase().replace(/ /g,'_')+'.jpg')),
      `Bestiary image exists for ${monster.name}`)
  }
  for(const [group,firstDepth] of [['early',10],['middle',11],['late',12]]) {
    assert(templates.filter(m=>groups[group].includes(m.name)).every(m=>
      m.biomes.length===1 && m.biomes[0]===`z-${firstDepth}`),
      `each ${group} species uses one minimum-depth biome`)
    for(const name of groups[group])for(const depth of [9,10,11,12,13])
      assert.equal(run(`enemyDepthBiomeEligible(ENEMY_TEMPLATE_BY_NAME[${JSON.stringify(name)}],-${depth})`),
        depth>=firstDepth,`${name} is eligible exactly at and below z:-${firstDepth}`)
  }
  assert(run('enemyDepthBiomeEligible(ENEMY_TEMPLATE_BY_NAME.Banshee,-7)'),
    'Banshee z-6 remains eligible on deeper Fort floors')
  assert(!run('enemyDepthBiomeEligible(ENEMY_TEMPLATE_BY_NAME.Banshee,-5)'),
    'Banshee cannot spawn above its Fort minimum depth')
  assert(!names.includes('Banshee')&&!names.includes('Ogre'),
    'Fort species are not included in the separate mine population groups')

  context.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
  context.fixture.version=run('SAVE_VERSION')
  run(`loadGameFromObject(fixture,{isReplayInit:true});
    log=()=>{};lootLog=()=>{};replayAnimationsDisabled=true;
    enemyIsVisibleOnMainView=()=>false;player.hp=playerMaxHp();
    enemies=[];occupied=new Set();groundItems=[];
    player.killsBySpecies={};player.totalXpEarned=0;player.x=40;player.y=40;
    currentZ=0;map=surfaceMap;map[40][42]='grass';
    const t=ENEMY_TEMPLATE_BY_NAME.Glaber;
    target=addEnemy({...t,baseName:t.name,level:0,levelKind:null,
      x:42,y:40,homeX:42,homeY:40,homeTileType:'grass',
      hp:t.hp,maxHp:t.hp,alive:true,prefix:null,equipment:null})`)
  const reward=run('xpForEnemy(target)')
  const expectedReward=run('Math.round(xpForEnemy(target)*xpMultiplier())')
  const prevXp=run('player.totalXpEarned')
  assert(reward>0)
  run('killEnemy(target,true)')
  assert.equal(run('player.totalXpEarned')-prevXp,expectedReward,'new species use normal race-adjusted XP formula')
  assert.equal(run('player.killsBySpecies.Glaber'),1,'new species enter the Bestiary')
  assert.equal(run('enemies.some(e=>e.id===target.id)'),false,'killed creature is removed')
  assert.equal(run('trackSpecies({baseName:"Glaber",name:"Glaber"})'),'Glaber')
  const prior=copy(run('player.killsBySpecies'))
  context.saved=copy(run('buildSaveObject()'))
  run('loadGameFromObject(saved,{isReplayInit:true})')
  assert.deepEqual(copy(run('player.killsBySpecies')),prior,'mine Bestiary records survive saves')
  assert.equal(run('player.totalXpEarned'),prevXp+expectedReward,'earned XP survives saves')
  console.log('PASS Batch E mine integration: 19 portraits, biome isolation, equipment, shared XP/loot kill path and Bestiary save')
})().catch(error=>{console.error(error.stack);process.exitCode=1})
