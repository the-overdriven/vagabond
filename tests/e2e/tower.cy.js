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
  it('carves the connected lower Tower labyrinth without changing x/y or resetting its gates', function () {
    this.timeout(180000)
    cy.viewport(1280,800)
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.window({timeout:180000}).then(async win=>{
      const result=await win.eval(`(async()=>{
        // Fixed-seed worldgen with a compact deterministic test silhouette.
        // Reuse the same app generator, not a fabricated parallel dungeon.
        CaveSilhouettes.prepare=async seed=>{
          CAVE_SILHOUETTES=[{id:CaveSilhouettes.idForSeed(seed),sourceIds:['a','b'],
            rows:Array.from({length:32},(_,y)=>Array.from({length:32},(_,x)=>
              ((x-15)**2+(y-15)**2<212?'1':'0')).join(''))}]
          return CAVE_SILHOUETTES[0]
        }
        WORLD_SEED=67893;rngState=WORLD_SEED;applyWorldTraits([],'XS')
        map=[];surfaceMap=null;enemies=[];groundItems=[];occupied=new Set()
        player.inventory=[];player.curseDebuffs=[];replayRecording=false
        replayAnimationsDisabled=true;raceOpen=false
        await generateNewWorld()
        const count=z=>enemies.filter(e=>e.alive&&e.towerMazeResident&&e.level===z).length
        const before={x:towerMaze.center.x,y:towerMaze.center.y}
        currentZ=0;map=surfaceMap;Object.assign(player,before)
        const down=TowerMaze.switchStairs()&&currentZ===-1&&player.x===before.x&&player.y===before.y
        Object.assign(player,towerMaze.down)
        const lower={x:player.x,y:player.y}
        const deep=TowerMaze.switchStairs()&&currentZ===-2&&player.x===lower.x&&player.y===lower.y
        const back=TowerMaze.switchStairs()&&currentZ===-1&&player.x===lower.x&&player.y===lower.y
        currentZ=3;map=towerLevels[2].map
        // Bump the basement gate before flipping the lever.
        currentZ=-1;map=undergroundMap
        const oldLog=log,gate=towerMaze.gate
        const dx=Math.sign(gate.x-towerMaze.center.x),dy=Math.sign(gate.y-towerMaze.center.y)
        Object.assign(player,{x:gate.x-dx,y:gate.y-dy})
        let messages=[];log=text=>messages.push(text)
        const beforeGateTurn=turnCount
        await tryMove(dx,dy)
        const basementFeedback=messages.length===1 &&
          messages[0]==="The door won't budge." && turnCount===beforeGateTurn
        log=oldLog
        currentZ=3;map=towerLevels[2].map
        const lever=TowerMaze.toggle(towerMaze.lever.x,towerMaze.lever.y)
        const sealed=towerMaze.active&&surfaceMap[tower.entrance.y][tower.entrance.x]==='towerentrancesealed'
        currentZ=0;map=surfaceMap
        Object.assign(player,{x:tower.entrance.x,y:tower.entrance.y+1})
        messages=[];log=text=>messages.push(text)
        const beforeTowerTurn=turnCount
        await tryMove(0,-1)
        const towerFeedback=messages.length===1 &&
          messages[0]==="The door won't budge." && turnCount===beforeTowerTurn
        log=oldLog
        currentZ=3;map=towerLevels[2].map
        const oldVisible=undergroundTileVisible
        undergroundTileVisible=()=>true
        const leverTooltip=tileInspectInfo(towerMaze.lever.x,towerMaze.lever.y)?.html||''
        const gateTooltip=(()=>{
          currentZ=-1;map=undergroundMap
          return tileInspectInfo(towerMaze.gate.x,towerMaze.gate.y)?.html||''
        })()
        undergroundTileVisible=oldVisible
        const noSpoilers=leverTooltip.includes('Old Lever')&&
          gateTooltip.includes('Basement Gate')&&
          !/upstairs|below|exchange|opens|mechanism/i.test(leverTooltip+' '+gateTooltip)
        const saved=buildSaveObject()
        loadGameFromObject(saved,{isReplayInit:true})
        return {down,deep,back,lever,sealed,basementFeedback,towerFeedback,
          noSpoilers,persisted:towerMaze.active,
          monsters:[count(-1),count(-2)],
          ghost:enemies.some(e=>e.towerMazeResident &&
            (e.abilities.includes('fly')||e.abilities.includes('ethereal'))),
          chest:groundItems.filter(g=>g.towerMazeTreasure).length,
          upper:undergroundMap[towerMaze.center.y][towerMaze.center.x],
          lower:deepLevels[0].map[towerMaze.down.y][towerMaze.down.x]}
      })()`)
      expect(result).to.include({down:true,deep:true,back:true,lever:true,
        sealed:true,basementFeedback:true,towerFeedback:true,
        noSpoilers:true,persisted:true,ghost:false,chest:1,
        upper:'mazestairsup',lower:'caveup'})
      expect(result.monsters[0]).to.be.within(8,15)
      expect(result.monsters[1]).to.be.within(8,15)
    })
  })
  for (const [device,width,height] of [['desktop',1280,800],['mobile',390,844]]) {
    it(`opens the clicked entrance without entering its tile on ${device}`,()=>{
      cy.viewport(width,height);loadTower()
      cy.window().then(async win=>{
        const before=win.eval(`(()=>{
          currentZ=0;map=surfaceMap;replayAnimationsDisabled=true;
          const outside=towerPoint(5,tower.size)
          Object.assign(player,outside)
          map[tower.entrance.y][tower.entrance.x]='dwarvendoorclosed'
          enemies=[];occupied=new Set();clearAutoPath();pendingMove=null
          stopCameraAnimation();snapCameraToPlayer();invalidateUndergroundFov();render()
          return {x:player.x,y:player.y,turnCount}
        })()`)
        const pos=win.eval(`(()=>{
          const rect=canvas.getBoundingClientRect()
          return {
            x:rect.left+(tower.entrance.x-camX+.5)*TILE_PX*rect.width/canvas.width,
            y:rect.top+(tower.entrance.y-camY+.5)*TILE_PX*rect.height/canvas.height
          }
        })()`)
        if(device==='desktop') {
          win.eval(`canvas.dispatchEvent(new MouseEvent('click',{
            bubbles:true,clientX:${pos.x},clientY:${pos.y}
          }))`)
        } else {
          win.eval(`(()=>{
            const p={clientX:${pos.x},clientY:${pos.y}}
            const start=new Event('touchstart',{bubbles:true,cancelable:true})
            Object.defineProperty(start,'touches',{value:[p]})
            canvas.dispatchEvent(start)
            const end=new Event('touchend',{bubbles:true,cancelable:true})
            Object.defineProperty(end,'touches',{value:[]})
            Object.defineProperty(end,'changedTouches',{value:[p]})
            canvas.dispatchEvent(end)
          })()`)
        }
        expect(win.eval('map[tower.entrance.y][tower.entrance.x]')).to.equal('dwarvendooropen')
        expect(win.eval('player.x')).to.equal(before.x)
        expect(win.eval('player.y')).to.equal(before.y)
        expect(win.eval('autoPath')).to.equal(null)
        expect(win.eval('turnCount')).to.equal(before.turnCount+1)
        await win.eval('tryMove(tower.entrance.x-player.x,tower.entrance.y-player.y)')
        expect(win.eval('player.x')).to.equal(win.eval('tower.entrance.x'))
        expect(win.eval('player.y')).to.equal(win.eval('tower.entrance.y'))
      })
    })
  }
  it('keeps floors, background boundaries and save/replay state isolated',()=>{
    loadTower()
    cy.window().then(async win=>{
      await win.eval(`(${checkTowerReplayAndIsolation.toString()})()`)
      win.eval('currentZ=0;map=surfaceMap')
      await win.eval('preloadImages()')
      for (const state of ['dwarvendoorclosed','dwarvendooropen']) {
        expect(win.eval(`resolveVisualImage(terrainVisual('${state}',tower.entrance.x,tower.entrance.y))?.naturalWidth > 0`),
          state + ' image is loaded and drawable').to.equal(true)
      }
      expect(win.eval(`terrainVisual('dwarvendooropen',tower.entrance.x,tower.entrance.y).image`))
        .to.equal('img/tiles/tower-entrance-open.png')
      expect(win.eval(`terrainVisual('dwarvendoorclosed',tower.entrance.x,tower.entrance.y).image`))
        .to.equal('img/tiles/tower-entrance.png')
      // Rotate the loaded fixture rather than adding another expensive world
      // generation case. Its doors, four maps, and matched landings must turn.
      expect(win.eval(`(()=>{
        currentZ=0;map=surfaceMap
        rotateGeneratedWorld(1)
        const p=towerPoint(5,tower.size-1)
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
  it('occludes surface monsters with trees below the tower and avoids square sand patches',()=>{
    cy.viewport(1280,800);loadTower()
    cy.window().then(win=>{
      const result=win.eval(`(()=>{
        const saved={currentZ,map,enemies,camX,camY,useTiles:USE_TILE_IMAGES,
          drawEnemyVisual,drawImageVisual,enemyHasAbility}
        const x=tower.x-2,y=tower.y+4,key=keyXY(x,y)
        const savedTile=surfaceMap[y][x],savedUnderlay=tileUnderlays[key]
        const savedDiscovery=discovered[y][x]
        const wasForaged=foragedTiles.has(key)
        try {
          const template=enemies.find(e=>e.alive&&(e.level??0)===0)
          if(!template)throw Error('Missing surface enemy in tower fixture')
          currentZ=4;map=towerLevels[3].map;USE_TILE_IMAGES=true
          // The loaded character starts at the Temple, far from this render fixture.
          camX=x-2;camY=y-2
          surfaceMap[y][x]='forest';tileUnderlays[key]='sand';discovered[y][x]=true
          foragedTiles.delete(key)
          const ground=towerBackgroundGround('forest',x,y)
          const sand=RENDER_STYLE.terrainTiles.sand
          const blend=sandGrassBlendImage(sand,[['forest','sand']],1,0)
          const e={...template,x,y,level:0,levelKind:'surface',abilities:[],
            animStart:undefined,invisibleUntilTurn:0,wallAmbushHidden:false,pendingAbility:null}
          enemies=[e]
          const draws=[]
          drawEnemyVisual=()=>draws.push('enemy')
          drawImageVisual=(px,py,visual)=>{draws.push(visual?.image==='img/tiles/forest-tree.png'?'forest':'other');return true}
          enemyHasAbility=(enemy,ability)=>ability==='fly'?e.flying:saved.enemyHasAbility(enemy,ability)
          const check=()=>{
            draws.length=0;drawTowerSurfaceMonsters(performance.now());return [...draws]
          }
          const groundRoof=check()
          currentZ=2;map=towerLevels[1].map
          const groundRoom=check()
          e.flying=true
          const flying=check()
          USE_TILE_IMAGES=false;e.flying=false
          const ascii=check()
          return {ground,blend:blend===sand.blendGrassWImage,
            groundRoof,groundRoom,flying,ascii}
        } finally {
          currentZ=saved.currentZ;map=saved.map;enemies=saved.enemies
          camX=saved.camX;camY=saved.camY
          USE_TILE_IMAGES=saved.useTiles
          drawEnemyVisual=saved.drawEnemyVisual;drawImageVisual=saved.drawImageVisual
          enemyHasAbility=saved.enemyHasAbility
          surfaceMap[y][x]=savedTile;discovered[y][x]=savedDiscovery
          if(wasForaged)foragedTiles.add(key)
          if(savedUnderlay===undefined)delete tileUnderlays[key]
          else tileUnderlays[key]=savedUnderlay
          render()
        }
      })()`)
      expect(result.ground).to.equal('grass')
      expect(result.blend).to.equal(true)
      for(const order of [result.groundRoof,result.groundRoom])
        expect(order).to.deep.equal(['enemy','forest'])
      expect(result.flying).to.deep.equal(['enemy'])
      expect(result.ascii).to.deep.equal(['enemy'])
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
        // Every playable roof tile is visible, but chamfered void corners
        // must remain outside the tower rather than becoming visible floor.
        expect(win.eval(`(()=>{const visible=currentUndergroundFov();
          return Array.from({length:tower.size},(_,dy)=>Array.from({length:tower.size},(_,dx)=>
            visible.has(keyXY(tower.x+dx,tower.y+dy))===towerContains(tower.x+dx,tower.y+dy))).flat().every(Boolean)
        })()`)).to.equal(true)
        // The north window must not cover the inner wall junction, and the
        // east chamber must have a proper southern wall with a door.
        expect(win.eval("(()=>{const p=towerPoint(5,0);return towerLevels[0].map[p.y][p.x]})()")).to.equal('dwarvenwall')
        expect(win.eval("(()=>{const p=towerPoint(3,0);return towerLevels[0].map[p.y][p.x]})()")).to.equal('towerwindow')
        expect(win.eval("(()=>{const p=towerPoint(5,tower.size-4);return towerLevels[0].map[p.y][p.x]})()")).to.equal('dwarvenwall')
        expect(win.eval("(()=>{const p=towerPoint(6,tower.size-4);return towerLevels[0].map[p.y][p.x]})()")).to.equal('dwarvenwall')
        expect(['dwarvendoorclosed','dwarvendooropen']).to.include(win.eval("(()=>{const p=towerPoint(tower.size-3,tower.size-4);return towerLevels[0].map[p.y][p.x]})()"))
        expect(win.eval(`Array.from({length:5},(_,z)=>{
          const terrain=z===0?surfaceMap:towerLevels[z-1].map
          const stairs=[...(z<4?[towerStair(z,true)]:[]),...(z>0?[towerStair(z,false)]:[])]
          return stairs.every(p=>[-1,0,1].every(dy=>[-1,0,1].every(dx=>
            (dx===0&&dy===0)||terrain[p.y+dy]?.[p.x+dx]==='marble')))
        }).every(Boolean)`)).to.equal(true)
        expect(win.eval(`(()=>{
          const corners=[[0,0],[tower.size-1,0],[0,tower.size-1],[tower.size-1,tower.size-1]]
          return corners.every(([dx,dy])=>{const p=towerPoint(dx,dy)
            return towerLevels[3].map[p.y][p.x]===(tower.cornerCut?'towervoid':'marble')})
        })()`)).to.equal(true)
        expect(win.eval(`(()=>{const p=towerPoint(3,0);
          return terrainVisual('towerwindow',p.x,p.y)?.quarterTurns === undefined
        })()`)).to.equal(true)
        for(const tiles of [true,false]) {
          win.eval(`USE_TILE_IMAGES=${tiles};renderScene(performance.now())`)
          const roundBackings=win.eval(`(()=>{
            const original=ctx.fill;let drawn=0
            ctx.fill=function(...args){
              if(ctx.fillStyle==='rgba(240, 243, 246, 0.17)')drawn++
              return original.apply(this,args)
            }
            try{renderScene(performance.now());return drawn}finally{ctx.fill=original}
          })()`)
          expect(roundBackings>0,'monster backing appears only in tile mode').to.equal(tiles)
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
          })()`)).to.equal(win.eval('4 + (tower.cornerCut ? 4 : 0)'))
          win.eval('currentZ=4;map=towerLevels[3].map;undergroundDiscovered=towerLevels[3].discovered;invalidateUndergroundFov()')
        }
      })
      cy.get('#game').should('be.visible').then($canvas=>{
        const rect=$canvas[0].getBoundingClientRect()
        if (width > 720) {
          // Desktop intentionally centers an oversized canvas inside a clipped
          // full-viewport stage, preserving whole, square terrain pixels.
          const stage=$canvas[0].ownerDocument.querySelector('#stage').getBoundingClientRect()
          expect(stage.left).to.be.at.least(0)
          expect(stage.right).to.be.at.most(width+1)
          expect(rect.left).to.be.at.most(stage.left+2)
          expect(rect.right).to.be.at.least(stage.right-2)
        } else {
          // Narrow windows must fit the displayed canvas inside the viewport.
          expect(rect.left).to.be.at.least(0)
          expect(rect.right).to.be.at.most(width+1)
        }
      })
    })
  }
})
