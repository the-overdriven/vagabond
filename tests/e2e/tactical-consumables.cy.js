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

  for (const [width, touch] of [[1440,false],[390,true]]) {
    it(`previews and cancels fireball, then casts once at ${width}px`, () => {
      loadConsumableWorld(width,touch)
      cy.window().then(win => win.eval(`
        toggleInv(false);USE_TILE_IMAGES=${!touch};currentZ=0;map=surfaceMap;player.x=40;player.y=40;
        player.hp=500;player.berserkTurns=0;player.inventory=[createItem('scrollOfFireball',{count:2})];
        for(let y=30;y<52;y++)for(let x=30;x<52;x++){
          map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
        }
        snapCameraToPlayer();window.fireballTurn=turnCount;toggleInv(true);renderInventory();
      `))
      cy.get('#invList .invitem').filter(':contains("Scroll of Fireball")').contains('button','Read').click()
      if (touch) {
        cy.get('#fireballControls').should('be.visible').and('contain','You are in the blast')
        cy.get('#fireballCancel').click()
      } else {
        cy.get('#fireballControls').should('not.be.visible')
        cy.get('body').trigger('keydown',{key:'Escape'})
      }
      cy.window().then(win => {
        expect(win.eval('turnCount===window.fireballTurn && player.inventory[0].count===2')).to.equal(true)
        win.eval('beginFireballTargeting(0);setFireballTarget(47,40)')
      })
      cy.get('#fireballCast').should('be.disabled')
      cy.window().then(win => win.eval(`
        setFireballTarget(44,40);
        if(fireballBlastTiles(44,40).length!==21)throw Error('centered 21-tile blast');
        if(fireballVisualTiles(44,40).length!==49)throw Error('unclipped 7x7 flame presentation');
      `))
      if (touch) cy.get('#fireballCast').should('be.enabled').click()
      else cy.window().then(win => {
        const point=win.eval(`(() => {
          const r=canvas.getBoundingClientRect();
          return {x:r.left+(44-camX+0.5)*TILE_PX*r.width/canvas.width,
            y:r.top+(40-camY+0.5)*TILE_PX*r.height/canvas.height}
        })()`);
        win.eval('canvas').dispatchEvent(new win.MouseEvent('click',
          {clientX:point.x,clientY:point.y,bubbles:true}))
      })
      cy.get('#fireballControls').should('not.be.visible')
      cy.window().then(win => {
        expect(win.eval('player.inventory[0].count')).to.equal(1)
        expect(win.eval('turnCount')).to.equal(win.fireballTurn+1)
      })
    })
  }

  it('boosts Wyrdling combat-potion strength once, keeps penalties, and restores sampled values', () => {
    loadConsumableWorld(1440)
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,message)=>{if(!ok)throw Error(message)};
      toggleInv(false);player.race='wyrdling';player.baseAtk=18;player.baseDef=18;
      player.equip={weapon:null,armor:null,shield:null};player.curseDebuffs=[];
      map[player.y][player.x]='grass';
      for(let dose=0;dose<2;dose++)for(const kind of ['stoneSkinPotion','berserkPotion']){
        addInventoryItem(kind);
        useTacticalConsumable(player.inventory.findIndex(item=>item.kind===kind),kind)
      }
      check(player.stoneSkinBonus===11&&player.berserkBonus===9,'whole bonus scales once and rounds');
      check(player.stoneSkinTurns===17&&player.berserkTurns===18,'extended duration refreshes');
      check(potionGracePenalty()===5&&playerDef()===26&&playerAtk()===27,'penalties stay unchanged');
      const save=JSON.parse(JSON.stringify(buildSaveObject()));
      loadGameFromObject(save,{isReplayInit:true});
      check(player.stoneSkinBonus===11&&player.berserkBonus===9,'sampled boosted values persist');
      updateHud();
    })()`))
    cy.get('[data-status="stone-skin"]').should('have.attr','data-detail').and('contain','+11 DEF')
    cy.get('[data-status="berserk"]').should('have.attr','data-detail').and('contain','+9 ATK')
  })

  it('keeps all six catalog icons, ground visuals, ASCII glyphs and pickup identities distinct', () => {
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
      expect(new Set(result.paths).size).to.equal(6)
      expect(new Set(result.names).size).to.equal(6)
      expect(result.kinds).to.have.length(6)
      expect(result.remaining).to.equal(0)
    })
  })
})
