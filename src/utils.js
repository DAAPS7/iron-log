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
    waterEntries: [],
    calorieGoal: null,
    macroGoals: { protein: null, carbs: null, fat: null },
    exercisePRs: {},
    prNotifyCache: {},
    mealPlans: [],
    customFoods: [],
    exerciseGoals: [],
    metricGoals: {},
    weeklySchedule: {},
    lastWeeklyReviewWeek: null,
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

// ---------- Fusão de dados entre dispositivos ----------
//
// Cada dispositivo mantém uma cópia local completa dos dados e grava-a por
// inteiro. Se o dispositivo A gravar um treino novo, e a seguir o
// dispositivo B (que ainda não tinha esse treino na sua cópia local) gravar
// um peso novo, uma simples substituição total apagaria o treino do
// dispositivo A. Em vez disso, listas com "id" (treinos, registos, planos,
// etc.) são fundidas por id: mantém-se tudo o que existir em qualquer um
// dos lados. Isto não resolve edições conflituosas do MESMO item feitas em
// dois sítios ao mesmo tempo (aí ganha a versão mais recente a gravar), nem
// apagar um item num dispositivo enquanto o outro ainda o tem — mas evita o
// problema mais grave, que é perder registos inteiros sem se dar conta.
const MERGE_ARRAYS_BY_ID = [
  'loggedWorkouts',
  'workouts',
  'calorieEntries',
  'waterEntries',
  'customFoods',
  'mealPlans',
  'exerciseGoals',
];
const MERGE_ARRAYS_BY_DATE = ['weightHistory'];
const MERGE_BEST_WEIGHT_OBJECTS = ['exercisePRs', 'prNotifyCache'];
// Objetos com sub-chaves (ex: metricGoals.bodyFat / metricGoals.weight) —
// se um dispositivo só conhecer uma das sub-chaves (ex: só tem definida a
// meta de gordura corporal), uma substituição direta apagaria a outra
// sub-chave (ex: a meta de peso) que outro dispositivo já tinha definido.
const MERGE_SHALLOW_OBJECTS = ['metricGoals', 'macroGoals', 'weeklySchedule'];

function mergeShallowObject(oldObj, newObj) {
  return { ...(oldObj || {}), ...(newObj || {}) };
}

function mergeArrayByKey(oldArr, newArr, keyField) {
  const map = new Map();
  (oldArr || []).forEach((item) => {
    if (item && item[keyField] != null) map.set(item[keyField], item);
  });
  (newArr || []).forEach((item) => {
    if (item && item[keyField] != null) map.set(item[keyField], item);
  });
  return [...map.values()];
}

function isBetterPR(a, b) {
  if (!a) return false;
  if (!b) return true;
  if (a.weight > b.weight) return true;
  if (a.weight === b.weight && (a.reps || 0) > (b.reps || 0)) return true;
  return false;
}
function mergeBestWeightObject(oldObj, newObj) {
  const merged = { ...(oldObj || {}) };
  for (const [key, val] of Object.entries(newObj || {})) {
    merged[key] = isBetterPR(val, merged[key]) ? val : merged[key];
  }
  return merged;
}

// Funde os dados recebidos de um dispositivo com os que já estavam
// guardados no servidor. Os restantes campos (perfil, metas, plano
// semanal, etc.) não têm uma forma óbvia de fundir — usa-se sempre a
// versão que está a ser gravada agora.
function mergeUserData(oldData, newData) {
  if (!oldData) return newData;
  if (!newData) return oldData;

  const merged = { ...newData };
  MERGE_ARRAYS_BY_ID.forEach((key) => {
    merged[key] = mergeArrayByKey(oldData[key], newData[key], 'id');
  });
  MERGE_ARRAYS_BY_DATE.forEach((key) => {
    merged[key] = mergeArrayByKey(oldData[key], newData[key], 'date');
  });
  MERGE_BEST_WEIGHT_OBJECTS.forEach((key) => {
    merged[key] = mergeBestWeightObject(oldData[key], newData[key]);
  });
  MERGE_SHALLOW_OBJECTS.forEach((key) => {
    merged[key] = mergeShallowObject(oldData[key], newData[key]);
  });
  return merged;
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

// ---------- Snapshots automáticos ----------
// Uma cópia diária dos dados de cada utilizador, guardada à parte do
// registo principal. Serve de rede de segurança: se um dispositivo gravar
// por engano uma versão desatualizada por cima da atual (ex: um bug de
// sincronização), há sempre um ponto recente para onde voltar.
const SNAPSHOT_RETENTION_DAYS = 14;
const SNAPSHOT_TTL_SECONDS = SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60;
const SNAPSHOT_PREFIX = 'snapshot:';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function snapshotKey(uKey, dateStr) {
  return `${SNAPSHOT_PREFIX}${uKey}:${dateStr}`;
}

// Só grava uma vez por dia por utilizador — não é preciso mais do que isso
// para uma rede de segurança, e evita encher o KV com uma cópia por cada
// pequena gravação ao longo do dia.
async function maybeWriteSnapshot(env, uKey, record) {
  const key = snapshotKey(uKey, todayStr());
  const existing = await env.USERS_KV.get(key);
  if (existing) return; // já há uma cópia de hoje
  await env.USERS_KV.put(
    key,
    JSON.stringify({ data: record.data, settings: record.settings, savedAt: new Date().toISOString() }),
    { expirationTtl: SNAPSHOT_TTL_SECONDS },
  );
}

// Lista as cópias disponíveis para um utilizador, mais recentes primeiro.
async function listSnapshots(env, uKey) {
  const list = await env.USERS_KV.list({ prefix: `${SNAPSHOT_PREFIX}${uKey}:` });
  return list.keys
    .map((k) => k.name.slice(`${SNAPSHOT_PREFIX}${uKey}:`.length))
    .sort()
    .reverse();
}

async function getSnapshot(env, uKey, dateStr) {
  const raw = await env.USERS_KV.get(snapshotKey(uKey, dateStr));
  return raw ? JSON.parse(raw) : null;
}

// Cabeçalhos CORS: necessários porque o site (servido pelo próprio Worker)
// e a app em modo web/Expo (servida de outra origem, ex: localhost:8081)
// deixam de ser "a mesma origem" — sem isto, o browser bloqueia a resposta.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function corsPreflightResponse() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
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
  corsPreflightResponse,
  maybeWriteSnapshot,
  listSnapshots,
  getSnapshot,
  mergeUserData,
};
