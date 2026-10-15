// Recovery markers are painted over the cached minimap terrain, not saved as
// separate objects. These tests cover both map views and the loot/save paths.
function beginNewGame() {
  cy.visit('/')
  cy.get('#raceName').clear().type('Remains Map Tester')
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
}

function captureMapSkulls(win) {
  win.eval(`
    window.__remainsMapDraws = []
    for (const [name, context] of [['world', mctx], ['side', sideCtx]]) {
      const original = context.fillText.bind(context)
      context.fillText = function(text, x, y, ...args) {
        if (text === '💀') window.__remainsMapDraws.push({name, x, y, alpha: this.globalAlpha})
        return original(text, x, y, ...args)
      }
    }
  `)
}

function redrawBothMaps(win) {
  win.eval(`
    window.__remainsMapDraws = []
    mapViewKey = 'surface'
    mapPanX = spawnPoint.x
    mapPanY = spawnPoint.y
    renderMinimapCanvas(mctx, MAP_SCALE, 0, 0, true)
    const origin = sideMiniOrigin()
    renderMinimapCanvas(sideCtx, SIDE_SCALE, origin.x, origin.y, false)
  `)
  return win.__remainsMapDraws
}

describe('Normal-death remains map markers', () => {
  it('marks outstanding remains on the world and side maps, persists them, and clears each when recovered', () => {
    beginNewGame()
    cy.window().then(win => {
      captureMapSkulls(win)
      win.eval(`
        replayAnimationsDisabled = true
        player.x = spawnPoint.x + 4
        player.y = spawnPoint.y + 4
        player.inventory = [{kind:'fish',name:'Fish'}]
        die()
      `)
      expect(win.eval('player.deaths')).to.equal(1)
      expect(win.eval("groundItems.filter(g => g.kind === 'playerremains')")).to.have.length(1)
      let samples = redrawBothMaps(win)
      expect(samples.filter(sample => sample.name === 'world')).to.have.length(1)
      expect(samples.filter(sample => sample.name === 'side')).to.have.length(1)
      expect(samples.every(sample => sample.alpha > 0 && sample.alpha < 1)).to.equal(true)
      const save = win.eval('JSON.parse(JSON.stringify(buildSaveObject()))')
      win.__remainsSave = save
      win.eval('loadGameFromObject(window.__remainsSave, {isReplayInit:true})')
      samples = redrawBothMaps(win)
      expect(samples.filter(sample => sample.name === 'world')).to.have.length(1)
      win.eval(`
        const remains = groundItems.find(g => g.kind === 'playerremains')
        player.x = remains.x; player.y = remains.y
        lootSkeletonOrForage()
      `)
      expect(win.eval("groundItems.filter(g => g.kind === 'playerremains')")).to.have.length(0)
      expect(redrawBothMaps(win)).to.have.length(0)
      expect(win.eval("player.inventory.some(i => i.name === 'Fish')")).to.equal(true)
    })
  })

  it('keeps separate deaths until each set of remains is retrieved, without marking empty drops', () => {
    beginNewGame()
    cy.window().then(win => {
      captureMapSkulls(win)
      win.eval(`
        replayAnimationsDisabled = true
        player.x = spawnPoint.x + 3; player.y = spawnPoint.y + 3
        player.inventory = [{kind:'fish',name:'Fish'}]; die()
        player.x = spawnPoint.x + 5; player.y = spawnPoint.y + 5
        player.inventory = [{kind:'berry',name:'Berry'}]; die()
      `)
      expect(win.eval("groundItems.filter(g => g.kind === 'playerremains')")).to.have.length(2)
      expect(redrawBothMaps(win).filter(sample => sample.name === 'world')).to.have.length(2)
      win.eval(`
        const remains = groundItems.find(g => g.kind === 'playerremains')
        player.x = remains.x; player.y = remains.y
        lootSkeletonOrForage()
      `)
      expect(redrawBothMaps(win).filter(sample => sample.name === 'world')).to.have.length(1)
      win.eval(`
        player.inventory = []; player.equip = {weapon:null,shield:null,armor:null,blackkey:null}
        player.x = spawnPoint.x + 7; player.y = spawnPoint.y + 7
        die()
      `)
      expect(win.eval("groundItems.filter(g => g.kind === 'playerremains')")).to.have.length(1)
      expect(redrawBothMaps(win).filter(sample => sample.name === 'world')).to.have.length(1)
    })
  })

  it('only paints remains on their own dungeon floor, distinguishing the crypt', () => {
    beginNewGame()
    cy.window().then(win => {
      captureMapSkulls(win)
      win.eval(`
        groundItems.push({kind:'playerremains',x:spawnPoint.x,y:spawnPoint.y,level:-2,levelKind:'chain',caveIndex:0,item:{kind:'fish',name:'Fish'}})
        groundItems.push({kind:'playerremains',x:spawnPoint.x+1,y:spawnPoint.y,level:-2,levelKind:'crypt2',item:{kind:'fish',name:'Fish'}})
        window.__remainsMapDraws = []
        drawDeathRemainsMarkers(mctx, MAP_SCALE, 0, 0, 1, 'surface')
      `)
      expect(win.__remainsMapDraws).to.have.length(0)
      win.eval("drawDeathRemainsMarkers(mctx, MAP_SCALE, 0, 0, 1, 'chain:2')")
      expect(win.__remainsMapDraws).to.have.length(1)
      win.eval("drawDeathRemainsMarkers(mctx, MAP_SCALE, 0, 0, 1, 'crypt2')")
      expect(win.__remainsMapDraws).to.have.length(2)
      win.eval("drawDeathRemainsMarkers(mctx, MAP_SCALE, 0, 0, 1, 'chain:1')")
      expect(win.__remainsMapDraws).to.have.length(2)
    })
  })

  it('replays the forage action without bringing back a recovered skull', () => {
    beginNewGame()
    cy.window().then(win => {
      win.eval(`
        replayAnimationsDisabled = true
        player.x = spawnPoint.x + 4; player.y = spawnPoint.y + 4
        player.inventory = [{kind:'fish',name:'Fish'}]; die()
        const remains = groundItems.find(g => g.kind === 'playerremains')
        player.x = remains.x; player.y = remains.y
        replayRecording = false; replayData = null; startReplayRecording()
        lootSkeletonOrForage()
        window.__remainsRecorded = structuredClone(replayData)
      `)
      expect(win.eval("window.__remainsRecorded.actions.some(a => a.type === 'forage')")).to.equal(true)
      expect(win.eval("groundItems.some(g => g.kind === 'playerremains')")).to.equal(false)
      win.eval(`
        loadGameFromObject(window.__remainsRecorded.initialState, {isReplayInit:true})
        replayRecording = false; replayPlaying = true; replaySimulationMode = true
        activeReplay = window.__remainsRecorded; replayRngIndex = 0
      `)
      expect(win.eval("groundItems.some(g => g.kind === 'playerremains')")).to.equal(true)
      return win.eval('runReplayAction(window.__remainsRecorded.actions.find(a => a.type === "forage"))').then(() => {
        expect(win.eval("groundItems.some(g => g.kind === 'playerremains')")).to.equal(false)
        win.eval('replayPlaying = false; replaySimulationMode = false; replayAnimationsDisabled = false')
      })
    })
  })
})
