describe('Exact current-save NPC restoration', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save => {
      cy.window().then(win => {
        win.__npcRestoreFixture=save
        win.eval('loadGameFromObject(window.__npcRestoreFixture,{isReplayInit:true})')
        delete win.__npcRestoreFixture
      })
    })
  })

  it('preserves valid empty NPC lists and RNG through save and replay restoration', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      replayRecording=false;replayPlaying=false;npcs=[]
      const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
      const oldSpawn=spawnNpcs
      try {
        spawnNpcs=()=>{throw Error('load attempted to generate replacement NPCs')}
        for(const opts of [{},{isReplayInit:true},{isReplayRestore:true}]) {
          npcs=[{name:'Unwanted NPC',x:0,y:0}]
          loadGameFromObject(snapshot,opts)
          check(npcs.length===0,'empty saved NPC list retained')
          check(rngState===snapshot.rngState,'NPC restoration does not consume RNG')
          check(buildSaveObject().npcs.length===0,'empty state survives resaving')
        }
      } finally {spawnNpcs=oldSpawn}
    })()`))
  })
})
