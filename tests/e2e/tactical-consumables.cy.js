function loadConsumableWorld(width, touch = false) {
  cy.viewport(width, 900)
  cy.visit('/', {onBeforeLoad(win) {
    if (touch) {
      const match = win.matchMedia.bind(win)
      win.matchMedia = query => /pointer:\s*coarse|hover:\s*none/.test(query)
        ? {matches:true, media:query, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}}
        : match(query)
    }
  }})
  cy.get('#loadingOverlay').should('not.be.visible')
  cy.get('#raceOverlay').should('be.visible')
  cy.readFile('tests/saves/Tester_start.json').then(save => cy.window().then(win => {
    win.consumableTestSave = save
    win.eval(`loadGameFromObject(consumableTestSave,{isReplayInit:true});raceOpen=false;
      document.getElementById('raceOverlay').classList.remove('show');
      enemies=[];npcs=[];groundItems=[];occupied=new Set();
      player.inventory=[];player.race='human';player.hp=playerMaxHp();
      player.stoneSkinTurns=0;player.berserkTurns=0;player.deathShieldReady=false;
      for(const kind of TACTICAL_CONSUMABLE_KINDS)addInventoryItem(kind);
      updateHud();render();toggleInv(true)`)
  }))
}

describe('Tactical consumables', () => {
  for (const [width, touch] of [[1440,false],[390,true]]) {
    it(`shows readable icons, effects and active statuses at ${width}px`, () => {
      loadConsumableWorld(width,touch)
      cy.get('#invList .invitem').filter(':contains("Scroll of Fear")').within(() => {
        cy.get('img').should($img => {
          expect($img[0].complete && $img[0].naturalWidth > 0).to.equal(true)
        })
        cy.contains('button','Read').should('be.visible')
        cy.contains('button','?').should('be.visible').click()
      })
      cy.window().then(win => win.eval(`
        for(const kind of ['scrollOfDeathShield','stoneSkinPotion','berserkPotion'])
          useTacticalConsumable(player.inventory.findIndex(i=>i.kind===kind),kind);
        toggleInv(false);updateHud();render()`))
      for (const id of ['death-shield','stone-skin','berserk'])
        cy.get(`[data-status="${id}"]`).should('be.visible').click()
      cy.get('#playerStatusDetail').should('be.visible').and('contain','−3 DEF')
      cy.window().then(win => {
        const state = win.eval(`(() => {
          const saved=JSON.parse(JSON.stringify(buildSaveObject()));
          loadGameFromObject(saved,{isReplayInit:true});updateHud();
          return {shield:player.deathShieldReady,stone:player.stoneSkinTurns,berserk:player.berserkTurns,
            stats:playerPermanentStats(),statuses:activePlayerStatuses().map(s=>s.id)}
        })()`)
        expect(state.shield).to.equal(true)
        expect(state.stone).to.be.greaterThan(0)
        expect(state.berserk).to.be.greaterThan(0)
        expect(state.statuses).to.include.members(['death-shield','stone-skin','berserk'])
      })
    })
  }

  it('keeps all five catalog icons, ground visuals, ASCII glyphs and pickup identities distinct', () => {
    loadConsumableWorld(1440)
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const paths=TACTICAL_CONSUMABLE_KINDS.map(itemIconPath), names=[];
        player.inventory=[];
        for(const kind of TACTICAL_CONSUMABLE_KINDS) {
          const drop={kind,x:player.x,y:player.y,level:currentZ};
          groundItems=[drop];names.push(groundItemLabel(drop));
          if(!groundGlyph(drop))throw new Error('Missing ASCII glyph: '+kind);
          if(RENDER_STYLE.groundItems[kind].image!==itemIconPath(kind))throw new Error('Icon mismatch');
          checkGroundAt(player.x,player.y)
        }
        return {paths,names,kinds:player.inventory.map(i=>i.kind),remaining:groundItems.length}
      })()`)
      expect(new Set(result.paths).size).to.equal(5)
      expect(new Set(result.names).size).to.equal(5)
      expect(result.kinds).to.have.length(5)
      expect(result.remaining).to.equal(0)
    })
  })
})
