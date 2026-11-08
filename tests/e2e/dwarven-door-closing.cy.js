describe('Dwarven door closing by mouse and touch', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Door Closing Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
  })

  const prepareDoor = win => win.eval(`(() => {
    const floor=deepLevels[2]
    currentZ=chainZForDepth(4);currentCave=-1;map=floor.map;
    undergroundDiscovered=floor.discovered;
    for(let y=38;y<=44;y++) for(let x=38;x<=44;x++) map[y][x]='marble';
    player.x=40;player.y=41;player.hp=playerMaxHp();
    enemies=[];occupied=new Set();groundItems=[];
    map[41][41]='dwarvendooropen';
    consecutiveWaitTurns=0;autoPath=null;
    stopCameraAnimation();snapCameraToPlayer();
    invalidateUndergroundFov();updateHud();render();
    return {turnCount}
  })()`)

  const clientPosition = (win, x=41, y=41) => win.eval(`(() => {
    const rect=canvas.getBoundingClientRect();
    return {
      x:rect.left + (${x} - camX + .5)*TILE_PX * rect.width/canvas.width,
      y:rect.top + (${y} - camY + .5)*TILE_PX * rect.height/canvas.height
    }
  })()`)

  it('closes an adjacent open door on a desktop canvas click', () => {
    cy.viewport(1280, 800)
    cy.window().then(win => {
      const before=prepareDoor(win)
      const pos=clientPosition(win)
      win.eval(`canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:${pos.x},clientY:${pos.y}}))`)
      expect(win.eval('map[41][41]')).to.equal('dwarvendoorclosed')
      expect(win.eval('turnCount')).to.equal(before.turnCount+1)
      expect(win.eval('player.x')).to.equal(40)
      expect(win.eval('TILE[map[41][41]].blocksSight')).to.equal(true)
    })
  })

  it('closes a door via the touchstart/touchend path on mobile', () => {
    cy.viewport(390, 844)
    cy.window().then(win => {
      const before=prepareDoor(win)
      const pos=clientPosition(win)
      // Recreate a single-finger tap so the normal touchend handler runs.
      win.eval(`(() => {
        const p={clientX:${pos.x},clientY:${pos.y}}
        const start=new Event('touchstart',{bubbles:true,cancelable:true})
        Object.defineProperty(start,'touches',{value:[p]})
        canvas.dispatchEvent(start)
        const end=new Event('touchend',{bubbles:true,cancelable:true})
        Object.defineProperty(end,'touches',{value:[]})
        Object.defineProperty(end,'changedTouches',{value:[p]})
        canvas.dispatchEvent(end)
      })()`)
      expect(win.eval('map[41][41]')).to.equal('dwarvendoorclosed')
      expect(win.eval('turnCount')).to.equal(before.turnCount+1)
    })
  })

  for (const [device,width,height] of [['desktop',1280,800],['mobile',390,844]]) {
    it(`opens every closed door family without entering on ${device}`, () => {
      cy.viewport(width,height)
      cy.window().then(async win => {
        const types = [
          ['dwarvendoorclosed','dwarvendooropen'],
          ['dwarvenprisondoorclosed','dwarvenprisondooropen'],
          ['dwarvengateclosed','dwarvengateopen'],
          ['dwarvendoorlocked','dwarvendooropen'],
          ['dwarvenprisondoorlocked','dwarvenprisondooropen'],
          ['dwarvengatelocked','dwarvengateopen']
        ]
        for (const [closed,opened] of types) {
          const before=win.eval(`(()=>{
            const floor=deepLevels[2]
            currentZ=chainZForDepth(4);currentCave=-1;map=floor.map
            undergroundDiscovered=floor.discovered
            for(let y=38;y<=44;y++)for(let x=38;x<=44;x++){
              map[y][x]='marble';undergroundDiscovered[y][x]=true
            }
            Object.assign(player,{x:40,y:41,hp:playerMaxHp()})
            enemies=[];occupied=new Set();groundItems=[]
            map[41][41]='${closed}'
            if('${closed}'.startsWith('dwarvengate'))map[42][41]='${closed}'
            player.inventory=player.inventory.filter(item=>item.kind!=='dwarvenkey')
            if(isLockedDungeonDoorTile(map[41][41]))
              addInventoryItem('dwarvenkey',{keyId:dungeonLockIdAt(41,41)})
            replayAnimationsDisabled=true;replayRecording=false
            clearAutoPath();pendingMove=null
            stopCameraAnimation();snapCameraToPlayer();invalidateUndergroundFov();render()
            return {turnCount,x:player.x,y:player.y}
          })()`)
          const pos=clientPosition(win)
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
          expect(win.eval('map[41][41]'),closed).to.equal(opened)
          expect(win.eval('player.x'),closed).to.equal(before.x)
          expect(win.eval('player.y'),closed).to.equal(before.y)
          expect(win.eval('turnCount'),closed).to.equal(before.turnCount+1)
          expect(win.eval('autoPath'),closed).to.equal(null)
          await win.eval('tryMove(1,0)')
          expect(win.eval('player.x'),`${closed} opens before moving`).to.equal(41)
        }
      })
    })
  }
})
