const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('./main.js'), 'utf8');
const code = source.slice(source.indexOf('async function latestRelease()'), source.indexOf('let installingUpdate'));
const release = (version, platforms, extra = {}) => ({ tag_name: `v${version}`, assets: platforms.map(p => ({ name: `DeskBuddy-${p}-${version}.zip` })), ...extra });
async function check(platform, releases) {
  const context = vm.createContext({ process: { platform }, app: { getVersion: () => '0.1.40' }, RELEASE_API: 'https://api.github.com/repos/example/app/releases/latest', AbortSignal,
    fetch: async url => { assert.match(url, /releases\?per_page=100$/); return { ok: true, json: async () => releases }; } });
  return vm.runInContext(code + '\nlatestRelease()', context);
}
test('Windows and Mac independently select their newest published ZIP', async () => {
  const releases = [release('0.1.42', ['Windows']), release('0.1.41', ['Mac']), release('0.1.40', ['Windows', 'Mac']), release('0.1.99', ['Mac'], { draft: true }), release('0.1.98', ['Windows'], { prerelease: true })];
  assert.equal((await check('win32', releases)).asset.name, 'DeskBuddy-Windows-0.1.42.zip');
  assert.equal((await check('darwin', releases)).asset.name, 'DeskBuddy-Mac-0.1.41.zip');
  assert.equal((await check('darwin', [release('0.1.39', ['Mac'])])).update, false);
  await assert.rejects(check('darwin', [release('0.1.41', ['Windows'])]), /배포 파일/);
  await assert.rejects(check('linux', releases), /운영체제/);
});
