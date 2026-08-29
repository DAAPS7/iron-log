const { json } = require('./utils');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Método não permitido.' });
  }

  const query = ((event.queryStringParameters && event.queryStringParameters.q) || '').trim();
  if (!query) {
    return json(400, { error: 'Falta o parâmetro de pesquisa.' });
  }

  try {
    const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=15&page=1&langs=pt,en`;
    const res = await fetch(url, {
      headers: {
        // A Open Food Facts pede um User-Agent identificável; o browser não
        // deixa definir isto diretamente numa chamada fetch do cliente, por
        // isso passa a ser feito aqui, do lado do servidor.
        'User-Agent': 'IronLog/1.0 (personal fitness tracker app)',
      },
    });

    if (!res.ok) {
      return json(res.status, { error: `A Open Food Facts respondeu com o estado ${res.status}.` });
    }

    const data = await res.json();
    return json(200, data);
  } catch (e) {
    console.error('Erro ao pesquisar na Open Food Facts:', e);
    return json(500, { error: 'Não foi possível contactar a Open Food Facts.' });
  }
};
