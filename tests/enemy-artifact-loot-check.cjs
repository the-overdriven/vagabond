'use strict'
// Integration at the synchronous death/Disarm hooks (no browser or animations).
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const fixture=require('./saves/Tester_start.json')
const plain=x=>JSON.parse(JSON.stringify(x))
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`)

test('enemy artifact probabilities, death and disarm, ownership, saves and replay',async()=>{
  await run('loadContent()')
  context.fixture=fixture
  run(`loadGameFromObject(fixture,{isReplayInit:true});log=()=>{};renderInventory=()=>{};replayAnimationsDisabled=true;replayRecording=false;
    globalThis.realChance=chance;globalThis.realRng=rng;
    globalThis.arena=()=>{
      currentZ=0;currentCave=-1;map=surfaceMap;enemies=[];npcs=[];groundItems=[];occupied=new Set();oldHunterQuest=null;
      player.x=40;player.y=40;player.hp=playerMaxHp();player.godMode=false;player.baseMf=10;player.inventory=[];
      player.equip={weapon:{kind:'artifact',artifactSlot:'weapon',base:'Dagger',name:'Testing',atk:8,grace:0,identified:true,abilityId:'disarm'},armor:null,shield:null,blackkey:null};
      for(let y=38;y<=43;y++)for(let x=38;x<=48;x++){map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))}
      chance=realChance;rng=realRng;
    };
    globalThis.makeTarget=(prefix='Brutal',kind='weapon')=>{
      const t=ENEMY_TEMPLATE_BY_NAME.Goblin;
      const e=addEnemy({...t,id:'loot-target',name:prefix?prefix+' Goblin':'Goblin',baseName:'Goblin',prefix,
        x:41,y:40,homeX:41,homeY:40,homeTileType:'grass',level:0,alive:true,hp:100,maxHp:100,
        atk:10,def:4,spd:5,grace:3,gearScale:.5,equipment:null,abilities:[],shooterAbility:null,shotsRemaining:0});
      occupied.add(keyXY(e.x,e.y));
      if(kind)applyEnemyEquipment(e,kind==='armor'?{kind:'armor',base:'Tunic',name:'Sturdy Tunic',tier:1,baseValue:30,def:4,mod:'def',modAmt:5}:
        {kind:'weapon',base:'Dagger',name:'Mighty Dagger',tier:1,baseValue:30,atk:2,grace:5,mod:'atk',modAmt:20,replayId:'physical_gear'});
      return e
    };
    globalThis.setLootThresholds=e=>{globalThis.preStrength=monsterLootStrength(enemyPermanentStats(e));globalThis.preGearChance=enemyGearArtifactChance(preStrength,playerMf());globalThis.preTrinketChance=enemyTrinketArtifactChance(preStrength,playerMf())};
    globalThis.artifacts=()=>[...player.inventory,...groundItems.map(g=>g.item)].filter(i=>i?.kind==='artifact')`)
  for(const strength of [20,30,40,50,60,80,100])for(const mf of [0,10,20]){
    close(run(`enemyGearArtifactChance(${strength},${mf})`),Math.min(.325,.0035*strength*Math.sqrt(strength/35)*(1+mf*.05)))
    close(run(`enemyTrinketArtifactChance(${strength},${mf})`),Math.min(.048,.00025*strength*(1+mf*.05)))
  }
  run("applyWorldTraits([WORLD_TRAITS.find(t=>t.name==='relic_world')],'L')")
  close(run('enemyArtifactWorldMultiplier()'),1.875)
  close(run('enemyGearArtifactChance(30,0)'),.0035*30*Math.sqrt(30/35)*1.875)
  close(run('enemyGearArtifactChance(100,100)'),.325)
  close(run('enemyTrinketArtifactChance(100,100)'),.09)
  run("applyWorldTraits([],'L')")

  // The existing two rolls apply on every depth and preserve the base odds.
  for(const [z,multiplier] of [[2,1],[0,1],[-1,1.02],[-2,1.04],[-3,1.06],[-4,1.08],[-5,1.1],[-10,1.1]]) {
    close(run(`enemyEquipmentDepthMultiplier(${z})`),multiplier)
    for (const tier of [1,2,3,4,5]) {
      const base=.45+tier*.03
      close(run(`enemyEquipmentRollChance({level:${z},tier:${tier},prefix:null})`),base*multiplier)
      close(run(`enemyEquipmentRollChance({level:${z},tier:${tier},prefix:'Brutal'},true,10)`),Math.min(.9,(base+.2)*multiplier))
    }
  }
  run(`WORLD_GEN_CONFIG.lootRules.enemyEquipmentPrefixMultipliers.Brutal=1.15`)
  close(run(`enemyEquipmentRollChance({level:-3,tier:3,prefix:'Brutal'})`),.54*1.06*1.15)
  close(run(`enemyEquipmentRollChance({level:-3,tier:3,prefix:null},false,0,'Brutal')`),.54*1.06*1.15)
  close(run(`enemyEquipmentRollChance({level:-3,tier:3,prefix:null})`),.54*1.06)
  close(run(`enemyEquipmentRollChance({level:-5,tier:5,prefix:'Brutal'},true,100)`),.9)
  run(`applyWorldTraits([WORLD_TRAITS.find(t=>t.name==='drought')],'L')`)
  close(run(`enemyEquipmentRollChance({level:-3,tier:3})`),(.45+.16+.09)*1.06)
  close(run(`enemyEquipmentRollChance({level:-3,tier:3},true,0)`),.54*1.06)
  run(`applyWorldTraits([],'L');arena();player.baseMf=0;
    globalThis.depthTargets=[]; globalThis.depthRolls=[];
    globalThis.oldMakeEnemyEquipment=makeEnemyEquipment;
    makeEnemyEquipment=()=>({kind:'weapon',base:'Dagger',name:'Dagger',tier:1,baseValue:30,atk:2,grace:5});
    for(let z=0;z>=-6;z--){
      const e=makeTarget(z%2===0?'Brutal':null,null);e.level=z;e.tier=3;depthTargets.push(e);
      chance=p=>{depthRolls.push(p);return false};prepareEnemyEquipment(e)
    }
    globalThis.wearer=makeTarget(null,null);wearer.level=-5;wearer.tier=3;
    chance=p=>{depthRolls.push(p);return true};prepareEnemyEquipment(wearer);
    globalThis.existingGear=wearer.equipment;prepareEnemyEquipment(wearer);
    globalThis.creature=makeTarget(null,null);creature.humanoid=false;creature.level=-5;prepareEnemyEquipment(creature);
    makeEnemyEquipment=oldMakeEnemyEquipment`)
  for(let i=0;i<7;i++)for(let j=0;j<2;j++)close(plain(run('depthRolls'))[i*2+j],.54*(1+Math.min(5,i)*.02))
  assert.equal(run('depthRolls.length'),15,'two rolls on failure, one on success, no rolls for existing gear or nonhumanoids')
  run(`for(const e of depthTargets)prepareEnemyEquipment(e)`)
  assert.equal(run('depthRolls.length'),15,'failed rolls are spent and cannot reroll')
  assert.ok(run('depthTargets.every(e=>e.equipmentPrepared)&&wearer.equipmentPrepared'))
  run(`arena();globalThis.preparedTarget=makeTarget(null,null);
    globalThis.oldHpMultiplier=WORLD_GEN_CONFIG.environment.humanoidHpMultiplier;
    WORLD_GEN_CONFIG.environment.humanoidHpMultiplier=1.2;
    globalThis.preparedHpBefore=preparedTarget.hp;
    chance=()=>false;prepareEnemyEquipment(preparedTarget);
    globalThis.preparedHpAfter=preparedTarget.hp;
    prepareEnemyEquipment(preparedTarget);
    WORLD_GEN_CONFIG.environment.humanoidHpMultiplier=oldHpMultiplier`)
  assert.equal(run('preparedTarget.hp'),run('preparedHpAfter'),'HP scales only once even after failed gear rolls')
  assert.equal(run('preparedHpAfter'),Math.round(run('preparedHpBefore')*1.2))
  run(`globalThis.preparedSnapshot=JSON.parse(JSON.stringify(buildSaveObject()));
    globalThis.preparedSaved=preparedSnapshot.enemies.find(e=>e.id===preparedTarget.id);
    loadGameFromObject(preparedSnapshot,{isReplayInit:true});
    globalThis.restoredPrepared=enemies.find(e=>e.id===preparedTarget.id);
    globalThis.restoredHp=restoredPrepared.hp;
    globalThis.restoredRng=rngState;
    prepareEnemyEquipment(restoredPrepared)`)
  assert.ok(run('preparedSaved.equipmentPrepared && restoredPrepared.equipmentPrepared && !restoredPrepared.equipment'))
  assert.equal(run('restoredPrepared.hp'),run('restoredHp'),'save and replay restore do not rescale HP')
  assert.equal(run('rngState'),run('restoredRng'),'save and replay restore do not reroll equipment')
  assert.ok(run('depthTargets.every(e=>!e.equipment)&&wearer.equipment===existingGear&&!creature.equipment'))
  assert.ok(run('enemyGearArtifactEligible(wearer,wearer.equipment)'))
  for(const tier of [1,2,3,4,5]){
    run(`arena();globalThis.target=makeTarget(null);target.tier=${tier};setLootThresholds(target);
      chance=p=>p===preGearChance;target.hp=0;killEnemy(target,true,'melee')`)
    assert.equal(run('target.gearArtifactConversionChecked'),tier>=3)
    assert.equal(run('artifacts().length'),tier>=3?1:0)
  }
  run(`arena();target=makeTarget(null);target.tier=3;setLootThresholds(target);
    chance=p=>p===artifactRule('disarm','chance')||p===preGearChance;artifactDisarmEnemy(target);
    applyEnemyEquipment(target,{kind:'armor',base:'Tunic',name:'Tunic',tier:1,baseValue:30,def:4});
    setLootThresholds(target);chance=p=>p===preGearChance;target.hp=0;killEnemy(target,true,'melee')`)
  assert.equal(run('target.gearArtifactConversionChecked'),true)
  assert.equal(run('artifacts().length'),1,'ordinary tier-3 disarm and death share one opportunity')

  // Both independent rewards and the original exact equipment instance.
  run(`arena();globalThis.target=makeTarget();globalThis.original=target.equipment;setLootThresholds(target);
    chance=p=>p===preGearChance||p===preTrinketChance;target.hp=0;killEnemy(target,true,'melee')`)
  assert.equal(run('target.gearArtifactConversionChecked'),true)
  assert.equal(run('artifacts().length'),2)
  assert.equal(run('artifacts().filter(i=>i.artifactSlot===\'trinket\').length'),1)
  assert.ok(run('artifacts().includes(original)&&original.modAmt===20&&original.tier===1&&!original.identified'))
  assert.equal(run('player.strongestEnemyKilled.strength'),run('preStrength'))
  assert.equal(run('player.equip.weapon.name'),'Testing','unknown artifact not auto-equipped')
  run('killEnemy(target,true,"melee")')
  assert.equal(run('artifacts().length'),2,'repeat death cannot duplicate')

  for(const cause of ['arrow','fireball','poison']){
    run(`arena();target=makeTarget();target.x=45;setLootThresholds(target);chance=p=>p===preGearChance||p===preTrinketChance;
      target.hp=0;killEnemy(target,true,${JSON.stringify(cause)})`)
    assert.equal(run('groundItems.filter(g=>g.item?.kind===\'artifact\').length'),2,cause+' distant ground loot')
    assert.equal(run('groundItems.filter(g=>g.item?.kind===\'artifact\').every(g=>g.x===45&&g.y===40&&g.level===0)'),true)
  }
  run(`arena();target=makeTarget();setLootThresholds(target);chance=p=>p===preGearChance||p===preTrinketChance;target.hp=0;killEnemy(target,false,'trap')`)
  assert.equal(run('target.gearArtifactConversionChecked'),false)
  assert.equal(run('artifacts().length'),1,'trap retains ordinary trinket roll only')
  assert.equal(run('artifacts()[0].artifactSlot'),'trinket')
  run(`arena();target=makeTarget(null,null);setLootThresholds(target);chance=p=>p===preTrinketChance;target.hp=0;killEnemy(target,true,'melee')`)
  assert.equal(run('artifacts().length'),1,'unprefixed and unarmed humanoid gets a trinket')
  assert.equal(run('target.gearArtifactConversionChecked'),false)
  run(`arena();target=makeTarget('Brutal','armor');setLootThresholds(target);chance=()=>false;target.hp=0;killEnemy(target,true,'melee')`)
  assert.equal(run('target.gearArtifactConversionChecked'),true)
  assert.equal(run('artifacts().length'),0)

  // The threshold is tested with the real strict less-than probability gate.
  run(`arena();target=makeTarget();setLootThresholds(target);rng=()=>preGearChance;tryEnemyGearArtifactConversion(target,target.equipment,preStrength,playerMf())`)
  assert.equal(run('target.gearArtifactConversionChecked'),true)
  assert.equal(run('target.equipment.kind'),'weapon')
  run(`arena();target=makeTarget();setLootThresholds(target);rng=()=>preGearChance-1e-8;tryEnemyGearArtifactConversion(target,target.equipment,preStrength,playerMf())`)
  assert.equal(run('target.equipment.kind'),'artifact')

  for(const success of [true,false]){
    run(`arena();target=makeTarget();original=target.equipment;setLootThresholds(target);
      chance=p=>p===artifactRule('disarm','chance')||(${success}&&p===preGearChance);artifactDisarmEnemy(target)`)
    assert.ok(run('target.gearArtifactConversionChecked&&target.equipment===null'))
    assert.equal(run('groundItems.find(g=>g.item===original).item.kind'),success?'artifact':'weapon')
    assert.equal(run('groundItems.filter(g=>g.item===original).length'),1)
    assert.ok(run('monsterLootStrength(enemyPermanentStats(target))<preStrength'),'pre-disarm equipment strength was included')
    // Re-equipping different gear, including across save/load, must not permit another roll.
    run(`applyEnemyEquipment(target,{kind:'shield',base:'Buckler',name:'Buckler',tier:1,baseValue:30,def:3});
      globalThis.midSave=JSON.parse(JSON.stringify(buildSaveObject()));loadGameFromObject(midSave,{isReplayInit:true});
      target=enemies.find(e=>e.id==='loot-target');replayAnimationsDisabled=true;setLootThresholds(target);
      chance=p=>p===artifactRule('disarm','chance')||p===preGearChance;artifactDisarmEnemy(target)`)
    assert.ok(run('target.gearArtifactConversionChecked&&target.equipment===null'))
    assert.equal(run('groundItems.find(g=>g.item?.base===\'Buckler\').item.kind'),'shield')
    run(`applyEnemyEquipment(target,{kind:'armor',base:'Tunic',name:'Tunic',tier:1,baseValue:30,def:4});setLootThresholds(target);
      chance=p=>p===preGearChance;target.hp=0;killEnemy(target,true,'melee')`)
    assert.equal(run('player.inventory.find(i=>i.base===\'Tunic\').kind'),'armor')
    assert.equal(run('artifacts().length'),success?1:0)
  }

  // Ineligible disarms and death candidates consume no conversion attempt.
  for(const kind of ['ordinary','artifact','stolen','quest','modeled','failed','special-name','ghost','mimic']){
    run(`arena();target=makeTarget(${JSON.stringify(kind==='ordinary'?null:kind==='special-name'?'Last Survivor':'Brutal')},${JSON.stringify(kind==='modeled'?null:'weapon')});
      if(${kind==='artifact'})convertEquipmentToArtifact(target.equipment,10);
      if(${kind==='stolen'}){target.stolenItem=structuredClone(target.equipment);target.stolenItemEquipped=true}
      if(${kind==='quest'})oldHunterQuest={id:'protected',type:'recover_item',state:'active',targetEnemyId:target.id,targetItemName:target.equipment.name};
      if(${kind==='modeled'}){target.shooterAbility='shooterArrows';target.shotsRemaining=5;target.shooterMode='ranged'}
      if(${kind==='ghost'})target.artifactSoulGhost=true;
      if(${kind==='mimic'})target.mimicLoot={gold:0,items:[]};
      chance=()=>${kind!=='failed'};artifactDisarmEnemy(target)`)
    assert.equal(run('target.gearArtifactConversionChecked'),false,kind)
    if(kind==='stolen'){
      assert.equal(run('target.stolenItem'),null,'separately restored thief item cleared after physical disarm')
      assert.equal(run('groundItems.filter(g=>g.item?.replayId===\'physical_gear\').length'),1)
      run('target.hp=0;chance=()=>false;killEnemy(target,true,"melee")')
      assert.equal(run('groundItems.filter(g=>g.item?.replayId===\'physical_gear\').length'),1)
    }
  }

  // Replay RNG tape and exact outcomes for actual disarm + later death;
  // test one seed producing success and one producing failure.
  for(const success of [true,false]){
    run(`arena();target=makeTarget();setLootThresholds(target);globalThis.testSeed=0;
      for(let n=1;n<10000;n++){rngState=n;if(realRng()<artifactRule('disarm','chance')&&((realRng()<preGearChance)===${success})){testSeed=n;break}}
      rngState=testSeed;globalThis.startingSnapshot=JSON.parse(JSON.stringify(buildSaveObject()));startReplayRecording();
      artifactDisarmEnemy(target);target.hp=0;killEnemy(target,true,'melee')`)
    assert.ok(run('testSeed>0'))
    const first=plain(run('({ground:groundItems,inventory:player.inventory,checked:target.gearArtifactConversionChecked})'))
    assert.equal(first.checked,true)
    assert.equal(first.ground.find(g=>g.item?.replayId==='physical_gear').item.kind,success?'artifact':'weapon')
    context.replayTape=plain(run('replayData.rng'))
    run(`loadGameFromObject(startingSnapshot,{isReplayInit:true});target=enemies.find(e=>e.id==='loot-target');replayAnimationsDisabled=true;
      replayPlaying=true;activeReplay={rng:replayTape};replayRngIndex=0;
      artifactDisarmEnemy(target);target.hp=0;killEnemy(target,true,'melee')`)
    assert.deepEqual(plain(run('({ground:groundItems,inventory:player.inventory,checked:target.gearArtifactConversionChecked})')),first)
    assert.equal(run('replayRngIndex'),context.replayTape.length)
    run('replayPlaying=false;activeReplay=null;replayRecording=false')
  }
})
