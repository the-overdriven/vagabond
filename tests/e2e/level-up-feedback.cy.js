describe('Nonblocking level-up feedback', () => {
  it('combines level gains without adding turns or RNG and suppresses replay feedback', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Level Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
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

  it('awards capped melee-hit XP and preserves the cap across saves and replay', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Melee XP Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class','show')
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw new Error(msg)}
      replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true
      currentZ=0;currentCave=-1;map=surfaceMap
      enemies=[];npcs=[];occupied=new Set()
      for(let y=39;y<=41;y++)for(let x=39;x<=41;x++){
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
      }
      player.x=40;player.y=40;player.race='human';player.lvl=10
      player.xp=0;player.totalXpEarned=0;player.maxHp=500;player.hp=500
      player.equip={weapon:null,armor:null,shield:null}
      const t=ENEMY_TEMPLATE_BY_NAME.Kobold
      const e=addEnemy({...t,baseName:'Kobold',x:41,y:40,homeX:41,homeY:40,
        homeTileType:'grass',hp:100,maxHp:100,alive:true,abilities:[],
        equipment:null,prefix:null})
      occupied.add(keyXY(e.x,e.y))
      const cfg=MONSTER_XP_WEIGHTS.meleeHitBonus
      const cap=Math.floor(xpForEnemy(e)*cfg.maxEnemyRewardFraction)
      const oldChance=chance,oldDamage=damageRoll
      try{
        chance=()=>false;damageRoll=()=>1
        await playerAttackEnemy(e,true)
        const expected=Math.min(cap,cfg.xpPerDamagingHit)
        check(e.meleeHitXpGranted===expected,'first hit grants configured base XP')
        check(player.xp===Math.round(expected*xpMultiplier()),'racial XP multiplier applies to melee hit')
        const earned=player.xp
        chance=()=>true
        await playerAttackEnemy(e,true)
        check(player.xp===earned,'miss gives no hit XP')
        chance=()=>false;damageRoll=()=>0
        await playerAttackEnemy(e,true)
        check(player.xp===earned,'zero-damage hit gives no XP')
        damageRoll=()=>1
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        check(saved.enemies.find(m=>m.id===e.id).meleeHitXpGranted===expected,'save retains awarded XP')
        loadGameFromObject(saved,{isReplayInit:true})
        const restored=enemies.find(m=>m.id===e.id)
        check(restored.meleeHitXpGranted===expected,'replay-style load restores earned XP')
        check(player.xp===earned,'XP persists across replay-style load')
        for(let i=0;i<30;i++)await playerAttackEnemy(restored,true)
        check(restored.meleeHitXpGranted===cap,'melee XP respects per-monster cap')
        const afterCap=player.xp
        for(let i=0;i<3;i++)await playerAttackEnemy(restored,true)
        check(player.xp===afterCap,'further attacks cannot farm XP after reaching cap')
        const cappedSave=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(cappedSave,{isReplayInit:true})
        const capped=enemies.find(m=>m.id===e.id)
        check(capped.meleeHitXpGranted===cap,'spent cap persists in replay snapshot')
        await playerAttackEnemy(capped,true)
        check(player.xp===afterCap,'reloaded capped enemy cannot grant extra hit XP')
      }finally{chance=oldChance;damageRoll=oldDamage}
    })()`))
  })

})
