// v194: independently seeded cave/territory parameters, final route diagnostics and save/replay.
describe('Deep Caves 2.0 randomized topology and encounter budgets', () => {
  it('persists tier mixes, clusters, elite counts and exploration measurements', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Cave Variants')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.window().then(win => win.eval(`(() => {
      const deep=deepLevels[0],cfg=WORLD_GEN_CONFIG.cavePopulation.ecosystem
      const check=(ok,why)=>{if(!ok)throw new Error(why)}
      check(deep.caves.length>=3,'required three deep cave styles')
      check(deep.caves.every(c=>Array.isArray(c.tierWeights)&&c.tierWeights.length===3&&
        Math.abs(c.tierWeights.reduce((a,b)=>a+b,0)-1)<0.0002),'per-cave normalized tiers')
      check(deep.territories.every(t=>Array.isArray(t.clusterCenters)&&
        Number.isFinite(t.threatBudget)&&Number.isFinite(t.threatUsed)&&
        t.threatUsed<=t.threatBudget*1.15+.01),'local cluster and threat budgets')
      check(deep.complexes.every(c=>c.ecosystem&&c.exploration&&
        c.ecosystem.champions<=c.ecosystem.championCandidates&&
        c.ecosystem.championCandidates>=0&&c.ecosystem.championCandidates<=5&&
        c.exploration.alternativeRouteShare>=0&&c.exploration.alternativeRouteShare<=1),
        'champion counts and route metrics')
      check(deep.caves.filter(c=>c.style==='grotto'||c.style==='burrow').every(c=>
        c.topology&&c.topology.alternativeRouteTarget>=0&&
        c.topology.alternativeRouteTarget<=.7),'optional route target persisted')
      const before=JSON.stringify({caves:deep.caves,complexes:deep.complexes,
        territories:deep.territories,rng:rngState})
      const save=structuredClone(buildSaveObject())
      check(save.version===101,'current save schema')
      loadGameFromObject(save,{isReplayInit:true})
      const restored=deepLevels[0]
      check(before===JSON.stringify({caves:restored.caves,complexes:restored.complexes,
        territories:restored.territories,rng:rngState}),'no rerolls after restore')
    })()`))
  })
})
