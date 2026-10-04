function beginMessageGame() {
  cy.visit('/')
  cy.get('#raceName').clear().type('Message Tester')
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay').should('not.be.visible')
  cy.get('#raceOverlay').should('not.have.class', 'show')
}
describe('Damage, healing, and equipped Hunter quest messages', () => {
  it('logs damage before the low-health warning for melee, arrows, poison, and freezing', () => {
    beginMessageGame()
    cy.window().then(win=>win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw new Error(msg)}
      replayRecording=false;replayAnimationsDisabled=true;player.maxHp=100;player.equip={weapon:null,armor:null,shield:null}
      player.godMode=false;player.invisibleTurns=0;currentZ=0;map=surfaceMap
      player.x=40;player.y=40;map[40][40]='grass';npcs=[];enemies=[];occupied.clear()
      const old={log,chance,damageRoll},messages=[]
      try {
        log=msg=>messages.push(msg);chance=()=>false;damageRoll=()=>5
        const reset=()=>{messages.length=0;player.hp=21;player.lowHpWarningActive=false}
        const e=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Centaur,baseName:'Centaur',name:'Centaur',x:43,y:40,
          level:0,alive:true,hp:100,maxHp:100,abilities:[],equipment:null,prefix:null,summonedTurn:null})
        reset();enemyAttackPlayer(e,true)
        check(messages[0].includes('hits you')&&messages[1]==="You're hurt badly.",'melee damage before warning')
        e.shooterAbility=Object.keys(RANGED_CONFIG.abilities).find(k=>RANGED_CONFIG.abilities[k].projectile==='arrow');e.shotsRemaining=10
        reset();enemyRangedAttackPlayer(e,[{x:43,y:40},{x:40,y:40}])
        check(messages[0].includes('at you for 5 damage')&&messages[1]==="You're hurt badly.",'arrow damage before warning')
        reset();player.hp=20;player.poisonTurns=2;tickPlayerPoison()
        check(messages[0]==='Poison deals 1 HP damage.'&&messages[1]==="You're hurt badly.",'poison damage before warning')
        reset();map[40][40]='snow';player.freezing={active:true,turns:WORLD_GEN_CONFIG.environment.freezingDamageIntervalTurns-1}
        player.hp=20;tickFreezing()
        check(messages[0].includes('freezing cold bites')&&messages[1]==="You're hurt badly.",'cold damage before warning')
      } finally {log=old.log;chance=old.chance;damageRoll=old.damageRoll}
    })()`))
  })
  it('logs potion/herb use before poison recovery and omits poison durations', () => {
    beginMessageGame()
    cy.window().then(win=>win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw new Error(msg)}
      replayRecording=false;player.equip={weapon:null,armor:null,shield:null};resetSwimming()
      const old={log,enemyTurn,npcTurn,chance},messages=[]
      try {
        log=msg=>messages.push(msg);enemyTurn=()=>{};npcTurn=()=>{}
        player.hp=20;player.maxHp=100;player.poisonTurns=5;player.inventory=[{kind:'potion',count:1}]
        usePotion(0)
        check(messages[0]==='You drink a Life Potion and feel fully restored.'&&messages[1]==='The poison leaves your body.','potion before cure')
        messages.length=0;player.hp=20;player.poisonTurns=5;player.inventory=[{kind:'herb',count:1}]
        useHerb(0)
        check(messages[0].startsWith('You eat the Healing Herb')&&messages[1]==='The poison leaves your body.','herb before cure')
        messages.length=0;chance=()=>true;player.poisonTurns=0
        const scorpion={name:'Scorpion',abilities:['poison']}
        applyEnemyPoison(scorpion);applyEnemyPoison(scorpion)
        check(messages[0]==='The Scorpion poisons you!'&&messages[1]==="The Scorpion's venom renews your poison.",'duration omitted on application and refresh')
        check(player.poisonTurns>0,'poison counter still applied')
      } finally {log=old.log;enemyTurn=old.enemyTurn;npcTurn=old.npcTurn;chance=old.chance}
    })()`))
  })
  it('acknowledges equipped quest gear without removing it or completing the quest', () => {
    beginMessageGame()
    cy.window().then(win=>win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw new Error(msg)}
      replayRecording=false;enemies=[];npcs=[];player.inventory=[]
      const gear={kind:'weapon',base:'Dagger',name:'Dagger',atk:1,grace:5,hunterQuestId:'hunter_test'}
      player.equip={weapon:gear,armor:null,shield:null}
      player.inventory=[{...gear,hunterQuestId:null}]
      oldHunterQuest={id:'hunter_test',type:'recover_item',state:'ready',targetItemName:'Dagger',targetItem:gear,rewardXp:100}
      const oldLog=log,messages=[];log=msg=>messages.push(msg)
      try {
        interactOldHunter()
        check(messages[0]==="Old Hunter says: I see that you have retrieved my Dagger. You aren't trying to claim it as your own now, are you? Will you give it back?",'equipped item dialogue')
        check(player.equip.weapon===gear&&oldHunterQuest.state==='ready','gear and quest unchanged')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()));loadGameFromObject(saved)
        messages.length=0;interactOldHunter()
        check(messages[0].includes('retrieved my Dagger'),'equipped item recognized after load')
        player.inventory.push(player.equip.weapon);player.equip.weapon=null
        interactOldHunter()
        check(oldHunterQuest.state==='completed'&&!player.inventory.some(i=>i.hunterQuestId==='hunter_test'),'normal unequipped hand-in still works')
        check(player.inventory.some(i=>i.name==='Dagger'&&!i.hunterQuestId),'same-name spare is preserved')
      } finally {log=oldLog}
    })()`))
  })
})
