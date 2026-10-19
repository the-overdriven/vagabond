describe('World generation seed diagnostics',()=>{
  it('announces each actual seed before generation can fail without consuming RNG',()=>{
    cy.visit('/')
    cy.window().its('__VAGABOND_E2E__').should('exist')
    cy.window().then(win=>win.eval(`(async()=>{
      const seen=[],listener=event=>seen.push(event.detail);
      window.addEventListener('vagabond:world-generation',listener);
      const prepare=CaveSilhouettes.prepare,seed=WORLD_SEED,before=rngState;
      try{
        CaveSilhouettes.prepare=async()=>{throw Error('expected preparation failure')};
        for(const testSeed of [-12345,12345]){
          WORLD_SEED=testSeed;
          let failed=false;
          try{await generateNewWorld()}catch(error){if(error.message!=='expected preparation failure')throw error;failed=true}
          if(!failed)throw Error('generation should fail during preparation');
        }
        if(seen.length!==2||seen[0].seed!==-12345||seen[1].seed!==12345)throw Error('actual generation seeds not captured');
        if(rngState!==before)throw Error('diagnostic changed RNG');
      }finally{
        CaveSilhouettes.prepare=prepare;WORLD_SEED=seed;
        window.removeEventListener('vagabond:world-generation',listener);
      }
    })()`))
  })
})
