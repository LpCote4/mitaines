const SESSION_KEY = 'mitaines_session';

export function getToken() {
  return localStorage.getItem(SESSION_KEY);
}

export function clearToken() {
  localStorage.removeItem(SESSION_KEY);
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function req(method, path, body) {
  const res = await fetch(path, {
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
  const pinHash = await sha256hex(pin);
  const res = await fetch('/api/v1/auth/verify', {
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
