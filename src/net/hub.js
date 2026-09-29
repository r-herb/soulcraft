// The live connection to the chat hub: new messages and moderation events
// arrive here while the player is signed in (the API pushes them).
import { account, onAccount } from '../save/account.js';

const listeners = new Set();
let ws = null, retry = 1000, pingT = 0, wanted = false;

export function onHub(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function connect() {
  if (!wanted || ws) return;
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/hub';
  try { ws = new WebSocket(url); } catch { schedule(); return; }
  ws.onopen = () => { retry = 1000; clearInterval(pingT); pingT = setInterval(() => { try { ws && ws.readyState === 1 && ws.send('ping'); } catch { /* closed */ } }, 30000); };
  ws.onmessage = (e) => {
    if (e.data === 'pong') return;
    let ev;
    try { ev = JSON.parse(e.data); } catch { return; }
    listeners.forEach((fn) => { try { fn(ev); } catch (err) { console.warn(err); } });
  };
  ws.onclose = () => { ws = null; clearInterval(pingT); schedule(); };
  ws.onerror = () => { /* onclose follows */ };
}
function schedule() { if (!wanted) return; setTimeout(connect, retry); retry = Math.min(30000, retry * 2); }

export function startHub() {
  const sync = () => {
    wanted = !!(account.user && account.mp);
    if (wanted) connect();
    else if (ws) { try { ws.close(); } catch { /* ignore */ } ws = null; }
  };
  onAccount(sync);
  sync();
}
