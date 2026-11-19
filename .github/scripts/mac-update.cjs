const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _electron } = require('playwright-core');

(async () => {
  const version = require('../../package.json').version;
  const root = path.join(process.env.RUNNER_TEMP, 'deskbuddy-update-test');
  fs.mkdirSync(root, { recursive: true });
  const zip = path.resolve(`DeskBuddy-Mac-${version}.zip`);
  let electron;
  const newBundle = path.join(root, 'updates', `v${version}`, 'DeskBuddy.app');
  try {
    electron = await _electron.launch({ executablePath: path.resolve('DeskBuddy.app/Contents/MacOS/DeskBuddy'), args: [`--user-data-dir=${root}`] });
    electron.process().stdout.on('data', chunk => process.stdout.write(chunk));
    electron.process().stderr.on('data', chunk => process.stderr.write(chunk));
    console.log('Update test app launched');
    const page = await electron.firstWindow();
    // Let the real startup release request finish (its timeout is eight seconds) before mocking versions.
    await new Promise(resolve => setTimeout(resolve, 9000));
    await electron.evaluate(async ({ app, dialog }, input) => {
      dialog.showMessageBox = async options => { console.error('UPDATE DIALOG:', options); return { response: 1 }; };
      const fs = process.getBuiltinModule('fs');
      const original = globalThis.fetch;
      app.getVersion = () => '0.0.0';
      globalThis.fetch = async (url, options) => {
        console.log('UPDATE FETCH', String(url));
        if (String(url).includes('api.github.com/repos/kssemy/deskbuddy-pet/releases')) return new Response(JSON.stringify([
          { tag_name: `v${input.version}`, assets: [{ name: `DeskBuddy-Mac-${input.version}.zip`, browser_download_url: 'https://fixture.invalid/mac.zip', size: fs.statSync(input.zip).size }] }
        ]));
        if (String(url) === 'https://fixture.invalid/mac.zip') return new Response(fs.readFileSync(input.zip));
        return original(url, options);
      };
    }, { version, zip });
    console.log('Update fixture installed');
    const closed = electron.waitForEvent('close', { timeout: 120000 });
    await electron.evaluate(({ BrowserWindow }) => {
      const now = Date.now;
      Date.now = () => now() + 120000;
      BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('pet.html')).emit('focus');
    });
    const notice = electron.windows().find(page => page.url().includes('update.html')) ||
      await electron.waitForEvent('window', { predicate: page => page.url().includes('update.html') });
    await notice.locator('#restart').click();
    console.log('Update requested');
    await closed;
    electron = null;
    const deadline = Date.now() + 90000;
    let restarted = false;
    while (Date.now() < deadline) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(root, 'prototype.json'), 'utf8'));
        if (data.sessions.length >= 2 && data.lastVersion === version) { restarted = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert(restarted, 'Updated app must restart using the same user data');
    assert(fs.existsSync(path.join(newBundle, 'Contents/MacOS/DeskBuddy')));
    console.log('PASS: Mac update download, extraction, version check, old process exit and new app restart');
  } finally {
    if (electron) await electron.close().catch(() => {});
    try { execFileSync('pkill', ['-f', path.join(newBundle, 'Contents/MacOS/DeskBuddy')]); } catch {}
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
