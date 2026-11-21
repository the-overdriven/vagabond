'use strict'
// Actual generated humanoid pools, sampled with replacement in an explicit
// illustrative 75-humanoid route (30/25/15/5 kills at tiers 1/2/3/4).
const {run,context} = require('./helpers/node-game-runtime.cjs')
const assert = require('node:assert/strict')
const clone = x => JSON.parse(JSON.stringify(x))
;(async()=>{
  await run('loadContent()')
  if(process.argv.includes('--fixture')){
    // Read-only estimate for the saved population. Missing equipment cannot
    // distinguish a failed roll from skipped preparation; never repair it here.
    context.fixture=require('./saves/Tester_start.json')
    run(`loadGameFromObject(fixture,{isReplayInit:true});log=()=>{};renderInventory=()=>{};
      replayAnimationsDisabled=true;replayRecording=false;oldHunterQuest=null`)
    const populationBefore=run('JSON.stringify(enemies)'),rngBefore=run('rngState')
    const counts=[30,25,15,5]
    // Exact expectation for independent samples with replacement, with the
    // same MF progression as the full simulation.
    const snapshot=()=>clone(run(`enemies.filter(e=>e.alive&&enemyArtifactLootEligible(e)&&e.tier<=4).map(e=>({
      tier:e.tier,level:e.level,eligible:enemyGearArtifactEligible(e,e.equipment),
      ordinaryPrefix:Object.hasOwn(ENEMY_PREFIXES,e.prefix),strength:monsterLootStrength(enemyPermanentStats(e)),equipped:!!e.equipment}))`))
    const evaluate=(pool,world,mode)=>{
      const groups=counts.map((_,i)=>pool.filter(e=>e.tier===i+1))
      groups.forEach((group,i)=>assert(group.length,`no tier ${i+1} humanoids in fixture`))
      let mean=0,zero=1,eligible=0,prefixed=0,ordinary=0,k=0
      for(let t=0;t<groups.length;t++)for(let i=0;i<counts[t];i++,k++){
        const mf=[0,5,10][Math.min(2,Math.floor(k/25))],group=groups[t]
        let sum=0,allowed=0,p=0,o=0
        for(const e of group){
          if(!e.eligible||(mode==='prefixed'&&!e.ordinaryPrefix))continue
          const chance=Math.min(.325,.0035*e.strength*Math.sqrt(e.strength/35)*(1+mf*.05)*world)
          sum+=chance;allowed++;if(e.ordinaryPrefix)p+=chance;else o+=chance
        }
        mean+=sum/group.length;zero*=1-sum/group.length;eligible+=allowed/group.length
        prefixed+=p/group.length;ordinary+=o/group.length
      }
      return {mean,zero,eligible,prefixed,ordinary}
    }
    const population=snapshot(),aggregate={}
    for(const world of [1,1.875]) {
      aggregate[world]={
        prefixedOnlyCounterfactual:evaluate(population,world,'prefixed'),
        currentEligibility:evaluate(population,world,'all')
      }
    }
    // Neither scenario may change gear, prefix stats, HP, positions or RNG.
    assert.equal(run('JSON.stringify(enemies)'),populationBefore)
    assert.equal(run('rngState'),rngBefore)
    console.log('fixtureCalibration',JSON.stringify({seed:context.fixture.worldSeed,
      populationSource:'saved-as-is',humanoidKills:counts.reduce((a,b)=>a+b,0),
      scope:'gear conversions only; not level-11 progression or fresh-world supply',
      worldMultipliersOnly:true,aggregate}))
    return
  }
  run(`CaveSilhouettes.prepare=async seed=>{
    CAVE_SILHOUETTES=[{id:CaveSilhouettes.idForSeed(seed),sourceIds:['mock-a','mock-b'],
      rows:Array.from({length:32},(_,y)=>Array.from({length:32},(_,x)=>
        ((x-15)**2+(y-15)**2<212?'1':'0')).join(''))}];return CAVE_SILHOUETTES[0]
  };log=()=>{};renderInventory=()=>{};replayAnimationsDisabled=true;replayRecording=false;raceOpen=false`)
  const samples=[]
  for(const seed of [67893,12345])for(const rich of [false,true]){
    run(`WORLD_SEED=${seed};rngState=WORLD_SEED;
      applyWorldTraits(${rich}?[WORLD_TRAITS.find(t=>t.name==='relic_world')]:[],'XS');
      player.inventory=[];player.equip={weapon:null,shield:null,armor:null,blackkey:null};player.baseMf=0;
      player.curseDebuffs=[];player.poisonTurns=0;player.berryRegenTurns=0;
      enemies=[];groundItems=[];occupied=new Set();oldHunterQuest=null`)
    await run('generateNewWorld()')
    const pool=clone(run(`enemies.filter(e=>enemyArtifactLootEligible(e)&&e.tier<=4).map(e=>({
      tier:e.tier,prefix:e.prefix,ordinaryPrefix:Object.hasOwn(ENEMY_PREFIXES,e.prefix),level:e.level??0,strength:monsterLootStrength(enemyPermanentStats(e)),
      eligible:enemyGearArtifactEligible(e,e.equipment),item:e.equipment,name:e.baseName}))`))
    assert(pool.length&&pool.every(e=>Number.isFinite(e.strength)))
    samples.push({seed,rich,pool})
    console.log('population',JSON.stringify({seed,rich,humanoids:pool.length,prefixed:pool.filter(e=>e.prefix).length,
      equipped:pool.filter(e=>e.item).length,eligible:pool.filter(e=>e.eligible).length,
      tiers:[1,2,3,4].map(t=>pool.filter(e=>e.tier===t).length),
      humanoidsUndergroundByDepth:[-1,-2,-3,-4,-5].map(z=>({z,total:pool.filter(e=>e.level===z).length,equipped:pool.filter(e=>e.level===z&&e.item).length}))}))
    assert.equal(run("validateDwarvenRuinsStratum().ok"),true)
  }
  const oldGearFractions={}
  run("rngState=291934;applyWorldTraits([],'XS')")
  for(const mf of [0,5,10,20])for(const tier of [1,2,3,4]){
    oldGearFractions[`${tier}:${mf}`]=run(`(()=>{let gear=0;for(let i=0;i<1000;i++)
      if(makeArtifactItem(${tier},${mf}).artifactSlot!=='trinket')gear++;return gear/1000})()`)
  }
  let state=849321;const rng=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296}
  const quantile=(v,q)=>v.slice().sort((a,b)=>a-b)[Math.floor(q*(v.length-1))]
  const mean=v=>v.reduce((a,b)=>a+b,0)/v.length
  const rounded=x=>Math.round(x*10000)/10000
  for(const rich of [false,true])for(const progression of ['0','0→10','10','20']){
    const population=samples.filter(s=>s.rich===rich).flatMap(s=>s.pool),groups=[1,2,3,4].map(t=>population.filter(e=>e.tier===t))
    const distribution=[],net=[],trinkets=[],oldGear=[],slots={},tiers={},mods={};let exceptional=0,eligible=0,extraDisarmExpected=0,expectedPrefixed=0,expectedOrdinaryTier3Plus=0
    const world=rich?1.875:1,runs=10000
    const probability=(strength,mf)=>Math.min(.325,.0035*strength*Math.sqrt(strength/35)*(1+mf*.05)*world)
    for(let i=0;i<runs;i++){
      let converted=0,old=0,trinket=0
      for(let t=0,k=0;t<4;t++)for(let j=0;j<[30,25,15,5][t];j++,k++){
        const pool=groups[t];assert(pool.length,`no tier ${t+1} humanoids`)
        const e=pool[Math.floor(rng()*pool.length)],mf=progression==='0→10'?[0,5,10][Math.min(2,Math.floor(k/25))]:Number(progression)
        const rate=rich?.75:.4,oldChance=Math.min(.12*rate,rate*(.01+t*.0075)*(1+mf*.05))
        if(rng()<oldChance*oldGearFractions[`${t+1}:${mf}`])old++
        if(rng()<Math.min(.048*world,e.strength*.00025*(1+mf*.05)*world))trinket++
        if(!e.eligible)continue
        eligible++
        if(e.ordinaryPrefix)expectedPrefixed+=probability(e.strength,mf)
        else expectedOrdinaryTier3Plus+=probability(e.strength,mf)
        if(e.item.kind!=='armor')extraDisarmExpected+=probability(e.strength,mf)
        if(rng()>=probability(e.strength,mf))continue
        converted++
        slots[e.item.kind]=(slots[e.item.kind]||0)+1;tiers[e.item.tier]=(tiers[e.item.tier]||0)+1
        const mod=e.item.mod||'none',amount=mod==='xp'?e.item.xpBonus:e.item.modAmt
        mods[mod]=(mods[mod]||0)+1
        if((mod==='hp'&&amount>=60)||(mod==='xp'&&amount>=16)||(['atk','def','spd','mf','grace'].includes(mod)&&amount>=11))exceptional++
      }
      distribution.push(converted);oldGear.push(old);net.push(converted-old);trinkets.push(trinket)
    }
    const total=distribution.reduce((a,b)=>a+b,0),fractions=c=>Object.fromEntries(Object.entries(c).map(([k,n])=>[k,rounded(n/total)]))
    console.log('calibration',JSON.stringify({world:rich?'relic_world':'normal',mf:progression,runs,
      eligiblePerCharacter:rounded(eligible/runs),meanConversion:rounded(mean(distribution)),meanOldGear:rounded(mean(oldGear)),expectedPrefixed:rounded(expectedPrefixed/runs),expectedOrdinaryTier3Plus:rounded(expectedOrdinaryTier3Plus/runs),meanNet:rounded(mean(net)),
      median:quantile(distribution,.5),p05:quantile(distribution,.05),p95:quantile(distribution,.95),medianNet:quantile(net,.5),p05Net:quantile(net,.05),p95Net:quantile(net,.95),
      zeroConversion:rounded(distribution.filter(n=>n===0).length/runs),meanTrinkets:rounded(mean(trinkets)),slots:fractions(slots),tiers:fractions(tiers),mods:fractions(mods),exceptionalShare:rounded(exceptional/total),
      extraConversionsPer10SurvivingRandomHumanoidsDisarmed:rounded(extraDisarmExpected/runs/75*10)}))
  }
})().catch(err=>{console.error(err);process.exitCode=1})
