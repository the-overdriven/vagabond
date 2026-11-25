'use strict'
// Deterministic catalog, location-sensing and shared cooldown rules. No DOM.
const assert = require('node:assert/strict')
const {run,context} = require('./helpers/node-game-runtime.cjs')
const copy = expression => JSON.parse(JSON.stringify(run(expression)))
;(async () => {
  await run('loadContent()')
  context.fixture = require('./saves/Tester_start.json')
  run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});
    replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;
    player.inventory=[];player.equip={weapon:null,armor:null,shield:null};player.baseDef=10;
    currentZ=0;map=surfaceMap;player.x=40;player.y=40;turnCount=100;
    groundItems=[];npcs=[];enemies=[];occupied=new Set();
    treasureMapSpot=null;treasureMapUnearthed=false;dugSandTiles=new Set();
    globalThis.messages=[];log=t=>messages.push(t);
    globalThis.gem=id=>makeArtifactTrinket('Flint',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id);
    ArtifactGeomancy.resetDerivedState()`)
  assert.equal(run('ARTIFACT_ABILITIES.domains.geomancy.length'),15)
  const enabled=copy('ARTIFACT_ABILITIES.domains.geomancy.filter(id=>ARTIFACT_ABILITIES.abilities[id].enabled)')
  assert.deepEqual(enabled,['burst_bending','aftershock','petrify','lodestone','resonance','stonemaker','stone_circle','stonepress','cragbowl','earthmaw','grounding','sounding_stone','runic_fuse','runebound_aegis','spell_cairn'],
    'only completed powers enter the catalog')
  assert.deepEqual(copy("artifactDomains({kind:'artifact',artifactSlot:'trinket',noun:'Flint'}).sort()"),['geomancy','wayfaring'])
  assert.deepEqual(copy("artifactAbilityPool({kind:'artifact',artifactSlot:'trinket',noun:'Stone',tier:3})"), enabled)
  assert.equal(run("artifactAbilityPool({kind:'artifact',artifactSlot:'trinket',noun:'Feather',tier:3}).includes('lodestone')"),false)
  assert.equal(run("eligibleArtifactTrinketNouns(3).includes('Stone')"),true)
  assert.equal(run("makeArtifactItem(3,0,{nonGearOnly:true}).kind"),'artifact')
  run('player.inventory=[gem("lodestone")]')
  assert.equal(run('ArtifactGeomancy.syncLodestone()'),false)
  run(`groundItems=[{kind:'buriedgear',x:43,y:43,level:0,levelKind:'surface',item:null}];
    markPlayerPositionChanged()`)
  assert.equal(run('ArtifactGeomancy.buriedTreasureNearby()'),true, 'Chebyshev radius includes diagonal')
  assert.equal(run('messages.includes("Your Lodestone grows heavy.")'),true)
  run('markPlayerPositionChanged()')
  assert.equal(run('messages.filter(m=>m==="Your Lodestone grows heavy.").length'),1, 'no duplicate notifications')
  run('player.x=44;player.y=44;markPlayerPositionChanged()')
  assert.equal(run('ArtifactGeomancy.buriedTreasureNearby()'),true)
  run('dugSandTiles.add(keyXY(43,43));markPlayerPositionChanged()')
  assert.equal(run('ArtifactGeomancy.buriedTreasureNearby()'),false,'dug treasure no longer counts')
  assert.equal(run('messages.includes("The strange weight in your pack fades.")'),true)
  run('dugSandTiles.clear();groundItems[0].level=-1;markPlayerPositionChanged()')
  assert.equal(run('ArtifactGeomancy.buriedTreasureNearby()'),false,'same coordinates on different Z never count')
  run('groundItems=[];player.x=40;player.y=40;treasureMapSpot={x:42,y:39};markPlayerPositionChanged()')
  assert.equal(run('ArtifactGeomancy.buriedTreasureNearby()'),true,'actual marked treasure counts')
  run('treasureMapUnearthed=true;markPlayerPositionChanged()')
  assert.equal(run('ArtifactGeomancy.buriedTreasureNearby()'),false,'unearthed casket stops signal')
  // Saving/loading must derive the signal, not serialize a cached boolean or
  // produce a second popup on loading next to a real buried object.
  run(`treasureMapUnearthed=false;markPlayerPositionChanged();
    globalThis.saved=structuredClone(buildSaveObject());messages.length=0;
    loadGameFromObject(saved,{isReplayInit:true})`)
  assert.deepEqual(copy('messages'),[])
  assert.equal(run('ArtifactGeomancy.buriedTreasureNearby()'),true)
  assert.equal(run('ArtifactGeomancy.syncLodestone()'),true)
  assert.deepEqual(copy('messages'),[])
  // A dormant active ID cannot be used or generate cooldowns until delivered.
  assert.equal(run('ArtifactGeomancy.canActivate(0)'),false,
    'passive trinkets cannot be activated')
  run(`ARTIFACT_ABILITIES.abilities.resonance.enabled=true;
    player.inventory=[gem('resonance'),gem('resonance')];
    ARTIFACT_ABILITIES.abilities.stonemaker.enabled=true;
    ARTIFACT_ABILITIES.abilities.cragbowl.enabled=true;
    ARTIFACT_ABILITIES.abilities.earthmaw.enabled=true;
    player.wayfaring.cooldowns={earthmaw:turnCount+80,cragbowl:turnCount+12,
      rush:turnCount+100};`)
  const reduction=run('20+Math.floor(playerDef()/2)')
  assert.equal(run('ArtifactGeomancy.commitCooldown("stonemaker")'),true)
  assert.equal(run('ArtifactGeomancy.cooldownRemaining("stonemaker")'),500)
  assert.equal(run('ArtifactGeomancy.cooldownRemaining("earthmaw")'),80-reduction)
  assert.equal(run('ArtifactGeomancy.cooldownRemaining("cragbowl")'),Math.max(0,12-reduction))
  assert.equal(run('ArtifactWayfaring.cooldownRemaining("rush")'),100)
  assert.equal(run('ArtifactGeomancy.commitCooldown("stonemaker")'),false,'duplicate activation never pulses')
  assert.equal(run('ArtifactGeomancy.cooldownRemaining("earthmaw")'),80-reduction)
  run('player.inventory=[];player.wayfaring.cooldowns={earthmaw:turnCount+80}')
  assert.equal(run('ArtifactGeomancy.commitCooldown("stonemaker")'),true)
  assert.equal(run('ArtifactGeomancy.cooldownRemaining("earthmaw")'),80,'no Resonance artifact, no reduction')
  run(`ARTIFACT_ABILITIES.abilities.resonance.enabled=false;
    ARTIFACT_ABILITIES.abilities.stonemaker.enabled=false;
    ARTIFACT_ABILITIES.abilities.cragbowl.enabled=false;
    ARTIFACT_ABILITIES.abilities.earthmaw.enabled=false;`)
  // Petrify is a separate, absolute world-turn status. Weapon-only direct
  // hits may affect bosses; neither bare fists nor bows can petrify.
  run(`player.wayfaring=ArtifactWayfaring.freshState();turnCount=900;
    player.inventory=[{...gem('petrify'),identified:true}];
    player.equip.weapon=null;
    globalThis.geomancyFoe=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,
      name:'Goblin',baseName:'Goblin',level:0,levelKind:'surface',
      x:41,y:40,hp:75,maxHp:75,alive:true,isBoss:true});
    globalThis.savedChance=chance;chance=()=>true;`)
  assert.equal(run('playerHasArtifactAbility("petrify")'),true)
  assert.equal(run('ArtifactGeomancy.petrifyOnMelee(geomancyFoe,5)'),false,'bare fists do not qualify')
  run('player.equip.weapon={kind:"weapon",base:"Short Bow",rangedRange:6,atk:1}')
  assert.equal(run('ArtifactGeomancy.petrifyOnMelee(geomancyFoe,5)'),false,'bows in melee do not qualify')
  run('player.equip.weapon={kind:"weapon",base:"Short Sword",atk:5}')
  assert.equal(run('ArtifactGeomancy.petrifyOnMelee(geomancyFoe,0)'),false,'zero damage never qualifies')
  assert.equal(run('ArtifactGeomancy.petrifyOnMelee(geomancyFoe,5)'),true)
  assert.equal(run('geomancyFoe.geomancyPetrifiedUntil'),916)
  assert.equal(run('enemyImmunityActive(geomancyFoe)'),true)
  assert.equal(run('geomancyFoe.artifactPetrified'),false,'old Petrifying Strike remains independent')
  assert.equal(run('ArtifactGeomancy.petrifyOnMelee(geomancyFoe,5)'),false,'re-hits cannot extend status')
  const statueSave=copy('buildSaveObject()')
  assert.equal(statueSave.enemies.find(e=>e.id===run('geomancyFoe.id')).geomancyPetrifiedUntil,916)
  context.statueSave=statueSave
  context.statueId=run('geomancyFoe.id')
  run('loadGameFromObject(structuredClone(statueSave),{isReplayInit:true});globalThis.geomancyFoe=enemies.find(e=>e.id===statueId)')
  assert.equal(run('ArtifactGeomancy.petrified(geomancyFoe)'),true)
  run('turnCount=915;ArtifactGeomancy.tick()')
  assert.equal(run('ArtifactGeomancy.petrified(geomancyFoe)'),true,'last protected turn')
  run('turnCount=916;ArtifactGeomancy.tick()')
  assert.equal(run('ArtifactGeomancy.petrified(geomancyFoe)'),false,'expires on world turn, no animation')
  assert.equal(run('enemyImmunityActive(geomancyFoe)'),false)
  run('chance=savedChance')
  // Grounding belongs to the character until the next damaging direct hit,
  // but the suppressed ability belongs to only the struck enemy instance.
  run(`globalThis.priorEnemyPhase=resolveEnemyPhase;resolveEnemyPhase=()=>{};
    currentZ=0;map=surfaceMap;turnCount=1000;player.x=40;player.y=40;
    player.wayfaring=ArtifactWayfaring.freshState();player.groundingArmed=false;
    player.inventory=[{...gem('grounding'),identified:true}];
    enemies=[];occupied=new Set();
    globalThis.groundTarget=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,
      name:'Goblin',baseName:'Goblin',level:0,levelKind:'surface',x:41,y:40,
      hp:60,maxHp:60,alive:true,abilities:['charge','ethereal']});
    globalThis.otherGroundTarget=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,
      name:'Goblin',baseName:'Goblin',level:0,levelKind:'surface',x:42,y:40,
      hp:60,maxHp:60,alive:true,abilities:['charge']});
    messages.length=0`)
  assert.equal(run('ArtifactGeomancy.canActivate(0)'),true)
  const groundingBefore=copy('buildSaveObject()')
  context.groundingBefore=groundingBefore
  const groundingId=run('player.inventory[0].replayId')
  assert.equal(run('ArtifactGeomancy.activate(0)'),true)
  assert.equal(run('player.groundingArmed'),true)
  assert.equal(run('ArtifactGeomancy.canActivate(0)'),false,'cannot stack a prepared charge')
  assert.equal(run('ArtifactGeomancy.cooldownRemaining("grounding")'),499)
  assert.equal(run('messages.filter(m=>m.includes("Grounding gathers")).length'),1)
  const armedSave=copy('buildSaveObject()')
  assert.equal(armedSave.player.groundingArmed,true)
  context.armedSave=armedSave
  run('loadGameFromObject(structuredClone(armedSave),{isReplayInit:true})')
  assert.equal(run('player.groundingArmed'),true,'prepared hit survives reload')
  run('globalThis.groundTarget=enemies.find(e=>e.x===41 && e.y===40);globalThis.otherGroundTarget=enemies.find(e=>e.x===42 && e.y===40)')
  assert.equal(run('ArtifactGeomancy.groundingHit(groundTarget,0)'),false,'zero damage never discharges')
  assert.equal(run('ArtifactGeomancy.groundingHit(groundTarget,12)'),true)
  assert.equal(run('player.groundingArmed'),false)
  assert.deepEqual(copy('groundTarget.groundingLostAbilities'),['charge'])
  assert.equal(run('enemyHasAbility(groundTarget,"charge")'),false)
  assert.equal(run('enemyHasAbility(otherGroundTarget,"charge")'),true,'same species retains the ability')
  assert.equal(run('groundTarget.abilities.includes("charge")'),true,'species catalog is unchanged')
  const groundingSave=copy('buildSaveObject()')
  assert.deepEqual(groundingSave.enemies.find(e=>e.id===run('groundTarget.id')).groundingLostAbilities,['charge'])
  context.groundingSave=groundingSave
  run('loadGameFromObject(structuredClone(groundingSave),{isReplayInit:true})')
  assert.equal(run('enemyHasAbility(enemies.find(e=>e.x===41 && e.y===40),"charge")'),false,
    'disabled power persists after loading')
  run(`player.groundingArmed=true;
    globalThis.noSkillEnemy=enemies.find(e=>e.x===42 && e.y===40);
    noSkillEnemy.abilities=['ethereal'];`)
  const noSkillRng=run('rngState')
  assert.equal(run('ArtifactGeomancy.groundingHit(noSkillEnemy,5)'),true)
  assert.equal(run('player.groundingArmed'),false)
  assert.equal(run('rngState'),noSkillRng,'discharge with no active skill does not roll RNG')
  context.groundingAction={type:'useItem',action:'geomancyPower',replayId:groundingId}
  run('loadGameFromObject(structuredClone(groundingBefore),{isReplayInit:true})')
  await run('runReplayAction(groundingAction)')
  assert.equal(run('player.groundingArmed'),true,'replay also prepares charge')
  assert.equal(run('ArtifactGeomancy.cooldownRemaining("grounding")'),499)
  // Earthmaw uses the shared 3D world: no map swap, alternate landing or
  // clone of the enemy. Buried actors reserve their original target cell.
  run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});
    replayAnimationsDisabled=true;replayRecording=false;replayPlaying=false;
    globalThis.earthEnemyPhase=resolveEnemyPhase;resolveEnemyPhase=()=>{};
    player.wayfaring=ArtifactWayfaring.freshState();player.inventory=[];
    player.x=40;player.y=40;player.hp=playerMaxHp();
    currentZ=0;map=surfaceMap;currentCave=-1;turnCount=1500;
    enemies=[];npcs=[];groundItems=[];occupied=new Set();
    for(let y=38;y<=42;y++)for(let x=38;x<=44;x++) surfaceMap[y][x]='grass';
    undergroundMap[40][41]='cavefloor';caveMaps[0][40][41]='cavefloor';
    ARTIFACT_ABILITIES.abilities.earthmaw.enabled=true;
    player.inventory=[{...makeArtifactTrinket('Stone',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,'earthmaw'),identified:true}];
    globalThis.earthFoe=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,
      name:'Goblin',baseName:'Goblin',tier:1,level:0,levelKind:'surface',
      x:41,y:40,hp:87,maxHp:87,alive:true,
      groundingLostAbilities:['charge'],equipment:{kind:'weapon',base:'Club'}});
    globalThis.earthId=earthFoe.id;
    ensureReplayItemIds();
    globalThis.earthBefore=structuredClone(buildSaveObject());
    globalThis.earthOriginalChance=chance;
    globalThis.earthChanceRolls=[];
    chance=p=>{earthChanceRolls.push(p);return p===.2};
    globalThis.earthMessages=[];log=msg=>earthMessages.push(msg);
    ensureReplayItemIds();`)
  run("surfaceMap[43][43]='grass';surfaceMap[43][44]='grass'")
  assert.equal(run('ArtifactGeomancy.earthmawEligible({...earthFoe,x:43,y:43})'),true,
    'Earthmaw reaches the corner three tiles away')
  assert.equal(run('ArtifactGeomancy.earthmawEligible({...earthFoe,x:44,y:43})'),false,
    'Earthmaw stops before the fourth tile')
  assert.equal(run('ArtifactGeomancy.canActivate(0)'),true)
  assert.equal(run('ArtifactGeomancy.activate(0)'),true)
  assert.equal(run('turnCount'),1501,'one action, independent of swallowed targets')
  assert.deepEqual(copy('earthChanceRolls'),[.1,.2],
    'one resistance roll and one legal lower-floor transfer roll')
  assert.equal(run('earthFoe.level'),-1)
  assert.equal(run('earthFoe.levelKind'),'chain')
  assert.equal(run('earthFoe.caveIndex'),0)
  assert.equal(run('earthFoe.x===41 && earthFoe.y===40'),true,
    'no XY translation is allowed during transfer')
  assert.ok(run('earthFoe.hp>=77 && earthFoe.hp<=82 && earthFoe.alarmed'))
  assert.deepEqual(copy('earthFoe.groundingLostAbilities'),['charge'])
  assert.equal(run('earthFoe.equipment.base'),'Club')
  assert.equal(run('earthFoe.id===earthId'),true)
  assert.equal(run('earthFoe.geomancyBuriedUntil'),1504)
  assert.equal(run('earthMessages.filter(m=>m.includes("Earthmaw shakes")).length'),1)
  assert.equal(run('earthMessages.some(m=>/lost to the depths|fell below/.test(m))'),false)
  assert.equal(run('ArtifactGeomancy.cooldownRemaining("earthmaw")'),499)
  assert.equal(run('occupied.has(keyXY(41,40))'),false,
    'the surface source square is released when transferred')
  assert.equal(run('earthFoe.alive'),true,'transfer is not a kill or loot event')
  const firstEarthOutcome=copy(`({turnCount,rngState,
    foe:{id:earthFoe.id,level:earthFoe.level,levelKind:earthFoe.levelKind,
      x:earthFoe.x,y:earthFoe.y,hp:earthFoe.hp,
      geomancyBuriedUntil:earthFoe.geomancyBuriedUntil},
    cooldown:ArtifactGeomancy.cooldownRemaining('earthmaw')})`)
  context.earthAction={type:'useItem',action:'geomancyPower',idx:0,
    replayId:run('player.inventory[0].replayId')}
  run(`loadGameFromObject(structuredClone(earthBefore),{isReplayInit:true});
    globalThis.earthFoe=enemies.find(e=>e.id===earthId);`)
  await run('runReplayAction(earthAction)')
  assert.deepEqual(copy(`({turnCount,rngState,
    foe:{id:earthFoe.id,level:earthFoe.level,levelKind:earthFoe.levelKind,
      x:earthFoe.x,y:earthFoe.y,hp:earthFoe.hp,
      geomancyBuriedUntil:earthFoe.geomancyBuriedUntil},
    cooldown:ArtifactGeomancy.cooldownRemaining('earthmaw')})`),firstEarthOutcome,
    'replaying Earthmaw from the same snapshot restores exact Z, ID, RNG and turn')
  const earthSave=copy('buildSaveObject()')
  context.earthSave=earthSave
  run(`loadGameFromObject(structuredClone(earthSave),{isReplayInit:true});
    globalThis.earthFoe=enemies.find(e=>e.id===earthId);
    currentZ=-1;map=undergroundMap;currentCave=0;
    rebuildActiveLevelOccupancy();`)
  assert.equal(run('occupied.has(keyXY(41,40))'),true,
    'buried lower-floor occupant reserves the exact landing after load')
  assert.equal(run('ArtifactGeomancy.buried(earthFoe)'),true)
  assert.equal(run('enemyCanBeSeen(earthFoe)'),false)
  assert.equal(run('enemyImmunityActive(earthFoe)'),true)
  assert.equal(run('ArtifactGeomancy.earthmawTargets().length'),0)
  run('turnCount=1503;ArtifactGeomancy.tick()')
  assert.equal(run('ArtifactGeomancy.buried(earthFoe)'),true,
    'the target remains unavailable through its third turn')
  run('turnCount=1504;ArtifactGeomancy.tick()')
  assert.equal(run('ArtifactGeomancy.buried(earthFoe)'),false)
  assert.equal(run('occupied.has(keyXY(41,40))'),true,'emergence never teleports a creature')
  // A blocked lower location must never trigger a transfer roll or shove
  // the original occupant. Earthmaw still swallows the upper target.
  run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});
    replayAnimationsDisabled=true;replayRecording=false;replayPlaying=false;
    resolveEnemyPhase=()=>{};player.wayfaring=ArtifactWayfaring.freshState();
    ARTIFACT_ABILITIES.abilities.earthmaw.enabled=true;
    player.inventory=[{...makeArtifactTrinket('Stone',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,'earthmaw'),identified:true}];
    currentZ=0;map=surfaceMap;currentCave=-1;turnCount=1600;
    player.x=40;player.y=40;player.hp=playerMaxHp();
    enemies=[];groundItems=[];npcs=[];occupied=new Set();
    surfaceMap[40][41]='grass';undergroundMap[40][41]='cavefloor';
    caveMaps[0][40][41]='cavefloor';
    globalThis.lowerBlocker=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,
      name:'Goblin',baseName:'Goblin',level:-1,levelKind:'chain',caveIndex:0,
      tier:1,x:41,y:40,hp:90,maxHp:90,alive:true});
    globalThis.upperTarget=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,
      name:'Goblin',baseName:'Goblin',level:0,levelKind:'surface',
      tier:1,x:41,y:40,hp:90,maxHp:90,alive:true});
    chance=p=>{earthChanceRolls.push(p);return false};earthChanceRolls=[];`)
  assert.equal(run('ArtifactGeomancy.activate(0)'),true)
  assert.equal(copy('earthChanceRolls').filter(p=>p===.2).length,0,
    'blocked lower floor does not consume a 20% chance roll')
  assert.equal(run('upperTarget.level'),0)
  assert.equal(run('upperTarget.geomancyBuriedUntil'),1604)
  assert.equal(run('occupied.has(keyXY(41,40))'),true)
  assert.equal(run('lowerBlocker.x===41 && lowerBlocker.y===40'),true)
  run("upperTarget.geomancyBuriedUntil=0;upperTarget.alarmed=false;player.wayfaring.cooldowns={};chance=()=>true")
  const hpBeforeResist=run('upperTarget.hp')
  assert.equal(run('ArtifactGeomancy.activate(0)'),true)
  assert.equal(run('upperTarget.hp'),hpBeforeResist)
  assert.ok(run('upperTarget.alarmed && !ArtifactGeomancy.buried(upperTarget)'))
  // No legal targets: cancelling does not touch time, cooldowns or RNG.
  run(`upperTarget.geomancyBuriedUntil=0;upperTarget.abilities=['fly'];
    upperTarget.sleeping=false;player.wayfaring.cooldowns={};`)
  const emptyEarthBefore=copy('({turnCount,rngState,cooldowns:player.wayfaring.cooldowns})')
  assert.equal(run('ArtifactGeomancy.canActivate(0)'),false)
  assert.equal(run('ArtifactGeomancy.activate(0)'),false)
  assert.deepEqual(copy('({turnCount,rngState,cooldowns:player.wayfaring.cooldowns})'),emptyEarthBefore)
  run("upperTarget.abilities=[];upperTarget.hp=1;chance=()=>false;player.wayfaring.cooldowns={}")
  assert.equal(run('ArtifactGeomancy.activate(0)'),true)
  assert.ok(run('!upperTarget.alive && upperTarget.level===0 && !ArtifactGeomancy.buried(upperTarget)'))
  run('chance=earthOriginalChance;resolveEnemyPhase=earthEnemyPhase')
  console.log('PASS Geomancy catalog, cooldowns, Grounding, Earthmaw 3D transfer and save')
})().catch(err=>{console.error(err);process.exitCode=1})
