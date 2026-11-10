function campFixture() {
  cy.visit('/')
  cy.get('#raceOverlay').should('be.visible')
  cy.readFile('tests/saves/Tester_start.json').then(save => cy.window().then(win => {
    win.campSave = save
    win.eval(`loadGameFromObject(campSave);
      replayRecording=false;replayPlaying=false;raceOpen=false;invOpen=false;mapOpen=false;tradeOpen=false;
      currentZ=0;map=surfaceMap;player.x=60;player.y=50;spawnPoint={x:20,y:20};
      for(let y=40;y<=60;y++)for(let x=50;x<=70;x++)map[y][x]='grass';
      player.race='human';player.maxHp=200;player.hp=20;player.equip={};player.curseDebuffs=[];
      player.berryRegenTurns=0;player.poisonTurns=0;player.godMode=false;player.campRestProgress=0;
      player.inventory=[];enemies=[];npcs=[];groundItems=[];occupied=new Set();turnCount=0;
      groundItems.push({kind:'campfire',x:61,y:50,level:0,burnUntil:0,searched:true});
      addInventoryItem('flint');addInventoryItem('brushwood',{count:5});
      addInventoryItem('meat',{count:3});addInventoryItem('potato');addInventoryItem('fish');
      snapCameraToPlayer();render();updateHud();lootSkeletonOrForage();`)
  }))
}

describe('Abandoned campfire cooking and recovery', () => {
  it('inspects overlapping ground objects and interactive terrain without skipping either', () => {
    campFixture()
    cy.window().then(win => win.eval(`(() => {
      Campfires.close()
      groundItems=[{kind:'chest',x:60,y:50,level:0,opened:false},
        {kind:'potion',x:62,y:50,level:0},
        {kind:'droppeditem',x:62,y:50,level:0,item:createItem('potato')}]
      map[50][62]='dwarvenlever';map[51][62]='dwarvenpressureplate'
      enemies=[{name:'Goblin',baseName:'Goblin',x:62,y:51,level:0,alive:true},
        {name:'Hidden Goblin',baseName:'Goblin',x:63,y:51,level:0,alive:true,wallAmbushHidden:true}]
      const lines=[],oldLog=log
      try {log=message=>lines.push(message);describeSurroundings()}
      finally {log=oldLog}
      const text=lines.join(' ')
      if(!text.includes('a chest here')||!text.includes('a potion')||
        !text.includes('Potato')||!text.includes('control lever')||
        !text.includes('pressure plate')||!text.includes('Goblin')||text.includes('Hidden Goblin'))
        throw Error('Inspect omitted a nearby object, occupied trap, or item underfoot: '+text)
    })()`))
  })

  it('searches nearby campfire ashes with Inspect only once while F opens cooking', () => {
    campFixture()
    cy.window().then(win => win.eval(`(() => {
      Campfires.close()
      const fire=groundItems.find(g=>g.kind==='campfire')
      fire.searched=false
      const before=Campfires.count('potato'),oldChance=chance
      try {chance=()=>true;describeSurroundings();describeSurroundings()}
      finally {chance=oldChance}
      if(!fire.searched||Campfires.count('potato')!==before+1)
        throw Error('Inspect must search ashes once from an adjacent tile')
      lootSkeletonOrForage()
    })()`))
    cy.contains('#campOverlay h2','Abandoned campfire').should('be.visible')
  })

  it('uses a dwarven kitchen stove for longer cooking and persists the fire', () => {
    cy.viewport(1366,900)
    campFixture()
    cy.window().then(win => win.eval(`Campfires.close();groundItems=[{
      kind:'dwarvenstove',x:61,y:50,level:0,burnUntil:0,
      description:'An old dwarven kitchen stove.'}];lootSkeletonOrForage();`))
    cy.contains('#campOverlay h2','Dwarven stove').should('be.visible')
    cy.contains('#campOverlay button','Search ashes').should('not.exist')
    cy.window().then(win => expect(win.eval('isWalkableForPlayer(61,50)')).to.equal(false))
    cy.contains('#campOverlay button','Light fire').click()
    cy.contains('#campOverlay','Burning · 18 turns left').should('be.visible')
    cy.contains('#campOverlay button','Cook Fresh Fish (1)').click()
    cy.contains('#campOverlay button','Eat Cooked Fish').click()
    cy.window().then(win => {
      const snapshot=win.eval(`(() => {
        const save=buildSaveObject();
        return {fire:save.groundItems.find(g=>g.kind==='dwarvenstove'),
          fish:player.inventory.some(i=>i.kind==='cookedFish'),
          food:Campfires.foodRemaining()}
      })()`)
      expect(snapshot.fire.burnUntil).to.be.greaterThan(0)
      expect(snapshot.fish).to.equal(false)
      expect(snapshot.food).to.be.greaterThan(0)
    })
  })

  for (const [name,width,height] of [['desktop',1366,900],['mobile',390,844]]) {
    it(`cooks, eats and rests through the ${name} controls`, () => {
      cy.viewport(width,height)
      campFixture()
      cy.get('#campOverlay .camp-section-cook .camp-section-actions').then($actions => {
        const win=$actions[0].ownerDocument.defaultView
        const desktop=win.matchMedia('(min-width: 721px) and (any-pointer: fine)').matches
        const style=win.getComputedStyle($actions[0])
        const firstButton=$actions[0].querySelector('button')
        expect($actions[0].querySelectorAll('button').length).to.equal(4)
        if (desktop) {
          expect(style.display).to.equal('grid')
          expect(style.gridTemplateColumns.trim().split(/\s+/).length).to.equal(2)
          expect(win.getComputedStyle(firstButton).backgroundColor).to.equal('rgb(51, 39, 30)')
          expect(firstButton.getBoundingClientRect().height).to.be.lessThan(42)
        } else {
          expect(style.display).not.to.equal('grid')
          expect(firstButton.getBoundingClientRect().height).to.be.at.least(42)
        }
      })
      cy.contains('#campOverlay button','Light fire').click()
      cy.get('#campOverlay .camp-section-cook button:not(:disabled)').first().then($button => {
        const win=$button[0].ownerDocument.defaultView
        if (win.matchMedia('(min-width: 721px) and (any-pointer: fine)').matches)
          expect(win.getComputedStyle($button[0]).backgroundImage).to.include('linear-gradient')
      })
      cy.contains('#campOverlay','Burning · 12 turns left').should('be.visible')
      cy.contains('#campOverlay button','Cook Fresh Fish (1)').click()
      cy.contains('#campOverlay button','Eat Cooked Fish').click()
      cy.contains('#campOverlay button','Rest · up to 8 turns').click()
      cy.contains('#campOverlay button',/^Close$/).should('be.visible')
      cy.window().then(win => {
        expect(win.eval('player.hp')).to.equal(52)
        expect(win.eval('Campfires.foodRemaining()')).to.equal(0)
        expect(win.eval('Campfires.count("fish")+Campfires.count("cookedFish")')).to.equal(0)
        expect(win.eval('Campfires.count("brushwood")')).to.equal(4)
      })
      cy.get('#campOverlay .panelbox').then($box => {
        const bounds=$box[0].getBoundingClientRect()
        const win=$box[0].ownerDocument.defaultView
        const backdrop=win.getComputedStyle(win.document.getElementById('campOverlay'))
        const desktop=win.matchMedia('(min-width: 721px) and (any-pointer: fine)').matches
        expect(bounds.left).to.be.at.least(0)
        expect(bounds.right).to.be.at.most(width)
        expect(bounds.bottom).to.be.at.most(height)
        if (desktop) {
          expect(backdrop.justifyContent).to.equal('flex-end')
          expect(backdrop.backgroundColor).to.equal('rgba(0, 0, 0, 0)')
          expect(backdrop.backdropFilter).to.equal('none')
          expect(bounds.right).to.be.closeTo(width-16,2)
        } else {
          expect(backdrop.justifyContent).to.equal('center')
          expect(backdrop.backgroundColor).not.to.equal('rgba(0, 0, 0, 0)')
        }
      })
      if (name === 'desktop') {
        cy.viewport(1024,600)
        cy.get('#campOverlay .panelbox').then($box => {
          const bounds=$box[0].getBoundingClientRect()
          expect(bounds.left).to.be.at.least(0)
          expect(bounds.right).to.be.at.most(1024)
          expect(bounds.bottom).to.be.at.most(600)
        })
        cy.viewport(width,height)
      }
      cy.window().then(win => win.eval(`(() => {
        const fire=groundItems.find(g=>g.kind==='campfire')
        player.berryRegenTurns=0;player.campRestProgress=0
        fire.burnUntil=turnCount+3;Campfires.open(fire)
      })()`))
      cy.contains('#campOverlay','Only 3 turns of fire remain').should('be.visible')
      cy.contains('#campOverlay','you need 4 consecutive rest turns to heal 1 HP').should('be.visible')
      cy.contains('#campOverlay button',/^Close$/).click()
      cy.get('#campOverlay').should('not.exist')
    })
  }

  it('stops a cooking queue on new danger and preserves uncooked portions', () => {
    campFixture()
    cy.contains('#campOverlay button','Light fire').click()
    cy.contains('#campOverlay button','Cook up to 3 Meat').should('not.be.disabled')
    cy.window().then(win => win.eval(`window.campEnemyTurn=enemyTurn;
      enemyTurn=function(...args){const result=campEnemyTurn(...args);player.poisonTurns=2;return result}`))
    cy.contains('#campOverlay button','Cook up to 3 Meat').click()
    cy.contains('#campOverlay button',/^Close$/).should('be.visible')
    cy.window().then(win => {
      expect(win.eval('Campfires.count("roastedMeat")')).to.equal(1)
      expect(win.eval('Campfires.count("meat")')).to.equal(2)
      expect(win.eval('turnCount')).to.equal(2)
      win.eval('enemyTurn=campEnemyTurn')
    })
    cy.contains('#campOverlay','It is unsafe to camp here.').should('be.visible')
    cy.contains('#campOverlay','Cooking and resting are unavailable until it is safe again.').should('be.visible')
  })

  it('prevents further food stacking after a serving crosses 300 turns', () => {
    campFixture()
    cy.window().then(win => win.eval(`(() => {
      Campfires.close()
      player.berryRegenTurns=290
      const before=Campfires.count('meat')
      player.inventory.push(createItem('roastedMeat',{count:2}))
      const idx=player.inventory.findIndex(i=>i.kind==='roastedMeat')
      if(!Campfires.eat(idx))throw Error('first meal should be allowed below 300')
      if(player.berryRegenTurns<=300)throw Error('first meal should cross the soft cap')
      const remaining=Campfires.count('roastedMeat'),turns=player.berryRegenTurns
      if(Campfires.eat(player.inventory.findIndex(i=>i.kind==='roastedMeat')))
        throw Error('second meal must be blocked above 300')
      if(Campfires.count('roastedMeat')!==remaining||player.berryRegenTurns!==turns)
        throw Error('blocked meal consumed food or changed duration')
      if(Campfires.count('meat')!==before)throw Error('raw ingredients changed unexpectedly')
    })()`))
    cy.get('#logpanel').should('contain','You are full.')
  })
})
