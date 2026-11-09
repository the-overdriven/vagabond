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
  for (const [name,width,height] of [['desktop',1366,900],['mobile',390,844]]) {
    it(`cooks, eats and rests through the ${name} controls`, () => {
      cy.viewport(width,height)
      campFixture()
      cy.contains('#campOverlay button','Light fire').click()
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
        expect(bounds.left).to.be.at.least(0)
        expect(bounds.right).to.be.at.most(width)
        expect(bounds.bottom).to.be.at.most(height)
      })
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
  })
})
