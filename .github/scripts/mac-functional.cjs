const assert = require('node:assert/strict');
const path = require('node:path');
const { _electron } = require('playwright-core');

const bundle = path.resolve('DeskBuddy.app');
const executablePath = path.join(bundle, 'Contents/MacOS/DeskBuddy');
const appPath = path.join(bundle, 'Contents/Resources/app');
const png = path.join(appPath, 'default-character.png');
const jpg = path.resolve('character-test.jpg');
let electron;

async function windowFor(name) {
  const [file, mode] = name.split('?mode=');
  const matches = page => {
    const url = new URL(page.url());
    return url.pathname.endsWith('/' + file) && (!mode || url.searchParams.get('mode') === mode);
  };
  return electron.windows().find(matches) ||
    electron.waitForEvent('window', { predicate: matches, timeout: 20000 });
}

async function openSettings() {
  await electron.evaluate(({ BrowserWindow }, files) => {
    const window = new BrowserWindow({ width: 280, height: 590, show: true, frame: false,
      webPreferences: { preload: files.preload, contextIsolation: true, nodeIntegration: false } });
    window.loadFile(files.panel, { query: { mode: 'settings' } });
  }, { panel: path.join(appPath, 'panel.html'), preload: path.join(appPath, 'preload.js') });
  const page = await windowFor('panel.html?mode=settings');
  await page.locator('#settingsView').waitFor({ state: 'visible' });
  return page;
}

async function run() {
  electron = await _electron.launch({ executablePath,
    args: [`--user-data-dir=${process.env.RUNNER_TEMP}/deskbuddy-functional`] });
  const pet = await windowFor('pet.html');
  await pet.locator('#figure').waitFor({ state: 'visible' });
  assert.match(await pet.locator('#workStatus').textContent(), /\S/);
  console.log('PASS: own character and work status');

  await pet.locator('#figure').click({ force: true });
  const tasks = await windowFor('panel.html?mode=tasks');
  await tasks.locator('#entry').fill('Mac functional task');
  await tasks.locator('#add button[value=task]').click();
  const task = tasks.locator('#tasks li').filter({ hasText: 'Mac functional task' });
  await task.waitFor();
  await task.locator('.pin').click();
  await task.locator('input[type=checkbox]').check();
  await tasks.locator('#entry').fill('Mac fixed memo');
  await tasks.locator('#add button[value=memo]').click();
  await tasks.locator('#memos').getByText('Mac fixed memo').waitFor();
  await tasks.locator('#shareTodos').check();
  const own = await pet.evaluate(() => window.pet.load());
  assert(own.tasks.some(item => item.text === 'Mac functional task' && item.done && item.pinned));
  assert(own.memos.some(item => item.text === 'Mac fixed memo'));
  assert.equal(own.shareTodos, true);
  await tasks.locator('#tasksView .close').click();
  console.log('PASS: task, pin, completion, memo, sharing');

  await pet.locator('#chatButton').click();
  const chat = await windowFor('panel.html?mode=chat');
  await chat.locator('#chatInput').fill('Mac hello');
  await chat.locator('#chatForm button[type=submit]').click();
  await pet.getByText('Mac hello').waitFor();
  await pet.locator('#chatButton').click();
  const bomb = await windowFor('panel.html?mode=chat');
  await bomb.locator('#chatInput').fill('Short hello');
  await bomb.locator('#bomb').click();
  await pet.getByText('Short hello').waitFor();
  assert.equal(await pet.locator('#speech').getAttribute('class'), 'temporary');
  console.log('PASS: persistent and temporary speech');

  await pet.evaluate(() => window.pet.openHistory());
  const history = await windowFor('history.html');
  await history.getByText('Mac functional task').first().waitFor();
  await history.locator('#close').click();
  console.log('PASS: monthly history');

  const settings = await openSettings();
  assert.equal(await settings.locator('#autoLaunch').locator('..').isVisible(), false);
  await settings.locator('#workStart').fill('08:30');
  await settings.locator('#saveSettings').click();
  assert.equal((await pet.evaluate(() => window.pet.load())).workStart, '08:30');
  console.log('PASS: settings and macOS startup option');

  await electron.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, jpg);
  await pet.evaluate(() => window.pet.openWardrobe());
  const wardrobe = await windowFor('wardrobe.html');
  await wardrobe.locator('#upload').click();
  await wardrobe.locator('#status').getByText('옷장에 추가했어요.').waitFor();
  const uploaded = await pet.evaluate(() => window.pet.load());
  assert.notEqual(uploaded.currentCharacterId, 'default');
  await wardrobe.locator('#addPoses').click();
  await wardrobe.locator('#poseGrid .pose').first().waitFor();
  assert.equal((await pet.evaluate(() => window.pet.load())).poses.length, 1);
  await wardrobe.locator('#poseGrid .delete').first().click();
  assert.equal((await pet.evaluate(() => window.pet.load())).poses.length, 0);
  await wardrobe.locator('#close').click();
  console.log('PASS: JPG character and pose upload/deletion');

  await electron.evaluate(({ nativeImage }, file) => {
    const avatar = nativeImage.createFromPath(file).resize({ width: 64, height: 64 }).toDataURL();
    const original = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const address = String(url);
      if (address.includes('api.github.com/repos/kssemy/deskbuddy-pet/releases/latest'))
        return new Response(JSON.stringify({ tag_name: 'v0.1.34', assets: [{
          name: `DeskBuddy-mac-${process.arch}-0.1.34.zip`,
          browser_download_url: 'https://example.invalid/test.zip' }] }), { status: 200 });
      if (!address.includes('tgyfscvjnkaiykyfyzcc.supabase.co')) return original(url, options);
      let result = null;
      if (address.includes('/rpc/pet_register'))
        result = { member_id: 'p_mac_test_self', name: 'MacTester', session_token: 'mock-session' };
      else if (address.includes('/pet_presence?select='))
        result = [{ member_id: 'p_mac_test_friend', name: 'Friend', avatar, speech: 'Hello friend',
          status: '01:23', public_tasks: [{ text: 'Mock friend task', done: false }],
          updated_at: new Date().toISOString() }];
      else if (address.includes('/pet_schedule?select=') || address.includes('/pet_poses?select=')) result = [];
      return new Response(result === null ? '' : JSON.stringify(result), { status: 200 });
    };
  }, png);
  const login = await openSettings();
  await login.locator('#loginName').fill('MacTester');
  await login.locator('#loginPin').fill('123456');
  await login.locator('#register').click();
  await login.locator('#disconnect').waitFor({ state: 'visible' });
  const friend = await windowFor('other.html');
  await friend.locator('#avatar').waitFor({ state: 'visible' });
  await friend.getByText('Hello friend').waitFor();
  await friend.evaluate(() => {
    const avatar = document.querySelector('#avatar');
    avatar.setPointerCapture = () => {};
    avatar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
    avatar.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1 }));
  });
  await friend.locator('#todo').waitFor({ state: 'visible' });
  await friend.getByText('Mock friend task').waitFor();
  const friendClosed = friend.waitForEvent('close');
  await login.locator('#disconnect').click();
  await friendClosed;
  console.log('PASS: mocked friend sign-in, speech, todo, disconnect');

  await electron.evaluate(({ BrowserWindow }) => {
    const original = Date.now;
    Date.now = () => original() + 70000;
    BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('pet.html')).emit('focus');
  });
  const update = await windowFor('update.html');
  await update.getByText('새 버전 0.1.34이 있어요').waitFor();
  const positions = await electron.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    const top = windows.find(win => win.webContents.getURL().includes('top.html')).getBounds();
    const notice = windows.find(win => win.webContents.getURL().includes('update.html')).getBounds();
    return { top, notice };
  });
  assert(positions.notice.x >= positions.top.x + positions.top.width);
  assert(Math.abs(positions.notice.y + positions.notice.height - positions.top.y - positions.top.height) < 10);
  await update.locator('#later').click();
  console.log('PASS: update notice next to home controls');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (electron) await electron.close().catch(() => {});
});
