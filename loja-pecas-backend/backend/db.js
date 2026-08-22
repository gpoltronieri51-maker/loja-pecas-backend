const { Pool } = require('pg');

// A DATABASE_URL vem do seu banco gratuito (Neon, Supabase, etc)
// Formato: postgresql://usuario:senha@host/nomedobanco?sslmode=require
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;
