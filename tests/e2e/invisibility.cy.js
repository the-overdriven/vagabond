function beginGame() {
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.get('#raceName').clear().type('Invisibility Tester')
  // These cases test mechanics, not random world-generation attempts.
  cy.get('#worldSizeSelect').select('XS')
  cy.window().then(win => win.eval('WORLD_SEED = 12345; rngState = WORLD_SEED'))
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay', {timeout:60000}).should($overlay => {
    expect($overlay.text(), 'world generation status').not.to.include('failed')
    expect($overlay, 'world generation finished').not.to.be.visible
  })
  cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
  cy.get('#raceOverlay').should('not.have.class', 'show')
  cy.window().then(win => win.eval(`(() => {
    // Test retaliation outside Temple sanctuary with controlled combat stats.
    replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true
    enemies=[];npcs=[];groundItems=[];occupied=new Set();currentZ=0;map=surfaceMap
    player.x=spawnPoint.x<MAP_W/2?MAP_W-12:12
    player.y=spawnPoint.y<MAP_H/2?MAP_H-12:12
    for(let y=player.y-2;y<=player.y+2;y++)for(let x=player.x-2;x<=player.x+2;x++) {
      map[y][x]='grass';grasslandTrees.delete(keyXY(x,y));discovered[y][x]=true
    }
    player.baseAtk=2;player.baseDef=0;player.baseSpd=2;player.lvl=1
    player.hp=50;player.maxHp=50;player.poisonTurns=0;player.invisibleTurns=0
    player.curseDebuffs=[];player.equip={weapon:null,armor:null,shield:null}
    resetSwimming();deathTransition=null;stopCameraAnimation();stopAttackAnimation();snapCameraToPlayer()
  })()`))
}

describe('Scroll of Invisibility', () => {
  it('stocks three scrolls at 200g and lasts 20 turns (25 for Wyrdlings)', () => {
    beginGame()
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const stock = merchantStock.find(it => it.kind === 'scrollOfInvisibility')
        addInvisibilityScroll()
        ITEM_ACTION_HANDLERS.scrollOfInvisibility(player.inventory.length - 1)
        const humanTurns = player.invisibleTurns
        player.race = 'wyrdling'
        addInvisibilityScroll()
        ITEM_ACTION_HANDLERS.scrollOfInvisibility(player.inventory.length - 1)
        return {stock: {count: stock.count, price: stock.merchantPrice}, humanTurns, wyrdlingTurns: player.invisibleTurns,
          catalog: {oldKindExists: Object.hasOwn(ITEM_DEFINITIONS, 'scroll'),
            handler: itemDefinition('scrollOfInvisibility').actions[0].handler,
            icon: itemIconPath('scrollOfInvisibility')}}
      })()`)
      expect(result.stock).to.deep.equal({count: 3, price: 200})
      expect(result.catalog).to.deep.equal({oldKindExists: false,
        handler: 'scrollOfInvisibility', icon: 'img/icons/scroll.svg'})
      expect(result.humanTurns).to.equal(19)
      expect(result.wyrdlingTurns).to.equal(24)
    })
    cy.get('[data-status="invisible"]').should('contain.text', '24t')
  })

  it('does not replenish sold-out merchant scrolls when stock is ensured again', () => {
    beginGame()
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const scroll = merchantStock.find(it => it.kind === 'scrollOfInvisibility')
        player.gold = 600
        for (let i = 0; i < 3; i++) buyItem(scroll)
        ensureMerchantStock()
        renderTrade()
        return {
          stock: merchantStock.find(it => it.kind === 'scrollOfInvisibility')?.count,
          inventory: player.inventory.find(it => it.kind === 'scrollOfInvisibility')?.count,
          buyList: document.getElementById('tradeBuyList').textContent
        }
      })()`)
      expect(result.stock).to.equal(0)
      expect(result.inventory).to.equal(3)
      expect(result.buyList).to.not.include('Scroll of Invisibility')
    })
  })

  it('reacts once to an invisible hit without chasing or wandering afterward', () => {
    beginGame()
    cy.window().then(win => win.eval(`(async () => {
      replayAnimationsDisabled = true
      const e = {
        name: 'Goblin', baseName: 'Goblin', tier: 2, aggro: 3, hp: 100, maxHp: 100,
        atk: 1, def: 0, spd: 2, x: player.x + 1, y: player.y,
        level: currentZ, alive: true, }
      map[e.y][e.x] = 'grass'
      enemies.push(e)
      occupied.add(keyXY(e.x, e.y))
      player.invisibleTurns = 20
      const originalRng = rng
      const rolls = [0.5, 0.5, 0.5, 0.05]
      rng = () => rolls.length ? rolls.shift() : 0.5
      try {
        await tryMove(1, 0)
        return {x: e.x, y: e.y, hp: e.hp, invisibleTurns: player.invisibleTurns, aware: e.aware}
      } finally {
        rng = originalRng
      }
    })()`).then(result => {
      expect(result.hp).to.be.lessThan(100)
      expect(result.invisibleTurns).to.equal(19)
      expect(result.aware).to.equal(false)
    }))
    cy.get('#logpanel').should('contain.text', 'The Goblin is confused at the unseen attack!')
    cy.get('#logpanel').should('not.contain.text', 'The Goblin has spotted you!')
  })

  it('recoils without moving or fleeing, but can still lash out at reduced accuracy', () => {
    beginGame()
    cy.window().then(win => {
      const result = win.eval(`(() => {
        replayAnimationsDisabled = true
        const e = {
          name: 'Goblin', baseName: 'Goblin', tier: 2, aggro: 3, hp: 100, maxHp: 100,
          atk: 1, def: 0, spd: 2, x: player.x + 1, y: player.y,
          level: currentZ, alive: true
        }
        enemies.push(e)
        occupied.add(keyXY(e.x, e.y))
        const oldRng = rng
        try {
          rng=()=>0.2
          const before={x:e.x,y:e.y}, occupancy=occupied.size
          reactToInvisibleAttack(e, 0)
          const after={x:e.x,y:e.y}
          player.hp=50
          const missedRolls=[0.6,0.1,0.5,0.5]
          rng=()=>missedRolls.shift()??0.5
          reactToInvisibleAttack(e, 0)
          const missedHp=player.hp
          const hitRolls=[0.6,0.99,0.5,0.5]
          rng=()=>hitRolls.shift()??0.5
          reactToInvisibleAttack(e, 0)
          return {before,after,occupancyUnchanged:occupied.size===occupancy,missedHp,hp:player.hp}
        } finally {rng=oldRng}
      })()`)
      expect(result.before).to.deep.equal(result.after)
      expect(result.occupancyUnchanged).to.equal(true)
      expect(result.missedHp).to.equal(50)
      expect(result.hp).to.be.lessThan(50)
    })
    cy.get('#logpanel').should('contain.text', 'recoils from the unseen attack!')
    cy.get('#logpanel').should('contain.text', 'lashes out wildly into the empty air!')
  })

  it('uses damage, tier, and aggro in the recoil threshold without moving', () => {
    beginGame()
    cy.window().then(win => {
      const result=win.eval(`(() => {
        const e={name:'Goblin',tier:2,aggro:3,hp:100,maxHp:100,atk:1,def:0,spd:2,
          x:player.x+1,y:player.y,level:currentZ,alive:true}
        const oldRng=rng,oldLog=log,logs=[]
        try {
          rng=()=>0.34
          log=msg=>logs.push(msg)
          const before={x:e.x,y:e.y}
          reactToInvisibleAttack(e,0)
          reactToInvisibleAttack(e,4)
          return {before,after:{x:e.x,y:e.y},messages:logs.filter(msg=>msg.includes('lashes out wildly') || msg.includes('recoils'))}
        } finally {rng=oldRng;log=oldLog}
      })()`)
      expect(result.after).to.deep.equal(result.before)
      expect(result.messages[0]).to.include('lashes out wildly')
      expect(result.messages[1]).to.include('recoils')
    })
  })

})
