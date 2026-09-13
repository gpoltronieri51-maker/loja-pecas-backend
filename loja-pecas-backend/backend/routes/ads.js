const express = require('express');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

// Tabela de preços por duração do anúncio — ajuste os valores como quiser
const PRECOS_ANUNCIO = {
  3: 9.90,
  7: 19.90,
  15: 29.90
};

// Cria o anúncio (ainda pendente) e gera o link de pagamento
router.post('/criar', autenticar, async (req, res) => {
  const { titulo, descricao, categoria_id, preco, condicao, imagem_url, duracao_dias } = req.body;
  const dias = Number(duracao_dias);

  if (!titulo || !preco) return res.status(400).json({ erro: 'Título e preço são obrigatórios' });
  if (!PRECOS_ANUNCIO[dias]) return res.status(400).json({ erro: 'Duração de anúncio inválida' });

  const valorAnuncio = PRECOS_ANUNCIO[dias];

  try {
    // cria o produto já no banco, mas inativo até o pagamento ser confirmado
    const resultado = await pool.query(
      `INSERT INTO produtos (titulo, descricao, categoria_id, preco, estoque, condicao, imagem_url, ativo, anunciante_id, status_anuncio)
       VALUES ($1,$2,$3,$4,1,$5,$6,FALSE,$7,'pendente') RETURNING id`,
      [titulo, descricao || null, categoria_id || null, preco, condicao || 'usado', imagem_url || null, req.usuario.id]
    );
    const produtoId = resultado.rows[0].id;

    const preference = new Preference(mpClient);
    const preferenceResponse = await preference.create({
      body: {
        items: [{
          title: `Anúncio "${titulo}" por ${dias} dias`,
          quantity: 1,
          unit_price: valorAnuncio,
          currency_id: 'BRL'
        }],
        external_reference: `anuncio:${produtoId}:${dias}`,
        back_urls: {
          success: `${process.env.FRONTEND_URL}/anuncio-confirmado.html?anuncio=${produtoId}`,
          failure: `${process.env.FRONTEND_URL}/anuncio-confirmado.html?anuncio=${produtoId}&status=falha`,
          pending: `${process.env.FRONTEND_URL}/anuncio-confirmado.html?anuncio=${produtoId}&status=pendente`
        },
        auto_return: 'approved',
        notification_url: `${process.env.BACKEND_URL}/api/pagamentos/webhook`
      }
    });

    await pool.query('UPDATE produtos SET mp_preference_id_anuncio = $1 WHERE id = $2', [preferenceResponse.id, produtoId]);

    res.json({ produto_id: produtoId, init_point: preferenceResponse.init_point });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao criar anúncio' });
  }
});

// Lista os preços disponíveis (pra montar a tela sem repetir os valores no front)
router.get('/precos', (req, res) => {
  res.json(PRECOS_ANUNCIO);
});

// Status de um anúncio específico (usado na página de confirmação)
router.get('/status/:id', async (req, res) => {
  const resultado = await pool.query(
    'SELECT id, titulo, status_anuncio, ativo, expira_em FROM produtos WHERE id = $1',
    [req.params.id]
  );
  if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Anúncio não encontrado' });
  res.json(resultado.rows[0]);
});

// Anúncios do próprio usuário logado
router.get('/meus', autenticar, async (req, res) => {
  const resultado = await pool.query(
    'SELECT * FROM produtos WHERE anunciante_id = $1 ORDER BY criado_em DESC',
    [req.usuario.id]
  );
  res.json(resultado.rows);
});

module.exports = router;
