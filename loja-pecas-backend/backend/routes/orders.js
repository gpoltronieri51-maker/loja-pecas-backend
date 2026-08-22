const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');

const router = express.Router();

// Listar pedidos do usuário logado
router.get('/meus', autenticar, async (req, res) => {
  try {
    const pedidos = await pool.query(
      'SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY criado_em DESC',
      [req.usuario.id]
    );
    res.json(pedidos.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao buscar pedidos' });
  }
});

// Detalhe de um pedido (com itens)
router.get('/:id', autenticar, async (req, res) => {
  try {
    const pedido = await pool.query('SELECT * FROM pedidos WHERE id = $1 AND usuario_id = $2', [req.params.id, req.usuario.id]);
    if (pedido.rows.length === 0) return res.status(404).json({ erro: 'Pedido não encontrado' });

    const itens = await pool.query(
      `SELECT pi.*, p.titulo, p.imagem_url FROM pedido_itens pi
       JOIN produtos p ON p.id = pi.produto_id WHERE pi.pedido_id = $1`,
      [req.params.id]
    );
    res.json({ ...pedido.rows[0], itens: itens.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao buscar pedido' });
  }
});

module.exports = router;
