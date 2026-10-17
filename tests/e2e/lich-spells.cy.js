describe('Lich shield and debuffs', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Lich Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.window().then(win => win.eval(`(() => {
      window.lichCheck=(ok,msg)=>{if(!ok)throw new Error(msg)}
      currentZ=0;map=surfaceMap;enemies=[];groundItems=[];occupied=new Set()
      player.x=40;player.y=40;player.hp=100;player.maxHp=100;player.baseSpd=10
      player.lichWeakenTurns=0;player.lichSlowTurns=0;player.equip={weapon:null,shield:null,armor:null}
      player.inventory=[];player.godMode=false;player.invisibleTurns=0
      for(let y=35;y<=45;y++)for(let x=35;x<=45;x++){map[y][x]='grass';discovered[y][x]=true;grasslandTrees.delete(keyXY(x,y))}
      const t=ENEMY_TEMPLATE_BY_NAME.Lich
      window.testLich=addEnemy({...t,id:'test_lich',baseName:'Lich',x:42,y:40,level:0,
        alive:true,aware:true,maxHp:t.hp,hp:t.hp,prefix:null,equipment:null})
      occupied.add(keyXY(42,40))
    })()`))
  })

  it('uses the one-hit Gargoyle shield, then remains vulnerable', () => {
    cy.window().then(win => win.eval(`(() => {
      lichCheck(testLich.abilities.includes('deathShield'),'Lich has shield')
      testLich.hp=0
      lichCheck(absorbEnemyFatalHit(testLich)&&testLich.hp===1&&testLich.deathShieldUsed,'one lethal hit survives')
      testLich.hp=0
      lichCheck(!absorbEnemyFatalHit(testLich),'next lethal hit is fatal')
    })()`))
    cy.get('#logpanel').should('contain.text', 'death shield shatters')
  })

  it('applies each five-turn spell once, preserves it on load, and restores stats at expiry', () => {
    cy.window().then(win => win.eval(`(() => {
      const old={chance,randInt,enemyHasSight}
      try {
        chance=()=>true;randInt=()=>0;enemyHasSight=()=>true
        const speed=playerSpd(),hp=playerMaxHp()
        lichCheck(tryLichDebuff(testLich),'weaken cast')
        lichCheck(player.lichWeakenTurns===5&&playerMaxHp()===hp-10&&player.hp===90,'maximum HP capped')
        lichCheck(tryLichDebuff(testLich),'slow cast')
        lichCheck(player.lichSlowTurns===5&&playerSpd()===Math.max(1,speed-Math.ceil(speed*0.10)),'SPD penalty')
        lichCheck(!tryLichDebuff(testLich),'no repeated casts while both active')
        lichCheck(document.getElementById('logpanel').textContent.includes('weakens you')&&
          document.getElementById('logpanel').textContent.includes('slows you'),'both casts logged')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        lichCheck(player.lichWeakenTurns===5&&player.lichSlowTurns===5,'both durations restored')
        for(let n=0;n<5;n++)tickMonsterStatuses()
        lichCheck(playerMaxHp()===hp&&playerSpd()===speed&&player.hp===90,'stats restore without free healing')
      } finally {chance=old.chance;randInt=old.randInt;enemyHasSight=old.enemyHasSight}
    })()`))
  })
})
