const spellHelpers=require('../helpers/enemy-spell-checks.js')
const gearHelpers=require('../helpers/gear-auto-equip-checks.js')
describe('Loot auto equip respects two-handed restrictions',()=>{
  beforeEach(()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>cy.window().then(win=>{
      win.__gearFixture=save
      win.eval('loadGameFromObject(window.__gearFixture,{isReplayInit:true})')
      delete win.__gearFixture
      for(const [name,fn] of Object.entries({...spellHelpers,...gearHelpers}))
        win.eval('window.'+name+' = '+fn.toString())
    }))
  })
  it('keeps dropped two-handed gear in inventory when a shield is equipped and replays safe equip behavior',()=>{
    cy.window().then(win=>win.eval('gearAutoEquipShieldConflictCheck()'))
  })
  it('uses keys 1 and 2 for best melee-plus-shield and ranged loadouts',()=>{
    cy.window().then(win=>{
      win.eval('setupQuickEquipKeyboardArena()')
      const key=k=>win.dispatchEvent(new win.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}))
      key('1')
      win.eval(`if(player.equip.weapon?.base!=='Long Sword'||
        player.equip.shield?.base!=='Tower Shield'||turnCount!==2)
        throw Error('key 1 equips the best melee weapon and shield in two turns')`)
      key('1')
      win.eval(`if(turnCount!==2)throw Error('key 1 repeated with the same loadout is free')`)
      key('2')
      win.eval(`if(player.equip.weapon?.base!=='Short Bow'||player.equip.shield||turnCount!==3)
        throw Error('key 2 restores the ranged weapon and removes the shield')`)
      key('2')
      win.eval(`if(turnCount!==3)throw Error('key 2 does not consume a turn when already equipped')`)
      key('1')
      win.eval(`if(player.equip.weapon?.base!=='Long Sword'||
        player.equip.shield?.base!=='Tower Shield'||turnCount!==5)
        throw Error('key 1 restores the melee and shield loadout')`)
    })
  })
})
