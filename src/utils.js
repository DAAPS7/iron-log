// Utilitários partilhados pelas Pages Functions.
// Usa só a Web Crypto API nativa do runtime do Cloudflare — sem dependências
// npm, sem precisar de node_compat.

const SESSION_SECRET_FALLBACK = 'iron-log-dev-secret-change-me';

function getSecret(env) {
  return (env && env.SESSION_SECRET) || SESSION_SECRET_FALLBACK;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}
function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlToString(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64);
}

async function pbkdf2(password, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
}

async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, saltBytes);
  return { salt: toHex(saltBytes), hash: toHex(bits) };
}

async function verifyPassword(password, saltHex, hashHex) {
  try {
    const bits = await pbkdf2(password, fromHex(saltHex));
    const computed = toHex(bits);
    // Comparação em tempo constante simples (evita terminar a comparação assim que a primeira diferença aparece)
    if (computed.length !== hashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hashHex.charCodeAt(i);
    return diff === 0;
  } catch (e) {
    return false;
  }
}

async function hmacKey(env) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret(env)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function signToken(username, env) {
  const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias
  const payload = JSON.stringify({ u: username, exp: Date.now() + TOKEN_TTL_MS });
  const payloadB64 = bufferToBase64Url(new TextEncoder().encode(payload));
  const key = await hmacKey(env);
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${bufferToBase64Url(sigBuffer)}`;
}

async function verifyToken(token, env) {
  if (!token || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  const key = await hmacKey(env);
  const expectedSigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const expectedSig = bufferToBase64Url(expectedSigBuffer);
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(base64UrlToString(payloadB64));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload.u;
  } catch (e) {
    return null;
  }
}

function isValidUsername(uKey) {
  return /^[a-z0-9_.-]{3,32}$/.test(uKey);
}

function defaultData() {
  return {
    profile: null,
    weightHistory: [],
    workouts: [],
    loggedWorkouts: [],
    calorieEntries: [],
    calorieGoal: null,
    macroGoals: { protein: null, carbs: null, fat: null },
    exercisePRs: {},
    mealPlans: [],
  };
}
function defaultSettings() {
  return { theme: 'light', font: 'anton-work', accentStrength: null, accentCardio: null, radius: 14 };
}
function defaultSocial() {
  return {
    friends: [],
    friendRequestsIncoming: [], // [{username, displayName, sentAt}]
    friendRequestsOutgoing: [], // [username]
    notifications: [], // [{id, type, message, read, createdAt}]
    sharedWorkoutsInbox: [], // [{id, fromUsername, fromDisplayName, workout, receivedAt}]
  };
}

// Grava um registo de utilizador, incluindo o displayName como metadata do
// KV — isto permite pesquisar utilizadores por prefixo do username sem ter
// de ler o valor completo de cada entrada candidata.
async function putUserRecord(env, uKey, record) {
  await env.USERS_KV.put(uKey, JSON.stringify(record), {
    metadata: { displayName: record.displayName },
  });
}
async function getUserRecord(env, uKey) {
  const raw = await env.USERS_KV.get(uKey);
  return raw ? JSON.parse(raw) : null;
}

function exerciseNameFromKey(key) {
  const idx = key.indexOf('::');
  return idx >= 0 ? key.slice(idx + 2) : key;
}

function jsonResponse(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  isValidUsername,
  defaultData,
  defaultSettings,
  defaultSocial,
  putUserRecord,
  getUserRecord,
  exerciseNameFromKey,
  jsonResponse,
};
