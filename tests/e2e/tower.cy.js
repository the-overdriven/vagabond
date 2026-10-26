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
    cy.window().then(async win=>{
      await win.eval(`(${checkTowerReplayAndIsolation.toString()})()`)
      // Rotate the loaded fixture rather than adding another expensive world
      // generation case. Its doors, four maps, and matched landings must turn.
      expect(win.eval(`(()=>{
        currentZ=0;map=surfaceMap
        rotateGeneratedWorld(1)
        const p=towerPoint(5,10)
        return TOWER_MIN_VILLAGE_GAP===50 &&
          towerFootprintDistance(tower.x-50,tower.y,tower.x,tower.y)===50 &&
          towerFootprintDistance(tower.x-49,tower.y,tower.x,tower.y)===49 &&
          tower.rotation===1 && tower.entrance.x===p.x && tower.entrance.y===p.y &&
          Array.from({length:5},(_,z)=>{
            const board=z===0?surfaceMap:towerLevels[z-1].map
            return [z<4?towerStair(z,true):null,z>0?towerStair(z,false):null]
              .filter(Boolean).every(q=>['towerstairsup','towerstairsdown'].includes(board[q.y]?.[q.x]))
          }).every(Boolean) &&
          terrainVisual(surfaceMap[tower.entrance.y][tower.entrance.x],
            tower.entrance.x,tower.entrance.y)?.quarterTurns === undefined
      })()`)).to.equal(true)
    })
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
        // The open roof has no dungeon FOV cutoff, including diagonal corners.
        expect(win.eval(`(()=>{const visible=currentUndergroundFov();
          return Array.from({length:11},(_,dy)=>Array.from({length:11},(_,dx)=>
            visible.has(keyXY(tower.x+dx,tower.y+dy)))).flat().every(Boolean)
        })()`)).to.equal(true)
        // The north window must not cover the inner wall junction, and the
        // east chamber must have a proper southern wall with a door.
        expect(win.eval("(()=>{const p=towerPoint(5,0);return towerLevels[0].map[p.y][p.x]})()")).to.equal('dwarvenwall')
        expect(win.eval("(()=>{const p=towerPoint(3,0);return towerLevels[0].map[p.y][p.x]})()")).to.equal('towerwindow')
        expect(win.eval("(()=>{const p=towerPoint(5,7);return towerLevels[0].map[p.y][p.x]})()")).to.equal('dwarvenwall')
        expect(win.eval("(()=>{const p=towerPoint(6,7);return towerLevels[0].map[p.y][p.x]})()")).to.equal('dwarvenwall')
        expect(['dwarvendoorclosed','dwarvendooropen']).to.include(win.eval("(()=>{const p=towerPoint(8,7);return towerLevels[0].map[p.y][p.x]})()"))
        expect(win.eval(`Array.from({length:5},(_,z)=>{
          const terrain=z===0?surfaceMap:towerLevels[z-1].map
          const stairs=[...(z<4?[towerStair(z,true)]:[]),...(z>0?[towerStair(z,false)]:[])]
          return stairs.every(p=>[-1,0,1].every(dy=>[-1,0,1].every(dx=>
            (dx===0&&dy===0)||terrain[p.y+dy]?.[p.x+dx]==='marble')))
        }).every(Boolean)`)).to.equal(true)
        expect(win.eval("towerLevels[3].map[tower.y][tower.x]")).to.equal('marble')
        expect(win.eval("towerLevels[3].map[tower.y+10][tower.x+10]")).to.equal('marble')
        expect(win.eval(`(()=>{const p=towerPoint(3,0);
          return terrainVisual('towerwindow',p.x,p.y)?.quarterTurns === undefined
        })()`)).to.equal(true)
        for(const tiles of [true,false]) {
          win.eval(`USE_TILE_IMAGES=${tiles};renderScene(performance.now())`)
          expect(win.eval('tileInspectInfo(tower.x-1,tower.y)')).to.equal(null)
          expect(win.eval("currentMapViewKey() === 'tower:4'")).to.equal(true)
          expect(win.eval('canvas.width > 0 && canvas.height > 0')).to.equal(true)
          expect(win.eval(`(()=>{const e=enemies.find(e=>e.alive&&(e.level??0)===0&&!towerContains(e.x,e.y));
            e.x=tower.x-2;e.y=tower.y+4;e.invisibleUntilTurn=0;
            e.wallAmbushHidden=false;e.pendingAbility=null;discovered[e.y][e.x]=true;
            return towerSurfaceMonsterVisible(e)&&!onCurrentLevel(e)&&tileInspectInfo(e.x,e.y)===null
          })()`)).to.equal(true)
          expect(win.eval(`(()=>{const original=drawEnemyVisual,draws=[];
            drawEnemyVisual=(x,y,e)=>draws.push(e);
            try{drawTowerSurfaceMonsters(performance.now());return draws.length>0}
            finally{drawEnemyVisual=original}
          })()`)).to.equal(true)
          expect(win.eval(`(()=>{const original=ctx.fillRect,rects=[];
            ctx.fillRect=(...args)=>{if(ctx.fillStyle==='rgba(0, 0, 0, 0.5)')rects.push(args)};
            try{shadeTowerExterior();return rects.length}finally{ctx.fillRect=original}
          })()`)).to.equal(0) // summit remains bright
          win.eval('currentZ=2;map=towerLevels[1].map;undergroundDiscovered=towerLevels[1].discovered;invalidateUndergroundFov();renderScene(performance.now())')
          expect(win.eval(`(()=>{const original=ctx.fillRect,rects=[];
            ctx.fillRect=(...args)=>{if(ctx.fillStyle==='rgba(0, 0, 0, 0.5)')rects.push(args)};
            try{shadeTowerExterior();return rects.length}finally{ctx.fillRect=original}
          })()`)).to.equal(4)
          win.eval('currentZ=4;map=towerLevels[3].map;undergroundDiscovered=towerLevels[3].discovered;invalidateUndergroundFov()')
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
