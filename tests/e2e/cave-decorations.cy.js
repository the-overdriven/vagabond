describe('Decorative caves and deep threat rarity', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Cave Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')
  })

  for (const [seed, traitNames] of [[12345, []], [24680, []], [67890, ['hollow_world', 'things_below']]]) {
    it('preserves cave safety, cosmetic state and rarity rules for seed ' + seed, () => {
      cy.window().then(win => win.eval(`(async () => {
        const check=(ok,msg)=>{if(!ok)throw new Error(msg)}
        replayRecording=false;replayPlaying=false;currentZ=0;currentCave=-1;map=surfaceMap
        const names=${JSON.stringify(traitNames)}
        const traits=names.map(name=>WORLD_TRAITS.find(t=>t.name===name))
        check(traits.every(Boolean),'requested trait fixtures exist')
        applyWorldTraits(traits);WORLD_SEED=${seed};rngState=WORLD_SEED
        let selections=0,inCaveScenarios=false;const originalPickWeighted=pickWeighted
        const originalSpawnCaveScenarios=spawnCaveScenarios
        spawnCaveScenarios=()=>{
          selections=0;inCaveScenarios=true
          try{return originalSpawnCaveScenarios()}finally{inCaveScenarios=false}
        }
        pickWeighted=(pool,weight)=>{
          if(inCaveScenarios && pool.length && pool.every(t=>deepCaveThreatTemplates().includes(t))) {
            selections++;check(pool.every(t=>(t.rarity??1)>.1),'rare species excluded from actual bonus spawns')
            check(pool.every(t=>weight(t)===(t.rarity??1)),'actual bonus spawn uses rarity weights')
          }
          return originalPickWeighted(pool,weight)
        }
        try {await generateNewWorld()} finally {
          pickWeighted=originalPickWeighted
          spawnCaveScenarios=originalSpawnCaveScenarios
        }
        check(selections===deepLevels[0].caves.filter(c=>c.scenario).length,
          'each deep cave receives its weighted threat: '+selections+' selections for '+
          deepLevels[0].caves.filter(c=>c.scenario).length+' scenarios')
        const lootCells=new Set()
        for(const g of groundItems.filter(g=>['chest','potion','speedpotion'].includes(g.kind)||g.kind.startsWith('scroll'))) {
          const k=(g.level??0)+':'+(g.levelKind||((g.level??0)<0?'chain':'surface'))+':'+g.x+','+g.y
          check(!lootCells.has(k),'chests, potions and scrolls occupy distinct tiles');lootCells.add(k)
        }
        for(const [kind,count] of [['potion',WORLD_GEN_CONFIG.surfaceLoot.loosePotions],['speedpotion',WORLD_GEN_CONFIG.surfaceLoot.looseSpeedPotions],['scrollOfInvisibility',WORLD_GEN_CONFIG.surfaceLoot.looseScrolls]])
          check(groundItems.filter(g=>(g.level??0)===0&&g.kind===kind).length===count,'loose supply count preserved '+kind)
        check(caveDecorations.length>0 && new Set(caveDecorations.map(p=>p.kind)).size===3,'all three decorations generated')
        const occupiedProps=new Set()
        for(const level of [-1,-2]) {
          const descriptors=level===-1?caves:deepLevels[0].caves
          const shared=level===-1?undergroundMap:deepLevels[0].map
          const entries=descriptors.flatMap(c=>c.entrances||[])
          const reachable=new Set(),queue=entries.map(e=>({x:e.x,y:e.y}))
          for(const e of queue)reachable.add(keyXY(e.x,e.y))
          for(let i=0;i<queue.length;i++)for(const [dx,dy] of DIRS8){
            const x=queue[i].x+dx,y=queue[i].y+dy,k=keyXY(x,y)
            if(!TILE[shared[y]?.[x]]?.walk||reachable.has(k))continue
            reachable.add(k);queue.push({x,y})
          }
          for(const p of caveDecorations.filter(p=>p.level===level)) {
            const descriptor=descriptors[p.caveIndex],k=keyXY(p.x,p.y),id=level+':'+k
            check(p.levelKind==='chain' && descriptor.scenario && !descriptor.crypt,'ordinary cave scope')
            check(reachable.has(k) && TILE[shared[p.y][p.x]].walk,'reachable, walkable decoration')
            check(!occupiedProps.has(id),'no overlapping decorations');occupiedProps.add(id)
            check(entries.every(e=>Math.max(Math.abs(e.x-p.x),Math.abs(e.y-p.y))>2),'entrance clearance')
            check(!groundItems.some(g=>g.level===level&&g.x===p.x&&g.y===p.y),'loot remains visible')
            check(!enemies.some(e=>e.alive&&e.level===level&&e.x===p.x&&e.y===p.y),'valid initial spawns')
            if(p.kind==='web') {
              const wall=(dx,dy)=>shared[p.y+dy]?.[p.x+dx]==='cavewall'
              check((wall(0,-1)||wall(0,1))&&(wall(-1,0)||wall(1,0)),'web placed at corner')
            }
          }
        }
        const original=JSON.stringify(caveDecorations),rngBefore=rngState
        spawnCaveDecorations()
        check(original===JSON.stringify(caveDecorations)&&rngBefore===rngState,'repeat placement consumes no gameplay RNG')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        check(saved.version===self.VAGABOND_SAVE_VERSION,'current save schema')
        loadGameFromObject(saved,{isReplayInit:true})
        check(JSON.stringify(caveDecorations)===original,'current save and replay restoration retain props')
        const terrainBefore=JSON.stringify(undergroundMap)
        resetForNewCharacter()
        check(JSON.stringify(caveDecorations)===original && JSON.stringify(undergroundMap)===terrainBefore,'reused world keeps cosmetic layout')
        check(!caveDecorations.some(p=>p.level===-3),'fort excluded')
        check(dwarvenRuin && deepLevels[1],'fort still generated')
      })()`))
    })
  }
})
