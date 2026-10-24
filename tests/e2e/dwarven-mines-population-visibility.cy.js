describe('Mine-only encounters and darkness', () => {
  it('keeps 19 species in the mines, limits their sight radius, and persists their population', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Mine Population Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.window().then(win => win.eval(`(async()=>{
      const check=(condition,message)=>{if(!condition)throw Error(message)}
      replayRecording=false;replayAnimationsDisabled=true
      applyWorldTraits([],'XS')
      WORLD_SEED=610061;rngState=WORLD_SEED
      await generateNewWorld()

      const cfg=minePackageConfig(),groups=cfg.encounters.groups
      const names=[...groups.early,...groups.middle,...groups.late]
      const ec=cfg.encounters
      const chances=Array.from({length:minePackageConfig().floorCounts.at(-1)},(_,i)=>
        i===0?0:Math.min(ec.prefixChanceCap,ec.prefixBaseChance+(i-1)*ec.prefixGrowthPerFloor))
      check(JSON.stringify(chances)===JSON.stringify([0,0.11,0.135,0.16,0.185]),
        'mine respite has no prefixes; later floors rise from 11% to 18.5%')
      check(cfg.encounters.guaranteeEachSpecies && names.length===19 && new Set(names).size===19,
        'all 19 unique species have a guaranteed encounter')
      const mine=dungeonPackageLevels('dwarvenMines')
      const monsters=enemies.filter(e=>e.alive && e.level<=-9 && names.includes(e.baseName) && e.levelKind==='chain')
      check(monsters.filter(e=>e.humanoid).every(e=>
        ['Wyrdhag','Naledi','Troglodyte','Cave Troll'].includes(e.baseName)),
        'only the four humanoid mine species can receive ordinary equipment')
      check(monsters.some(e=>e.humanoid&&e.equipment),
        'humanoid mine inhabitants receive equipment through the normal rolls')
      check(monsters.every(e=>e.humanoid||!e.equipment),
        'nonhumanoid creatures never carry normal gear')
      check(monsters.filter(e=>e.prefix).every(e=>e.prefix!=='Champion' &&
        e.name===e.prefix+' '+e.baseName && e.prefixBase),
        'mine prefixes follow ordinary non-Champion naming and stat rules')
      check([4,5].includes(mine.length),'Mines occupy four or five floors')
      check(TILE.dwarvenminessealed.mini===TILE.dwarvenminesopen.mini,
        'sealed mine entrance uses the same red map highlight as the opened entrance')
      check(RENDER_STYLE.terrainTiles.minestairsup.image==='img/tiles/shoddy-mine-stairs-up.png' &&
        RENDER_STYLE.terrainTiles.minestairsdown.image==='img/tiles/shoddy-mine-stairs-down.png',
        'the mine stairs have dedicated brownish artwork')
      check(RENDER_STYLE.terrainTiles.minestairsup.baseTileKey==='cavefloorBrown' &&
        RENDER_STYLE.terrainTiles.minestairsdown.baseTileKey==='cavefloorBrown',
        'stair sprites sit on the same brown cave floor as the mine')
      const respite=enemies.filter(e=>e.alive&&e.level===-9)
      check(respite.length>0 && respite.every(e=>['Giant Rat','Giant Bat','Scarab','Giant Spider'].includes(e.baseName)),
        'first floor is a respite with ordinary weak fauna')
      check(respite.filter(e=>e.baseName==='Giant Spider').length<=1,'respite has no spider packs')
      check(respite.every(e=>!e.prefix),'respite monsters cannot have prefixes')
      for(const [floor,namesOnFloor] of [[1,groups.early],[2,groups.middle],[3,groups.late]]) {
        check(namesOnFloor.every(name=>monsters.some(e=>e.baseName===name && e.level===mine[floor].z)),
          'floor '+(floor+1)+' includes every assigned species')
      }
      check(monsters.every(e=>Math.abs(e.level)>=(groups.early.includes(e.baseName)?10:
        groups.middle.includes(e.baseName)?11:12)), 'stronger species never spawn above their intended tier')
      check(enemies.filter(e=>e.level===0).every(e=>!names.includes(e.baseName)),
        'no mine-exclusive species appears on the surface')
      check(names.every(name=>!surfaceSpawnEligible(ENEMY_TEMPLATE_BY_NAME[name])),
        'depth-only templates are excluded before any surface spawn roll')

      const first=mine[0]
      check(mine.every(({level})=>level.minePockets.every(p=>
        Number.isInteger(p.approachDepth)&&p.approachDepth>=1&&p.approachDepth<=20)),
        'every pocket connects through a bounded mineable excavation route')
      check(mine.flatMap(({level})=>level.minePockets).some(p=>p.approachDepth>=10),
        'the mine includes genuinely distant chambers beyond the first corridor wall')
      currentZ=first.z;currentCave=-1;map=first.level.map
      undergroundDiscovered=first.level.discovered
      player.x=first.level.mineUpstairs.x;player.y=first.level.mineUpstairs.y
      invalidateUndergroundFov()
      const shown=currentUndergroundFov()
      const expected=UndergroundFov.compute(map,player.x,player.y,5)
      check([...expected].every(p=>shown.has(p)),
        'mine visibility always includes the ordinary radius-five FOV')
      check(UndergroundFov.RADIUS===8,'other underground FOV remains eight tiles')
      check([0,0.25,0.5,0.75,0].every((opacity,i)=>
        mineSightDarknessAt(player.x+[2,3,4,5,6][i],player.y)===opacity),
        'mine distance bands darken 3/4/5 tiles by 25/50/75 percent without reducing sight')
      check(MINING_CONFIG.lighting.exploredDarkness>MINING_CONFIG.lighting.fovDarknessByDistance[5],
        'explored mine tiles beyond sight remain darker than the fifth visible ring')
      check(MINING_CONFIG.skill.xpRequiredMultiplier===3,
        'Mining progression requires three times its previous experience')
      const originalExcavations=first.level.mineExcavations
      const lightMap=Array.from({length:25},()=>Array(25).fill('cavefloor2'))
      first.level.mineExcavations=[{x:12,y:10,kind:'exposed',mineral:'ruby',removed:false,threshold:0}]
      try {
        const normal=UndergroundFov.compute(lightMap,2,10,5)
        const distant=Mining.lightVisible(lightMap,2,10,normal)
        check(!normal.has('12,10')&&distant.has('12,10')&&distant.has('15,10'),
          'a distant crystal lights unobstructed terrain beyond normal sight radius')
        lightMap[10][8]='cavewall'
        const blocked=Mining.lightVisible(lightMap,2,10,normal)
        check(!blocked.has('12,10')&&blocked.has('12,8'),
          'walls hide blocked light but visible tiles still glow around a corner')
        lightMap[10][8]='cavefloor2'
        lightMap[10][10]='cavewall'
        check(Mining.lightCanReach(lightMap,12,10,10,10,13,10),
          'the crystal illuminates the wall face on its side')
        check(!Mining.lightCanReach(lightMap,12,10,10,10,8,10)&&
          UndergroundFov.canSee(lightMap,8,10,10,10),
          'the same wall stays visible but receives no crystal light from its opposite side')
        const diagonal=Array.from({length:7},()=>Array(7).fill('cavefloor2'))
        diagonal[1][2]='cavewall'
        check(Mining.lightCanReach(diagonal,2,2,3,1,4,2),
          'crystal light reaches the northeast floor diagonally around one wall')
        diagonal[2][3]='cavewall'
        check(!Mining.lightCanReach(diagonal,2,2,3,1,4,2),
          'two walls meeting diagonally still block crystal light')
      } finally {first.level.mineExcavations=originalExcavations}
      const originalTileMode=USE_TILE_IMAGES
      const originalGradient=ctx.createRadialGradient
      let radialGlows=0
      ctx.createRadialGradient=function(...args) {
        radialGlows++
        return originalGradient.apply(this,args)
      }
      first.level.mineExcavations=[{x:player.x,y:player.y,kind:'exposed',
        mineral:'aquamarine',removed:false,threshold:0}]
      try {
        USE_TILE_IMAGES=true
        render()
        check(radialGlows>=2,'tile graphics use soft radial crystal light and a central halo')
        const exposedGlows=radialGlows
        first.level.mineExcavations[0].kind='embedded'
        render()
        check(radialGlows>=exposedGlows+2,'visible embedded wall crystals cast smaller radial light')
        const embeddedGlows=radialGlows
        first.level.mineExcavations[0].threshold=50
        render()
        check(radialGlows===embeddedGlows,'concealed mineral deposits cast no visible light')
        USE_TILE_IMAGES=false
        render()
        check(radialGlows===embeddedGlows,'ASCII graphics do not use tile-mode gradient lighting')
      } finally {
        ctx.createRadialGradient=originalGradient
        first.level.mineExcavations=originalExcavations
        USE_TILE_IMAGES=originalTileMode
        render()
      }
      const portable=MINING_CONFIG.lighting
      check(Mining.lightInfo({kind:'dropped',mineral:'quartz',removed:false}).radius===2 &&
        Mining.lightInfo({kind:'dropped',mineral:'ruby',removed:false}).radius===3 &&
        portable.droppedRadiusReduction===1,
        'portable crystal light uses a smaller radius without losing its close-range glow')
      const glowingGround={kind:'ruby',x:player.x,y:player.y,level:currentZ,
        levelKind:'chain',caveIndex:-1,count:1}
      groundItems.push(glowingGround)
      try {
        check(Mining.lightSources().some(source=>source.kind==='dropped'&&source.mineral==='ruby'),
          'a crystal dropped in the mine becomes a normal light source')
      } finally {groundItems.splice(groundItems.indexOf(glowingGround),1);invalidateUndergroundFov()}
      // Inspect the actual transparent shadow layer: a crystal at the fifth
      // ring must clear darkness at its center, without removing remote shade.
      const originalMap=map,originalX=player.x,originalY=player.y
      const originalCamX=camX,originalCamY=camY
      const originalDiscovered=undergroundDiscovered
      try {
        map=Array.from({length:20},()=>Array(20).fill('cavefloor2'))
        undergroundDiscovered=Array.from({length:20},()=>Array(20).fill(false))
        player.x=5;player.y=5;camX=0;camY=0;USE_TILE_IMAGES=true
        first.level.mineExcavations=[{x:10,y:5,kind:'exposed',mineral:'ruby',removed:false,threshold:0}]
        const visible=UndergroundFov.compute(map,5,5,5)
        drawMineSightDarkness(visible,0,0,VIEW_W,VIEW_H)
        const shadow=mineDarknessLayer.getContext('2d')
        const opacityAt=(x,y)=>shadow.getImageData(Math.floor((x+0.5)*TILE_PX),
          Math.floor((y+0.5)*TILE_PX),1,1).data[3]
        check(opacityAt(10,5)<12,
          'crystal light removes almost all fifth-ring darkness from its center')
        check(opacityAt(5,10)>170,
          'an unlit tile on the fifth ring retains its 75 percent dark overlay')
        map[5][8]='cavewall'
        drawMineSightDarkness(visible,0,0,VIEW_W,VIEW_H)
        check(opacityAt(8,5)>45,
          'a wall face seen opposite the crystal does not lose its darkness')
        map[5][8]='cavefloor2'
        first.level.mineExcavations=[]
        drawMineSightDarkness(visible,0,0,VIEW_W,VIEW_H)
        const alphaWithinTile=part=>shadow.getImageData(
          Math.floor((9+part)*TILE_PX),Math.floor(5.5*TILE_PX),1,1).data[3]
        check(alphaWithinTile(0.15)+15<alphaWithinTile(0.85),
          'tile mode gradually darkens across a tile instead of using flat distance bands')
        check(opacityAt(11,5)>205,
          'the uninterrupted radial shade reaches remembered-terrain darkness outside radius five')
        undergroundDiscovered[5][8]=true
        const hiddenTileVisible=new Set(visible)
        hiddenTileVisible.delete('8,5')
        drawMineSightDarkness(hiddenTileVisible,0,0,VIEW_W,VIEW_H)
        check(opacityAt(8,5)>205,
          'a remembered tile blocked from view stays dark despite proximity to the player')
        undergroundDiscovered[5][8]=false
        let featherGradients=0
        const originalLinearGradient=ctx.createLinearGradient
        try {
          ctx.createLinearGradient=function(...args) {
            featherGradients++
            return originalLinearGradient.apply(this,args)
          }
          drawMineVisibilityFeather(visible,0,0,VIEW_W,VIEW_H)
          check(featherGradients>0,
            'the edge of visible mine terrain is softly feathered in tile mode')
          USE_TILE_IMAGES=false
          const tileGradientCount=featherGradients
          drawMineVisibilityFeather(visible,0,0,VIEW_W,VIEW_H)
          check(featherGradients===tileGradientCount,
            'ASCII mode preserves its existing hard-edged tile visibility')
        } finally {ctx.createLinearGradient=originalLinearGradient}
      } finally {
        map=originalMap;player.x=originalX;player.y=originalY
        camX=originalCamX;camY=originalCamY
        undergroundDiscovered=originalDiscovered
        first.level.mineExcavations=originalExcavations
        USE_TILE_IMAGES=originalTileMode
        invalidateUndergroundFov()
        render()
      }
      check(MERCHANT_STOCK_CONFIG.scrolls.homecomingScroll.merchantPrice===70 &&
        itemDefinition('homecomingscroll').baseValue===70,'Homecoming costs 70g')

      let wideCorridorCrystals=0
      for(const [i,{level,z}] of mine.entries()) {
        check(level.minePockets.length>=3 && level.minePockets.length<=10,
          'floor '+(i+1)+' has three to ten sealed mining pockets')
        check(level.minePockets.every(p=>{
          const xs=p.cells.map(c=>c.x),ys=p.cells.map(c=>c.y)
          return Math.max(...xs)-Math.min(...xs)<8 && Math.max(...ys)-Math.min(...ys)<8
        }), 'pockets fit in eight-by-eight bounding boxes')
        const [min,max]=MINING_CONFIG.generation.budgets[i]
        check(level.mineMineralValue>=min&&level.mineMineralValue<=max,
          'mine minerals respect the complete floor gold budget')
        const minerals=level.mineExcavations.filter(t=>t.mineral)
        const separation=MINING_CONFIG.generation.differentMineralSeparation
        for(let a=0;a<minerals.length;a++)for(let b=a+1;b<minerals.length;b++){
          const left=minerals[a],right=minerals[b]
          if(left.mineral===right.mineral)continue
          check(Math.max(Math.abs(left.x-right.x),Math.abs(left.y-right.y))>=separation,
            'different mineral veins stay ten tiles apart')
        }
        for(const pocket of level.minePockets){
          const members=enemies.filter(e=>e.alive&&e.level===z&&
            pocket.cells.some(p=>p.x===e.x&&p.y===e.y))
          if(pocket.type==='nest')check(new Set(members.map(e=>e.baseName)).size<=1,
            'a mine nest contains only one monster species')
          if(pocket.type==='geode')check(new Set(minerals.filter(t=>
            pocket.cells.some(p=>p.x===t.x&&p.y===t.y)).map(t=>t.mineral)).size<=1,
            'a geode contains only one crystal type')
        }
        const pocketTiles=new Set(level.minePockets.flatMap(p=>p.cells.map(c=>keyXY(c.x,c.y))))
        const formations=level.mineExcavations.filter(t=>t.kind==='exposed'&&!t.removed)
        const crystalPositions=new Set(formations.map(t=>keyXY(t.x,t.y)))
        check(enemies.filter(e=>e.alive&&e.level===z).every(e=>!crystalPositions.has(keyXY(e.x,e.y))),
          'monsters do not spawn inside exposed crystal formations')
        for(const p of formations.filter(t=>!pocketTiles.has(keyXY(t.x,t.y)))) {
          const open=DIRS8.filter(([dx,dy])=>level.map[p.y+dy]?.[p.x+dx]==='cavefloor2').length
          if(open>=MINING_CONFIG.generation.exposedWideCorridorMinNeighbors)wideCorridorCrystals++
        }
      }
      check(wideCorridorCrystals>0,'exposed formations sometimes grow on wider corridor floors')
      const seams=first.level.mineExcavations.filter(d=>d.kind==='wall'&&d.threshold===0)
      check(seams.some(d=>Math.max(Math.abs(d.x-first.level.mineUpstairs.x),
        Math.abs(d.y-first.level.mineUpstairs.y))<=MINING_CONFIG.generation.respiteTrainingDistance),
        'respite introduces mining with an obvious weak wall near the entrance')
      const reachable=dungeonWalkDistances(map,first.level.mineUpstairs)
      const seam=seams.find(d=>[[0,-1],[1,0],[0,1],[-1,0]].some(([dx,dy])=>
        reachable.has(keyXY(d.x+dx,d.y+dy))))
      check(seam,'obvious mineable wall has a traversable approach')
      const from=[[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy])=>({x:seam.x+dx,y:seam.y+dy}))
        .find(p=>reachable.has(keyXY(p.x,p.y)))
      enemies=enemies.filter(e=>e.level!==-9) // isolate the mining turn path from ordinary combat
      player.x=from.x;player.y=from.y
      player.miningTutorialSeen=false
      addInventoryItem('pickaxe')
      const turns=turnCount
      await tryMove(seam.x-from.x,seam.y-from.y)
      check(turnCount===turns&&player.miningTutorialSeen,'the one-time mining warning takes no turn')
      await tryMove(seam.x-from.x,seam.y-from.y)
      check(turnCount===turns+1&&seam.progress===1,'a confirmed mining strike takes a regular turn')
      const partial=JSON.parse(JSON.stringify(buildSaveObject())),partialRng=rngState
      loadGameFromObject(partial,{isReplayInit:true})
      replayAnimationsDisabled=true
      check(rngState===partialRng,'partial mining restoration consumes no RNG')
      check(Mining.find(Mining.activeLevel(),seam.x,seam.y).progress===1&&player.miningTutorialSeen,
        'partial excavation and the one-time mining warning survive save and replay initialization')
      await tryMove(seam.x-from.x,seam.y-from.y)
      check(map[seam.y][seam.x]==='cavefloor2'&&player.mining===0&&
        player.miningXpUnits===MINING_CONFIG.skill.surfaceFractionScale,
        'finishing the weak wall opens a route and earns one of three XP for the first level')
      const floor=Mining.activeLevel(),open=dungeonWalkDistances(map,{x:player.x,y:player.y})
      let solid=null
      for(const position of open.keys()) {
        const [x,y]=position.split(',').map(Number)
        for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
          const tx=x+dx,ty=y+dy
          if(map[ty]?.[tx]==='cavewall'&&!Mining.find(floor,tx,ty)) {
            solid={x,y,tx,ty};break
          }
        }
        if(solid)break
      }
      check(solid,'respite has an ordinary solid wall next to a corridor')
      player.x=solid.x;player.y=solid.y;player.godMode=true
      const godTurn=turnCount
      check(!Mining.canTarget(solid.tx,solid.ty),'god mode does not trigger futile mining on solid walls')
      await tryMove(solid.tx-solid.x,solid.ty-solid.y)
      check(player.x===solid.tx&&player.y===solid.ty&&turnCount===godTurn+1&&
        map[solid.ty][solid.tx]==='cavewall','god mode walks through solid mine walls without excavation')
      player.godMode=false;player.x=solid.x;player.y=solid.y
      invalidateUndergroundFov()

      const roster=monsters.map(e=>[e.id,e.baseName,e.level,e.x,e.y,e.prefix,e.prefixBase,e.equipment,e.gearScale,e.gearBonuses])
      const saved=JSON.parse(JSON.stringify(buildSaveObject())),rng=rngState
      loadGameFromObject(saved,{isReplayInit:true})
      check(rngState===rng,'save restoration does not consume RNG')
      check(JSON.stringify(enemies.filter(e=>e.alive && names.includes(e.baseName) && e.levelKind==='chain')
        .map(e=>[e.id,e.baseName,e.level,e.x,e.y,e.prefix,e.prefixBase,e.equipment,e.gearScale,e.gearBonuses]))===JSON.stringify(roster),
        'mine representatives, prefixes and worn equipment persist after restore')
      return true
    })()`))
  })
})
