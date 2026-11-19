const fs = require('node:fs');
const source = fs.readFileSync('main.js', 'utf8');
const base = source.match(/const REMOTE_URL = '([^']+)'/)[1].replace('/rest/v1', '');
const key = source.match(/const REMOTE_KEY = '([^']+)'/)[1];
const version = String(process.env.RELEASE_TAG || '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release tag');
(async () => {
  const response = await fetch(base + '/realtime/v1/api/broadcast', {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ topic: 'deskbuddy-events', event: 'deskbuddy-event', payload: { type: 'release', version }, private: false }] })
  });
  if (!response.ok) throw new Error('Release notification failed: ' + response.status);
  console.log('Release notification sent:', version);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
