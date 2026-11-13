const cdp = (command, params) =>
  Cypress.automation('remote:debugger:protocol', {command, params})

function beginNewGame(name) {
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.get('#raceName').clear().type(name)
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay', {timeout: 60000}).should(($overlay) => {
    expect($overlay.text(), 'world generation status').not.to.include('failed')
    expect($overlay, 'world generation finished').not.to.be.visible
  })
  cy.get('#raceOverlay').should('not.have.class', 'show')
}

describe('Desktop combat enemy tooltip', () => {
  it('loads dedicated portraits for adaptive encounters in inspection and the Bestiary', () => {
    cy.viewport(1440, 900)
    beginNewGame('Encounter Portrait Tester')
    const portraits = {
      'Forest Spirit': 'img/enemies/forest_spirit.jpg',
      'Guardian of the Deep': 'img/enemies/guardian_of_the_deep.jpg',
      'Undead Warden': 'img/enemies/undead_warden.jpg',
      'Uninvited Guest': 'img/enemies/uninvited_guest.jpg'
    }
    cy.window().then(win => {
      const result = win.eval(`(() => ({
        paths: Object.fromEntries(['Forest Spirit', 'Guardian of the Deep',
          'Undead Warden', 'Uninvited Guest'].map(species => [species, enemyPortraitPath(species)]))
      }))()`)
      expect(result.paths).to.deep.equal(portraits)
    })
    for (const file of Object.values(portraits)) {
      cy.request(file).its('status').should('eq', 200)
    }
  })

  it('hides equipped enemy gear prefixes without changing the actual item', () => {
    cy.viewport(1440, 900)
    beginNewGame('Hidden Enemy Gear Tester')

    cy.window().then(win => {
      const result = win.eval(`(() => {
        currentZ=0;currentCave=-1;map=surfaceMap
        enemies=[];occupied=new Set()
        const x=player.x+1,y=player.y
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
        const t=ENEMY_TEMPLATE_BY_NAME.Goblin
        const e=addEnemy({...t,baseName:'Goblin',name:'Goblin',x,y,level:0,
          alive:true,hp:20,maxHp:20,homeX:x,homeY:y,homeTileType:'grass',
          prefix:null,equipment:null,abilities:[]})
        e.equipment={kind:'weapon',base:'Dagger',name:'Mighty Dagger',tier:2}
        const tooltip=tileInspectInfo(x,y)?.html || ''
        return {showsBase:tooltip.includes('Equipped:') && tooltip.includes('Dagger'),
          hidesPrefix:!tooltip.includes('Mighty'),
          preservesLootName:e.equipment.name==='Mighty Dagger'}
      })()`)
      expect(result.showsBase).to.equal(true)
      expect(result.hidesPrefix).to.equal(true)
      expect(result.preservesLootName).to.equal(true)
    })
  })

  afterEach(() => {
    cy.then(() => cdp('Emulation.setTouchEmulationEnabled', {enabled: false}))
  })

  it('pins attacked enemies only with collapsed hints, switches targets, and hides after movement', () => {
    cy.viewport(1440, 900)
    beginNewGame('Combat Tooltip Tester')

    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok) throw new Error(msg)}
      replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true
      currentZ=0;currentCave=-1;map=surfaceMap;deathTransition=null
      enemies=[];npcs=[];occupied=new Set();turnCount=0
      for(let y=37;y<=43;y++) for(let x=37;x<=43;x++) {
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
      }
      player.x=40;player.y=40;player.hp=1000;player.maxHp=1000
      player.godMode=false;player.invisibleTurns=0;player.poisonTurns=0
      player.equip={weapon:null,armor:null,shield:null}
      snapCameraToPlayer();lastMousePx=null;lastMousePy=null;hoveredEnemy=null
      tooltip.style.display='none';hideDesktopCombatTooltip()
      check(Math.round(parseFloat(getComputedStyle(document.getElementById('logpanel')).height))===220,
        'desktop message log defaults to 220px height')
      document.body.classList.remove('hint-collapsed')
      check(desktopUsesHoverTooltips(),'desktop must use fine-pointer tooltip behavior')

      const makeEnemy=(name,x,y)=>{
        const t=ENEMY_TEMPLATE_BY_NAME[name]
        const e=addEnemy({...t,baseName:name,name,x,y,level:0,hp:100,maxHp:100,
          alive:true,homeX:x,homeY:y,homeTileType:'grass',prefix:null,equipment:null,
          abilities:[]})
        occupied.add(keyXY(x,y));return e
      }
      const a=makeEnemy('Goblin',41,40)
      const b=makeEnemy('Kobold',39,40)
      const oldChance=chance,oldDamage=damageRoll,oldEnemyTurn=enemyTurn,oldNpcTurn=npcTurn
      try {
        chance=()=>false;damageRoll=()=>2
        await playerAttackEnemy(a,true)
        check(desktopCombatTooltipEnemy===a,'first attacked enemy becomes combat tooltip target')
        check(tooltip.dataset.autoCombat!=='true' && tooltip.style.display==='none','expanded hints suppress the automatic combat tooltip')

        document.getElementById('btnHintCollapse').click()
        check(document.body.classList.contains('hint-collapsed'),'hint panel collapses')
        check(tooltip.dataset.autoCombat==='true' && tooltip.style.display==='block','collapsed hints reveal the combat tooltip')
        check(tooltip.textContent.includes('Goblin') && tooltip.textContent.includes('HP 98 / 100'),'pinned tooltip refreshes post-hit HP')
        let stageRect=document.getElementById('stage').getBoundingClientRect()
        let tipRect=tooltip.getBoundingClientRect()
        check(Math.abs(stageRect.right-tipRect.right-12)<=1.5,'tooltip sits 12px from right edge')
        check(Math.abs(stageRect.bottom-tipRect.bottom-12)<=1.5,'tooltip sits 12px from bottom edge')

        await playerAttackEnemy(b,true)
        check(desktopCombatTooltipEnemy===b && tooltip.textContent.includes('Kobold'),'new attacked enemy replaces pinned target')

        document.getElementById('btnHintCollapse').click()
        check(!document.body.classList.contains('hint-collapsed'),'hint panel expands')
        check(desktopCombatTooltipEnemy===b,'expanding hints keeps the temporary combat target')
        check(tooltip.dataset.autoCombat!=='true' && tooltip.style.display==='none','expanding hints hides the pinned tooltip')
        document.getElementById('btnHintCollapse').click()
        check(tooltip.dataset.autoCombat==='true' && tooltip.textContent.includes('Kobold'),'collapsing hints restores the remembered combat tooltip')

        enemyTurn=()=>{};npcTurn=()=>{}
        await tryMove(0,1)
        check(player.x===40 && player.y===41,'movement succeeds')
        check(desktopCombatTooltipEnemy===null,'movement clears pinned target')
        check(tooltip.dataset.autoCombat!=='true' && tooltip.style.display==='none','movement hides pinned tooltip')

        // A distant enemy now uses the existing auto-path, while its final
        // occupied tile still resolves through ordinary melee/replay logic.
        const distant=makeEnemy('Goblin',43,41)
        const rect=canvas.getBoundingClientRect()
        const clientX=rect.left+(distant.x-camX+0.5)*TILE_PX*rect.width/canvas.width
        const clientY=rect.top+(distant.y-camY+0.5)*TILE_PX*rect.height/canvas.height
        const adjacentX=rect.left+(b.x-camX+0.5)*TILE_PX*rect.width/canvas.width
        const adjacentY=rect.top+(b.y-camY+0.5)*TILE_PX*rect.height/canvas.height
        canvas.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:adjacentX,clientY:adjacentY}))
        check(canvas.style.cursor.includes(imageSrc(DESKTOP_ENEMY_CURSOR_IMAGE)),
          'adjacent monster uses sword cursor (hovered='+hoveredEnemy?.name+', tile='+
          [Math.floor(camX+lastMousePx/TILE_PX),Math.floor(camY+lastMousePy/TILE_PX)]+')')
        canvas.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX,clientY}))
        check(canvas.style.cursor.includes(imageSrc(DESKTOP_ENEMY_CURSOR_IMAGE)),'distant monster also uses sword cursor')
        check(hoveredAutoPath?.at(-1)?.x===distant.x && hoveredAutoPath.at(-1).y===distant.y,
          'hover shows a route to the occupied enemy tile')
        const clearY=rect.top+(42-camY+0.5)*TILE_PX*rect.height/canvas.height
        canvas.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:rect.left+(40-camX+0.5)*TILE_PX*rect.width/canvas.width,clientY:clearY}))
        check(canvas.style.cursor==='', 'empty tile restores normal cursor')
        canvas.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX,clientY}))
        canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX,clientY,button:0}))
        check(autoPath?.at(-1)?.x===distant.x && autoPath.at(-1).y===distant.y,
          'clicking a distant enemy starts a route to it')
        await new Promise((resolve,reject)=>{
          const deadline=Date.now()+5000
          const wait=()=>{
            if(distant.hp<100) resolve()
            else if(Date.now()>deadline) reject(new Error('auto-path did not reach and attack the distant enemy'))
            else setTimeout(wait,20)
          }
          wait()
        })
        check(autoPath===null,'attacking the target ends the route')
      } finally {
        chance=oldChance;damageRoll=oldDamage;enemyTurn=oldEnemyTurn;npcTurn=oldNpcTurn
      }
    })()`))
  })

  it('chases a moving monster by identity and stops when the target is lost', () => {
    cy.viewport(1440, 900)
    beginNewGame('Moving Quarry Tester')
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true
      currentZ=0;map=surfaceMap;enemies=[];npcs=[];groundItems=[];occupied=new Set()
      player.x=40;player.y=40;player.rootTurns=0;player.confusionTurns=0;player.berserkTurns=0
      for(let y=37;y<=46;y++)for(let x=37;x<=48;x++){
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
      }
      snapCameraToPlayer()
      const template=ENEMY_TEMPLATE_BY_NAME.Goblin
      const quarry=addEnemy({...template,id:'moving-quarry',name:'Goblin',baseName:'Goblin',
        x:45,y:40,homeX:45,homeY:40,homeTileType:'grass',level:0,
        alive:true,hp:40,maxHp:40,prefix:null,equipment:null,abilities:[]})
      occupied.add(keyXY(quarry.x,quarry.y))
      const oldEnemyTurn=enemyTurn,oldNpcTurn=npcTurn
      try {
        enemyTurn=()=>{};npcTurn=()=>{}
        check(startAutoPath(quarry.x,quarry.y,quarry),'click creates a chase route')
        check(autoPathTargetEnemy===quarry,'route tracks the actual monster')
        const startRng=rngState
        occupied.delete(keyXY(quarry.x,quarry.y));quarry.x=45;quarry.y=42
        occupied.add(keyXY(quarry.x,quarry.y));flushPendingMove()
        check(autoPath?.at(-1)?.x===45&&autoPath.at(-1).y===42,
          'next movement automatically reroutes when monster wanders')
        check(rngState===startRng,'replanning has no RNG cost')
        occupied.delete(keyXY(quarry.x,quarry.y));quarry.x=46;quarry.y=42
        occupied.add(keyXY(quarry.x,quarry.y));flushPendingMove()
        check(autoPath?.at(-1)?.x===46&&autoPath.at(-1).y===42,
          'further movement keeps following the same monster')
        quarry.wallAmbushHidden=true;flushPendingMove()
        check(autoPath===null&&autoPathTargetEnemy===null,'unseen target cancels pursuit')
        quarry.wallAmbushHidden=false
        check(startAutoPath(46,44),'ground auto-path still works')
        check(autoPathTargetEnemy===null,'clicking ground never starts creature tracking')
      } finally {enemyTurn=oldEnemyTurn;npcTurn=oldNpcTurn;clearAutoPath()}
    })()`))
  })

  it('keeps the normal hover tooltip when the attacked monster is already under the mouse and clears on death', () => {
    cy.viewport(1440, 900)
    beginNewGame('Hover Combat Tooltip Tester')

    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok) throw new Error(msg)}
      replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true
      currentZ=0;currentCave=-1;map=surfaceMap;deathTransition=null
      enemies=[];npcs=[];occupied=new Set()
      // Keep the hover fixture independent of random surface loot/tracks.
      // Otherwise the vacated enemy tile may still have an inspectable object,
      // and its ordinary hover tooltip correctly takes precedence over the pin.
      groundItems=[];beastTracks.clear()
      for(let y=38;y<=42;y++) for(let x=38;x<=42;x++) {
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
      }
      player.x=40;player.y=40;player.hp=1000;player.maxHp=1000
      player.equip={weapon:null,armor:null,shield:null};snapCameraToPlayer();hideDesktopCombatTooltip()
      document.body.classList.add('hint-collapsed')
      const t=ENEMY_TEMPLATE_BY_NAME.Goblin
      const e=addEnemy({...t,baseName:'Goblin',name:'Goblin',x:41,y:40,level:0,hp:100,maxHp:100,
        alive:true,homeX:41,homeY:40,homeTileType:'grass',prefix:null,equipment:null,abilities:[]})
      occupied.add(keyXY(e.x,e.y))
      lastMousePx=(e.x-camX+0.5)*TILE_PX
      lastMousePy=(e.y-camY+0.5)*TILE_PX
      updateTooltip()
      check(hoveredEnemy===e && tooltip.style.display==='block','ordinary hover tooltip is active')
      const hoverLeft=tooltip.style.left,hoverTop=tooltip.style.top
      const oldChance=chance,oldDamage=damageRoll
      try {
        chance=()=>false;damageRoll=()=>2
        await playerAttackEnemy(e,true);updateTooltip()
        check(desktopCombatTooltipEnemy===e,'hovered target remains the temporary combat target')
        check(tooltip.dataset.autoCombat!=='true','hovered target does not create a duplicate pinned tooltip')
        check(tooltip.style.left===hoverLeft && tooltip.style.top===hoverTop,'hover tooltip keeps cursor-relative position')
        check(tooltip.textContent.includes('HP 98 / 100'),'hover tooltip refreshes after the hit')

        occupied.delete(keyXY(e.x,e.y));e.x=42;occupied.add(keyXY(e.x,e.y))
        check(tileInspectInfo(41,40)===null,'vacated hover tile has no unrelated inspectable objects')
        updateTooltip()
        check(tooltip.dataset.autoCombat==='true' && tooltip.textContent.includes('Goblin'),'pin takes over if the combat target moves away from the cursor')

        lastMousePx=null;lastMousePy=null;hoveredEnemy=null;tooltip.style.display='none'
        e.hp=1
        await playerAttackEnemy(e,true)
        check(!e.alive && desktopCombatTooltipEnemy===null,'dead target clears automatic combat tooltip')
        check(tooltip.dataset.autoCombat!=='true' && tooltip.style.display==='none','dead target does not leave stale tooltip')
      } finally {chance=oldChance;damageRoll=oldDamage}
    })()`))
  })

  it('leaves coarse-pointer mobile inspection unchanged', () => {
    cy.viewport(390, 844)
    cy.then(() => cdp('Emulation.setTouchEmulationEnabled', {enabled: true}))
    beginNewGame('Mobile Tooltip Guard')

    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok) throw new Error(msg)}
      check(window.matchMedia('(pointer: coarse)').matches,'test is running with coarse pointer')
      replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true
      currentZ=0;currentCave=-1;map=surfaceMap;deathTransition=null
      enemies=[];npcs=[];occupied=new Set()
      for(let y=39;y<=41;y++) for(let x=39;x<=42;x++) {
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
      }
      player.x=40;player.y=40;player.hp=1000;player.maxHp=1000
      player.equip={weapon:null,armor:null,shield:null};snapCameraToPlayer();hideDesktopCombatTooltip()
      const t=ENEMY_TEMPLATE_BY_NAME.Goblin
      const e=addEnemy({...t,baseName:'Goblin',name:'Goblin',x:41,y:40,level:0,hp:100,maxHp:100,
        alive:true,homeX:41,homeY:40,homeTileType:'grass',prefix:null,equipment:null,abilities:[]})
      occupied.add(keyXY(e.x,e.y))
      const oldChance=chance,oldDamage=damageRoll
      try {
        chance=()=>false;damageRoll=()=>2
        await playerAttackEnemy(e,true)
        check(desktopCombatTooltipEnemy===null && tooltip.dataset.autoCombat!=='true','desktop pin never activates on mobile')
        check(mobileInfoPanel.textContent.includes('Goblin') && mobileInfoPanel.textContent.includes('HP 98 / 100'),'existing mobile combat inspection still updates')
      } finally {chance=oldChance;damageRoll=oldDamage}
    })()`))
  })
})
