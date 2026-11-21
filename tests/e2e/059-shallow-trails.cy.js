const checks=require('../helpers/shallow-trail-checks.js')
describe('Winding links between shallow cave entrances',()=>{
  for(const [seed,names] of [[12345,[]],[67893,['hollow_world','things_below']]]){
    it('preserves paired routes and save/replay state for '+seed,()=>{
      cy.visit('/')
      cy.get('#raceName').clear().type('Trail Tester')
      cy.get('#btnBegin').click()
      cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
      cy.window().then(win=>win.eval(`(async()=>{
        replayRecording=false;replayPlaying=false;currentZ=0;currentCave=-1;map=surfaceMap;
        applyWorldTraits(${JSON.stringify(names)}.map(name=>WORLD_TRAITS.find(t=>t.name===name)),'XS');
        WORLD_SEED=${seed};rngState=WORLD_SEED;await generateNewWorld();
        (${checks.toString()})();
        if(!caves.some(c=>!c.crypt&&c.entrances?.length>1))throw Error('missing paired-entrance cave');
        if(!isBigBellReachableFromTemple()||!isSurfacePointReachableFromTemple(dwarvenRuin.x,dwarvenRuin.y))throw Error('surface reachability');
        const saved=structuredClone(buildSaveObject());
        const before=JSON.stringify({map:undergroundMap,caves,caveMaps,rng:rngState});
        loadGameFromObject(saved,{isReplayInit:true});
        if(JSON.stringify({map:undergroundMap,caves,caveMaps,rng:rngState})!==before)throw Error('save/replay changes trails');
        (${checks.toString()})();
      })()`))
    })
  }
})
