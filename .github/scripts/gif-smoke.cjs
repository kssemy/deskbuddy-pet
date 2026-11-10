const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright-core');

const fixture = path.join(os.tmpdir(), 'deskbuddy-gif-smoke.gif');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'deskbuddy-gif-smoke-'));
fs.writeFileSync(fixture, Buffer.from('R0lGODlhGAAYAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQIEgAAACwAAAAAGAAYAAAIKQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDPgwIACH5BAgSAAAALAAAAAAYABgAgQAA/wAAAAAAAAAAAAgpAAEIHEiwoMGDCBMqXMiwocOHECNKnEixosWLGDNq3Mixo8ePIEM+DAgAOw==', 'base64'));

async function run() {
  const app = await _electron.launch({ executablePath: require('electron'), args: ['.', `--user-data-dir=${userData}`] });
  try {
    const pet = app.windows().find(page => page.url().endsWith('/pet.html'));
    await pet.evaluate(() => window.pet.openWardrobe());
    const isWardrobe = page => new URL(page.url()).pathname.endsWith('/wardrobe.html');
    const wardrobe = app.windows().find(isWardrobe) ||
      await app.waitForEvent('window', { predicate: isWardrobe });
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, fixture);
    await wardrobe.locator('#upload').click();
    await pet.waitForFunction(() => document.querySelector('#figure').src.includes('.gif'));
    await pet.bringToFront();
    const colors = new Set();
    for (let i = 0; i < 8; i++) {
      const png = await pet.screenshot();
      const color = await app.evaluate(({ nativeImage }, base64) => {
        const image = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'));
        const pixels = image.toBitmap(), offset = (120 * image.getSize().width + 120) * 4;
        return [...pixels.subarray(offset, offset + 3)].join(',');
      }, png.toString('base64'));
      colors.add(color);
      await pet.waitForTimeout(100);
    }
    assert(colors.size >= 2, `GIF did not animate: ${[...colors]}`);
    assert((await pet.evaluate(() => window.pet.load())).image.includes('.gif'));
  } finally { await app.close(); }
  const restarted = await _electron.launch({ executablePath: require('electron'), args: ['.', `--user-data-dir=${userData}`] });
  try {
    const pet = restarted.windows().find(page => page.url().endsWith('/pet.html'));
    assert((await pet.evaluate(() => window.pet.load())).image.includes('.gif'));
  } finally { await restarted.close(); }
  console.log('PASS: GIF uploads, animates, and survives restart');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
