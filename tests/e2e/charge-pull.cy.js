describe('Charge and Pull terrain rules', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Rush Tester')
    // These cases test mechanics, not random world-generation attempts.
    cy.get('#worldSizeSelect').select('XS')
    cy.window().then(win => win.eval('WORLD_SEED = 12345; rngState = WORLD_SEED'))
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout:60000}).should($overlay => {
      expect($overlay.text(), 'world generation status').not.to.include('failed')
      expect($overlay, 'world generation finished').not.to.be.visible
    })
    cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => win.eval(`(() => {
      window.rushCheck=(ok,msg)=>{if(!ok) throw new Error(msg)}
      replayRecording=false; replayPlaying=false; replayData=null; replayAnimationsDisabled=true
      currentZ=0; currentCave=-1; map=surfaceMap; deathTransition=null
      enemies=[]; npcs=[]; occupied=new Set(); turnCount=0
      for(let y=30;y<=50;y++) for(let x=30;x<=50;x++) {
        map[y][x]='grass'; grasslandTrees.delete(keyXY(x,y))
      }
      player.x=40; player.y=40; player.hp=1000; player.maxHp=1000; player.race='human'
      player.godMode=false; player.invisibleTurns=0; player.poisonTurns=0
      player.equip={weapon:null,armor:null,shield:null}; resetSwimming()
      player.swimming=0; player.swimmingPractice=0
      window.rushEnemy=(name,x=38,y=40)=>{
        const t=ENEMY_TEMPLATE_BY_NAME[name]
        rushCheck(!!t, 'missing test enemy template: '+name)
        const e=addEnemy({...t,baseName:name,x,y,hp:t.hp,maxHp:t.hp,alive:true,
          level:0,homeX:x,homeY:y,homeTileType:'grass',prefix:null,equipment:null})
        occupied.add(keyXY(x,y)); return e
      }
    })()`))
  })

  it('validates cardinal/diagonal routes before rolling and respects range and invisibility', () => {
    cy.window().then(win => win.eval(`(() => {
      const e=rushEnemy('Boar'), previousChance=chance
      let rolls=0
      try {
        chance=()=>{rolls++;return false}
        rushCheck(enemyChargeLine(e).distance===2,'minimum gap')
        map[40][39]='forest'; rushCheck(!tryEnemyRush(e),'non-grass blocked')
        map[40][39]='grass'; grasslandTrees.add('39,40'); rushCheck(!tryEnemyRush(e),'tree blocked')
        grasslandTrees.delete('39,40'); npcs=[{x:39,y:40}]; rushCheck(!tryEnemyRush(e),'NPC blocked')
        npcs=[]; const blocker=rushEnemy('Giant Rat',39,40); rushCheck(!tryEnemyRush(e),'enemy blocked')
        blocker.alive=false; player.invisibleTurns=5; rushCheck(!tryEnemyRush(e),'invisibility blocked')
        player.invisibleTurns=0; player.x=41;player.y=42; rushCheck(!tryEnemyRush(e),'off line blocked')
        player.x=49;player.y=40; rushCheck(!tryEnemyRush(e),'outside aggro blocked')
        rushCheck(rolls===0,'invalid routes spend no RNG')
        player.x=40;player.y=40; e.y=38
        rushCheck(enemyChargeLine(e).distance===2,'diagonal valid')
        map[38][39]='mountain'; rushCheck(!tryEnemyRush(e),'diagonal corner blocked')
        map[38][39]='forest'; rushCheck(!!enemyChargeLine(e),'walkable side terrain allowed')
        rushCheck(!tryEnemyRush(e) && rolls===1,'failed proc preserves position')
      } finally {chance=previousChance}
    })()`))
  })

  it('allows Charge in caves and on marble while Pull additionally works on sand', () => {
    cy.window().then(win => win.eval(`(() => {
      const spider=rushEnemy('Giant Spider',37,40)
      const boar=rushEnemy('Boar',37,42)
      for(const terrain of ['grass','sand','cavefloor','cavefloor2','marble']) {
        player.x=40; player.y=40
        spider.x=37; spider.y=40
        occupied=new Set([keyXY(spider.x,spider.y),keyXY(boar.x,boar.y)])
        for(let x=37;x<=40;x++) map[40][x]=terrain
        rushCheck(enemyChargeLine(spider)?.distance===3,'pull line allowed on '+terrain)
      }
      player.x=40; player.y=42
      boar.x=37; boar.y=42
      for(const terrain of ['grass','cavefloor','cavefloor2','marble']) {
        for(let x=37;x<=40;x++) map[42][x]=terrain
        rushCheck(enemyChargeLine(boar)?.distance===3,'charge line allowed on '+terrain)
      }
      for(let x=37;x<=40;x++) map[42][x]='sand'
      rushCheck(!enemyChargeLine(boar),'charge remains blocked on sand')
    })()`))
  })

  it('charges with gap-scaled ATK and half dodge, knocks back, and never grants extra attacks', () => {
    cy.window().then(win => win.eval(`(() => {
      const e=rushEnemy('Minotaur'), oldChance=chance, oldDamage=damageRoll
      let attacks=0, attackAtk=null, dodge=null, calls=0
      try {
        chance=p=>{calls++; if(calls===1) {rushCheck(p===.60,'charge proc');return true}
          if(calls===2) dodge=p; return false}
        damageRoll=(atk,def)=>{attacks++;attackAtk=atk;return 10}
        const normalDodge=missChance(enemySpd(e),playerSpd()), hp=player.hp, steps=player.steps
        rushCheck(tryEnemyRush(e),'charge success')
        rushCheck(e.x===39 && player.x===41,'charge then knockback')
        rushCheck(attackAtk===e.atk*1.25 && dodge===normalDodge/2,'damage and dodge multipliers')
        rushCheck(attacks===1 && player.hp===hp-10 && player.steps===steps,'one attack no walking credit')
        rushCheck(!occupied.has('38,40') && occupied.has('39,40'),'occupancy relocated')
        // A repeat rush when the player retreats has no cooldown.
        player.x=42; calls=0; map[40][43]='mountain'
        rushCheck(tryEnemyRush(e) && attackAtk===e.atk*1.5 && player.x===42,'repeat charge and blocked knockback')
        map[40][43]='grass'; player.x=43; calls=0; chance=p=>{calls++;return calls<=2}
        const before=player.hp; rushCheck(tryEnemyRush(e),'dodged charge still moves monster')
        rushCheck(player.x===43 && player.hp===before,'dodge prevents damage and knockback')
      } finally {chance=oldChance;damageRoll=oldDamage}
    })()`))
  })

  it('pulls with ordinary damage/dodge and forced water knockback earns no swimming practice', () => {
    cy.window().then(win => win.eval(`(() => {
      const e=rushEnemy('Giant Spider',37,40), oldChance=chance, oldDamage=damageRoll
      let calls=0, atkUsed=null, dodge=null
      try {
        chance=p=>{calls++;if(calls===1){rushCheck(p===.70,'pull chance');return true}
          if(calls===2)dodge=p;return false}
        damageRoll=atk=>{atkUsed=atk;return 10}
        const steps=player.steps
        rushCheck(tryEnemyRush(e) && player.x===38 && e.x===37,'player pulled adjacent')
        rushCheck(atkUsed===e.atk && Math.abs(dodge-missChance(enemySpd(e),playerSpd()))<1e-9,'ordinary pull attack')
        rushCheck(player.steps===steps,'pull no steps')
        e.alive=false;occupied.clear();player.x=40
        const boar=rushEnemy('Boar');map[40][41]='water';calls=0
        chance=()=>++calls===1
        const hp=player.hp
        rushCheck(tryEnemyRush(boar) && player.x===41,'knockback into water without skill')
        rushCheck(player.drowning && player.hp<hp-10 && player.swimmingPractice===0,'immediate drowning no practice')
        const save=JSON.parse(JSON.stringify(buildSaveObject()));loadGameFromObject(save)
        rushCheck(player.drowning && player.x===41 && enemies.some(e=>e.abilities.includes('charge')),'save restores water and ability')
      } finally {chance=oldChance;damageRoll=oldDamage}
    })()`))
  })
  it('replays rush movement and combat with the same RNG and saved state', () => {
    cy.window().then(win => win.eval(`(async () => {
      rushEnemy('Boar',38,40);rushEnemy('Giant Spider',43,40)
      player.freezing={active:false,turns:0};player.curseDebuffs=[]
      player.berryRegenTurns=0;player.speedPotionTurns=0
      consecutiveWaitTurns=0;rngState=917
      startReplayRecording()
      for(let i=0;i<3;i++) skipTurn()
      const state=()=>({hp:player.hp,x:player.x,y:player.y,turn:turnCount,enemies:buildSaveObject().enemies})
      const expected=JSON.parse(JSON.stringify(state())), recorded=JSON.parse(JSON.stringify(replayData))
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayAnimationsDisabled=true;replaySimulationMode=true;activeReplay=recorded
      replayPlaying=true;replayRecording=false;replayRngIndex=0
      try {for(const action of recorded.actions) await runReplayAction(action)}
      finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
      rushCheck(replayRngIndex===recorded.rng.length,'same RNG trace')
      rushCheck(JSON.stringify(state())===JSON.stringify(expected),'same rush outcome')
    })()`))
  })

  it("preserves the web impact and drag after the player walks into a spider's Pull lane", () => {
    cy.window().then(async win => win.eval(`(async () => {
      const oldChance=chance, oldDamage=damageRoll, oldLoop=runAnimationLoop
      try {
        chance=p=>p===.70; damageRoll=()=>10; runAnimationLoop=()=>{}
        stopCameraAnimation(); clearEnemyAnims()
        enemies=[]; occupied.clear(); damageAnims=[]; projectileAnims=[]
        replayAnimationsDisabled=false; replaySimulationMode=false
        player.x=40; player.y=41; player.hp=1000
        const spider=rushEnemy('Giant Spider',37,40)
        const steps=player.steps
        await tryMove(0,-1)
        rushCheck(player.x===38 && player.y===40,'Pull resolves deterministically on walking turn')
        rushCheck(player.steps===steps+1,'only the voluntary step counts')
        const web=projectileAnims.find(anim=>anim.projectile==='web')
        rushCheck(!!web && web.path[1].x===40 && web.path[1].y===40,'web targets tile after walking')
        rushCheck(moveAnim?.kind==='pull' && moveAnim.fromX===40 && moveAnim.toX===38,
          'ordinary walking pan must not overwrite delayed drag')
        rushCheck(moveAnim.start>=web.start+420 && moveAnim.duration===360,
          'drag begins only after web impact')
        render(web.start+180)
        rushCheck(camX===targetCamX(40) && camY===targetCamY(40),
          'player stays visibly on target tile while web travels')
        render(moveAnim.start+180)
        rushCheck(camX<targetCamX(40) && camX>targetCamX(38),
          'camera and player follow the drag only after web impact')
        render(moveAnim.start+360)
        rushCheck(moveAnim===null && camX===targetCamX(38),
          'drag ends at resolved player position')
        rushCheck(damageAnims.some(effect=>typeof effect.amount==='number' && effect.delay>=780),
          'melee feedback follows the completed drag')

        // Ordinary walking without a Pull must retain its usual short pan.
        stopCameraAnimation(); enemies=[]; occupied.clear(); projectileAnims=[]
        player.x=40; player.y=41
        await tryMove(0,-1)
        rushCheck(moveAnim?.kind==='normal' && moveAnim.duration===MOVE_ANIM_MS,
          'uninterrupted walking keeps normal animation')
      } finally {
        chance=oldChance; damageRoll=oldDamage; runAnimationLoop=oldLoop
        replayAnimationsDisabled=true; stopCameraAnimation(); clearEnemyAnims()
      }
    })()`))
  })

  it('sequences web, drag and melee effects without changing Pull outcomes', () => {
    cy.window().then(win => win.eval(`(() => {
      const oldChance=chance,oldDamage=damageRoll,oldLoop=runAnimationLoop
      try {
        chance=p=>p===.70; damageRoll=()=>10; runAnimationLoop=()=>{}
        const outcomes=[]
        for(const animated of [true,false]) {
          stopCameraAnimation(); enemies=[]; occupied.clear(); damageAnims=[]; projectileAnims=[]
          player.x=40;player.y=40;player.hp=1000
          replayAnimationsDisabled=!animated; replaySimulationMode=false
          const e=rushEnemy('Giant Spider',37,40),steps=player.steps,turn=turnCount
          rushCheck(tryEnemyRush(e),'connected pull')
          outcomes.push([player.x,player.y,player.hp,player.steps-steps,turnCount-turn])
          if(animated) {
            const web=projectileAnims[0]
            rushCheck(web.projectile==='web' && web.duration===420,'slower thrown web')
            rushCheck(web.path[0].x===37 && web.path[1].x===40,'web targets original tile')
            rushCheck(moveAnim.fromX===40 && moveAnim.toX===38 && moveAnim.duration===360,'visual drag')
            rushCheck(moveAnim.start>=web.start+420,'drag waits for web')
            rushCheck(damageAnims.some(effect=>effect.amount==='Web!' && effect.delay===420),'web impact text')
            rushCheck(damageAnims.some(effect=>typeof effect.amount==='number' && effect.delay>=780),'melee follows drag')
            render(web.start)
            rushCheck(moveAnim!==null,'pre-start rendering does not finish drag')
          } else rushCheck(!projectileAnims.length && !moveAnim,'simulation skips web and drag')
        }
        rushCheck(JSON.stringify(outcomes[0])===JSON.stringify(outcomes[1]),'same rules with and without animation')
      } finally {
        chance=oldChance;damageRoll=oldDamage;runAnimationLoop=oldLoop
        replayAnimationsDisabled=true;stopCameraAnimation();clearEnemyAnims()
      }
    })()`))
  })

})
