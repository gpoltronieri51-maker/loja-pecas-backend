const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

// Cadastro de cliente
router.post('/cadastro', async (req, res) => {
  const { nome, email, senha, telefone } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios' });
  }
  try {
    const existe = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ erro: 'Este email já está cadastrado' });
    }
    const hash = await bcrypt.hash(senha, 10);
    const resultado = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, telefone) VALUES ($1,$2,$3,$4)
       RETURNING id, nome, email`,
      [nome, email, hash, telefone || null]
    );
    const usuario = resultado.rows[0];
    const token = jwt.sign({ id: usuario.id, nome: usuario.nome, is_admin: false }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ usuario, token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao cadastrar usuário' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'Email e senha são obrigatórios' });

  try {
    const resultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (resultado.rows.length === 0) return res.status(401).json({ erro: 'Email ou senha inválidos' });

    const usuario = resultado.rows[0];
    const senhaOk = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaOk) return res.status(401).json({ erro: 'Email ou senha inválidos' });

    const token = jwt.sign(
      { id: usuario.id, nome: usuario.nome, is_admin: usuario.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, is_admin: usuario.is_admin }, token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao fazer login' });
  }
});

module.exports = router;
