import { hashPassword, signToken, isValidUsername, defaultData, defaultSettings, defaultSocial, putUserRecord, jsonResponse } from '../utils.js';

export async function handleAuthRegister(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse(400, { error: 'Pedido inválido.' });
  }

  const rawUsername = (body.username || '').trim();
  const password = body.password || '';
  const uKey = rawUsername.toLowerCase();

  if (!isValidUsername(uKey)) {
    return jsonResponse(400, { error: 'Nome de utilizador inválido (3-32 caracteres: letras, números, ponto, hífen ou underscore).' });
  }
  if (password.length < 6) {
    return jsonResponse(400, { error: 'A palavra-passe deve ter pelo menos 6 caracteres.' });
  }

  try {
    const existing = await env.USERS_KV.get(uKey);
    if (existing) {
      return jsonResponse(409, { error: 'Já existe uma conta com esse nome.' });
    }

    const { salt, hash } = await hashPassword(password);
    const record = {
      displayName: rawUsername,
      salt,
      hash,
      data: defaultData(),
      settings: defaultSettings(),
      ...defaultSocial(),
      updatedAt: new Date().toISOString(),
    };
    await putUserRecord(env, uKey, record);

    const token = await signToken(uKey, env);
    return jsonResponse(200, { token, displayName: record.displayName, data: record.data, settings: record.settings });
  } catch (e) {
    console.error(e);
    return jsonResponse(500, { error: 'Erro no servidor. Tenta novamente.' });
  }
}
