const fs = require('node:fs'), path = require('node:path')
const {run, context} = require('./helpers/node-game-runtime.cjs')
async function main() {
  await run('loadContent()')
  context.fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'saves/Tester_start.json'), 'utf8'))
  run('loadGameFromObject(fixture, {isReplayInit: true}); log = () => {}')
  run(fs.readFileSync(path.join(__dirname, 'helpers/auto-forage-checks.js'), 'utf8'))
  await run('autoForageChecks()')
  console.log('PASS Auto-Forage movement, auto-path, repeat protection, enemy safety, save reset and replay RNG')
}
main().catch(err => { console.error(err.stack); process.exitCode = 1 })
