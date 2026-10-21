const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');

async function downloadVerified(asset, file, get = fetch) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await get(asset.browser_download_url, { headers: { 'Cache-Control': 'no-cache' } });
      if (!response.ok || !response.body) throw new Error('다운로드에 실패했어요.');
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(file));
      if (fs.statSync(file).size !== asset.size) throw new Error('다운로드가 끝까지 완료되지 않았어요.');
      if (asset.digest?.startsWith('sha256:')) {
        const hash = createHash('sha256');
        for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
        if (`sha256:${hash.digest('hex')}` !== asset.digest) throw new Error('다운로드 파일을 확인할 수 없어요.');
      }
      return;
    } catch (error) {
      lastError = error;
      fs.rmSync(file, { force: true });
    }
  }
  throw lastError;
}

module.exports = { downloadVerified };
