describe('Deep Caves 2.0 — rewards and permanent clues', () => {
  it('budgets rewards across complexes and persists real inhabitants’ spoor', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Cave Rewards Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.window().then(win => win.eval(`(async()=>{
      const assert=(condition,message)=>{if(!condition)throw new Error(message)}
      replayRecording=false;replayPlaying=false;currentZ=0;currentCave=-1;map=surfaceMap
      WORLD_SEED=12345;rngState=WORLD_SEED;applyWorldTraits([],'XS')
      await generateNewWorld()
      const level=deepLevels[0]
      const drops=groundItems.filter(g=>g.level===-2&&g.levelKind==='chain'&&
        ['chest','potion','scrollOfInvisibility'].includes(g.kind))
      assert(drops.length>0,'deep floor has rewards')
      assert(new Set(drops.map(g=>keyXY(g.x,g.y))).size===drops.length,'no overlapping rewards')
      const rc=WORLD_GEN_CONFIG.cavePopulation.rewards
      const near=(a,b,r)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))<=r
      assert(drops.every(g=>{
        const guarded=enemies.some(e=>e.alive&&e.level===-2&&e.levelKind==='chain'&&
          near(e,g,rc.guardedEnemyDistance))
        const count=drops.filter(q=>near(g,q,rc.localRewardRadius)).length
        return count<=(guarded?rc.maxGuardedLocalRewards:rc.maxUnguardedLocalRewards)
      }),'no densely piled rewards in guarded or unguarded cave rooms')
      assert(drops.filter(g=>g.kind==='chest').every(g=>drops.filter(q=>q!==g&&q.kind==='chest').every(q=>
        !near(g,q,rc.minimumChestSpacing-1))),'chests are adequately spaced')
      assert(level.complexes.every(c=>c.rewards&&Number.isInteger(c.rewards.chests)&&
        Number.isInteger(c.rewards.provisions)),'every complex has a settled reward allocation')
      assert(level.complexes.reduce((sum,c)=>sum+c.rewards.chests+c.rewards.provisions,0)===drops.length,
        'world budget allocated once across joined source caves')
      assert(drops.every(g=>level.caveMaps[g.caveIndex][g.y]?.[g.x]==='cavefloor2'),
        'rewards belong to an actual source floor')
      for(const clue of caveSpoor){
        assert(level.map[clue.y]?.[clue.x]==='cavefloor2','permanent spoor is on ordinary deep cave floor')
        assert(level.complexes.some(c=>c.id===clue.complexId&&c.members.some(ci=>
          enemies.some(e=>e.alive&&e.level===-2&&e.levelKind==='chain'&&
            e.caveIndex===ci&&e.baseName===clue.species))),
          'clue species genuinely inhabited the connected complex')
        assert(!groundItems.some(g=>g.level===-2&&g.levelKind==='chain'&&
          g.x===clue.x&&g.y===clue.y),'clue does not cover treasure')
      }
      const before=JSON.stringify({items:drops,spoor:caveSpoor,complexes:level.complexes,
        decorations:caveDecorations,rng:rngState})
      const save=structuredClone(buildSaveObject())
      assert(save.version===103,'new permanent-spoor save schema')
      loadGameFromObject(save,{isReplayInit:true})
      const after=JSON.stringify({items:groundItems.filter(g=>g.level===-2&&g.levelKind==='chain'&&
        ['chest','potion','scrollOfInvisibility'].includes(g.kind)),spoor:caveSpoor,
        complexes:deepLevels[0].complexes,decorations:caveDecorations,rng:rngState})
      assert(before===after,'save and replay initial state preserve generated rewards and clues')
      const decorBefore=JSON.stringify(caveDecorations),rngBefore=rngState
      spawnCaveDecorations()
      assert(rngBefore===rngState&&JSON.stringify(caveDecorations)===decorBefore,
        'repeated decorative rendering cannot change RNG or map contents')
    })()`))
  })
})
