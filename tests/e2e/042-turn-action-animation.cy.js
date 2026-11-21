function beginNewGame(name = 'Turn Animation Tester') {
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.get('#raceName').clear().type(name)
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay', { timeout: 60000 }).should(($overlay) => {
    expect($overlay.text(), 'world generation status').not.to.include('failed')
    expect($overlay, 'world generation finished').not.to.be.visible
  })
  cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
  cy.get('#raceOverlay').should('not.have.class', 'show')
}

describe('Stationary turn animation handoff', () => {
  it('starts the shared animation loop for item, forage, and dig turns', () => {
    beginNewGame()
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const saved = {
          enemyTurn, npcTurn, updateHud, render, renderInventory, updateTooltip,
          runAnimationLoop, rng, randInt, foragedTiles, dugSandTiles, groundItems,
          treasureMapSpot, tile: map[player.y][player.x]
        }
        let loops = 0, loopStarted = false
        try {
          enemyTurn = () => {}
          npcTurn = () => {}
          updateHud = () => {}
          render = () => {}
          renderInventory = () => {}
          updateTooltip = () => {}
          // The real scheduler coalesces repeated requests into a single rAF.
          runAnimationLoop = () => { if (!loopStarted) { loops++; loopStarted = true } }

          consumeItemTurn()
          const itemLoops = loops

          loops = 0; loopStarted = false
          map[player.y][player.x] = 'forest'
          foragedTiles = new Set()
          rng = () => 0.99
          tryForage()
          const forageLoops = loops

          loops = 0; loopStarted = false
          map[player.y][player.x] = 'sand'
          dugSandTiles = new Set()
          groundItems = []
          treasureMapSpot = null
          randInt = () => 100
          tryDig({recordReplay:false})
          const digLoops = loops

          return {itemLoops, forageLoops, digLoops}
        } finally {
          enemyTurn = saved.enemyTurn
          npcTurn = saved.npcTurn
          updateHud = saved.updateHud
          render = saved.render
          renderInventory = saved.renderInventory
          updateTooltip = saved.updateTooltip
          runAnimationLoop = saved.runAnimationLoop
          rng = saved.rng
          randInt = saved.randInt
          foragedTiles = saved.foragedTiles
          dugSandTiles = saved.dugSandTiles
          groundItems = saved.groundItems
          treasureMapSpot = saved.treasureMapSpot
          map[player.y][player.x] = saved.tile
          saved.render()
        }
      })()`)
      expect(result).to.deep.equal({itemLoops: 1, forageLoops: 1, digLoops: 1})
    })
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const old={enemyTurn,npcTurn,runAnimationLoop}
      try {
        currentZ=0;currentCave=-1;map=surfaceMap
        player.x=50;player.y=50;player.confusionTurns=0;player.rootTurns=0
        player.artifactElusiveReady=false;player.berserkTurns=0
        replayAnimationsDisabled=false;replayRecording=false
        map[50][50]=map[50][51]=map[50][52]='grass'
        for(let x=50;x<=52;x++)grasslandTrees.delete(keyXY(x,50))
        enemies=[];npcs=[];groundItems=[];occupied=new Set()
        enemyTurn=()=>{};npcTurn=()=>{};runAnimationLoop=()=>{}
        stopCameraAnimation();clearAutoPath();pendingMove=null
        await tryMove(1,0)
        check(player.x===51 && moveAnim?.duration===140,'manual movement stays at 140 ms')
        check(moveAnim.walking,'manual land step animates the sprite')
        stopCameraAnimation()
        startPlannedAutoPath([{x:52,y:50}])
        check(player.x===52 && moveAnim?.duration===100,'even the last autopath step uses the accelerated animation')
        check(moveAnim.walking,'autopath land step animates the sprite')
        stopCameraAnimation()
        map[50][53]='river'
        await tryMove(1,0)
        check(player.x===53 && moveAnim?.walking===false,'entering a river skips the walking bob')
        stopCameraAnimation()
        await tryMove(-1,0)
        check(player.x===52 && moveAnim?.walking===false,'leaving a river skips the walking bob')
      } finally {
        stopCameraAnimation();clearAutoPath();pendingMove=null
        enemyTurn=old.enemyTurn;npcTurn=old.npcTurn;runAnimationLoop=old.runAnimationLoop
      }
    })()`))
  })
})
