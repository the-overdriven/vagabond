describe('Duiwel Rupture presentation',()=>{
  it('shakes the playfield on eruption but not during replay simulation',()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>{
      cy.window().then(win=>{
        win.__ruptureSave=save
        win.eval(`(() => {
          loadGameFromObject(window.__ruptureSave,{isReplayInit:true})
          const check=(ok,msg)=>{if(!ok)throw Error(msg)}
          const stage=document.getElementById('stage')
          const originalVisible=enemyIsVisibleOnMainView
          try {
            enemyIsVisibleOnMainView=()=>false
            replayAnimationsDisabled=false;replaySimulationMode=false
            player.x=40;player.y=40
            const hp=player.hp,random=rngState
            resolveEnemyRupture({name:'Duiwel'},{tiles:[{x:39,y:39}]})
            check(stage.classList.contains('rupture-shake'),'miss triggers shake')
            check(getComputedStyle(stage).animationName.includes('rupture-shake'),
              'playfield has the shake animation in the browser')
            check(player.hp===hp && rngState===random,'cosmetic miss changes no rules')
            replayAnimationsDisabled=true
            stage.classList.remove('rupture-shake')
            resolveEnemyRupture({name:'Duiwel'},{tiles:[{x:39,y:39}]})
            check(!stage.classList.contains('rupture-shake'),'replay suppresses shake')
            check(rngState===random,'replay keeps the same RNG state')
          } finally {
            enemyIsVisibleOnMainView=originalVisible
            replayAnimationsDisabled=false
            stage.classList.remove('rupture-shake')
          }
        })()`)
        delete win.__ruptureSave
      })
    })
  })
})
