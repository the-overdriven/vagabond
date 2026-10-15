describe('Mausoleum layout and chest restoration', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save => {
      cy.window().then(win => {
        win.__mausoleumSave = save
        win.eval('loadGameFromObject(window.__mausoleumSave, {isReplayInit: true})')
        delete win.__mausoleumSave
      })
    })
  })

  it('restores rotated room, staircase and all four chests without putting loot on the sarcophagus', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const chestList=()=>groundItems.filter(g=>g.mausoleumChest).map(g=>({x:g.x,y:g.y,opened:g.opened,tier:g.tier})).sort((a,b)=>a.y-b.y||a.x-b.x)
      const roomTiles=()=>{
        const hut=villageHuts.find(h=>h.mausoleum)
        const positions=[]
        for(let y=1;y<=7;y++)for(let x=1;x<=7;x++){
          const p=mausoleumOffset(x,y)
          positions.push({x:hut.x+p.x,y:hut.y+p.y,tile:undergroundMap[hut.y+p.y]?.[hut.x+p.x]})
        }
        return positions
      }
      const verify=()=>{
        const hut=villageHuts.find(h=>h.mausoleum)
        const chests=chestList()
        check(chests.length===4,'four original chests remain')
        const offsets=[[1,1],[7,1],[1,7],[7,7]]
        const expected=new Set(offsets.map(([x,y])=>{
          const p=mausoleumOffset(x,y)
          return keyXY(hut.x+p.x,hut.y+p.y)
        }))
        check(chests.every(g=>expected.has(keyXY(g.x,g.y))),'chests follow rotated corners')
        const sarc=mausoleumOffset(4,4)
        check(undergroundMap[hut.y+sarc.y][hut.x+sarc.x]==='sarcophagus','sarcophagus at rotated centre')
        const stairs=mausoleumOffset(4,7)
        check(undergroundMap[hut.y+stairs.y][hut.x+stairs.x]==='mausoleumstairsup','stairs at hut entrance')
        check(!chests.some(g=>g.x===hut.x+sarc.x&&g.y===hut.y+sarc.y),'no chest on sarcophagus')
        for(const p of roomTiles())check(p.tile==='crypt2floor'||p.tile==='sarcophagus'||p.tile==='mausoleumstairsup','all room tiles restored')
      }
      verify()
      for(let turn=0;turn<4;turn++){
        rotateGeneratedWorld(1)
        const before=JSON.stringify(roomTiles())
        const chests=JSON.stringify(chestList())
        const save=buildSaveObject(), rng=save.rngState
        loadGameFromObject(save,{isReplayInit:true})
        check(JSON.stringify(roomTiles())===before,'rotated room identical after load')
        check(JSON.stringify(chestList())===chests,'chests unchanged by load')
        check(rngState===rng,'restore did not use rng')
        verify()
      }
    })()`))
  })

  it('does not respawn opened chests and restores old current-format saves with partial loot', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const hut=villageHuts.find(h=>h.mausoleum)
      const expected=mausoleumQuarterTurns
      // Mark the explored room so orientation is recoverable even if almost
      // all chests have been opened in a save that lacks the rotation field.
      for(let y=1;y<=7;y++)for(let x=1;x<=7;x++){
        const p=mausoleumOffset(x,y)
        undergroundDiscoveredL1[hut.y+p.y][hut.x+p.x]=true
      }
      const chests=groundItems.filter(g=>g.mausoleumChest)
      check(chests.length===4,'fixture starts with four chests')
      groundItems=groundItems.filter(g=>!g.mausoleumChest||g===chests[0])
      const oldSave=buildSaveObject()
      delete oldSave.mausoleumQuarterTurns
      loadGameFromObject(oldSave,{isReplayInit:true})
      check(mausoleumQuarterTurns===expected,'infer old save orientation from remaining chest and room discovery')
      check(groundItems.filter(g=>g.mausoleumChest).length===1,'only unopened chest stays')
      check(undergroundMap[hut.y+mausoleumOffset(4,4).y][hut.x+mausoleumOffset(4,4).x]==='sarcophagus','old save restores coffin')
      groundItems=groundItems.filter(g=>!g.mausoleumChest)
      const emptySave=buildSaveObject()
      loadGameFromObject(emptySave,{isReplayInit:true})
      check(groundItems.filter(g=>g.mausoleumChest).length===0,'no chest regenerated after all opened')
      check(mausoleumQuarterTurns===expected,'orientation survives without chests')
    })()`))
  })
})
