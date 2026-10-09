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
      } finally {
        chance=oldChance;damageRoll=oldDamage;enemyTurn=oldEnemyTurn;npcTurn=oldNpcTurn
      }
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
