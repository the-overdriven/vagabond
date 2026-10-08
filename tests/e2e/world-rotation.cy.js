describe('Whole-world rotation and Dwarven Key floors', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Rotation Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay', {timeout: 90000}).should('not.have.class','show')
  })

  it('rotates all floors, entrance coordinates, locks, traps, and saves without shifting their alignment', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw new Error(msg)}
      const dims=()=>[MAP_W,MAP_H]
      const copyGrid=g=>g.map(row=>row.slice())
      const surfaceBefore=copyGrid(map)
      const undergroundBefore=copyGrid(undergroundMap)
      const fortBefore=copyGrid(deepLevels[1].map)
      const descent=deepLevels[1].caves[0].entrances[0]
      const oldEntrance={x:descent.x,y:descent.y}
      const oldSpawn={...spawnPoint}
      const [w,h]=dims()
      const oldItems=groundItems.filter(g=>g.kind==='dwarvenkey')
        .map(g=>({x:g.x,y:g.y,level:g.level,keyId:g.keyId}))
      const originalPosition=(x,y)=>({x:h-1-y,y:x})
      const rotateGrid=g=>g[0].map((_,x)=>g.slice().reverse().map(row=>row[x]))
      rotateGeneratedWorld(1)
      check(MAP_W===h&&MAP_H===w, 'rotated dimensions')
      check(JSON.stringify(map)===JSON.stringify(rotateGrid(surfaceBefore)), 'entire surface rotated')
      check(JSON.stringify(undergroundMap)===JSON.stringify(rotateGrid(undergroundBefore)), 'z:-1 rotated')
      check(JSON.stringify(deepLevels[1].map)===JSON.stringify(rotateGrid(fortBefore)), 'dwarven fort rotated')
      check(spawnPoint.x===originalPosition(oldSpawn.x,oldSpawn.y).x&&spawnPoint.y===originalPosition(oldSpawn.x,oldSpawn.y).y,'spawn rotated')
      const newEntrance=originalPosition(oldEntrance.x,oldEntrance.y)
      check(descent.x===newEntrance.x&&descent.y===newEntrance.y,'fort entry rotated')
      for(const original of oldItems) {
        const now=groundItems.find(g=>g.kind==='dwarvenkey'&&g.level===original.level&&g.x===originalPosition(original.x,original.y).x&&g.y===originalPosition(original.x,original.y).y)
        check(!!now,'key item coordinates rotated')
        const pairs=now.keyId.split(':').at(-1).split('|')
        check(pairs.every(pair=>{const [x,y]=pair.split(',').map(Number);return Number.isInteger(x)&&x>=0&&x<MAP_W&&y>=0&&y<MAP_H}),'key lock identifiers rotated')
      }
      for(let i=0;i<deepLevels.length;i++) for(const trap of deepLevels[i].traps||[]) {
        check(deepLevels[i].map[trap.trigger.y]?.[trap.trigger.x]===(trap.type==='spikes'
          ? WORLD_GEN_CONFIG.dungeons.dwarvenRuins.traps.tileKeys.spikes : WORLD_GEN_CONFIG.dungeons.dwarvenRuins.traps.tileKeys.pressurePlate), 'trap trigger follows the grid')
      }
      player.x=spawnPoint.x;player.y=spawnPoint.y
      const state=buildSaveObject()
      loadGameFromObject(state,{isReplayInit:true})
      check(JSON.stringify(map)===JSON.stringify(rotateGrid(surfaceBefore)),'save restores rotated surface')
      check(JSON.stringify(deepLevels[1].map)===JSON.stringify(rotateGrid(fortBefore)),'save restores rotated fort')
      check(state.mapWidth===MAP_W&&state.mapHeight===MAP_H,'saved rotation dimensions')
    })()`))
  })
})
