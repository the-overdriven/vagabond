const caveChecks=require('../helpers/deep-cave-topology-checks.js')
describe('Deep cave topology variation',()=>{
  it('keeps all dry routes and stairs usable after seeded geometry and save/replay',()=>{
    cy.visit('/')
    cy.get('#raceName').clear().type('Cave Topology Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.window().then(win=>win.eval(`(async()=>{
      replayRecording=false;replayPlaying=false;currentZ=0;currentCave=-1;map=surfaceMap;
      applyWorldTraits([],'XS');WORLD_SEED=67893;rngState=WORLD_SEED;
      await generateNewWorld();(${caveChecks.toString()})();
      const saved=structuredClone(buildSaveObject());
      const before=JSON.stringify({caves:deepLevels[0].caves,map:deepLevels[0].map,rng:rngState});
      loadGameFromObject(saved,{isReplayInit:true});
      if(before!==JSON.stringify({caves:deepLevels[0].caves,map:deepLevels[0].map,rng:rngState}))
        throw Error('Topology/replay initialization mismatch');
      (${caveChecks.toString()})();
    })()`))
  })
})
