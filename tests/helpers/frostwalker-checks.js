// Shared real-runtime checks (Node and Cypress). No animation-dependent rules.
async function frostwalkerChecks(fixture) {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  const restore=save=>{loadGameFromObject(structuredClone(save),{isReplayInit:true});replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;replaySimulationMode=false}
  const reset=()=>{
    restore(fixture);enemies=[];npcs=[];groundItems=[];occupied=new Set();player.equip={weapon:null,shield:null,armor:null};
    player.race='human';player.hp=200;player.maxHp=200;player.swimming=0;player.godMode=false;player.invisibleTurns=0;
    player.rootTurns=0;player.poisonTurns=0;player.freezing={active:false,turns:0};currentZ=0;map=surfaceMap;player.x=40;player.y=40;turnCount=0;spawnPoint={x:10,y:10};
    resetSwimming();player.wayfaring=ArtifactWayfaring.freshState();
    for(let y=25;y<=55;y++)for(let x=25;x<=55;x++){map[y][x]='grass';grasslandTrees.delete(keyXY(x,y));delete tileUnderlays[keyXY(x,y)]}
    discovered.forEach(r=>r.fill(false));discoverPlayerSight('arrival');
    player.inventory=[sample('frostwalker')];
  }
  const sample=id=>makeWayfaringTrinket('Feather',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id)
  const foe=(x,y,abilities=[])=>{const e=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,baseName:'Goblin',x,y,level:0,levelKind:'surface',alive:true,hp:100,maxHp:100,aware:true,equipment:null,abilities});occupied.add(keyXY(x,y));return e}
  const tick=t=>{turnCount=t;Frostwalker.tick()}
  try {
    reset();player.inventory.push(sample('water_walking'),sample('permafrost'))
    map[40][41]='water';map[40][42]='river';map[40][43]='water';
    check(isWalkableForPlayer(41,40),'untrained Frostwalker may enter deep water')
    await tryMove(1,0);check(map[40][41]==='ice'&&!isActuallySwimming()&&player.swimTurns===0,'freezes before swimming')
    check(ArtifactWayfaring.waterRemaining()===8&&playerTerrainEffects().defense>=3,'Frostwalker wins over Water Walking; Permafrost works')
    await tryMove(1,0);await tryMove(1,0)
    check(map[40][42]==='ice'&&player.wayfaring.frostBridges.length===1&&player.wayfaring.frostBridges[0].started===0,'all steps share absolute deadline')
    const seed=rngState;tickLakeIce();check(rngState===seed,'natural ice never rolls on magical ice')
    tick(10);check([41,42,43].every(x=>map[40][x]==='crackingice'),'entire crossing cracks together')
    const mid=structuredClone(buildSaveObject());restore(mid);check(map[40][42]==='crackingice'&&Frostwalker.at(42,40).tile.original==='river','cracking bridge and original terrain survive load')
    tick(15);check(map[40][41]==='water'&&map[40][42]==='river'&&map[40][43]==='water','restores original terrain')
    check(player.hp===184&&isActuallySwimming()&&ArtifactWayfaring.waterRemaining()===0,'deep plunge costs 8% HP and takes priority over water walking')
    check(!Frostwalker.canFreeze(41,40),'no renewal while still in same water crossing')
    await tryMove(1,0);map[40][45]='water';await tryMove(1,0);check(map[40][45]==='ice','solid shore renews Frostwalker')

    reset();map[40][41]='water';await tryMove(1,0);await tryMove(-1,0)
    resetForNewCharacter();check(player.wayfaring.frostActive===null&&player.wayfaring.frostBridges.length===1,'permadeath preserves world ice but resets crossing')
    tick(15);check(surfaceMap[40][41]==='water','inherited world ice melts')

    reset();map[40][41]='water';await tryMove(1,0);check(ArtifactWayfaring.coldTerrain()&&player.freezing.active,'magical ice is cold')
    await tryMove(-1,0);tick(10);player.x=40;player.y=40;forcePlayerPosition(41,40)
    check(map[40][41]==='water'&&isActuallySwimming()&&player.hp===184,'forced player landing breaks cracking ice immediately')

    reset();map[40][41]='water';map[40][42]='water';await tryMove(1,0);await tryMove(1,0);await tryMove(1,0)
    tick(10);player.x=40;player.y=40;const e=foe(41,40)
    check(pushEnemyFromPlayer(e)&&e.x===42&&map[40][42]==='water'&&Frostwalker.stranded(e),'knockback breaks cracked tile and strands land monster')
    const hp=player.hp;enemyAttackPlayer(e);check(player.hp===hp,'stranded cannot retaliate')
    const saved=structuredClone(buildSaveObject());restore(saved);const restored=enemies.find(m=>m.id===e.id)
    check(Frostwalker.stranded(restored),'stranded state survives load')
    check(Frostwalker.enemyAction(restored)&&!Frostwalker.stranded(restored)&&map[restored.y][restored.x]!=='water','rescues itself to free shore instead of attacking')

    reset();map[40][41]='water';await tryMove(1,0);await tryMove(-1,0)
    const trapped=foe(41,40);const swimmer=foe(42,40,['swim']);map[40][42]='water'
    for(let y=39;y<=41;y++)for(let x=40;x<=43;x++)if(!(y===40&&(x===41||x===42)))map[y][x]='mountain'
    tick(15);check(Frostwalker.stranded(trapped)&&!Frostwalker.stranded(swimmer),'land enemy stranded after melt; swimmers exempt')
    Frostwalker.tickStranded();check(trapped.hp===90,'no reachable shore loses 10% max HP')
    trapped.hp=10;Frostwalker.tickStranded();check(!trapped.alive&&!Frostwalker.stranded(trapped),'fatal drowning clears state')

    reset();map[40][41]='water';map[40][42]='river';await tryMove(1,0);await tryMove(1,0);await tryMove(1,0)
    const surfaceBridgeId=player.wayfaring.frostBridges[0].id
    // Find actual generated underground deep water, with a neighboring legal cell.
    const deep=deepLevels[0];let cell=null
    for(let y=1;y<MAP_H-1&&!cell;y++)for(let x=1;x<MAP_W-1&&!cell;x++)if(deep.map[y][x]==='water')for(const [dx,dy] of DIRS8){if(TILE[deep.map[y+dy]?.[x+dx]]?.walk){cell={x,y,from:{x:x+dx,y:y+dy}};break}}
    check(cell,'fixture has underground water')
    currentZ=-2;map=deep.map;undergroundDiscovered=deep.discovered;currentCave=-1;player.x=cell.from.x;player.y=cell.from.y;Frostwalker.reconcileCrossing()
    check(finishPlayerStep(cell.x,cell.y),'underground step succeeds');check(map[cell.y][cell.x]==='ice'&&ArtifactWayfaring.coldTerrain(),'underground uses same world terrain and cold')
    const undergroundSaved=structuredClone(buildSaveObject());restore(undergroundSaved)
    check(currentZ===-2&&map[cell.y][cell.x]==='ice'&&surfaceMap[40][41]==='ice','both floors survive reconstruction')
    tick(15);check(surfaceMap[40][41]==='water'&&surfaceMap[40][42]==='river'&&!player.wayfaring.frostBridges.some(b=>b.id===surfaceBridgeId),'inactive surface melts on schedule')
    tick(18);check(map[cell.y][cell.x]==='water','underground melts on its own schedule')

    reset();for(let y=35;y<=45;y++)for(let x=35;x<=55;x++)map[y][x]='mountain';map[40][40]='grass';for(let x=41;x<=54;x++)map[40][x]='water';map[40][55]='grass'
    check(findPlayerPath(55,40)?.length===15,'safe 14-tile magical route')
    map[40][55]='water';map[40][56]='grass';check(findPlayerPath(56,40)===null,'path cannot cross a bridge that will melt first')

    reset();map[40][41]='water';map[40][42]='river';startReplayRecording()
    await tryMove(1,0);await tryMove(1,0);await tryMove(1,0)
    for(let i=0;i<13;i++)await tryMove(i%2?-1:1,0)
    const snapshot=()=>JSON.stringify({hp:player.hp,x:player.x,y:player.y,turn:turnCount,state:player.wayfaring,tiles:map[40].slice(40,44)})
    const expected=snapshot(),record=structuredClone(replayData)
    restore(record.initialState);activeReplay=record;replayRngIndex=0;replayPlaying=true;replayRecording=false;replaySimulationMode=true
    for(const action of record.actions)await runReplayAction(action)
    check(snapshot()===expected&&replayRngIndex===record.rng.length,'real replay reproduces bridge and RNG')
    reset();player.godArtifactStockGranted=false;grantGodArtifactStock();check(merchantStock.filter(i=>i.godTestArtifact&&i.abilityId==='frostwalker').length===1,'debug merchant has exactly one Frostwalker')
    check(artifactPriceBonus(sample('frostwalker'))===450,'price bonus')
  } finally {restore(fixture);activeReplay=null}
}
if(typeof module!=='undefined')module.exports={frostwalkerChecks}
