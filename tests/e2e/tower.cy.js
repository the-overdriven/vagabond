import {checkTowerReplayAndIsolation} from '../support/tower-checks'

function loadTower() {
  cy.visit('/')
  cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
  cy.readFile('tests/saves/Tester_start.json').then(save=>cy.window().then(win=>{
    win.__towerSave=save
    win.eval('loadGameFromObject(window.__towerSave,{isReplayInit:true});closeRaceSelect();replayRecording=false;replayAnimationsDisabled=true')
    delete win.__towerSave
  }))
}

describe('Guaranteed elevated tower',()=>{
  it('keeps floors, background boundaries and save/replay state isolated',()=>{
    loadTower()
    cy.window().then(win=>win.eval(`(${checkTowerReplayAndIsolation.toString()})()`))
  })
  for(const [name,width,height] of [['desktop',1280,800],['mobile',390,844]]) {
    it(`hides the surface rooms and changes the exterior perspective on ${name}`,()=>{
      cy.viewport(width,height);loadTower()
      cy.window().then(win=>{
        for(const tiles of [true,false]) {
          win.eval(`USE_TILE_IMAGES=${tiles};currentZ=0;map=surfaceMap;
            Object.assign(player,{x:tower.x+5,y:tower.y+16});invalidateUndergroundFov();renderScene(performance.now())`)
          expect(win.eval('towerShowsSummit()')).to.equal(true)
          expect(win.eval('undergroundTileVisible(tower.x+5,tower.y+9)')).to.equal(false)
          win.eval(`Object.assign(player,{x:tower.x+5,y:tower.y+11});invalidateUndergroundFov();renderScene(performance.now())`)
          expect(win.eval('towerShowsSummit()')).to.equal(false)
          expect(win.eval('undergroundTileVisible(tower.x+5,tower.y+9)')).to.equal(false)
          expect(win.eval('tileInspectInfo(tower.x+5,tower.y+9)')).to.equal(null)
          win.eval('openDungeonDoorAt(tower.entrance.x,tower.entrance.y);renderScene(performance.now())')
          expect(win.eval('undergroundTileVisible(tower.x+5,tower.y+9)')).to.equal(true)
          win.eval('closeDungeonDoorAt(tower.entrance.x,tower.entrance.y);renderScene(performance.now())')
          expect(win.eval('undergroundTileVisible(tower.x+5,tower.y+9)')).to.equal(false)
        }
      })
    })
    it(`renders tile and ASCII upper floors on ${name}`,()=>{
      cy.viewport(width,height);loadTower()
      cy.window().then(win=>{
        win.eval(`currentZ=4;currentCave=-1;map=towerLevels[3].map;
          undergroundDiscovered=towerLevels[3].discovered;
          Object.assign(player,towerStair(4,false));invalidateUndergroundFov();
          stopCameraAnimation();snapCameraToPlayer();render()`)
        // The north window must not cover the inner wall junction, and the
        // east chamber must have a proper southern wall with a door.
        expect(win.eval("towerLevels[0].map[tower.y][tower.x+5]")).to.equal('dwarvenwall')
        expect(win.eval("towerLevels[0].map[tower.y][tower.x+3]")).to.equal('towerwindow')
        expect(win.eval("towerLevels[0].map[tower.y+7][tower.x+6]")).to.equal('dwarvenwall')
        expect(win.eval("towerLevels[0].map[tower.y+7][tower.x+8]")).to.equal('dwarvendoorclosed')
        for(const tiles of [true,false]) {
          win.eval(`USE_TILE_IMAGES=${tiles};renderScene(performance.now())`)
          expect(win.eval('tileInspectInfo(tower.x-1,tower.y)')).to.equal(null)
          expect(win.eval("currentMapViewKey() === 'tower:4'")).to.equal(true)
          expect(win.eval('canvas.width > 0 && canvas.height > 0')).to.equal(true)
        }
      })
      cy.get('#game').should('be.visible').then($canvas=>{
        const rect=$canvas[0].getBoundingClientRect()
        expect(rect.left).to.be.at.least(0)
        expect(rect.right).to.be.at.most(width+1)
      })
    })
  }
})
