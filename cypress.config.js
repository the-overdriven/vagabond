const { defineConfig } = require('cypress')

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://127.0.0.1:8080',
    specPattern: 'tests/e2e/**/*.cy.js',
    supportFile: 'tests/support/e2e.js',
    setupNodeEvents(on) {
      on('task', {
        logWorldGenerationSeeds({spec, test, state, generations}) {
          for (const generation of generations) {
            console.log(`[worldgen] ${JSON.stringify({spec, test, state, ...generation})}`)
          }
          return null
        },
      })
    },
    video: false,
    defaultCommandTimeout: 60000,
  },
})