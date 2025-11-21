// backend/server.js
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// 1. connect to SQLite database (file will be created if not present)
const dbPath = path.join(__dirname, "data.db");
const db = new Database(dbPath);

// 2. create tables if they don't exist
db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT,
    available INTEGER NOT NULL DEFAULT 1,
    owner_name TEXT,
    borrower_name TEXT,
    borrowed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    busy INTEGER NOT NULL DEFAULT 0,
    free_at TEXT,
    note TEXT
  );
`);

// small helpers for queries
function all(sql, params = []) {
  return db.prepare(sql).all(params);
}
function get(sql, params = []) {
  return db.prepare(sql).get(params);
}
function run(sql, params = []) {
  return db.prepare(sql).run(params);
}

/* ================== BOOKS API ================== */

app.get("/api/books", (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  let rows = all("SELECT * FROM books ORDER BY id DESC");
  if (q) {
    rows = rows.filter(
      (b) =>
        (b.title || "").toLowerCase().includes(q) ||
        (b.author || "").toLowerCase().includes(q)
    );
  }
  res.json(rows);
});

app.post("/api/books", (req, res) => {
  const { title, author, owner_name } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });

  const info = run(
    "INSERT INTO books (title, author, available, owner_name) VALUES (?, ?, 1, ?)",
    [title, author || "", owner_name || null]
  );
  const book = get("SELECT * FROM books WHERE id = ?", [info.lastInsertRowid]);
  res.json(book);
});

app.post("/api/books/:id/rent", (req, res) => {
  const id = Number(req.params.id);
  const { borrower_name } = req.body;

  const book = get("SELECT * FROM books WHERE id = ?", [id]);
  if (!book) return res.status(404).json({ error: "not found" });
  if (book.available === 0)
    return res.status(400).json({ error: "already rented" });

  run(
    "UPDATE books SET available = 0, borrower_name = ?, borrowed_at = ? WHERE id = ?",
    [borrower_name || null, new Date().toISOString(), id]
  );
  res.json(get("SELECT * FROM books WHERE id = ?", [id]));
});

app.post("/api/books/:id/return", (req, res) => {
  const id = Number(req.params.id);
  const book = get("SELECT * FROM books WHERE id = ?", [id]);
  if (!book) return res.status(404).json({ error: "not found" });

  run(
    "UPDATE books SET available = 1, borrower_name = NULL, borrowed_at = NULL WHERE id = ?",
    [id]
  );
  res.json(get("SELECT * FROM books WHERE id = ?", [id]));
});

/* ================== MACHINES API ================== */

app.get("/api/machines", (req, res) => {
  const rows = all("SELECT * FROM machines ORDER BY id");
  res.json(rows);
});

app.post("/api/machines", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });

  const info = run(
    "INSERT INTO machines (name, busy, free_at, note) VALUES (?, 0, NULL, ?)",
    [name, ""]
  );
  res.json(get("SELECT * FROM machines WHERE id = ?", [info.lastInsertRowid]));
});

app.post("/api/machines/:id/use", (req, res) => {
  const id = Number(req.params.id);
  const { user, durationMinutes, note } = req.body;

  const m = get("SELECT * FROM machines WHERE id = ?", [id]);
  if (!m) return res.status(404).json({ error: "not found" });

  const duration = Number(durationMinutes) || 30;
  const freeAt = new Date(Date.now() + duration * 60000).toISOString();
  run("UPDATE machines SET busy = 1, free_at = ?, note = ? WHERE id = ?", [
    freeAt,
    note || `Used by ${user || "someone"} for ${duration}m`,
    id,
  ]);
  res.json(get("SELECT * FROM machines WHERE id = ?", [id]));
});

app.post("/api/machines/:id/free", (req, res) => {
  const id = Number(req.params.id);

  const m = get("SELECT * FROM machines WHERE id = ?", [id]);
  if (!m) return res.status(404).json({ error: "not found" });

  run("UPDATE machines SET busy = 0, free_at = NULL, note = ? WHERE id = ?", [
    "",
    id,
  ]);
  res.json(get("SELECT * FROM machines WHERE id = ?", [id]));
});

/* ========== serve frontend static files ========== */

app.use(express.static(path.join(__dirname, "..", "frontend")));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
