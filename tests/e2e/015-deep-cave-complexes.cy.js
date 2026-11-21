describe('Deep cave complexes and persistent topology',()=>{
  it('keeps source maps, optional links, entrances and territories stable after save/replay initialization',()=>{
    cy.visit('/')
    cy.get('#raceName').clear().type('Cave Complex Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.window().then(win=>win.eval(`(async()=>{
      replayRecording=false;replayPlaying=false;currentZ=0;currentCave=-1;map=surfaceMap;
      applyWorldTraits([],'XS');WORLD_SEED=67893;rngState=WORLD_SEED;
      await generateNewWorld();
      const level=deepLevels[0];
      if(level.caves.length<3||!level.caves.some(c=>c.style==='silhouette'))throw Error('missing source cave');
      const silhouettes=level.caves.filter(c=>c.style==='silhouette');
      if(silhouettes.length>3||new Set(silhouettes.map(c=>c.silhouetteId)).size!==silhouettes.length)
        throw Error('silhouette count or source uniqueness invalid');
      if(!Array.isArray(level.links)||!Array.isArray(level.complexes)||!Array.isArray(level.territories))
        throw Error('deep cave complex metadata missing');
      const merging=WORLD_GEN_CONFIG.caves.deep.merging;
      const chanceAt=distance=>deepCaveMergeDistanceChance(merging,distance);
      if(!(chanceAt(2)>chanceAt(4)&&chanceAt(4)>chanceAt(5)&&
        chanceAt(5)>chanceAt(8)&&chanceAt(8)>chanceAt(9)&&
        chanceAt(9)>chanceAt(12)&&chanceAt(13)===0))
        throw Error('cave merging distance bands invalid');
      const dry=t=>t==='cavefloor2'||t==='caveup';
      const ownership=new Set(level.complexes.flatMap(c=>c.members));
      if(ownership.size!==level.caves.length)throw Error('complex membership mismatch');
      for(let i=0;i<level.caves.length;i++){
        const entry=level.caves[i].entrances[0];
        if(level.caveMaps[i][entry.y][entry.x]!=='caveup'||level.map[entry.y][entry.x]!=='caveup')
          throw Error('source staircase changed');
      }
      for(const link of level.links){
        if(link.cells.length<2||link.cells.length>12)throw Error('connector length invalid');
        for(const p of link.cells)if(!dry(level.map[p.y][p.x])&&level.map[p.y][p.x]!=='water')throw Error('unwalkable connector');
        for(const p of link.waterCells||[])if(level.map[p.y][p.x]!=='water')
          throw Error('missing water-lined connector tile');
      }
      const before=JSON.stringify({map:level.map,caves:level.caves,links:level.links,
        complexes:level.complexes,territories:level.territories,rng:rngState});
      const save=structuredClone(buildSaveObject());
      if(save.version!==self.VAGABOND_SAVE_VERSION)throw Error('expected current water-connector save schema');
      loadGameFromObject(save,{isReplayInit:true});
      const after=deepLevels[0];
      if(before!==JSON.stringify({map:after.map,caves:after.caves,links:after.links,
        complexes:after.complexes,territories:after.territories,rng:rngState}))
        throw Error('deep cave save/replay topology desync');
    })()`))
  })
})
