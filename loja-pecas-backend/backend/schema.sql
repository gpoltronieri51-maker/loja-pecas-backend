-- Schema do banco de dados - Loja de Peças Usadas
-- Rode este arquivo uma vez no seu banco Postgres (Neon, Supabase, etc)

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(160) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  telefone VARCHAR(30),
  is_admin BOOLEAN DEFAULT FALSE,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categorias (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(80) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS produtos (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(160) NOT NULL,
  descricao TEXT,
  categoria_id INTEGER REFERENCES categorias(id),
  preco NUMERIC(10,2) NOT NULL,
  estoque INTEGER NOT NULL DEFAULT 1,
  condicao VARCHAR(40) DEFAULT 'usado', -- usado, seminovo, para retirada de peças
  imagem_url TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pedidos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  status VARCHAR(30) DEFAULT 'pendente', -- pendente, pago, enviado, cancelado
  total NUMERIC(10,2) NOT NULL,
  mp_preference_id VARCHAR(120),
  mp_payment_id VARCHAR(120),
  endereco_entrega TEXT,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pedido_itens (
  id SERIAL PRIMARY KEY,
  pedido_id INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id INTEGER REFERENCES produtos(id),
  quantidade INTEGER NOT NULL,
  preco_unitario NUMERIC(10,2) NOT NULL
);

-- categorias iniciais sugeridas
INSERT INTO categorias (nome) VALUES
  ('Placas-mãe'), ('Fontes'), ('Memórias RAM'), ('HDs e SSDs'),
  ('Placas de vídeo'), ('Processadores'), ('Gabinetes e carcaças'),
  ('Impressoras e peças'), ('Cabos e conectores'), ('Coolers e ventoinhas')
ON CONFLICT DO NOTHING;
