// Buffer browser notifications; cy.task must run inside a hook's command queue.
let generations = []

beforeEach(() => {
  generations = []
})

Cypress.on('window:before:load', win => {
  win.addEventListener('vagabond:world-generation', event => {
    const {seed, width, height, traits} = event.detail
    const generation = {seed, width, height, traits: [...traits]}
    generations.push(generation)
    Cypress.log({
      name: 'worldgen seed',
      message: String(seed),
      consoleProps: () => generation,
    })
  })
})

afterEach(function () {
  if (!generations.length) return
  return cy.task('logWorldGenerationSeeds', {
    spec: Cypress.spec.relative,
    test: this.currentTest.fullTitle(),
    state: this.currentTest.state,
    generations,
  }, {log: false})
})
