const { verifyPassword, signToken, json, getUsersStore } = require('./utils');

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

  const uKey = (body.username || '').trim().toLowerCase();
  const password = body.password || '';

  try {
    const store = getUsersStore();
    const record = await store.get(uKey, { type: 'json' });
    if (!record) {
      return json(401, { error: 'Conta não encontrada.' });
    }
    if (!verifyPassword(password, record.salt, record.hash)) {
      return json(401, { error: 'Palavra-passe incorreta.' });
    }
    const token = signToken(uKey);
    return json(200, { token, displayName: record.displayName, data: record.data, settings: record.settings });
  } catch (e) {
    console.error(e);
    return json(500, { error: 'Erro no servidor. Tenta novamente.' });
  }
};
