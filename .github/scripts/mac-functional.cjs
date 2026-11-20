const assert = require('node:assert/strict');
const path = require('node:path');
const { _electron } = require('playwright-core');

const bundle = path.resolve('DeskBuddy.app');
const executablePath = process.platform === 'win32' ? path.resolve('windows-app/DeskBuddy.exe') : path.join(bundle, 'Contents/MacOS/DeskBuddy');
const appPath = process.platform === 'win32' ? path.resolve('windows-app/resources/app') : path.join(bundle, 'Contents/Resources/app');
const png = path.resolve('default-character.png');
const jpg = path.resolve('.github/fixtures/character-test.jpg');
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
  await electron.evaluate(({ BrowserWindow, Menu }) => {
    const build = Menu.buildFromTemplate;
    try {
      Menu.buildFromTemplate = template => {
        template.find(item => item.label === '설정').click();
        return { popup() {} };
      };
      BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && !item.webContents.isDestroyed() && item.webContents.getURL().includes('pet.html'))
        .webContents.emit('context-menu');
    } finally { Menu.buildFromTemplate = build; }
  });
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
  const bounds = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('pet.html')).getBounds());
  await pet.evaluate(() => window.pet.hover(true));
  const beforeMove = await bounds();
  await pet.mouse.move(0, 0);
  await new Promise(resolve => setTimeout(resolve, 1500));
  const afterMove = await bounds();
  assert(beforeMove.x !== afterMove.x || beforeMove.y !== afterMove.y, 'Native character window must move even after a stale hover event');
  console.log('PASS: native automatic movement and stale hover recovery');

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
  assert.equal(await settings.getByRole('tab').count(), 4);
  for (const label of ['캐릭터', '근무시간', '친구', '앱 설정']) {
    await settings.getByRole('tab', { name: label, exact: true }).click();
    assert(await settings.evaluate(() => {
      const page = [...document.querySelectorAll('.settingsPage')].find(el => !el.hidden);
      return page.scrollWidth <= page.clientWidth + 1 && document.querySelector('#settingsTabs').scrollWidth <= document.querySelector('#settingsTabs').clientWidth + 1;
    }), `Compact ${label} tab must fit horizontally`);
  }
  await settings.getByRole('tab', { name: '캐릭터', exact: true }).click();
  await settings.screenshot({ path: 'settings-character.png' });
  await settings.getByRole('tab', { name: '앱 설정', exact: true }).click();
  assert.equal(await settings.locator('#autoLaunch').locator('..').isVisible(), process.platform === 'win32');
  await settings.getByRole('tab', { name: '근무시간', exact: true }).click();
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
  await wardrobe.waitForFunction(() => !!document.querySelector('#status').textContent.trim());
  const uploadStatus = await wardrobe.locator('#status').textContent();
  console.log('Character upload:', uploadStatus);
  assert.equal(uploadStatus, '옷장에 추가했어요.');
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
      if (address.includes('api.github.com/repos/kssemy/deskbuddy-pet/releases'))
        return new Response(JSON.stringify([]), { status: 200 });
      if (!address.includes('tgyfscvjnkaiykyfyzcc.supabase.co')) return original(url, options);
      if (address.includes('/pet_presence?on_conflict=')) {
        if (!options.signal) throw new Error('Presence request needs a timeout');
        return new Response('temporary upload failure', { status: 503 });
      }
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
  await login.getByRole('tab', { name: '친구', exact: true }).click();
  assert.equal(await login.locator('#loginName').getAttribute('placeholder'), '아이디');
  await login.screenshot({ path: 'settings-login.png' });
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
  console.log('PASS: friend sign-in with failed upload and clock skew, speech, todo, disconnect');

  console.log('PASS: released app functional checks');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (electron) await electron.close().catch(() => {});
});

