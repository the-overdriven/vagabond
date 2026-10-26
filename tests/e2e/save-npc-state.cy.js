describe('Exact current-save state restoration', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save => {
      cy.window().then(win => {
        expect(save.version, 'shared test fixture matches the current save format').to.equal(win.VAGABOND_SAVE_VERSION)
        win.__npcRestoreFixture=save
        win.eval('loadGameFromObject(window.__npcRestoreFixture,{isReplayInit:true})')
        delete win.__npcRestoreFixture
      })
    })
  })

  it('preserves valid empty NPC lists and RNG through save and replay restoration', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      replayRecording=false;replayPlaying=false;npcs=[]
      const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
      const oldSpawn=spawnNpcs
      try {
        spawnNpcs=()=>{throw Error('load attempted to generate replacement NPCs')}
        for(const opts of [{},{isReplayInit:true},{isReplayRestore:true}]) {
          npcs=[{name:'Unwanted NPC',x:0,y:0}]
          loadGameFromObject(snapshot,opts)
          check(npcs.length===0,'empty saved NPC list retained')
          check(rngState===snapshot.rngState,'NPC restoration does not consume RNG')
          check(buildSaveObject().npcs.length===0,'empty state survives resaving')
        }
      } finally {spawnNpcs=oldSpawn}
    })()`))
  })

  it('restores dug sand coloring on both cached maps and keeps digging state in replay', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      let spot=null
      for(let y=0;y<MAP_H&&!spot;y++)for(let x=0;x<MAP_W;x++) {
        if(surfaceMap[y][x]==='sand'){spot={x,y};break}
      }
      check(!!spot,'surface has sand')
      const key=keyXY(spot.x,spot.y)
      discovered[spot.y][spot.x]=true
      dugSandTiles.add(key)
      rebuildMinimapBases()
      const pixel=scale=>Array.from(miniBases[scale].ctx.getImageData(
        spot.x*scale,spot.y*scale,1,1).data)
      const dugMain=pixel(MAP_SCALE),dugSide=pixel(SIDE_SCALE)
      const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
      const snapshot=structuredClone(buildSaveObject())
      check(snapshot.dugSandTiles.includes(key),'dug tile serialized')
      dugSandTiles.clear();rebuildMinimapBases()
      check(!same(pixel(MAP_SCALE),dugMain),'undug sand has a different map color')
      for(const options of [{},{isReplayInit:true}]) {
        loadGameFromObject(snapshot,options)
        check(dugSandTiles.has(key),'digging state restored')
        check(same(pixel(MAP_SCALE),dugMain),'full-map cached color restored')
        check(same(pixel(SIDE_SCALE),dugSide),'side-minimap cached color restored')
        check(rngState===snapshot.rngState,'restoration does not change RNG')
      }
    })()`))
  })

  it('repaints a mined surface boulder on both minimaps before saving', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      currentZ=0;map=surfaceMap
      const x=player.x+3,y=player.y+3,key=keyXY(x,y)
      enemies=[];npcs=[];groundItems=[]
      surfaceMap[y][x]='boulder'
      tileUnderlays[key]='sand'
      discovered[y][x]=true
      check(tileInspectInfo(x,y)===null,'surface boulders do not open inspection tooltips')
      player.miningTutorialSeen=true
      player.mining=0
      player.miningArmedTarget=null
      player.inventory.push(createItem('pickaxe'))
      rebuildMinimapBases()
      const pixel=scale=>Array.from(miniBases[scale].ctx.getImageData(x*scale,y*scale,1,1).data)
      const before=MINI_SCALES.map(pixel)
      Mining.strike(x,y)
      check(surfaceMap[y][x]==='boulder','first strike leaves the boulder intact')
      Mining.strike(x,y)
      check(surfaceMap[y][x]==='sand','second strike restores its sand underlay')
      const after=MINI_SCALES.map(pixel)
      check(after.every((p,i)=>JSON.stringify(p)!==JSON.stringify(before[i])),
        'both cached minimap pixels change immediately without a rebuild')
      check(minimapDirty&&mapPreviewBase===null,'world-map preview is invalidated')
      const snapshot=structuredClone(buildSaveObject())
      loadGameFromObject(snapshot,{isReplayInit:true})
      check(MINI_SCALES.every((scale,i)=>JSON.stringify(pixel(scale))===JSON.stringify(after[i])),
        'surface excavation colors remain correct after save/replay initialization')
    })()`))
  })

  it('keeps the Drunk out of mined forest and grassland-tree tiles', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      currentZ=0;map=surfaceMap
      const drunk=npcs.find(n=>n.name==='Drunk')
      check(!!drunk,'Drunk exists in the saved village')
      enemies=[];npcs=[drunk];occupied=new Set()
      player.x=44;player.y=40
      drunk.x=40;drunk.y=40;drunk.homeX=40;drunk.homeY=40
      drunk.static=false;drunk.free=true;drunk.talkFreezeTurns=0
      occupied.add(keyXY(40,40))
      for(let y=39;y<=41;y++)for(let x=39;x<=41;x++){
        map[y][x]='forest';grasslandTrees.delete(keyXY(x,y))
      }
      map[40][40]='grass'
      const target=keyXY(41,40)
      map[40][41]='boulder';tileUnderlays[target]='forest'
      player.inventory.push(createItem('pickaxe'))
      player.miningTutorialSeen=true;player.miningArmedTarget=null
      Mining.strike(41,40);Mining.strike(41,40)
      check(map[40][41]==='forest','mining restores the real forest tile')
      const oldChance=chance
      try {
        chance=()=>true
        npcTurn()
        check(drunk.x===40&&drunk.y===40,'Drunk will not enter mined forest')
        map[40][41]='grass';grasslandTrees.add(target)
        npcTurn()
        check(drunk.x===40&&drunk.y===40,'Drunk avoids a tree standing on grass')
        grasslandTrees.delete(target)
        npcTurn()
        check(drunk.x===41&&drunk.y===40,'ordinary grass remains a valid NPC step')
      } finally {chance=oldChance}
    })()`))
  })
})
