describe('Nonblocking level-up feedback', () => {
  it('combines level gains without adding turns or RNG and suppresses replay feedback', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Level Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class','show')
    cy.window().then(win=>win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw new Error(msg)}
      player.lvl=1;player.xp=0;player.maxHp=50;player.race='human'
      player.equip={weapon:null,shield:null,armor:null}
      replayPlaying=false;replaySimulationMode=false;replayAnimationsDisabled=false
      const amount=Math.ceil([1,2,3,4].reduce((sum,lvl)=>sum+xpToNext(lvl),0)/xpMultiplier())
      const turn=turnCount,seed=rngState
      gainXp(amount)
      const popup=document.getElementById('levelUpPopup')
      check(player.lvl===5&&player.maxHp===90,'all gameplay gains applied immediately')
      check(!popup.hidden&&popup.textContent==='Level Up!Level 5 · +40 max HP · +2 SPD · +1 GRACE','one combined notice')
      check(getComputedStyle(popup).pointerEvents==='none','notice does not intercept input')
      check(turnCount===turn&&rngState===seed,'notice adds no turns or RNG')
      const saved=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(saved,{isReplayInit:true})
      check(popup.hidden,'loading clears stale notice')
      replayPlaying=true;replaySimulationMode=true;replayAnimationsDisabled=true
      try {gainXp(10000);check(popup.hidden,'replay has no visual level-up side effects')}
      finally {replayPlaying=false;replaySimulationMode=false;replayAnimationsDisabled=false}
      showLevelUpPopup({hp:10,spd:0,grace:0});resetForNewCharacter()
      check(popup.hidden,'new character clears notice')
    })()`))
  })
})
