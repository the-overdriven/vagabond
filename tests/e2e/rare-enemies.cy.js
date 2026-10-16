describe('Ultra-rare enemy templates', () => {
  const expected = {
    'Vampire': {tier:4, rarity:0.01},
    'Tokka': {tier:2, rarity:0.1},
    'Myrka': {tier:3, rarity:0.02},
    'Skerva': {tier:3, rarity:0.1},
    'Kveld': {tier:3, rarity:0.1},
    'Tulla': {tier:3, rarity:0.1},
    'Grivel': {tier:3, rarity:0.1},
    'Grivkin': {tier:2, rarity:0.1},
    'GAUR': {tier:4, rarity:0.02},
    'DRUSK': {tier:4, rarity:0.02},
    'NULK': {tier:4, rarity:0.02},
    'Giant Toad': {tier:1, rarity:0.1},
    'SKELD': {tier:4, rarity:0.02},
    'Bog Spitter': {tier:3, rarity:0.1},
    'Thornmaw': {tier:3, rarity:0.1},
    'Spineback': {tier:4, rarity:0.1},
    'NHALUUN': {tier:4, rarity:0.02},
    'MIREHOWL': {tier:4, rarity:0.02},
    'ASHFANG': {tier:4, rarity:0.02},
    'Murkspawn': {tier:2, rarity:0.1},
  }

  it('preserves exact species names and current rare balance, with valid spawn biomes', () => {
    cy.request('/content/enemy_templates.json').then(({body}) => {
      expect(new Set(body.map(template => template.name)).size, 'enemy names remain unique').to.equal(body.length)
      const byName = new Map(body.map(template => [template.name, template]))
      const validBiomes = new Set(['grass', 'forest', 'hill', 'sand', 'snow', 'river', 'lava', 'cave'])
      const surfaceBiomes = new Set(['grass', 'forest', 'hill', 'sand', 'snow', 'river', 'lava'])

      for (const [name, {tier, rarity}] of Object.entries(expected)) {
        const template = byName.get(name)
        expect(template, `${name} template`).to.exist
        expect(template.name).to.equal(name)
        expect(template.rarity, `${name} rarity`).to.equal(rarity)
        expect(template.tier, `${name} tier`).to.equal(tier)
        expect(template.hp, `${name} hp`).to.be.greaterThan(0)
        expect(template.atk, `${name} atk`).to.be.greaterThan(0)
        expect(template.def, `${name} def`).to.be.at.least(0)
        expect(template.spd, `${name} spd`).to.be.greaterThan(0)
        expect(template.grace, `${name} grace`).to.be.greaterThan(0)
        expect(template.biomes, `${name} biomes`).to.be.an('array').and.not.be.empty
        for (const biome of template.biomes) expect(validBiomes.has(biome), `${name} biome ${biome}`).to.equal(true)
        expect(template.biomes.some(biome => surfaceBiomes.has(biome)), `${name} has a surface biome`).to.equal(true)
      }
    })
  })

  it('gives ordinary and prefixed surface rares two sightings regardless of wander mode or humanoid type', () => {
    cy.visit('/')
    cy.get('#raceOverlay .panelbox').should('be.visible')
    cy.window().then(win => win.eval('WORLD_SEED=246813579; rngState=WORLD_SEED'))
    cy.get('#raceName').clear().type('Rare Scope Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,message)=>{if(!ok)throw new Error(message)}
      replayRecording=false; replayAnimationsDisabled=true
      currentZ=0; map=surfaceMap; player.invisibleTurns=0; player.godMode=false
      oldHunterQuest=null;enemies=[];npcs=[];occupied=new Set()
      const control={...ENEMY_TEMPLATE_BY_NAME.Myrka,...rareFleeDefaults({}),baseName:'Myrka',
        alive:true,level:0,x:player.x+4,y:player.y,aware:false,alarmed:false}
      check(playerInsideSanctuary()&&!rareStartFlee(control,4),
        'the starting sanctuary hides the player and cannot trigger a rare sighting')
      // Rare sightings require a visible player outside the Temple sanctuary.
      const offset=FLEE_DISTANCE+RARE_FLEE.sightRange+2
      player.x=spawnPoint.x+offset<MAP_W-5 ? spawnPoint.x+offset : spawnPoint.x-offset
      player.y=spawnPoint.y
      map[player.y][player.x]='grass';grasslandTrees.delete(keyXY(player.x,player.y))
      check(!playerInsideSanctuary()&&!playerHasForestCover(),'rare-sighting arena is unprotected and unconcealed')
      const names=['Myrka','Vampire','NULK','SKELD','DRUSK','GAUR','ASHFANG','MIREHOWL','NHALUUN']
      check(JSON.stringify(ENEMY_TEMPLATES.filter(t=>Number(t.rarity??1)<=RARE_FLEE.maxRarity).map(t=>t.name).sort())===JSON.stringify(names.slice().sort()), 'exact rare scope')
      for(const prefixed of [false,true]) for(const name of names) for(const wander of ['far','homeReturn','homeReanchored','roam',false]) {
        const t=ENEMY_TEMPLATE_BY_NAME[name]
        const e={...t,...rareFleeDefaults({}),name:prefixed?'Fierce '+name:name,baseName:name,prefix:prefixed?'Fierce':null,
          alive:true,level:0,x:player.x+4,y:player.y,aware:false,alarmed:false,wander}
        check(rareStartFlee(e,4), e.name+' '+wander+' starts without a quest outside sanctuary')
        check(e.rareSightings===1 && e.rareFleeTurns===RARE_FLEE.fleeTurns[0] && !e.aware && !e.alarmed, e.name+' '+wander+' cinematic flags')
        check(!rareStartFlee(e,4), 'ongoing flight cannot retrigger')
        e.rareFleeTurns=0; e.rareSightings=2; e.rareArmed=true
        check(!rareStartFlee(e,4), 'two sightings only')
      }
      check(!rareFleeTemplate({baseName:'Kveld'}), 'ordinary control remains unchanged')
    })()`))
  })

  it('serves the supplied portraits using the normal enemy slug paths', () => {
    const portraits = [
      'tokka', 'myrka', 'skerva', 'kveld', 'tulla',
      'grivel', 'grivkin', 'skeld', 'spineback', 'murkspawn',
    ]
    for (const slug of portraits) {
      cy.request(`/img/enemies/${slug}.jpg`).its('status').should('eq', 200)
    }
  })
})
