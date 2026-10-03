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
