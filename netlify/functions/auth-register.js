const { hashPassword, signToken, isValidUsername, defaultData, defaultSettings, json, getUsersStore } = require('./utils');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Método não permitido.' });
  }
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Pedido inválido.' });
  }

  const rawUsername = (body.username || '').trim();
  const password = body.password || '';
  const uKey = rawUsername.toLowerCase();

  if (!isValidUsername(uKey)) {
    return json(400, { error: 'Nome de utilizador inválido (3-32 caracteres: letras, números, ponto, hífen ou underscore).' });
  }
  if (password.length < 6) {
    return json(400, { error: 'A palavra-passe deve ter pelo menos 6 caracteres.' });
  }

  try {
    const store = getUsersStore();
    const existing = await store.get(uKey, { type: 'json' });
    if (existing) {
      return json(409, { error: 'Já existe uma conta com esse nome.' });
    }

    const { salt, hash } = hashPassword(password);
    const record = {
      displayName: rawUsername,
      salt,
      hash,
      data: defaultData(),
      settings: defaultSettings(),
      updatedAt: new Date().toISOString(),
    };
    await store.setJSON(uKey, record);

    const token = signToken(uKey);
    return json(200, { token, displayName: record.displayName, data: record.data, settings: record.settings });
  } catch (e) {
    console.error(e);
    return json(500, { error: 'Erro no servidor. Tenta novamente.' });
  }
};
