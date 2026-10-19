const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const checks=require('./helpers/shallow-trail-checks.js')
;(async()=>{
 await run('loadContent()')
 context.fixture=JSON.parse(require('node:fs').readFileSync(__dirname+'/saves/Tester_start.json','utf8'))
 assert(run(`(()=>{
   MAP_W=80;MAP_H=80;villageHuts=[];cryptCaveExclusionCenter={x:40,y:40};
   const from={x:23,y:22},to={x:57,y:22};
   const generate=()=>{rngState=12345;const cm=blankCaveMap();cm[from.y][from.x]='caveentrance';cm[to.y][to.x]='caveentrance';if(!carveShallowEntranceTrail(cm,from,to))throw Error('protected detour failed');return {cm,rng:rngState}};
   const a=generate(),b=generate();if(JSON.stringify(a)!==JSON.stringify(b))throw Error('nondeterministic trail');
   const seen=new Set([keyXY(from.x,from.y)]),queue=[from];
   for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
     const x=queue[i].x+dx,y=queue[i].y+dy,k=keyXY(x,y);
     if(!['cavefloor','caveentrance'].includes(a.cm[y]?.[x])||seen.has(k))continue;seen.add(k);queue.push({x,y})
   }
   if(!seen.has(keyXY(to.x,to.y)))throw Error('cardinal route missing');
   for(const p of queue)if(isInsideCryptCaveExclusion(p.x,p.y))throw Error('trail crossed crypt');
   if(!queue.some(p=>p.y!==22))throw Error('straight trail');
   const blocked=blankCaveMap(),before=JSON.stringify(blocked);
   if(carveShallowEntranceTrail(blocked,{x:40,y:40},to)||JSON.stringify(blocked)!==before)throw Error('failed route mutated map');
   cryptCaveExclusionCenter=null;villageHuts=[{x:40,y:42,mausoleum:true}];
   const m=blankCaveMap();if(!carveShallowEntranceTrail(m,{x:23,y:40},{x:57,y:40}))throw Error('mausoleum detour failed');
   for(let y=35;y<=43;y++)for(let x=36;x<=44;x++)if(m[y][x]!=='cavewall')throw Error('mausoleum crossed');
   villageHuts=[];return true;
 })()`))
 console.log('PASS seeded winding trails, protected detours, cardinal routes, preserved entrances, atomic rejection')
 context.checkTrail=checks.toString()
 for(const [seed,traits] of [[12345,[]],[67893,['hollow_world','things_below']]]){
   context.traits=traits
   const generate=async()=>{
     run('loadGameFromObject(structuredClone(fixture),{isReplayInit:true});merchantStock=[]')
     run(`WORLD_SEED=${seed};rngState=WORLD_SEED;currentZ=0;currentCave=-1;applyWorldTraits(traits.map(name=>WORLD_TRAITS.find(t=>t.name===name)),'XS');player.inventory=[];player.curseDebuffs=[];player.poisonTurns=0;player.berryRegenTurns=0;enemies=[];groundItems=[];occupied=new Set()`)
     await run('generateNewWorld()')
   }
   await generate();assert(run('caves.some(c=>!c.crypt&&c.entrances?.length>1)'),'paired entrance coverage');assert(run('eval("("+checkTrail+")")()'))
   const before=run('JSON.stringify({map:undergroundMap,caves,caveMaps,rng:rngState})')
   await generate();assert(run('JSON.stringify({map:undergroundMap,caves,caveMaps,rng:rngState})')===before,'world state mismatch')
   assert(run('validateDwarvenRuinsStratum().ok && isBigBellReachableFromTemple() && isSurfacePointReachableFromTemple(dwarvenRuin.x,dwarvenRuin.y)'))
   assert(run(`enemies.filter(e=>e.alive&&e.level===-1).every(e=>TILE[undergroundMap[e.y]?.[e.x]]?.walk||enemyHasAbility(e,'fly')||enemyHasAbility(e,'ethereal'))`))
   context.snapshot=JSON.parse(JSON.stringify(run('buildSaveObject()')))
   run('loadGameFromObject(structuredClone(snapshot),{isReplayInit:true})')
   assert(run('JSON.stringify({map:undergroundMap,caves,caveMaps,rng:rngState})')===before,'trail maps and descriptors survive save/replay')
   assert(run('eval("("+checkTrail+")")()'))
   console.log('PASS world',seed,traits.join('+')||'normal','paired routes, placement, fort/bell, spawns, deterministic generation, save/replay restore')
 }
})().catch(e=>{console.error(e.message,e.stack?.split("\n").slice(1,3).join("\n"));process.exitCode=1})
