describe('Use-based combat proficiency', () => {
  it('trains four distinct skills through combat, blocks a hit and restores progress through saves', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Proficiency Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true
      currentZ=0;currentCave=-1;map=surfaceMap
      enemies=[];groundItems=[];npcs=[];occupied=new Set()
      for(let y=38;y<=42;y++)for(let x=38;x<=43;x++) {
        map[y][x]='grass';discovered[y][x]=true;grasslandTrees.delete(keyXY(x,y))
      }
      spawnPoint={x:120,y:120};player.x=40;player.y=40
      player.lvl=1;player.hp=500;player.maxHp=500;player.godMode=false
      player.combatSkills=freshCombatSkills();player.combatSkillXp=freshCombatSkills()
      player.equip={weapon:null,shield:null,armor:null,blackkey:null}
      const template=ENEMY_TEMPLATE_BY_NAME.Goblin
      const e=addEnemy({...template,baseName:'Goblin',x:41,y:40,homeX:41,homeY:40,
        homeTileType:'grass',tier:2,hp:1000,maxHp:1000,alive:true,aware:true,
        abilities:[],equipment:null,prefix:null})
      occupied.add(keyXY(e.x,e.y))
      const original={chance,damageRoll,enemyTurn,npcTurn}
      try {
        chance=()=>false;damageRoll=()=>2
        player.equip.weapon={kind:'weapon',base:'Scimitar',name:'Scimitar',atk:4,grace:4,twoHanded:false}
        for(let i=0;i<5;i++)await playerAttackEnemy(e,true)
        check(player.combatSkills.oneHanded>0 && player.combatSkills.twoHanded===0,
          'one-handed hits train their category alone')
        player.equip.weapon={kind:'weapon',base:'War Hammer',name:'War Hammer',atk:9,grace:1,twoHanded:true}
        for(let i=0;i<5;i++)await playerAttackEnemy(e,true)
        check(player.combatSkills.twoHanded>0,'two-handed hits develop their category')
        player.equip.weapon=makeShortBowItem()
        player.inventory=[{kind:'arrows',name:'Arrows',count:20}]
        enemyTurn=()=>{};npcTurn=()=>{}
        for(let i=0;i<5;i++)check(shootEnemy(e),'short bow can shoot the visible adjacent target')
        check(player.combatSkills.marksmanship>0,'bow hits develop Marksmanship')
        check(e.combatSkillXp?.twoHanded>0 && e.combatSkillXp?.marksmanship>0,
          'per-enemy caps are tracked independently')
        player.equip.weapon=null
        player.equip.shield={kind:'shield',base:'Buckler',name:'Buckler',def:2}
        enemyTurn=original.enemyTurn
        for(let i=0;i<5;i++)enemyAttackPlayer(e,true)
        check(player.combatSkills.shielding>0,'shield-equipped landed melee hits train Shielding')
        player.combatSkills.shielding=100;player.combatSkillXp.shielding=0
        damageRoll=()=>9
        let attempts=0
        chance=()=>++attempts===2
        const hp=player.hp
        enemyAttackPlayer(e,true)
        check(hp-player.hp===3,'trained block reduces incoming damage to one-third')
        const recorded=JSON.parse(JSON.stringify(buildSaveObject()))
        const savedEnemy=recorded.enemies.find(m=>m.id===e.id)
        check(savedEnemy.combatSkillXp?.oneHanded>0 &&
          recorded.player.combatSkills.marksmanship>0,'current save includes progress and enemy budgets')
        loadGameFromObject(recorded,{isReplayInit:true})
        const restored=enemies.find(m=>m.id===e.id)
        check(JSON.stringify(player.combatSkills)===JSON.stringify(recorded.player.combatSkills) &&
          JSON.stringify(player.combatSkillXp)===JSON.stringify(recorded.player.combatSkillXp) &&
          JSON.stringify(restored.combatSkillXp)===JSON.stringify(savedEnemy.combatSkillXp),
          'replay-style restoration preserves all four levels, XP and caps')
        const current=buildSaveObject()
        check(current.version===self.VAGABOND_SAVE_VERSION,'combat skill save schema is current')
      } finally {
        chance=original.chance;damageRoll=original.damageRoll
        enemyTurn=original.enemyTurn;npcTurn=original.npcTurn
      }
    })()`))
    cy.window().then(win => win.eval('toggleInv(true)'))
    cy.get('.stats-details').invoke('prop', 'open', true)
    cy.get('#statGrid .lbl').filter((_, label) => label.textContent.includes('GRACE'))
      .should('have.length', 5).each($label => {
        expect($label.text()).to.match(/^🤺/)
      })
    cy.get('#statGrid').then($grid => {
      const strongest = $grid[0].querySelector('.achievement-row')
      expect(strongest.getBoundingClientRect().width).to.be.lessThan(
        $grid[0].getBoundingClientRect().width * 0.6)
      const value = strongest.querySelector('b')
      if (value.textContent === 'None') {
        expect(value.getBoundingClientRect().width).to.be.lessThan(
          strongest.getBoundingClientRect().width / 3)
      }
    })
    cy.get('.combat-skill-row').should('have.length', 4)
    let rowHeight
    cy.get('.combat-skill-row[data-skill="oneHanded"]').then($row => {
      rowHeight = $row[0].getBoundingClientRect().height
    })
    cy.get('.combat-skill-row[data-skill="oneHanded"]')
      .find('b').invoke('text').should('match', /^\d+ \/ 100$/)
    cy.get('.combat-skill-row[data-skill="oneHanded"]')
      .find('.combat-skill-detail').should('not.be.visible')
    cy.get('.combat-skill-row[data-skill="oneHanded"]')
      .click().then($row => {
        if ($row[0].ownerDocument.defaultView.matchMedia('(hover: hover) and (pointer: fine)').matches) {
          expect($row).to.have.attr('aria-expanded', 'false')
          expect($row).not.to.have.class('expanded')
        }
      })
      .find('.combat-skill-detail').should('contain', 'Train by damaging enemies with one-handed melee weapons')
    cy.get('.combat-skill-row[data-skill="oneHanded"]').then($row => {
      if (!$row[0].ownerDocument.defaultView.matchMedia('(hover: hover) and (pointer: fine)').matches) return
      const tooltip = $row[0].querySelector('.combat-skill-detail')
      expect($row[0].ownerDocument.defaultView.getComputedStyle(tooltip).position).to.equal('fixed')
      expect($row[0].getBoundingClientRect().height).to.equal(rowHeight)
      expect(tooltip.getBoundingClientRect().top).to.be.at.least(0)
    })
    cy.get('.combat-skill-row[data-skill="shielding"]')
      .click().then($row => {
        if ($row[0].ownerDocument.defaultView.matchMedia('(hover: hover) and (pointer: fine)').matches)
          expect($row).not.to.have.class('expanded')
      })
      .find('.combat-skill-detail').should('contain', 'Misses, arrows and spells do not count')
    cy.viewport(390, 844)
    cy.get('#invOverlay').invoke('addClass', 'character-sheet')
    cy.window().then(win => {
      const original = win.matchMedia.bind(win)
      cy.stub(win, 'matchMedia').callsFake(query =>
        query === '(hover: hover) and (pointer: fine)' ? {matches:false} : original(query))
    })
    cy.get('.combat-skill-row[data-skill="marksmanship"]')
      .click().should('have.attr', 'aria-expanded', 'true')
      .find('.combat-skill-detail').should('be.visible')
    cy.get('.combat-skill-row[data-skill="shielding"]')
      .click().should('have.class', 'expanded')
    cy.get('.combat-skill-row[data-skill="marksmanship"]')
      .should('not.have.class', 'expanded').should('have.attr', 'aria-expanded', 'false')
  })
})
