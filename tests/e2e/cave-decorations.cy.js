describe('Decorative caves and deep threat rarity', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Cave Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
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
        await generateNewWorld()
        const decorCfg=WORLD_GEN_CONFIG.worldDecorations
        const fissures=[]
        for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)
          if(surfaceMap[y][x]==='groundfissure')fissures.push({x,y})
        check(fissures.length===decorCfg.surfaceFissures,'exactly four permanent open fissures')
        for(const hole of fissures){
          check(!TILE.groundfissure.walk,'surface fissures block walking in both render modes')
          check(fissures.every(other=>other===hole||
            Math.max(Math.abs(other.x-hole.x),Math.abs(other.y-hole.y))>=decorCfg.minFissureSpacing),
            'fissures are separated')
          check(DIRS8.every(([dx,dy])=>
            TILE[surfaceMap[hole.y+dy]?.[hole.x+dx]]?.walk),
            'fissures are placed in open terrain, not bottlenecks')
        }
        const surfaceProps=caveDecorations.filter(p=>p.level===0)
        const num=(kind,props=surfaceProps)=>props.filter(p=>p.kind===kind).length
        check(num('stone-skull-altar')===1,'one skull altar')
        check(num('tree-cage')===1,'one remote caged tree')
        check(num('trash-wood')===2,'exactly two wooden trash piles')
        check(num('beast-skeleton-large')+num('beast-skeleton-small')>=decorCfg.surfaceSkeletons,
          'surface beast skeleton minimum')
        check(num('stone-brown')+num('stone-grey')>=decorCfg.surfaceStones,'surface stone minimum')
        check(surfaceProps.every(p=>p.kind==='mountain-water' || TILE[surfaceMap[p.y]?.[p.x]]?.walk ||
          ['lily-pads','lily-flowering'].includes(p.kind)),
          'ordinary surface scenery rests on walkable ground')
        check(surfaceProps.filter(p=>p.kind==='mountain-water').every(p=>
          ['mountain','snowmountain'].includes(surfaceMap[p.y][p.x])),
          'river sources remain real mountains')
        check(surfaceProps.filter(p=>p.kind==='tree-cage').every(p=>
          villageHuts.every(h=>Math.max(Math.abs(h.x-p.x),Math.abs(h.y-p.y))>=decorCfg.uniqueVillageClearance)),
          'caged tree stays far away from huts')
        check(Object.entries(RENDER_STYLE.caveDecorations).filter(([,visual])=>visual.tileOnly)
          .every(([,visual])=>preloadedImages.has(visual.image)),
          'tile-only props preloaded before game starts')
        const population=deepLevels[0].caves
        check(population.every(c=>c.populated && !c.scenario),
          'all ordinary deep caves are populated without named scenarios')
        const disallowed=new Set(WORLD_GEN_CONFIG.cavePopulation.ecosystem.excludedSpecies)
        check(enemies.filter(e=>e.level===-2 && e.levelKind==='chain' &&
          e.baseName==='Cave Troll').length<=1,'at most one optional cave Troll')
        check(enemies.filter(e=>e.level===-2 && e.levelKind==='chain')
          .every(e=>e.baseName==='Cave Troll' ||
            (!disallowed.has(e.baseName) && e.tier<=4 &&
              !ENEMY_TEMPLATE_BY_NAME[e.baseName]?.ultraRare)),
          'only permitted species inhabit ordinary deep caves')
        check(['silhouette','grotto','burrow'].every(style=>deepLevels[0].caves.some(c=>c.style===style)),
          'required silhouette, grotto and burrow layouts retained')
        const lootCells=new Set()
        const nonHealingKinds=new Set(['speedpotion','scrollOfInvisibility','idscroll',...TACTICAL_CONSUMABLE_KINDS])
        for(const g of groundItems.filter(g=>g.kind==='chest'||g.kind==='potion'||nonHealingKinds.has(g.kind)||g.kind.startsWith('scroll'))) {
          const k=(g.level??0)+':'+(g.levelKind||((g.level??0)<0?'chain':'surface'))+':'+g.x+','+g.y
          check(!lootCells.has(k),'chests, potions and scrolls occupy distinct tiles');lootCells.add(k)
        }
        const surfaceSupplies=groundItems.filter(g=>(g.level??0)===0)
        const lootConfig=WORLD_GEN_CONFIG.surfaceLoot
        check(surfaceSupplies.filter(g=>g.kind==='potion').length===lootConfig.loosePotions,
          'loose Life Potion count preserved')
        check(surfaceSupplies.filter(g=>nonHealingKinds.has(g.kind)).length===
          lootConfig.looseSpeedPotions+lootConfig.looseScrolls,
          'combined non-healing supply count preserved after tactical replacements')
        for(const [kind,limit] of [['speedpotion',lootConfig.looseSpeedPotions],['scrollOfInvisibility',lootConfig.looseScrolls]])
          check(surfaceSupplies.filter(g=>g.kind===kind).length<=limit,
            'remaining original supplies do not exceed configured slots '+kind)
        check(['web','stalagmites','mushrooms'].every(kind=>caveDecorations.some(p=>p.kind===kind)),
          'all three ordinary cave decoration kinds generated')
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
            check(p.levelKind==='chain' && (descriptor.scenario || descriptor.populated) && !descriptor.crypt,'ordinary cave scope')
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
        check(fissures.every(p=>surfaceMap[p.y][p.x]==='groundfissure'),
          'saved and loaded world retains impassable fissures')
        const terrainBefore=JSON.stringify(undergroundMap)
        resetForNewCharacter()
        check(JSON.stringify(caveDecorations)===original && JSON.stringify(undergroundMap)===terrainBefore,'reused world keeps cosmetic layout')
        const fortWebs=caveDecorations.filter(p=>p.level<=-3 && p.kind==='web')
        check(fortWebs.length>0, 'dwarven masonry receives webs')
        for(const p of fortWebs) {
          const floor=deepLevels[-p.level-2]
          check(floor.map[p.y][p.x]==='dwarvenwall','dwarven web mounted on wall')
          const cornerAdjacent = [[0,-1],[0,1],[-1,0],[1,0]]
            .some(([dx,dy]) => {
              const x=p.x+dx,y=p.y+dy
              if(floor.map[y]?.[x]!=='marble')return false
              const wall=(wx,wy)=>floor.map[y+wy]?.[x+wx]==='dwarvenwall'
              return (wall(0,-1)||wall(0,1))&&(wall(-1,0)||wall(1,0))
            })
          check(cornerAdjacent,'web mounted beside a real corner')
        }
        const supports=caveDecorations.filter(p=>p.kind==='minesupport')
        check(supports.length>0, 'mine corridors have supports after world rotation')
        for(const p of supports) {
          const floor=deepLevels[-p.level-2]
          check(floor?.dungeonPackage==='dwarvenMines' && p.levelKind==='chain' && p.caveIndex===-1,
            'mine supports only on mine floors')
          const cm=floor.map
          const tight=(x,y)=>cm[y]?.[x]==='cavefloor2' &&
            TILE[cm[y-1]?.[x]]?.walk && TILE[cm[y+1]?.[x]]?.walk &&
            !TILE[cm[y]?.[x-1]]?.walk && !TILE[cm[y]?.[x+1]]?.walk
          check([-1,0,1].every(offset=>tight(p.x,p.y+offset)),
            'support and both neighbors belong to a tight north-south passage')
          const entrance=floor.mineUpstairs,visited=new Set([keyXY(entrance.x,entrance.y)])
          const queue=[entrance]
          for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
            const x=queue[i].x+dx,y=queue[i].y+dy,k=keyXY(x,y)
            if(visited.has(k)||!TILE[cm[y]?.[x]]?.walk)continue
            visited.add(k);queue.push({x,y})
          }
          check(visited.has(keyXY(p.x,p.y)),'mine support reachable without excavating pockets')
          check(!groundItems.some(g=>g.level===p.level&&g.x===p.x&&g.y===p.y),
            'supports avoid initial loot')
          check(!enemies.some(e=>e.alive&&e.level===p.level&&e.x===p.x&&e.y===p.y),
            'supports avoid initial creature positions')
        }
        for(let i=1;i<deepLevels.length;i++){
          const floor=deepLevels[i]
          if(!['dwarvenFort','dwarvenRuins','dwarvenMines'].includes(floor.kind))continue
          const level=chainZForDepth(i+2),props=caveDecorations.filter(p=>p.level===level)
          check(props.filter(p=>p.kind==='alcohol-barrel').length>=decorCfg.dwarfBarrelsPerFloor,
            'each dwarven floor has at least two barrels')
          check(props.filter(p=>p.kind==='dwarven-wall-relief').length>=decorCfg.dwarfReliefsPerFloor,
            'each dwarven floor has at least two reliefs')
          check(props.filter(p=>p.kind==='dwarven-wall-relief').every(p=>
            floor.map[p.y][p.x]===(floor.kind==='dwarvenMines'?'cavewall':'dwarvenwall')),
            'reliefs are on real walls')
        }
        check(dwarvenRuin && deepLevels[1],'fort still generated')
      })()`))
    })
  }
})
