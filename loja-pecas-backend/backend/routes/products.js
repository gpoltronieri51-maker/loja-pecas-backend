const express = require('express');
const pool = require('../db');
const { autenticar, apenasAdmin } = require('../middleware/auth');

const router = express.Router();

// Listar produtos (público) - com filtro opcional por categoria e busca
router.get('/', async (req, res) => {
  const { categoria, busca } = req.query;
  let sql = `SELECT p.*, c.nome AS categoria_nome FROM produtos p
             LEFT JOIN categorias c ON c.id = p.categoria_id
             WHERE p.ativo = TRUE`;
  const params = [];

  if (categoria) {
    params.push(categoria);
    sql += ` AND p.categoria_id = $${params.length}`;
  }
  if (busca) {
    params.push(`%${busca}%`);
    sql += ` AND (p.titulo ILIKE $${params.length} OR p.descricao ILIKE $${params.length})`;
  }
  sql += ' ORDER BY p.criado_em DESC';

  try {
    const resultado = await pool.query(sql, params);
    res.json(resultado.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao buscar produtos' });
  }
});

// Detalhe de um produto
router.get('/:id', async (req, res) => {
  try {
    const resultado = await pool.query(
     `SELECT p.*, c.nome AS categoria_nome FROM produtos p
             LEFT JOIN categorias c ON c.id = p.categoria_id
             WHERE p.ativo = TRUE
             AND (p.expira_em IS NULL OR p.expira_em > NOW())`;
      [req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json(resultado.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao buscar produto' });
  }
});

// Listar categorias
router.get('/categorias/todas', async (req, res) => {
  const resultado = await pool.query('SELECT * FROM categorias ORDER BY nome');
  res.json(resultado.rows);
});

// Criar produto (admin)
router.post('/', autenticar, apenasAdmin, async (req, res) => {
  const { titulo, descricao, categoria_id, preco, estoque, condicao, imagem_url } = req.body;
  if (!titulo || !preco) return res.status(400).json({ erro: 'Título e preço são obrigatórios' });

  try {
    const resultado = await pool.query(
      `INSERT INTO produtos (titulo, descricao, categoria_id, preco, estoque, condicao, imagem_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [titulo, descricao || null, categoria_id || null, preco, estoque || 1, condicao || 'usado', imagem_url || null]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao criar produto' });
  }
});

// Editar produto (admin)
router.put('/:id', autenticar, apenasAdmin, async (req, res) => {
  const { titulo, descricao, categoria_id, preco, estoque, condicao, imagem_url, ativo } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE produtos SET titulo=$1, descricao=$2, categoria_id=$3, preco=$4,
       estoque=$5, condicao=$6, imagem_url=$7, ativo=$8 WHERE id=$9 RETURNING *`,
      [titulo, descricao, categoria_id, preco, estoque, condicao, imagem_url, ativo, req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json(resultado.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao editar produto' });
  }
});

// Excluir produto (admin) - soft delete
router.delete('/:id', autenticar, apenasAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE produtos SET ativo = FALSE WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao remover produto' });
  }
});

module.exports = router;
