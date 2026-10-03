describe('Ultra-rare enemy templates', () => {
  const expected = {
    'VAMPIRE': 4,
    'TOKKA': 2,
    'MYRKA': 3,
    'SKERVA': 3,
    'KVELD': 3,
    'TULLA': 3,
    'GRIVEL': 3,
    'GRIVKIN': 2,
    'GAUR': 3,
    'DRUSK': 2,
    'NULK': 2,
    'GIANT TOAD': 1,
    'SKELD': 4,
    'BOG SPITTER': 3,
    'THORNMAW': 3,
    'SPINEBACK': 4,
    'NHALUUN': 4,
    'MIREHOWL': 3,
    'ASHFANG': 3,
    'MURKSPAWN': 2,
  }

  it('keeps every new species uppercase, ultra-rare, and spawnable in valid biomes', () => {
    cy.request('/content/enemy_templates.json').then(({body}) => {
      expect(new Set(body.map(template => template.name)).size, 'enemy names remain unique').to.equal(body.length)
      const byName = new Map(body.map(template => [template.name, template]))
      const validBiomes = new Set(['grass', 'forest', 'hill', 'sand', 'snow', 'river', 'cave'])
      const surfaceBiomes = new Set(['grass', 'forest', 'hill', 'sand', 'snow', 'river'])

      for (const [name, tier] of Object.entries(expected)) {
        const template = byName.get(name)
        expect(template, `${name} template`).to.exist
        expect(template.name).to.equal(template.name.toUpperCase())
        expect(template.rarity, `${name} rarity`).to.equal(0.02)
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
