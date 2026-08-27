const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Garante que o arquivo do banco de dados fique em um local seguro ou na raiz
const dbPath = path.resolve(__dirname, 'database.sqlite');

const db = new Database(dbPath, { verbose: console.log });

// Criação das tabelas básicas se não existirem
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  );

  CREATE TABLE IF NOT EXISTS mangas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    cover TEXT
  );
`);

module.exports = db;
