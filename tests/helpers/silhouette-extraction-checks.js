module.exports=function silhouetteExtractionChecks(){
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  const extract=CaveSilhouettes.extract
  const originalRng=rngState
  const alpha=new Uint8Array(100*80)
  for(let y=20;y<60;y++)for(let x=30;x<70;x++)alpha[y*100+x]=255
  const rows=extract({width:100,height:80,alpha})
  check(rows.length===48&&rows.every(r=>r==='1'.repeat(48)),'transparent padding cropped before sampling')
  const shape=extract({width:2,height:1,alpha:new Uint8Array([255,0])})
  check(shape.length===48&&shape.every(r=>r==='1'.repeat(48)),'small alpha masks use bounded integer sampling')
  for(const value of [0,255]) {
    let rejected=false
    try{extract({width:2,height:2,alpha:new Uint8Array(4).fill(value)})}catch{rejected=true}
    check(rejected,'empty/opaque image rejected')
  }
  const sources=CAVE_SILHOUETTE_SOURCES
  check(sources.length===72&&sources.every(s=>s.source==='img/enemies-no-bg/'+s.id+'.png'),'source manifest contains real image paths')
  for(const seed of [0,1,12345,24680,67890,0xffffffff]) {
    check(CaveSilhouettes.sourceForSeed(seed,sources)===CaveSilhouettes.sourceForSeed(seed,sources),'stable seeded image selection')
  }
  const block={id:'a',rows:Array(12).fill('1'.repeat(12))},other={id:'b',rows:Array(12).fill('1'.repeat(12))};
  for(const seed of [1,12345,24680,67890]){
    const pair=CaveSilhouettes.pairForSeed(seed,sources);
    check(pair.length===2&&pair[0].id!==pair[1].id,'distinct seeded pair');
    const result=CaveSilhouettes.blend(block,other,seed);
    check(result.mix.overlap>0&&result.mix.uniqueA>0&&result.mix.uniqueB>0,'overlap with contributions from both sources');
    check(JSON.stringify(result)===JSON.stringify(CaveSilhouettes.blend(block,other,seed)),'deterministic blending');
  }
  for(const seed of [12345,1420044060,67893]){
    const selected=CaveSilhouettes.sourcesForSeed(seed,sources);
    check(selected.length===CaveSilhouettes.sourceCountForSeed(seed),'weighted source count');
    check(new Set(selected.map(s=>s.id)).size===selected.length,'all selected sources distinct');
  }
  check(rngState===originalRng,'extraction and selection consume no gameplay RNG')
  return true
}
