function beginRareHuntGame(name = 'Rare Hunt Tester') {
  cy.viewport(1440, 900)
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.window().then(win => win.eval('WORLD_SEED = 246813579; rngState = WORLD_SEED'))
  cy.get('#raceName').clear().type(name)
  cy.get('#worldSizeSelect').select('XS')
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay', {timeout: 60000}).should($overlay => {
    expect($overlay.text(), 'world generation status').not.to.include('failed')
    expect($overlay, 'world generation finished').not.to.be.visible
  })
  cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
}

describe('Triangular damage variance with minimum spread', () => {
  beforeEach(() => beginRareHuntGame('Damage Tester'))

  it('keeps weak-hit ranges, scales strong hits, and uses one seeded draw per roll', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)},oldRng=rng
      try {
        let roll=0,calls=0;rng=()=>{calls++;return roll}
        for(const [atk,def,min,max] of [[4,10,1,4],[4,2,2,5],[10,0,7,12],[100,10,35,60]]) {
          roll=0;calls=0;check(damageRoll(atk,def)===min && calls===1,'lower bound and draw count')
          roll=.999999;calls=0;check(damageRoll(atk,def)===max && calls===1,'upper bound and draw count')
          const d=atk*10/(10+def),lower=Math.max(1,d*.3),upper=Math.max(2,d*.2)
          roll=lower/(lower+upper);check(damageRoll(atk,def)===Math.max(1,Math.round(d)),'triangular peak')
        }
        for(const u of [0,.1,.5,.999999]) {
          roll=u;check(damageRoll(0,1000)>=1 && damageRoll(.01,1000)>=1,'base minimum damage')
          check(damageRoll(10,-10)===damageRoll(10,0),'negative defense cannot amplify attack')
        }
        const bins=[0,0,0,0];for(let i=0;i<6000;i++){roll=(i+.5)/6000;bins[damageRoll(4,10)-1]++}
        check(bins[1]>bins[0] && bins[1]>bins[3],'weak hits favor central values')
        check(Math.abs(bins[1]/6000-13/24)<.001,'brass armor example probability')
      } finally {rng=oldRng}
    })()`))
  })

  it('repeats fixed-seed damage and consumes recorded replay RNG exactly', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const previous={rngState,replayPlaying,replayRecording,replayData,activeReplay,replayRngIndex}
      try {
        replayPlaying=false;replayRecording=false
        for(const seed of [12345,24680,424242]) {
          rngState=seed;const first=Array.from({length:60},(_,i)=>damageRoll(4+i,i%20))
          rngState=seed;const second=Array.from({length:60},(_,i)=>damageRoll(4+i,i%20))
          check(JSON.stringify(first)===JSON.stringify(second),'seeded damage '+seed)
          rngState=seed;replayData={rng:[]};replayRecording=true
          const live=Array.from({length:60},(_,i)=>damageRoll(4+i,i%20))
          check(replayData.rng.length===60,'one recorded draw per damage roll')
          replayRecording=false;activeReplay={rng:[...replayData.rng]};replayRngIndex=0;replayPlaying=true
          const restored=Array.from({length:60},(_,i)=>damageRoll(4+i,i%20))
          check(JSON.stringify(live)===JSON.stringify(restored) && replayRngIndex===60,'recorded damage replay '+seed)
          replayPlaying=false
        }
      } finally {rngState=previous.rngState;replayPlaying=previous.replayPlaying;replayRecording=previous.replayRecording;
        replayData=previous.replayData;activeReplay=previous.activeReplay;replayRngIndex=previous.replayRngIndex}
    })()`))
  })
})
