const { test } = require('node:test');
const { strictEqual } = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { downloadVerified } = require('./update-download');

test('a same-size corrupt update is downloaded again before installation', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'deskbuddy-update-'));
  const file = path.join(folder, 'download.zip');
  const good = Buffer.from('valid ZIP bytes'), bad = Buffer.from('bad ZIP bytes!!');
  let calls = 0;
  try {
    await downloadVerified({ browser_download_url: 'https://example.test/update.zip', size: good.length,
      digest: `sha256:${createHash('sha256').update(good).digest('hex')}` }, file,
    async () => new Response(++calls === 1 ? bad : good));
    strictEqual(calls, 2);
    strictEqual(fs.readFileSync(file).toString(), good.toString());
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmdirSync(folder);
  }
});
