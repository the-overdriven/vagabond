describe('Tholosum shell duration',()=>{
  it('blocks actions through four complete player turns and survives a save restore',()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>{
      cy.window().then(win=>{
        win.__shellSave=save
        win.eval(`(() => {
          loadGameFromObject(window.__shellSave,{isReplayInit:true})
          const check=(ok,msg)=>{if(!ok)throw Error(msg)}
          replayRecording=false;currentZ=0;currentCave=-1;map=surfaceMap
          enemies=[];occupied=new Set();player.x=40;player.y=40
          const t=ENEMY_TEMPLATE_BY_NAME.Tholosum
          const shell=addEnemy({...t,name:t.name,baseName:t.name,
            x:41,y:40,level:0,levelKind:null,hp:Math.floor(t.hp*0.3),
            maxHp:t.hp,alive:true,homeX:41,homeY:40,equipment:null})
          check(ENEMY_DEFENSE_CONFIG.shellRetreat.durationTurns===4,'four-turn config')
          check(triggerEnemyShellRetreat(shell),'first low-health injury activates shell')
          check(shell.shellRetreatTurns===5,'trigger phase is excluded from four responses')
          tickEnemyDefensiveTimers()
          check(shell.shellRetreatTurns===4 && enemyShellRetreating(shell),'four full response turns remain')
          const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
          loadGameFromObject(snapshot,{isReplayInit:true})
          const restored=enemies.find(e=>e.id===shell.id)
          check(restored && restored.shellRetreatTurns===4 && restored.shellRetreatUsed,
            'remaining duration and spent charge restore')
          for(let i=0;i<4;i++){
            check(enemyShellRetreating(restored),'shell remains active for response '+(i+1))
            tickEnemyDefensiveTimers()
          }
          check(!enemyShellRetreating(restored) && restored.shellRetreatTurns===0,
            'shell expires after fourth response')
          check(!triggerEnemyShellRetreat(restored),'spent shell cannot re-trigger')
        })()`)
        delete win.__shellSave
      })
    })
  })
})
