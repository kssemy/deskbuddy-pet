const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, safeStorage, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { step } = require('./motion');
const { workState } = require('./worktime');
const { charactersMeet } = require('./meeting');
const { workMinutesForDay, tasksForDay } = require('./history');
const { envelope, fitToDisplays } = require('./desktop');

let petWindow;
let panelWindow;
let topWindow;
let panelMode;
let data;
let position;
let ownDragStart;
let workAreas = [];
const FRIEND_VISUAL = { left: 35, right: 155, top: 261, bottom: 395 };
let velocity = { x: 0.55, y: 0.3 };
let paused = false;
let dragging = false;
let movement;
let speechTimer;
let activeSession;
let workTimer;
let loggedPositionError = false;
let moveErrorUntil = 0;
let remoteSession;
let remoteError = '';
let remoteTimer;
let remoteSyncQueue = Promise.resolve();
let reaction = null;
const seenReactions = new Map();
const remoteWindows = new Map();
const meeting = new Set();
const lastHighfive = new Map();
const RELEASE_URL = 'https://github.com/kssemy/deskbuddy-pet/releases/latest';
const REMOTE_URL = 'https://tgyfscvjnkaiykyfyzcc.supabase.co/rest/v1';
const REMOTE_KEY = 'sb_publishable_4bdFjW6A7ahg9AaaV8AetQ_KEFbNYvw';
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function dataPath() { return path.join(app.getPath('userData'), 'prototype.json'); }
function sessionPath() { return path.join(app.getPath('userData'), 'pet-account-session.bin'); }
function imagePath() { return path.join(app.getPath('userData'), 'character.png'); }
function posePath(name) { return path.join(app.getPath('userData'), 'poses', name); }
function imageUrl(file) { return `${pathToFileURL(file).href}?v=${fs.statSync(file).mtimeMs}`; }
function isPng(file) {
  const header = Buffer.alloc(8);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, header, 0, 8, 0); } finally { fs.closeSync(fd); }
  return header.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}
function loadData() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(dataPath(), 'utf8')); } catch {}
  const tasks = [...(saved.tasks || []).map(task => ({ ...task, day: task.day || today() })),
    ...(saved.fixedTasks || []).map(task => ({ ...task, day: task.day || today(), pinned: true }))]
    .map(task => ({ ...task, completedAt: task.done ? (task.completedAt || task.day) : '' }));
  return { size: 130, bubbleOpacity: 100, tasks: [], taskHistory: [], memos: [], shareTodos: false, completedTodos: 'bottom', speech: '', workStart: '09:00', workEnd: '18:00',
    lunchStart: '12:00', lunchEnd: '13:00', sessions: [], todoHeight: null, followMouse: false,
    alwaysOnTop: true, autoLaunch: false, poseFiles: [],
    ...saved, fixedTasks: [], tasks };
}
function saveData() {
  fs.writeFileSync(dataPath(), JSON.stringify(data, null, 2));
  broadcast();
}
function publicData() {
  return { ...data, image: fs.existsSync(imagePath()) ? imageUrl(imagePath()) : null,
    workStatus: workState(new Date(), data),
    remote: { connected: !!remoteSession, name: remoteSession?.name || '', error: remoteError },
    poses: (data.poseFiles || []).filter(name => /^pose-[\w-]+\.png$/.test(name) && fs.existsSync(posePath(name)))
      .map(name => ({ name, url: imageUrl(posePath(name)) })) };
}
function broadcast() {
  for (const win of [petWindow, panelWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('data-changed', publicData());
  }
}
function petBounds() {
  return envelope(workAreas, ownVisual());
}
function ownVisual() {
  const left = (240 - data.size) / 2;
  return { left, right: left + data.size, top: 217 - data.size, bottom: 240 };
}
function refreshWorkAreas() { workAreas = screen.getAllDisplays().map(display => display.workArea); }
function placeWindow(window, x, y) {
  x = Math.round(x); y = Math.round(y);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) ||
      x < -2147483648 || x > 2147483647 || y < -2147483648 || y > 2147483647) return false;
  try { window.setPosition(x, y); return true; }
  catch (error) {
    if (!loggedPositionError) {
      loggedPositionError = true;
      try { fs.writeFileSync(path.join(app.getPath('userData'), 'position-error.json'), JSON.stringify({ x, y, bounds: window.getBounds(), message: error.message })); }
      catch {}
    }
    return false;
  }
}
function movePet() {
  if (paused || dragging || panelWindow || Date.now() < moveErrorUntil || !petWindow || petWindow.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const window = petWindow.getBounds();
  if (!data.followMouse && cursor.x >= window.x - 12 && cursor.x <= window.x + window.width + 12 &&
      cursor.y >= window.y - 12 && cursor.y <= window.y + window.height + 12) return;
  const b = petBounds();
  if (data.followMouse) {
    position.x = Math.max(b.minX, Math.min(b.maxX, position.x + Math.max(-1, Math.min(1, cursor.x - 120 - position.x))));
    position.y = Math.max(b.minY, Math.min(b.maxY, position.y + Math.max(-1, Math.min(1, cursor.y - 125 - position.y))));
  } else {
    [position.x, velocity.x] = step(position.x, velocity.x, b.minX, b.maxX);
    [position.y, velocity.y] = step(position.y, velocity.y, b.minY, b.maxY);
  }
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    position = { x: window.x, y: window.y };
    return;
  }
  const fitted = fitToDisplays(position.x, position.y, workAreas, ownVisual());
  if (!placeWindow(petWindow, fitted.x, fitted.y)) {
    position = { x: window.x, y: window.y };
    velocity = { x: -velocity.x, y: -velocity.y };
    moveErrorUntil = Date.now() + 1000;
  }
}
function moveRemotePets() {
  const b = envelope(workAreas, FRIEND_VISUAL);
  for (const item of remoteWindows.values()) {
    if (item.window.isDestroyed() || item.pinned || item.dragging || item.hovered) continue;
    [item.x, item.vx] = step(item.x, item.vx, b.minX, b.maxX);
    [item.y, item.vy] = step(item.y, item.vy, b.minY, b.maxY);
    const fitted = fitToDisplays(item.x, item.y, workAreas, FRIEND_VISUAL);
    if (!placeWindow(item.window, fitted.x, fitted.y)) { item.x = item.window.getBounds().x; item.y = item.window.getBounds().y; item.vx = 0; item.vy = 0; }
  }
}
function checkMeetings() {
  if (!remoteSession || !petWindow || petWindow.isDestroyed()) return;
  const own = petWindow.getBounds();
  for (const [id, item] of remoteWindows) {
    if (item.window.isDestroyed() || item.window.webContents.isLoading()) continue;
    const close = charactersMeet(own, item.window.getBounds(), data.size);
    if (!close) { meeting.delete(id); continue; }
    if (meeting.has(id)) continue;
    meeting.add(id);
    if (Date.now() - (lastHighfive.get(id) || 0) < 15000) continue;
    lastHighfive.set(id, Date.now());
    reaction = { type: 'highfive', id: randomUUID(), to: id, createdAt: Date.now() };
    petWindow.webContents.send('pet-reaction', 'highfive');
    item.window.webContents.send('remote-reaction', 'highfive');
    void syncRemote();
  }
}
async function remoteApi(route, options = {}) {
  const response = await fetch(REMOTE_URL + route, { ...options, headers: {
    apikey: REMOTE_KEY, Authorization: 'Bearer ' + REMOTE_KEY,
    'Content-Type': 'application/json', 'x-pet-session': remoteSession?.token || '',
    ...options.headers
  } });
  if (!response.ok) throw new Error(response.status === 404 ? 'Supabase에 캐릭터 테이블을 먼저 설치해 주세요.' : `Supabase 오류 (${response.status})`);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}
function loadRemoteSession() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    remoteSession = JSON.parse(safeStorage.decryptString(fs.readFileSync(sessionPath())));
  } catch { remoteSession = null; }
}
function saveRemoteSession() {
  if (remoteSession && safeStorage.isEncryptionAvailable())
    fs.writeFileSync(sessionPath(), safeStorage.encryptString(JSON.stringify(remoteSession)));
  else fs.rmSync(sessionPath(), { force: true });
}
function avatarData() {
  if (!fs.existsSync(imagePath())) return null;
  const image = nativeImage.createFromPath(imagePath());
  if (image.isEmpty()) return null;
  const value = image.resize({ width: 128, quality: 'good' }).toDataURL();
  return value.length <= 200000 ? value : null;
}
function showRemotePets(rows) {
  const active = new Set();
  const area = screen.getPrimaryDisplay().workArea;
  for (const row of rows) {
    if (row.member_id === remoteSession?.id || Date.now() - Date.parse(row.updated_at) > 40000) continue;
    active.add(row.member_id);
    let item = remoteWindows.get(row.member_id);
    if (!item) {
      const x = area.x + Math.round(Math.random() * Math.max(0, area.width - 190));
      const y = area.y + Math.round(Math.random() * Math.max(0, area.height - 400));
      const window = makeWindow('other.html', { width: 190, height: 400, x, y, frame: false,
        transparent: true, alwaysOnTop: data.alwaysOnTop, skipTaskbar: true, resizable: false, hasShadow: false });
      item = { window, x, y, vx: 0.45, vy: 0.3, hovered: false, dragging: false, pinned: false };
      remoteWindows.set(row.member_id, item);
      window.setIgnoreMouseEvents(true, { forward: true });
      window.webContents.on('context-menu', () => Menu.buildFromTemplate([
        { label: item.pinned ? '자동 이동 다시 켜기' : '여기에 고정', click: () => { item.pinned = !item.pinned; } }
      ]).popup({ window }));
      window.webContents.once('did-finish-load', () => { window.webContents.send('remote-update', row); showReaction(row, window); });
    } else { item.window.webContents.send('remote-update', row); showReaction(row, item.window); }
  }
  for (const [id, item] of remoteWindows) if (!active.has(id)) { item.window.close(); remoteWindows.delete(id); meeting.delete(id); }
}
function showReaction(row, window) {
  const events = Array.isArray(row.public_tasks) ? row.public_tasks.filter(task => task && task.type && Date.now() - Number(task.createdAt) < 30000) : [];
  for (const event of events) {
    if (seenReactions.get(row.member_id) === event.id) continue;
    seenReactions.set(row.member_id, event.id);
    if (event.type === 'glow') window.webContents.send('remote-reaction', 'glow');
    if (event.type === 'poke' && event.to === remoteSession?.id) petWindow?.webContents.send('pet-reaction', 'shake');
    if (event.type === 'highfive' && event.to === remoteSession?.id) {
      lastHighfive.set(row.member_id, Date.now());
      window.webContents.send('remote-reaction', 'highfive');
      petWindow?.webContents.send('pet-reaction', 'highfive');
    }
  }
}
function syncRemote() {
  remoteSyncQueue = remoteSyncQueue.then(sendRemote, sendRemote);
  return remoteSyncQueue;
}
async function sendRemote() {
  if (!remoteSession) return;
  try {
    const state = workState(new Date(), data);
    await remoteApi('/pet_presence?on_conflict=member_id', { method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ member_id: remoteSession.id, name: remoteSession.name, avatar: avatarData(), speech: data.speech || '',
        status: state,
        public_tasks: [...(data.shareTodos ? (data.tasks || []).filter(task => task.pinned || !task.done || task.completedAt === today()) : [])
          .map(task => ({ text: task.text, done: task.done })), ...(reaction && Date.now() - reaction.createdAt < 30000 ? [reaction] : [])], updated_at: new Date().toISOString() }) });
    const rows = await remoteApi('/pet_presence?select=*');
    showRemotePets(rows || []);
    if (remoteError) { remoteError = ''; broadcast(); }
  } catch (error) { remoteError = error.message; broadcast(); }
}
function makeWindow(file, options, query) {
  const win = new BrowserWindow({
    show: false, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    ...options
  });
  win.loadFile(path.join(__dirname, file), query ? { query } : undefined);
  win.webContents.once('did-finish-load', () => win.show());
  return win;
}
function togglePanel(mode = 'tasks') {
  const file = mode === 'history' ? 'history.html' : 'panel.html';
  if (panelWindow && !panelWindow.isDestroyed()) {
    if (panelMode === mode) panelWindow.close();
    else {
      panelMode = mode;
      const bounds = panelBounds(mode);
      const { placement, ...windowBounds } = bounds;
      panelWindow.setBounds(windowBounds);
      panelWindow.loadFile(path.join(__dirname, file), { query: { mode, placement: bounds.placement } });
    }
    return;
  }
  const bounds = panelBounds(mode);
  const { placement, ...windowBounds } = bounds;
  panelMode = mode;
  panelWindow = makeWindow(file, { ...windowBounds,
    frame: false, transparent: true, alwaysOnTop: data.alwaysOnTop, skipTaskbar: true, resizable: false,
    hasShadow: false, title: '캐릭터 말풍선' }, { placement, mode });
  panelWindow.on('closed', () => { panelWindow = null; panelMode = null; });
}
function panelBounds(mode) {
  const { x, y } = petWindow.getBounds();
  const area = screen.getDisplayNearestPoint({ x: x + 120, y: y + 217 - data.size / 2 }).workArea;
  const width = mode === 'history' ? Math.min(620, area.width - 16) : mode === 'settings' ? 280 : 240;
  const height = Math.min(mode === 'tasks' ? (data.todoHeight || 300) : mode === 'history' ? 650 : mode === 'settings' ? 590 : 66, area.height - 16);
  const figureTop = y + 217 - data.size;
  const placement = figureTop - height >= area.y ? 'above' : 'below';
  return { width, height, placement,
    x: Math.round(Math.max(area.x, Math.min(x + 120 - width / 2, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(placement === 'above' ? figureTop - height + 12 : y + 217, area.y + area.height - height))) };
}
function resizeTaskPanel(height) {
  if (!panelWindow || panelWindow.isDestroyed() || panelMode !== 'tasks') return;
  const requested = Math.max(200, Math.round(Number(height)));
  if (!Number.isFinite(requested)) return;
  const bounds = panelWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const bottom = bounds.y + bounds.height;
  const nextHeight = Math.min(requested, area.height - 16, bottom - area.y);
  if (nextHeight !== bounds.height) panelWindow.setBounds({ ...bounds, y: bottom - nextHeight, height: nextHeight });
}

app.whenReady().then(() => {
  refreshWorkAreas();
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, refreshWorkAreas);
  data = loadData();
  loadRemoteSession();
  data.sessions = (data.sessions || []).map(session => session.endedAt ? session : { ...session, endedAt: session.lastSeenAt });
  activeSession = { startedAt: Date.now(), lastSeenAt: Date.now() };
  data.sessions.push(activeSession);
  saveData();
  workTimer = setInterval(() => { activeSession.lastSeenAt = Date.now(); saveData(); }, 10000);
  if (data.speechExpiresAt && data.speechExpiresAt <= Date.now()) { data.speech = ''; data.speechExpiresAt = 0; saveData(); }
  else if (data.speechExpiresAt) scheduleSpeechClear();
  const area = screen.getPrimaryDisplay().workArea;
  position = { x: area.x + area.width - 290, y: area.y + area.height - 310 };
  petWindow = makeWindow('pet.html', { width: 240, height: 250, x: position.x, y: position.y,
    frame: false, transparent: true, alwaysOnTop: data.alwaysOnTop, skipTaskbar: true, resizable: false, hasShadow: false });
  petWindow.webContents.on('context-menu', () => {
    Menu.buildFromTemplate([
      { label: '체크리스트 열기', click: () => togglePanel('tasks') },
      { label: '설정', click: () => togglePanel('settings') },
      { label: '종료', click: () => app.quit() }
    ]).popup({ window: petWindow });
  });
  topWindow = makeWindow('top.html', { width: 28, height: 28, x: area.x + area.width - 34, y: area.y + 6,
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, hasShadow: false });
  movement = setInterval(() => { movePet(); moveRemotePets(); checkMeetings(); }, 30);
  remoteTimer = setInterval(syncRemote, 10000);
  if (remoteSession) syncRemote();
});

ipcMain.handle('load', () => publicData());
ipcMain.handle('history-month', (_event, year, month) => {
  year = Number(year); month = Number(month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return null;
  if (activeSession) activeSession.lastSeenAt = Date.now();
  const count = new Date(year, month, 0).getDate();
  const days = Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month - 1, index + 1);
    const key = `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
    return { day: index + 1, key, minutes: workMinutesForDay(date, data.sessions, data),
      tasks: tasksForDay(key, data.tasks, data.taskHistory || [], today()) };
  });
  return { year, month, days, total: days.reduce((sum, day) => sum + day.minutes, 0) };
});
ipcMain.handle('check-update', async () => {
  try {
    const response = await fetch('https://api.github.com/repos/kssemy/deskbuddy-pet/releases/latest', {
      headers: { 'User-Agent': 'DeskBuddy' }, signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('GitHub 응답 오류');
    const release = await response.json();
    const latest = String(release.tag_name || '').replace(/^v/, '');
    const current = app.getVersion();
    if (!/^\d+\.\d+\.\d+$/.test(latest)) throw new Error('버전 정보를 읽을 수 없어요.');
    return { current, latest, update: latest.localeCompare(current, undefined, { numeric: true }) > 0 };
  } catch { throw new Error('최신 버전을 확인할 수 없어요. 인터넷 연결을 확인해 주세요.'); }
});
ipcMain.on('open-release', () => { void shell.openExternal(RELEASE_URL); });
ipcMain.handle('choose-image', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'PNG 이미지', extensions: ['png'] }] });
  if (result.canceled) return publicData();
  const file = result.filePaths[0];
  if (!isPng(file)) throw new Error('PNG 파일을 선택해 주세요.');
  fs.copyFileSync(file, imagePath());
  broadcast();
  return publicData();
});
ipcMain.handle('add-poses', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'PNG 이미지', extensions: ['png'] }] });
  if (result.canceled) return publicData();
  if ((data.poseFiles || []).length + result.filePaths.length > 12) throw new Error('동작 PNG는 최대 12개까지 올릴 수 있어요.');
  for (const file of result.filePaths) if (!isPng(file)) throw new Error('PNG 파일만 올려주세요.');
  fs.mkdirSync(path.dirname(posePath('x')), { recursive: true });
  for (const file of result.filePaths) {
    const name = `pose-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    fs.copyFileSync(file, posePath(name));
    data.poseFiles.push(name);
  }
  saveData();
  return publicData();
});
ipcMain.handle('remove-pose', (_event, name) => {
  if (!data.poseFiles.includes(name)) return publicData();
  data.poseFiles = data.poseFiles.filter(item => item !== name);
  fs.rmSync(posePath(name), { force: true });
  saveData();
  return publicData();
});
ipcMain.handle('set-size', (_event, value) => {
  data.size = Math.max(80, Math.min(170, Number(value) || 130));
  saveData();
  return publicData();
});
ipcMain.handle('set-opacity', (_event, value) => {
  data.bubbleOpacity = Math.max(30, Math.min(100, Number(value) || 100));
  saveData();
  return publicData();
});
ipcMain.handle('set-tasks', (_event, tasks) => {
  if (!Array.isArray(tasks)) return publicData();
  const incoming = new Set(tasks.map(task => String(task.id)));
  data.taskHistory = [...(data.taskHistory || []), ...data.tasks.filter(task => task.done && !incoming.has(task.id)).map(task => ({ ...task, removedAt: today() }))];
  data.tasks = tasks.slice(0, 200).map(task => ({
    id: String(task.id).slice(0, 80),
    text: String(task.text).slice(0, 200),
    done: !!task.done,
    pinned: !!task.pinned,
    day: /^\d{4}-\d{2}-\d{2}$/.test(task.day) ? task.day : today(),
    completedAt: task.done ? (/^\d{4}-\d{2}-\d{2}$/.test(task.completedAt) ? task.completedAt : today()) : ''
  }));
  saveData();
  void syncRemote();
  return publicData();
});
ipcMain.handle('set-share-todos', (_event, value) => {
  data.shareTodos = !!value;
  saveData();
  void syncRemote();
  return publicData();
});
ipcMain.handle('set-memos', (_event, memos) => {
  if (!Array.isArray(memos)) return publicData();
  data.memos = memos.slice(0, 30).map(memo => ({ id: String(memo.id).slice(0, 80), text: String(memo.text).slice(0, 200) }));
  saveData();
  return publicData();
});
ipcMain.handle('set-settings', (_event, settings) => {
  data.size = Math.max(80, Math.min(170, Number(settings.size) || 130));
  for (const key of ['workStart', 'workEnd', 'lunchStart', 'lunchEnd'])
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(settings[key])) data[key] = settings[key];
  data.followMouse = !!settings.followMouse;
  data.alwaysOnTop = !!settings.alwaysOnTop;
  data.autoLaunch = !!settings.autoLaunch;
  data.completedTodos = settings.completedTodos === 'hide' ? 'hide' : 'bottom';
  petWindow.setAlwaysOnTop(data.alwaysOnTop);
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.setAlwaysOnTop(data.alwaysOnTop);
  for (const item of remoteWindows.values()) item.window.setAlwaysOnTop(data.alwaysOnTop);
  const loginOptions = app.isPackaged ? { openAtLogin: data.autoLaunch } :
    { openAtLogin: data.autoLaunch, path: process.execPath, args: [app.getAppPath()] };
  app.setLoginItemSettings(loginOptions);
  saveData();
  return publicData();
});
function scheduleSpeechClear() {
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => { data.speech = ''; data.speechExpiresAt = 0; saveData(); }, Math.max(0, data.speechExpiresAt - Date.now()));
}
ipcMain.handle('set-speech', (_event, text, temporary = false) => {
  data.speech = String(text || '').trim().slice(0, 80);
  data.speechExpiresAt = data.speech && temporary ? Date.now() + 10000 : 0;
  clearTimeout(speechTimer);
  if (data.speechExpiresAt) scheduleSpeechClear();
  saveData();
  return publicData();
});
ipcMain.on('toggle-panel', () => togglePanel('tasks'));
ipcMain.on('open-history', () => togglePanel('history'));
ipcMain.on('toggle-chat', () => togglePanel('chat'));
ipcMain.on('refresh-top', () => {
  data.alwaysOnTop = true;
  for (const window of [petWindow, panelWindow, ...[...remoteWindows.values()].map(item => item.window), topWindow]) {
    if (!window || window.isDestroyed()) continue;
    window.setAlwaysOnTop(false);
    window.setAlwaysOnTop(true, 'screen-saver');
    window.moveTop();
  }
  saveData();
});
ipcMain.on('glow-pet', () => {
  reaction = { type: 'glow', id: randomUUID(), createdAt: Date.now() };
  petWindow?.webContents.send('pet-reaction', 'glow');
  void syncRemote();
});
ipcMain.on('poke-friend', event => {
  for (const [id, item] of remoteWindows) if (item.window.webContents === event.sender) {
    reaction = { type: 'poke', id: randomUUID(), to: id, createdAt: Date.now() };
    item.window.webContents.send('remote-reaction', 'shake');
    void syncRemote();
    break;
  }
});
ipcMain.on('resize-panel', (event, height) => {
  if (event.sender === panelWindow?.webContents) resizeTaskPanel(height);
});
ipcMain.handle('set-todo-height', (_event, height) => {
  data.todoHeight = height == null ? null : Math.max(200, Math.min(700, Math.round(Number(height) || 300)));
  saveData();
  if (panelMode === 'tasks') resizeTaskPanel(data.todoHeight || 300);
  return publicData();
});
ipcMain.handle('connect-pet', async (_event, name, pin, register = false) => {
  name = String(name || '').trim();
  pin = String(pin || '');
  if (!name || name.length > 12 || !/^\d{6}$/.test(pin)) throw new Error('닉네임과 숫자 PIN 6자리를 입력해 주세요.');
  const response = await fetch(REMOTE_URL + (register ? '/rpc/pet_register' : '/rpc/pet_login'), { method: 'POST', headers: {
    apikey: REMOTE_KEY, Authorization: 'Bearer ' + REMOTE_KEY, 'Content-Type': 'application/json'
  }, body: JSON.stringify({ p_name: name, p_pin: pin }) });
  if (!response.ok) throw new Error('캐릭터 계정 연결에 실패했습니다.');
  const result = await response.json();
  if (result.error) throw new Error(result.error);
  remoteSession = { id: result.member_id, name: result.name, token: result.session_token };
  saveRemoteSession();
  remoteError = '';
  broadcast();
  await syncRemote();
  return publicData();
});
ipcMain.handle('disconnect-pet', async () => {
  await remoteSyncQueue;
  if (remoteSession) await remoteApi('/pet_presence?member_id=eq.' + encodeURIComponent(remoteSession.id), { method: 'DELETE' }).catch(() => {});
  remoteSession = null;
  saveRemoteSession();
  for (const item of remoteWindows.values()) item.window.close();
  remoteWindows.clear();
  remoteError = '';
  broadcast();
  return publicData();
});
ipcMain.on('hover-pet', (_event, value) => { paused = !!value; });
function remoteItemFor(sender) {
  for (const item of remoteWindows.values()) if (item.window.webContents === sender) return item;
}
ipcMain.on('remote-interactive', (event, value) => {
  const item = remoteItemFor(event.sender);
  if (!item || item.hovered === !!value) return;
  item.hovered = !!value;
  if (!item.dragging) item.window.setIgnoreMouseEvents(!item.hovered, { forward: true });
});
ipcMain.on('remote-drag-state', (event, value) => {
  const item = remoteItemFor(event.sender);
  if (!item) return;
  item.dragging = !!value;
  if (item.dragging) { item.dragStart = item.window.getBounds(); item.window.setIgnoreMouseEvents(false); }
  else { item.dragStart = null; item.window.setIgnoreMouseEvents(!item.hovered, { forward: true }); }
});
ipcMain.on('remote-drag', (event, dx, dy) => {
  const item = remoteItemFor(event.sender);
  if (!item || !item.dragging || !item.dragStart || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const b = envelope(workAreas, FRIEND_VISUAL);
  const x = Math.max(b.minX, Math.min(b.maxX, item.dragStart.x + dx));
  const y = Math.max(b.minY, Math.min(b.maxY, item.dragStart.y + dy));
  const fitted = fitToDisplays(x, y, workAreas, FRIEND_VISUAL);
  if (placeWindow(item.window, fitted.x, fitted.y)) { item.x = fitted.x; item.y = fitted.y; item.pinned = true; }
});
ipcMain.on('drag-pet-start', event => { if (event.sender === petWindow?.webContents) ownDragStart = petWindow.getBounds(); });
ipcMain.on('drag-pet-end', event => { if (event.sender === petWindow?.webContents) ownDragStart = null; });
ipcMain.on('drag-pet', (event, dx, dy) => {
  if (event.sender !== petWindow?.webContents || !ownDragStart) return;
  if (!petWindow || petWindow.isDestroyed()) return;
  if (!Number.isFinite(Number(dx)) || !Number.isFinite(Number(dy))) return;
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.close();
  dragging = true;
  const [x, y] = petWindow.getPosition();
  const b = petBounds();
  const candidate = { x: Math.max(b.minX, Math.min(b.maxX, ownDragStart.x + Number(dx))),
    y: Math.max(b.minY, Math.min(b.maxY, ownDragStart.y + Number(dy))) };
  position = fitToDisplays(candidate.x, candidate.y, workAreas, ownVisual());
  if (!placeWindow(petWindow, position.x, position.y)) position = { x, y };
  dragging = false;
});
let finishingQuit = false;
app.on('before-quit', event => {
  if (remoteSession && !finishingQuit) {
    event.preventDefault();
    finishingQuit = true;
    Promise.race([
      remoteApi('/pet_presence?member_id=eq.' + encodeURIComponent(remoteSession.id), { method: 'DELETE' }).catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 1200))
    ]).finally(() => { remoteSession = null; app.quit(); });
    return;
  }
  clearInterval(movement);
  clearInterval(workTimer);
  clearInterval(remoteTimer);
  if (activeSession) { activeSession.endedAt = Date.now(); activeSession.lastSeenAt = activeSession.endedAt; saveData(); activeSession = null; }
});
app.on('window-all-closed', () => app.quit());
