const topic = 'realtime:deskbuddy-releases';
function listenForReleases(base, key, onRelease, onReconnect = () => {}, channel = topic) {
  let socket, retry, heartbeat, stopped = false, attempts = 0, ref = 0, awaitingHeartbeat = false;
  function connect() {
    if (stopped) return;
    socket = new WebSocket(base.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(key) + '&vsn=1.0.0');
    const current = socket;
    const send = (event, payload, target = channel) => current.send(JSON.stringify({ topic: target, event, payload, ref: String(++ref) }));
    const joinTimeout = setTimeout(() => current.close(), 15000);
    current.onopen = () => send('phx_join', { config: { broadcast: { self: false }, presence: { enabled: false }, private: false } });
    current.onmessage = ({ data }) => {
      let message;
      try { message = JSON.parse(data); } catch { return; }
      if (message.topic === 'phoenix' && message.event === 'phx_reply') { awaitingHeartbeat = false; return; }
      if (message.topic !== channel) return;
      if (message.event === 'phx_reply') {
        if (message.payload?.status !== 'ok') { current.close(); return; }
        clearTimeout(joinTimeout);
        attempts = 0;
        clearInterval(heartbeat);
        heartbeat = setInterval(() => {
          if (awaitingHeartbeat) { current.close(); return; }
          awaitingHeartbeat = true;
          send('heartbeat', {}, 'phoenix');
        }, 25000);
        onReconnect();
      }
      if (message.event === 'broadcast' && message.payload?.event === 'release') {
        const version = message.payload.payload?.version;
        if (typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version)) onRelease(version);
      }
      if (message.event === 'phx_error' || message.event === 'phx_close') current.close();
    };
    current.onerror = () => current.close();
    current.onclose = () => {
      clearTimeout(joinTimeout);
      clearInterval(heartbeat);
      awaitingHeartbeat = false;
      if (!stopped) retry = setTimeout(connect, Math.min(60000, 1000 * 2 ** Math.min(attempts++, 6)));
    };
  }
  connect();
  return () => { stopped = true; clearTimeout(retry); clearInterval(heartbeat); socket?.close(); };
}
module.exports = { listenForReleases };
