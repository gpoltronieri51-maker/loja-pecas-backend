const express = require('express');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');

const router = express.Router();

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

// Recebe o carrinho, cria o pedido "pendente" no banco e gera a preferência de pagamento
router.post('/criar-preferencia', autenticar, async (req, res) => {
  const { itens, endereco_entrega } = req.body;
  if (!itens || itens.length === 0) return res.status(400).json({ erro: 'Carrinho vazio' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ids = itens.map(i => i.produto_id);
    const produtosResultado = await client.query(
      `SELECT id, titulo, preco, estoque FROM produtos WHERE id = ANY($1::int[]) AND ativo = TRUE`,
      [ids]
    );
    const produtos = produtosResultado.rows;

    let total = 0;
    const mpItens = [];
    const itensParaSalvar = [];

    for (const item of itens) {
      const produto = produtos.find(p => p.id === item.produto_id);
      if (!produto) return res.status(400).json({ erro: `Produto ${item.produto_id} não encontrado` });
      if (produto.estoque < item.quantidade) {
        return res.status(400).json({ erro: `Estoque insuficiente para ${produto.titulo}` });
      }
      const preco = Number(produto.preco);
      total += preco * item.quantidade;
      mpItens.push({ title: produto.titulo, quantity: item.quantidade, unit_price: preco, currency_id: 'BRL' });
      itensParaSalvar.push({ produto_id: produto.id, quantidade: item.quantidade, preco_unitario: preco });
    }

    const pedidoResultado = await client.query(
      `INSERT INTO pedidos (usuario_id, status, total, endereco_entrega) VALUES ($1,'pendente',$2,$3) RETURNING id`,
      [req.usuario.id, total, endereco_entrega || null]
    );
    const pedidoId = pedidoResultado.rows[0].id;

    for (const item of itensParaSalvar) {
      await client.query(
        `INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario) VALUES ($1,$2,$3,$4)`,
        [pedidoId, item.produto_id, item.quantidade, item.preco_unitario]
      );
    }

    const preference = new Preference(mpClient);
    const preferenceResponse = await preference.create({
      body: {
        items: mpItens,
        external_reference: `pedido:${pedidoId}`,
        back_urls: {
          success: `${process.env.FRONTEND_URL}/pedido-confirmado.html?pedido=${pedidoId}`,
          failure: `${process.env.FRONTEND_URL}/pedido-confirmado.html?pedido=${pedidoId}&status=falha`,
          pending: `${process.env.FRONTEND_URL}/pedido-confirmado.html?pedido=${pedidoId}&status=pendente`
        },
        auto_return: 'approved',
        notification_url: `${process.env.BACKEND_URL}/api/pagamentos/webhook`
      }
    });

    await client.query('UPDATE pedidos SET mp_preference_id = $1 WHERE id = $2', [preferenceResponse.id, pedidoId]);
    await client.query('COMMIT');

    res.json({ pedido_id: pedidoId, preference_id: preferenceResponse.id, init_point: preferenceResponse.init_point });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ erro: 'Erro ao criar preferência de pagamento' });
  } finally {
    client.release();
  }
});

// Webhook do Mercado Pago — agora trata tanto pedidos normais quanto anúncios de terceiros
router.post('/webhook', async (req, res) => {
  try {
    const topic = req.query.topic || req.query.type || req.body.type;
    const paymentId = req.query.id || req.body.data?.id;

    if (topic === 'payment' && paymentId) {
      const payment = new Payment(mpClient);
      const pagamento = await payment.get({ id: paymentId });
      const ref = pagamento.external_reference || '';

      if (ref.startsWith('anuncio:')) {
        // formato: "anuncio:<produtoId>:<dias>"
        const [, produtoIdStr, diasStr] = ref.split(':');
        const produtoId = Number(produtoIdStr);
        const dias = Number(diasStr);

        if (pagamento.status === 'approved') {
          const expiraEm = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
          await pool.query(
            `UPDATE produtos SET ativo = TRUE, status_anuncio = 'ativo', expira_em = $1 WHERE id = $2`,
            [expiraEm, produtoId]
          );
        } else if (pagamento.status === 'rejected') {
          await pool.query(`UPDATE produtos SET status_anuncio = 'rejeitado' WHERE id = $1`, [produtoId]);
        }
      } else {
        // formato antigo/pedido normal: "pedido:<id>" (ou só o número, por compatibilidade)
        const pedidoId = ref.includes(':') ? ref.split(':')[1] : ref;
        let statusPedido = 'pendente';
        if (pagamento.status === 'approved') statusPedido = 'pago';
        else if (pagamento.status === 'rejected') statusPedido = 'cancelado';

        await pool.query('UPDATE pedidos SET status = $1, mp_payment_id = $2 WHERE id = $3', [statusPedido, paymentId, pedidoId]);

        if (statusPedido === 'pago') {
          const itens = await pool.query('SELECT produto_id, quantidade FROM pedido_itens WHERE pedido_id = $1', [pedidoId]);
          for (const item of itens.rows) {
            await pool.query('UPDATE produtos SET estoque = estoque - $1 WHERE id = $2', [item.quantidade, item.produto_id]);
          }
        }
      }
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('Erro no webhook:', e);
    res.sendStatus(200);
  }
});

router.get('/status/:pedidoId', async (req, res) => {
  const resultado = await pool.query('SELECT id, status, total FROM pedidos WHERE id = $1', [req.params.pedidoId]);
  if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido não encontrado' });
  res.json(resultado.rows[0]);
});

module.exports = router;

