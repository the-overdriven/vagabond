const checks=require('../helpers/silhouette-cave-checks.js')
const sizeChecks=require('../helpers/silhouette-size-checks.js')
const extractionChecks=require('../helpers/silhouette-extraction-checks.js')
const outlineChecks=require('../helpers/silhouette-outline-checks.js')
const rockChecks=require('../helpers/silhouette-rock-checks.js')
describe('Monster silhouette caves',()=>{
  for(const [seed,names] of [[12345,[]],[1423288048,[]],[67893,['hollow_world','things_below']]]) {
    it('keeps connected deep layouts and save/replay state for '+seed,()=>{
      cy.visit('/')
      cy.get('#raceName').clear().type('Silhouette Tester')
      cy.get('#btnBegin').click()
      cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
      cy.window().then(win=>win.eval(`(async()=>{
        replayRecording=false;replayPlaying=false;currentZ=0;currentCave=-1;map=surfaceMap;
        const traits=${JSON.stringify(names)}.map(name=>WORLD_TRAITS.find(t=>t.name===name));
        applyWorldTraits(traits,'XS');WORLD_SEED=${seed};rngState=WORLD_SEED;
        (${extractionChecks.toString()})();
        (${outlineChecks.toString()})();
        (${rockChecks.toString()})();
        (${sizeChecks.toString()})();
        await generateNewWorld();(${checks.toString()})();
        const silhouetteCfg=WORLD_GEN_CONFIG.caves.deep.silhouette;
        if(JSON.stringify(silhouetteCfg.waterChancePercentRange)!=='[0,25]' || silhouetteCfg.dryChance!==.4)
          throw Error('silhouette water configuration must permit completely dry caves');
        const prototype=CAVE_SILHOUETTES[0], rngBefore=rngState;
        const reload=await CaveSilhouettes.prepare(WORLD_SEED);
        if(JSON.stringify(reload.rows)!==JSON.stringify(prototype.rows)||rngState!==rngBefore)throw Error('cached extraction changes shape or RNG');
        const saved=structuredClone(buildSaveObject());
        const before=JSON.stringify({map:deepLevels[0].map,caves:deepLevels[0].caves,rng:rngState});
        loadGameFromObject(saved,{isReplayInit:true});
        if(JSON.stringify({map:deepLevels[0].map,caves:deepLevels[0].caves,rng:rngState})!==before)throw Error('save/replay init changes cave');
        (${checks.toString()})();
      })()`))
    })
  }
})
