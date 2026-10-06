function beginGame() {
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.get('#raceName').clear().type('Crit Tester')
  cy.get('#btnBegin').click()
  cy.get('#raceOverlay').should('not.have.class', 'show')
}

describe('Critical hits', () => {
  it('shows the actual player crit chance and only exceptional enemy crit chances', () => {
    beginGame()
    cy.window().then(win => {
      const result = win.eval(`(() => {
        renderInventory()
        const enemy = {
          name: 'Goblin', baseName: 'Goblin', tier: 2, hp: 20, maxHp: 20,
          atk: 2, def: 0, spd: 2, aggro: 4, x: player.x + 1, y: player.y,
          level: currentZ, alive: true
        }
        enemies.push(enemy)
        try {
          const normal = tileInspectInfo(enemy.x, enemy.y).html
          enemy.prefix = 'Fierce'
          const fierce = tileInspectInfo(enemy.x, enemy.y).html
          enemy.prefix = 'Deadly'
          enemy.crit = true
          const deadly = tileInspectInfo(enemy.x, enemy.y).html
          return {stats: document.getElementById('statGrid').textContent, normal, fierce, deadly}
        } finally {
          enemies.pop()
        }
      })()`)
      expect(result.stats).to.match(/Crit Chance\s*5%/)
      expect(result.normal).not.to.include('chance to crit')
      expect(result.fierce).to.include('10% chance to crit')
      expect(result.deadly).to.include('15% chance to crit')
      for (const html of [result.normal, result.fierce, result.deadly]) {
        expect(html).not.to.include('double damage')
      }
    })
  })
})

describe('Invisible opening criticals', () => {
  it('adds 20 percentage points only before Alarmed and excludes trueSight', () => {
    beginGame()
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, message) => { if (!ok) throw new Error(message) }
      replayRecording=false; replayAnimationsDisabled=true
      const savedNpcs=npcs
      currentZ=0; map=surfaceMap; enemies=[]; npcs=[]; occupied.clear()
      player.godMode=false; player.invisibleTurns=10; player.equip={weapon:null,shield:null,armor:null}
      const oldChance=chance, oldDamage=damageRoll, oldLog=log
      const messages=[]
      try {
        chance=p=>p===0.25; damageRoll=()=>10; log=msg=>messages.push(msg)
        const e=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin, name:'Goblin', baseName:'Goblin',
          x:player.x+1,y:player.y,level:0,hp:1000,maxHp:1000,alive:true,
          abilities:[],equipment:null,prefix:null,alarmed:false})
        enemies=[e]
        await playerAttackEnemy(e,true)
        check(e.hp===980 && e.alarmed,'invisible opening deals critical damage before alarming target')
        check(messages.some(m=>m.startsWith('Critical hit!')),'existing critical feedback')
        await playerAttackEnemy(e,true)
        check(e.hp===970,'alarmed target gets normal crit chance')
        e.alarmed=false; e.abilities=['trueSight']
        await playerAttackEnemy(e,true)
        check(e.hp===960,'trueSight is immune')
        e.abilities=[]; e.alarmed=false; player.invisibleTurns=0
        await playerAttackEnemy(e,true)
        check(e.hp===950,'visible attacker gets normal crit chance')
        e.alarmed=false; player.invisibleTurns=10
        await playerAttackEnemy(e,true)
        check(e.hp===930,'bonus returns when Alarmed resets')
        // Armor glancing remains incompatible with critical damage.
        const oldArmor=equippedArmor
        try {
          e.alarmed=false; equippedArmor=()=>({base:'Plate Armor'})
          let rolls=0; chance=()=>++rolls>1
          await playerAttackEnemy(e,true)
          check(e.hp===927,'glancing damage is not doubled')
        } finally { equippedArmor=oldArmor }
      } finally { chance=oldChance; damageRoll=oldDamage; log=oldLog }
      const quarry=enemies[0]
      quarry.hp=1000;quarry.maxHp=1000;quarry.alarmed=false;quarry.abilities=[]
      player.invisibleTurns=10;map[quarry.y][quarry.x]='grass';grasslandTrees.delete(keyXY(quarry.x,quarry.y))
      npcs=savedNpcs
      for (const n of npcs) occupied.add(keyXY(n.x,n.y))
      stopCameraAnimation();stopAttackAnimation();replayData=null;startReplayRecording()
      await tryMove(1,0)
      check(replayData.actions.length===1 && replayData.actions[0].type==='move' &&
        replayData.actions[0].dx===1 && replayData.actions[0].dy===0,'invisible attack records one move')
      const live=JSON.stringify({hp:player.hp,turn:turnCount,target:enemies.find(x=>x.id===quarry.id).hp})
      startReplayPlayback()
      check(replayPlaying,'invisible attack replay starts')
      return {live, quarryId:quarry.id}
    })()`)).then(({live, quarryId}) => {
      cy.window().should(win => {
        expect(win.eval('replayPlaying'),'replay finishes').to.equal(false)
      }).then(win => {
        const state=win.eval(`({
          diagnostic:lastReplayDiagnostic,
          actions:replayData.actions.length,rng:replayData.rng.length,
          hp:player.hp,turn:turnCount,target:enemies.find(x=>x.id===${JSON.stringify(quarryId)})?.hp
        })`)
        if (state.diagnostic && !('completedActions' in state.diagnostic)) {
          throw new Error(`Replay desync: ${JSON.stringify({
            actionIndex:state.diagnostic.actionIndex,
            expectedRng:state.diagnostic.expectedRng,
            actualRng:state.diagnostic.actualRng
          })}`)
        }
        expect(state.diagnostic,'replay completion diagnostic').to.have.property('completedActions',state.actions)
        expect(state.diagnostic.consumedRng,'replay RNG consumption').to.equal(state.rng)
        expect(JSON.stringify({hp:state.hp,turn:state.turn,target:state.target}),'live combat restored').to.equal(live)
      })
    })
  })
})
