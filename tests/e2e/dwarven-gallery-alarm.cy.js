describe('Dwarven crossfire gallery entrance alarm', () => {
  it('alerts both barred shooter cells on movement, including while invisible, without repeated alarms', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Gallery Alarm Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => {if (!ok) throw Error(msg)}
      replayRecording=false;replayPlaying=false;currentZ=0;currentCave=-1;map=surfaceMap
      WORLD_SEED=610061;rngState=WORLD_SEED;applyWorldTraits([],'XS');await generateNewWorld()
      check(validateDwarvenRuinsStratum().ok,'valid galleries')
      const z=-5, level=deepLevels[chainDepthForZ(z)-2]
      const room=level.rooms.find(r=>r.gallery)
      check(room && room.gallery.alarmTiles.length===3,'full marked threshold')
      const alarm=room.gallery.alarmTiles[1]
      const from=room.gallery.aisle.find(p=>Math.abs(p.x-alarm.x)+Math.abs(p.y-alarm.y)===1 &&
        !room.gallery.alarmTiles.some(t=>t.x===p.x&&t.y===p.y))
      check(from,'walkable approach next to marked floor')
      const guards=enemies.filter(e=>e.alive&&e.level===z&&e.dungeonRoomId===room.id&&
        ['gallery0','gallery1'].includes(e.dungeonRole))
      check(guards.length===10,'both galleries contain their expected shooters')
      const oldEnemyTurn=enemyTurn,oldNpcTurn=npcTurn,oldLog=log
      let beforeAI=false,alarms=0
      try {
        log=(message)=>{if(message.includes('gallery guards are alerted')) alarms++}
        enemyTurn=()=>{beforeAI=guards.every(e=>e.alarmed)}
        npcTurn=()=>{}
        currentZ=z;currentCave=-1;map=level.map;player.x=from.x;player.y=from.y
        player.invisibleTurns=5;player.godMode=true
        for(const guard of guards){guard.alarmed=false;guard.aware=false}
        await tryMove(alarm.x-from.x,alarm.y-from.y)
        check(player.x===alarm.x&&player.y===alarm.y,'stepped onto engraving')
        check(beforeAI&&guards.every(e=>e.alarmed),'all shooters alarm before enemy AI')
        check(alarms===1,'one visible warning only')
        check(alarmGalleryShootersAt(alarm.x,alarm.y)===0&&alarms===1,'retrigger is idempotent')
        const snapshot=JSON.stringify(guards.map(e=>({id:e.id,alarmed:e.alarmed,alarmedZ:e.alarmedZ})))
        loadGameFromObject(JSON.parse(JSON.stringify(buildSaveObject())),{isReplayInit:true})
        const restored=JSON.stringify(enemies.filter(e=>e.alive&&e.level===z&&e.dungeonRoomId===room.id&&
          ['gallery0','gallery1'].includes(e.dungeonRole)).map(e=>({id:e.id,alarmed:e.alarmed,alarmedZ:e.alarmedZ})))
        check(restored===snapshot,'save restores alerted shooters')
      } finally {enemyTurn=oldEnemyTurn;npcTurn=oldNpcTurn;log=oldLog}
    })()`))
  })
})
