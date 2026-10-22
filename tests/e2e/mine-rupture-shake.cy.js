describe('Duiwel Rupture presentation',()=>{
  it('animates the visible canvas on eruption, without changing rules or replay',()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>{
      cy.window().then(win=>{
        win.__ruptureSave=save
        win.eval(`(() => {
          loadGameFromObject(window.__ruptureSave,{isReplayInit:true})
          const check=(ok,msg)=>{if(!ok)throw Error(msg)}
          const gameCanvas=document.getElementById('game')
          const originalVisible=enemyIsVisibleOnMainView
          try {
            enemyIsVisibleOnMainView=()=>false
            replayAnimationsDisabled=false;replaySimulationMode=false
            player.x=40;player.y=40
            const hp=player.hp,random=rngState
            resolveEnemyRupture({name:'Duiwel'},{tiles:[{x:39,y:39}]})
            const first=gameCanvas.ruptureShakeAnimation
            check(first && first.playState==='running','miss triggers visible canvas animation')
            check(first.effect.getKeyframes().some(frame=>String(frame.translate).includes('24px')),
              'the actual canvas receives a pronounced horizontal displacement')
            const oldEnemies=enemies,oldStrokeRect=ctx.strokeRect,oldFillText=ctx.fillText
            const oldImageMode=USE_TILE_IMAGES
            try {
              let borders=0,exclamations=0
              ctx.strokeRect=()=>borders++
              ctx.fillText=text=>{if(text==='!')exclamations++}
              enemies=[{alive:true,level:currentZ,levelKind:currentLevelKind(),
                pendingAbility:{type:'rupture',tiles:[{x:player.x,y:player.y}]}}]
              for(const images of [true,false]) {
                USE_TILE_IMAGES=images
                drawEnemyTelegraphWarnings(null,false)
                drawEnemyTelegraphWarnings(null,true)
              }
              check(borders===0 && exclamations===0,
                'Rupture keeps floor cracks but removes the yellow border and exclamation')
            } finally {
              enemies=oldEnemies;ctx.strokeRect=oldStrokeRect
              ctx.fillText=oldFillText;USE_TILE_IMAGES=oldImageMode
            }
            resolveEnemyRupture({name:'Duiwel'},{tiles:[{x:39,y:39}]})
            check(first.playState==='idle' && gameCanvas.ruptureShakeAnimation!==first,
              'another eruption restarts the canvas shake')
            check(player.hp===hp && rngState===random,'cosmetic miss changes no rules')
            replayAnimationsDisabled=true
            const current=gameCanvas.ruptureShakeAnimation
            resolveEnemyRupture({name:'Duiwel'},{tiles:[{x:39,y:39}]})
            check(gameCanvas.ruptureShakeAnimation===current,'replay suppresses shake')
            check(rngState===random,'replay keeps the same RNG state')
          } finally {
            enemyIsVisibleOnMainView=originalVisible
            replayAnimationsDisabled=false
            gameCanvas.ruptureShakeAnimation?.cancel()
            gameCanvas.ruptureShakeAnimation=null
          }
        })()`)
        delete win.__ruptureSave
      })
    })
  })
})
