const { verifyToken, json, getUsersStore } = require('./utils');

exports.handler = async (event) => {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const uKey = verifyToken(token);

  if (!uKey) {
    return json(401, { error: 'Sessão inválida ou expirada. Inicia sessão novamente.' });
  }

  const store = getUsersStore();

  if (event.httpMethod === 'GET') {
    try {
      const record = await store.get(uKey, { type: 'json' });
      if (!record) return json(404, { error: 'Conta não encontrada.' });
      return json(200, { displayName: record.displayName, data: record.data, settings: record.settings });
    } catch (e) {
      console.error(e);
      return json(500, { error: 'Erro ao carregar dados.' });
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const record = await store.get(uKey, { type: 'json' });
      if (!record) return json(404, { error: 'Conta não encontrada.' });

      const body = JSON.parse(event.body || '{}');
      if (body.data !== undefined) record.data = body.data;
      if (body.settings !== undefined) record.settings = body.settings;
      record.updatedAt = new Date().toISOString();

      await store.setJSON(uKey, record);
      return json(200, { ok: true, updatedAt: record.updatedAt });
    } catch (e) {
      console.error(e);
      return json(500, { error: 'Erro ao guardar dados.' });
    }
  }

  return json(405, { error: 'Método não permitido.' });
};
