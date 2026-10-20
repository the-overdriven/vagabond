module.exports=function silhouetteSizeChecks(){
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  const cfg=WORLD_GEN_CONFIG.caves.deep.silhouette,originalSeed=WORLD_SEED,originalRng=rngState
  try{
    const dense={rows:Array(20).fill('11111111111111111111'),sourceIds:['a','b']}
    const sparse={rows:Array.from({length:20},(_,i)=>i%2?'00000000000000000000':'11111111111111111111'),sourceIds:['a','b']}
    const targets=new Set()
    for(let seed=0;seed<64;seed++){
      WORLD_SEED=seed
      const plan=silhouetteSizePlan(dense),again=silhouetteSizePlan(dense),thin=silhouetteSizePlan(sparse)
      check(JSON.stringify(plan)===JSON.stringify(again),'repeatable size plan')
      check(plan.targetFloor>=700&&plan.targetFloor<=2800,'target range')
      check(plan.targetFloor===thin.targetFloor,'source density does not choose target')
      check(plan.targetFloor===silhouetteSizePlan(Object.assign({},dense,{sourceIds:['a','b','c','d']})).targetFloor,'source count does not choose target')
      check(thin.sizes[0][0]*thin.sizes[0][1]>plan.sizes[0][0]*plan.sizes[0][1],'sparse silhouettes get larger footprints')
      check(plan.sizes.every(([w,h])=>w<=cfg.maxFootprint[0]&&h<=cfg.maxFootprint[1]),'footprint cap')
      targets.add(plan.targetFloor)
    }
    check(targets.size>50&&Math.min(...targets)<1000&&Math.max(...targets)>2500,'wide seeded size variety')
    check(rngState===originalRng,'planning consumes no gameplay RNG')
    check(silhouetteSizePlan({rows:['0000']}).sizes.length===0,'empty source cannot generate a cave')
  }finally{WORLD_SEED=originalSeed}
  return true
}
