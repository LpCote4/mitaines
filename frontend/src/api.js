const SESSION_KEY = 'mitaines_session';
const API_BASE = '';

export function getToken() {
  return localStorage.getItem(SESSION_KEY);
}

export function clearToken() {
  localStorage.removeItem(SESSION_KEY);
}

function sha256hex(str) {
  // Pure-JS SHA-256 — works over plain HTTP (crypto.subtle requires HTTPS)
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const H = [
    0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19,
  ];
  const bytes = new TextEncoder().encode(str);
  const len = bytes.length;
  const bitLen = len * 8;
  const padded = new Uint8Array(Math.ceil((len + 9) / 64) * 64);
  padded.set(bytes);
  padded[len] = 0x80;
  new DataView(padded.buffer).setUint32(padded.length - 4, bitLen, false);

  const w = new Int32Array(64);
  for (let i = 0; i < padded.length; i += 64) {
    const dv = new DataView(padded.buffer, i, 64);
    for (let j = 0; j < 16; j++) w[j] = dv.getInt32(j * 4, false);
    for (let j = 16; j < 64; j++) {
      const s0 = (w[j-15] >>> 7 | w[j-15] << 25) ^ (w[j-15] >>> 18 | w[j-15] << 14) ^ (w[j-15] >>> 3);
      const s1 = (w[j-2] >>> 17 | w[j-2] << 15) ^ (w[j-2] >>> 19 | w[j-2] << 13) ^ (w[j-2] >>> 10);
      w[j] = (w[j-16] + s0 + w[j-7] + s1) | 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let j = 0; j < 64; j++) {
      const S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[j] + w[j]) | 0;
      const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h=g; g=f; f=e; e=(d+temp1)|0; d=c; c=b; b=a; a=(temp1+temp2)|0;
    }
    H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
    H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
  }
  return H.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function req(method, path, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    return null;
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json().catch(() => null);
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function verifyPin(pin) {
  const pinHash = sha256hex(pin);
  const res = await fetch(API_BASE + '/api/v1/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin_hash: pinHash }),
  });
  if (res.ok) {
    localStorage.setItem(SESSION_KEY, pinHash);
    return true;
  }
  return false;
}

// ── Checkins ──────────────────────────────────────────────────────────────────

export function postCheckin(biting, context, type = 'manual') {
  return req('POST', '/api/v1/checkins', { biting, context, type });
}

export function getCheckins(date) {
  const qs = date ? `?date_filter=${date}` : '';
  return req('GET', `/api/v1/checkins${qs}`);
}

// ── Evenings ──────────────────────────────────────────────────────────────────

export function postEvening(intensity, context, note) {
  return req('POST', '/api/v1/evenings', { intensity, context, note });
}

export function getEvening(date) {
  return req('GET', `/api/v1/evenings/${date}`);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function getSummary() {
  return req('GET', '/api/v1/stats/summary');
}

export function getDailyStats() {
  return req('GET', '/api/v1/stats/daily');
}

export function getHeatmap() {
  return req('GET', '/api/v1/stats/heatmap');
}

export function getHourlyStats() {
  return req('GET', '/api/v1/stats/hourly');
}

export function getContextStats() {
  return req('GET', '/api/v1/stats/context');
}

export function getDayDetail(date) {
  return req('GET', `/api/v1/days/${date}`);
}

// ── Insights ──────────────────────────────────────────────────────────────────

export function getInsights() {
  return req('GET', '/api/v1/insights');
}

// ── Milestones ────────────────────────────────────────────────────────────────

export function getMilestones() {
  return req('GET', '/api/v1/milestones');
}

export function acknowledgeMilestone(key) {
  return req('POST', `/api/v1/milestones/${key}/acknowledge`);
}

// ── Push ──────────────────────────────────────────────────────────────────────

export async function getVapidPublicKey() {
  const data = await req('GET', '/api/v1/push/vapid-public-key');
  return data?.publicKey;
}

export function subscribePush(subscription) {
  return req('POST', '/api/v1/push/subscribe', {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
      auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')))),
    },
  });
}

export function unsubscribePush(endpoint) {
  return req('DELETE', '/api/v1/push/unsubscribe', { endpoint });
}

export async function registerPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  const reg = await navigator.serviceWorker.ready;
  const publicKey = await getVapidPublicKey();
  if (!publicKey) return false;

  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await subscribePush(existing);
    return true;
  }

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await subscribePush(subscription);
  return true;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
