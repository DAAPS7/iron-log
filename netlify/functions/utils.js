const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

// Em teoria o Netlify injeta automaticamente o contexto (siteID/token) das
// Blobs nas funções em produção — mas há um bug conhecido e recorrente da
// plataforma em que isso falha silenciosamente ("MissingBlobsEnvironmentError").
// Para contornar isso de forma fiável, se as variáveis BLOBS_SITE_ID e
// BLOBS_TOKEN estiverem definidas, usamo-las explicitamente; caso contrário
// caímos na injeção automática (que funciona bem em `netlify dev`).
function getUsersStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: 'iron-log-users', siteID, token });
  }
  return getStore('iron-log-users');
}

// Define SESSION_SECRET nas variáveis de ambiente do site no Netlify
// (Site settings → Environment variables). Se não definires, é usado um
// valor por omissão — ATENÇÃO: isso não é seguro para produção.
const SESSION_SECRET = process.env.SESSION_SECRET || 'iron-log-dev-secret-change-me';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  try {
    const test = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(test, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

function signToken(username) {
  const payload = JSON.stringify({ u: username, exp: Date.now() + TOKEN_TTL_MS });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
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
  return { profile: null, weightHistory: [], workouts: [], loggedWorkouts: [], calorieEntries: [], calorieGoal: null, macroGoals: { protein: null, carbs: null, fat: null }, exercisePRs: {}, mealPlans: [] };
}
function defaultSettings() {
  return { theme: 'light', font: 'anton-work', accentStrength: null, accentCardio: null, radius: 14 };
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  isValidUsername,
  defaultData,
  defaultSettings,
  json,
  getUsersStore,
};
