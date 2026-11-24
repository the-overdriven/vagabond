// Shared rule tests exercise the same game code in Node and Cypress.
async function wayfaringStealthChecks(fixture) {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  const originalChance=chance
  const restore=save=>{loadGameFromObject(structuredClone(save),{isReplayInit:true});replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;replaySimulationMode=false}
  const sample=id=>makeArtifactTrinket('Feather',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id)
  const reset=(...ids)=>{
    chance=originalChance;restore(fixture);enemies=[];npcs=[];groundItems=[];occupied=new Set();
    player.equip={weapon:null,shield:null,armor:null};player.race='human';player.hp=200;player.maxHp=200;
    player.godMode=false;player.invisibleTurns=0;player.rootTurns=0;player.poisonTurns=0;
    currentZ=0;map=surfaceMap;player.x=40;player.y=40;turnCount=0;spawnPoint={x:10,y:10};
    player.wayfaring=ArtifactWayfaring.freshState();player.inventory=ids.map(sample);
    for(let y=30;y<=60;y++)for(let x=30;x<=60;x++){map[y][x]='grass';grasslandTrees.delete(keyXY(x,y));foragedTiles.delete(keyXY(x,y))}
    resetSwimming();discoverPlayerSight('arrival');
  }
  const foe=(name,x,y,extra={})=>{const e=addEnemy({...ENEMY_TEMPLATE_BY_NAME[name],baseName:name,x,y,level:currentZ,levelKind:currentLevelKind(),alive:true,hp:100,maxHp:100,aware:false,alarmed:false,equipment:null,...extra});occupied.add(keyXY(x,y));return e}
  const relocate=(x,y)=>{player.x=x;player.y=y;markPlayerPositionChanged(true)}
  try {
    reset('forestwalker','windwalker');player.race='halfling';map[40][40]='forest';map[40][43]='forest';
    const enemy=foe('Goblin',44,40);ArtifactWayfaring.beginStealthTurn();
    check(Math.abs(forestHideChance(enemy,4)-.83)<1e-9,'Forestwalker adds 10 pp to Halfling cover')
    check(ArtifactWayfaring.ambushChance(.08)===.02,'trait-adjusted ambush chance is multiplied, not capped')
    chance=()=>true;check(forestConcealsPlayer(enemy,4)&&player.wayfaring.stealth.dodgeReady,'successful forest roll prepares dodge');
    check(ArtifactWayfaring.cooldownRemaining('forestwalker')===30,'dodge cooldown starts on preparation')
    relocate(41,40);chance=()=>{throw Error('open gap must not reroll')};
    check(forestConcealsPlayer(enemy,3)&&ArtifactWayfaring.forestGap(),'one gap retains successful forest cover');
    check(player.wayfaring.stealth.dodgeReady,'first gap retains dodge')
    relocate(42,40);check(!forestConcealsPlayer(enemy,2)&&!player.wayfaring.stealth.dodgeReady,'second gap removes both')
    relocate(43,40);chance=()=>true;enemy.x=47;check(forestConcealsPlayer(enemy,4)&&!player.wayfaring.stealth.dodgeReady,'cooldown prevents new preparation')
    enemy.abilities=['trueSight'];check(!forestConcealsPlayer(enemy,4),'True Sight ignores cached artifact forest cover')
    enemy.abilities=['blind'];check(!forestConcealsPlayer(enemy,4),'Blind ignores cached artifact forest cover')
    reset('forestwalker','windwalker');player.race='elf';map[40][40]='forest';ArtifactWayfaring.beginStealthTurn();
    const observer=foe('Goblin',44,40),attacker=foe('Goblin',41,40,{aware:true});chance=()=>true;forestConcealsPlayer(observer,4);
    const hp=player.hp;chance=p=>p===.4;enemyAttackPlayer(attacker,true);check(player.hp===hp&&!player.wayfaring.stealth.dodgeReady&&player.wayfaring.windwalkerReady,'guaranteed melee dodge uses Windwalker hooks')

    reset('unseen');map[39][40]='boulder';ArtifactWayfaring.beginStealthTurn();check(ArtifactWayfaring.unseenActive(),'stationary turn beside rock arms Unseen')
    const a=foe('Goblin',46,40),b=foe('Goblin',47,40);let rolls=0;chance=()=>++rolls===1;
    check(forestConcealsPlayer(a,6)&&!forestConcealsPlayer(b,7)&&rolls===2,'independent success and failure recorded');
    relocate(40,41);relocate(40,42);check(ArtifactWayfaring.unseenActive(),'two open tiles allowed');
    check(forestConcealsPlayer(a,6)&&!forestConcealsPlayer(b,7)&&rolls===2,'movement retains both observer outcomes');
    const saved=structuredClone(buildSaveObject());restore(saved);const aa=enemies.find(e=>e.id===a.id),bb=enemies.find(e=>e.id===b.id);
    chance=()=>{throw Error('load must not reroll')};check(forestConcealsPlayer(aa,6)&&!forestConcealsPlayer(bb,7),'save retains both outcomes');
    const before=rngState;playerConcealmentInfo();check(rngState===before,'conceal tooltip consumes no RNG');
    relocate(40,43);check(!ArtifactWayfaring.unseenActive(),'third open tile ends episode');
    // Actual underground wall and same XY on another map cannot carry stealth.
    reset('unseen');currentZ=-1;map=undergroundMap;undergroundDiscovered=undergroundDiscoveredL1;currentCave=-1;
    map[40][40]='cavefloor';map[39][40]='cavewall';ArtifactWayfaring.beginStealthTurn();
    check(ArtifactWayfaring.unseenActive(),'Unseen works beside cave walls');
    currentZ=0;map=surfaceMap;markPlayerPositionChanged();check(!ArtifactWayfaring.unseenActive(),'same XY on another Z clears cover');
    reset('forestwalker','unseen');player.race='elf';map[40][40]='forest';ArtifactWayfaring.beginStealthTurn();const c=foe('Goblin',46,40);chance=()=>true;forestConcealsPlayer(c,6);
    relocate(41,40);relocate(42,40);check(ArtifactWayfaring.unseenActive()&&!player.wayfaring.stealth.dodgeReady&&forestConcealsPlayer(c,4),'Unseen survives second tile independently of Forestwalker')

    reset('one_with_the_wild');map[40][41]='forest';const wolf=foe('Wolf',44,40,{aware:true,alarmed:true,prefix:'Brutal'}),goblin=foe('Goblin',45,40,{aware:true}),rare=foe('SKELD',46,40,{aware:true}),adaptive=foe('Boar',47,40,{adaptiveEventId:'beast_hunter',aware:true});
    check(!ArtifactWayfaring.truce(wolf),'no truce outside forest');relocate(41,40);ArtifactWayfaring.reconcileTruce();
    check(ArtifactWayfaring.truce(wolf)&&!wolf.aware&&!wolf.alarmed,'forest entry ends existing pursuit even outside woodland');
    check(!ArtifactWayfaring.truce(goblin)&&!ArtifactWayfaring.truce(rare)&&!ArtifactWayfaring.truce(adaptive),'humanoid, rare and adaptive foes excluded');
    const oldHp=player.hp;enemyAttackPlayer(wolf,true);check(player.hp===oldHp,'truce blocks immediate retaliation');
    chance=()=>true;await playerAttackEnemy(wolf);check(ArtifactWayfaring.cooldownRemaining('one_with_the_wild')===1000&&!ArtifactWayfaring.truce(wolf),'real melee attempt breaks truce even on miss');
    const truceSave=structuredClone(buildSaveObject());restore(truceSave);check(ArtifactWayfaring.cooldownRemaining('one_with_the_wild')===1000,'truce cooldown saved');
    player.inventory=[];carryItem(sample('one_with_the_wild'));check(ArtifactWayfaring.cooldownRemaining('one_with_the_wild')===1000,'reacquisition does not reset cooldown');
    turnCount+=1000;check(ArtifactWayfaring.truce(enemies.find(e=>e.id===wolf.id)),'truce recovers at deadline');

    reset('one_with_the_wild');map[40][44]='forest';const arrowTarget=foe('Boar',44,40);
    player.equip.weapon=makeShortBowItem();player.inventory.push(createItem('arrows',{count:4}));
    check(shootEnemy(arrowTarget),'committed bow shot');check(ArtifactWayfaring.cooldownRemaining('one_with_the_wild')===999,'bow attack from outside forest breaks truce');
    reset('one_with_the_wild');map[40][44]='forest';foe('Boar',44,40);player.inventory.push(createItem('scrollOfFireball'));
    check(await castFireball(1,44,40),'committed Fireball');check(ArtifactWayfaring.cooldownRemaining('one_with_the_wild')===999,'Fireball target in woodland breaks truce');
    reset('forestwalker','windwalker');player.race='elf';map[40][40]='forest';ArtifactWayfaring.beginStealthTurn();
    const scout=foe('Goblin',44,40);chance=()=>true;forestConcealsPlayer(scout,4);chance=p=>p===.4;
    const beforeShot=player.hp;enemyRangedAttackPlayer(scout,null,DEATH_BOLT_CONFIG);
    check(player.hp===beforeShot&&!player.wayfaring.stealth.dodgeReady&&player.wayfaring.windwalkerReady,'direct projectile consumes guarantee and uses dodge hook');

    reset('forestwalker','unseen','one_with_the_wild');player.race='halfling';map[40][40]='forest';map[40][41]='forest';map[40][44]='forest';
    foe('Goblin',45,40);foe('Boar',47,40,{aware:true});startReplayRecording();
    await skipTurn();await tryMove(1,0);await tryMove(1,0);await tryMove(1,0);await tryMove(1,0);await skipTurn();
    const snapshot=()=>JSON.stringify({hp:player.hp,x:player.x,y:player.y,turn:turnCount,state:player.wayfaring,foes:enemies.map(e=>[e.id,e.x,e.y,e.hp,e.aware,e.alarmed,e.forestConcealX,e.forestConcealY])});
    const expected=snapshot(),record=structuredClone(replayData);check(record.actions.length===6&&player.x===44,'replay actually records six actions');restore(record.initialState);activeReplay=record;replayRngIndex=0;replayPlaying=true;replayRecording=false;replaySimulationMode=true;
    for(const action of record.actions)await runReplayAction(action);
    check(snapshot()===expected&&replayRngIndex===record.rng.length,'actual replay reproduces stealth, pursuit and RNG');
    reset();player.godArtifactStockGranted=false;grantGodArtifactStock();
    for(const [id,price] of [['forestwalker',350],['unseen',450],['one_with_the_wild',400]]){
      check(merchantStock.filter(i=>i.godTestArtifact&&i.abilityId===id).length===1,'one representative test artifact: '+id);
      check(artifactPriceBonus(sample(id))===price,'correct price: '+id);
    }
  } finally {chance=originalChance;restore(fixture);activeReplay=null}
}
if(typeof module!=='undefined')module.exports={wayfaringStealthChecks}
