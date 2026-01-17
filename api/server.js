app.get("/api/test", (req, res) => {
  res.json({ ok: true });
});

// backend/server.js
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = "change-this-secret-later"; // for demo; use .env in production

const app = express();
app.use(cors());
app.use(express.json());

// 1. connect to SQLite database (file will be created if not present)
const dbPath = path.join(__dirname, "data.db");
const db = new Database(dbPath);

// 2. create tables if they don't exist
db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student', -- 'student' or 'admin'
    course_year TEXT,
    course_program TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT,
    available INTEGER NOT NULL DEFAULT 1,
    owner_id INTEGER,
    owner_name TEXT,
    borrower_id INTEGER,
    borrower_name TEXT,
    borrowed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS book_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    user_id INTEGER,
    user_name TEXT,
    action TEXT,
    at TEXT
  );

  CREATE TABLE IF NOT EXISTS machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    busy INTEGER NOT NULL DEFAULT 0,
    free_at TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'working'
  );

  -- Badminton holidays (admin marks which dates are holiday)
  CREATE TABLE IF NOT EXISTS badminton_holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,  -- format YYYY-MM-DD
    note TEXT
  );

  -- Badminton bookings (1-hour slots, up to 6 users per slot)
  CREATE TABLE IF NOT EXISTS badminton_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_time TEXT NOT NULL,    -- ISO time for slot start
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    created_at TEXT
  );

  -- Sports items (bats, balls, rackets, etc.)
  CREATE TABLE IF NOT EXISTS sports_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    in_use INTEGER NOT NULL DEFAULT 0,
    current_user_id INTEGER,
    current_user_name TEXT,
    out_time TEXT,
    last_in_time TEXT
  );
`);

// Ensure new columns exist for sports_items (quantity + in_use_count)
try {
  db.exec(`
    ALTER TABLE sports_items
    ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;
  `);
} catch (e) {
  // column already exists, ignore
}

try {
  db.exec(`
    ALTER TABLE sports_items
    ADD COLUMN in_use_count INTEGER NOT NULL DEFAULT 0;
  `);
} catch (e) {
  // column already exists, ignore
}

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

// ====== Time helpers for badminton ======
function toDate(value) {
  const d = new Date(value);
  if (isNaN(d)) return null;
  return d;
}

function ymd(d) {
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function isWeekend(d) {
  const day = d.getDay(); // 0 = Sun, 6 = Sat
  return day === 0 || day === 6;
}

function isWeekday(d) {
  return !isWeekend(d);
}

function isHolidayDate(dateStr) {
  const row = get("SELECT * FROM badminton_holidays WHERE date = ?", [dateStr]);
  return !!row;
}

// ====== Auth helpers ======
function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      course_year: user.course_year || null,
      course_program: user.course_program || null,
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = authHeader.slice(7); // remove "Bearer "
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // {id, name, email, role}
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

/* ================== AUTH API ================== */

// POST /api/auth/register
// First user becomes admin, others are students
// POST /api/auth/register
app.post("/api/auth/register", (req, res) => {
  const { name, email, password, course_year, course_program } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, password required" });
  }

  const existing = get("SELECT * FROM users WHERE email = ?", [email]);
  if (existing) {
    return res.status(400).json({ error: "email already registered" });
  }

  const countRow = get("SELECT COUNT(*) as count FROM users");
  const isFirstUser = countRow.count === 0;
  const role = isFirstUser ? "admin" : "student";

  const hash = bcrypt.hashSync(password, 10);

  const info = run(
    "INSERT INTO users (name, email, password_hash, role, course_year, course_program, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      name,
      email,
      hash,
      role,
      course_year || null,
      course_program || null,
      new Date().toISOString(),
    ],
  );

  const user = get(
    "SELECT id, name, email, role, course_year, course_program FROM users WHERE id = ?",
    [info.lastInsertRowid],
  );
  const token = createToken(user);

  res.json({ token, user });
});

// POST /api/auth/login
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  const user = get("SELECT * FROM users WHERE email = ?", [email]);
  if (!user) {
    return res.status(400).json({ error: "invalid credentials" });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(400).json({ error: "invalid credentials" });
  }

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    course_year: user.course_year,
    course_program: user.course_program,
  };

  const token = createToken(safeUser);

  res.json({ token, user: safeUser });
});

// GET /api/auth/me  (needs token)
app.get("/api/auth/me", authMiddleware, (req, res) => {
  // req.user comes from token
  res.json({ user: req.user });
});

/* ================== BOOKS API ================== */

// GET /api/books  -> list all books + last 3 users
app.get("/api/books", authMiddleware, (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  let rows = all("SELECT * FROM books ORDER BY id DESC");
  if (q) {
    rows = rows.filter(
      (b) =>
        (b.title || "").toLowerCase().includes(q) ||
        (b.author || "").toLowerCase().includes(q),
    );
  }

  // attach last three users per book
  rows = rows.map((b) => {
    const lastUsers = all(
      "SELECT user_name, at FROM book_history WHERE book_id = ? ORDER BY at DESC LIMIT 3",
      [b.id],
    );
    return { ...b, last_users: lastUsers };
  });

  res.json(rows);
});

// POST /api/books  -> add new book (must be logged in)
app.post("/api/books", authMiddleware, (req, res) => {
  const { title, author } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });

  const owner_id = req.user.id;
  const owner_name = req.user.name;

  const info = run(
    "INSERT INTO books (title, author, available, owner_id, owner_name) VALUES (?, ?, 1, ?, ?)",
    [title, author || "", owner_id, owner_name],
  );
  const book = get("SELECT * FROM books WHERE id = ?", [info.lastInsertRowid]);
  res.json(book);
});

// POST /api/books/:id/rent  -> mark rented + add to history
app.post("/api/books/:id/rent", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const { borrower_name } = req.body;

  const book = get("SELECT * FROM books WHERE id = ?", [id]);
  if (!book) return res.status(404).json({ error: "not found" });
  if (book.available === 0)
    return res.status(400).json({ error: "already rented" });

  const userName = borrower_name || req.user.name;
  const now = new Date().toISOString();

  run(
    "UPDATE books SET available = 0, borrower_id = ?, borrower_name = ?, borrowed_at = ? WHERE id = ?",
    [req.user.id, userName, now, id],
  );

  // insert into history
  run(
    "INSERT INTO book_history (book_id, user_id, user_name, action, at) VALUES (?, ?, ?, ?, ?)",
    [id, req.user.id, userName, "rent", now],
  );

  res.json(get("SELECT * FROM books WHERE id = ?", [id]));
});

// POST /api/books/:id/return
app.post("/api/books/:id/return", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const user = req.user; // logged-in user

  const book = db
    .prepare(
      `
    SELECT * FROM books WHERE id = ?
  `,
    )
    .get(id);

  if (!book) {
    return res.status(404).json({ error: "Book not found" });
  }

  // If book is not rented
  if (book.available) {
    return res.status(400).json({ error: "Book is not rented right now" });
  }

  // Check who is allowed
  const isAdmin = user.role === "admin";
  const isBorrower = user.id === book.borrower_id;

  if (!isAdmin && !isBorrower) {
    return res.status(403).json({
      error: "Only the borrower or admin can return this book",
    });
  }

  // Return book
  db.prepare(
    `
    UPDATE books
    SET available = 1,
        borrower_id = NULL,
        borrower_name = NULL,
        borrowed_at = NULL
    WHERE id = ?
  `,
  ).run(id);

  // Save last user history
  db.prepare(
    `
    INSERT INTO book_history (book_id, user_id, user_name, action, at)
    VALUES (?, ?, ?, 'return', ?)
  `,
  ).run(id, user.id, user.name, new Date().toISOString());

  return res.json({ success: true });
});

// PUT /api/books/:id  -> update book (only owner or admin)
app.put("/api/books/:id", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const { title, author } = req.body;

  const book = get("SELECT * FROM books WHERE id = ?", [id]);
  if (!book) return res.status(404).json({ error: "not found" });

  const isOwner = book.owner_id && book.owner_id === req.user.id;
  const isAdmin = req.user.role === "admin";

  if (!isOwner && !isAdmin) {
    return res
      .status(403)
      .json({ error: "Only owner or admin can edit this book" });
  }

  run("UPDATE books SET title = ?, author = ? WHERE id = ?", [
    title || book.title,
    author || book.author,
    id,
  ]);

  res.json(get("SELECT * FROM books WHERE id = ?", [id]));
});

// DELETE /api/books/:id  -> delete (owner or admin)
app.delete("/api/books/:id", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const book = get("SELECT * FROM books WHERE id = ?", [id]);
  if (!book) return res.status(404).json({ error: "not found" });

  const isOwner = book.owner_id && book.owner_id === req.user.id;
  const isAdmin = req.user.role === "admin";

  if (!isOwner && !isAdmin) {
    return res
      .status(403)
      .json({ error: "Only owner or admin can delete this book" });
  }

  run("DELETE FROM books WHERE id = ?", [id]);
  res.json({ success: true });
});

/* ================== MACHINES API ================== */

app.get("/api/machines", (req, res) => {
  const rows = all("SELECT * FROM machines ORDER BY id");
  res.json(rows);
});

// POST /api/machines  -> add machine (ADMIN ONLY)
app.post("/api/machines", authMiddleware, requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });

  const info = run(
    "INSERT INTO machines (name, busy, free_at, note, status) VALUES (?, 0, NULL, ?, ?)",
    [name, "", "working"], // default status = working
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

// PUT /api/machines/:id  -> update machine (name/note for all, status only by admin)
app.put("/api/machines/:id", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const { name, note, status } = req.body;

  const m = get("SELECT * FROM machines WHERE id = ?", [id]);
  if (!m) return res.status(404).json({ error: "not found" });

  // allow everyone to change name & note
  const newName = name || m.name;
  const newNote = typeof note !== "undefined" ? note : m.note;

  // only admin can change status
  let newStatus = m.status;
  if (typeof status !== "undefined" && req.user.role === "admin") {
    newStatus = status;
  }

  run("UPDATE machines SET name = ?, note = ?, status = ? WHERE id = ?", [
    newName,
    newNote,
    newStatus,
    id,
  ]);

  res.json(get("SELECT * FROM machines WHERE id = ?", [id]));
});

// DELETE /api/machines/:id
app.delete("/api/machines/:id", authMiddleware, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const m = get("SELECT * FROM machines WHERE id = ?", [id]);
  if (!m) return res.status(404).json({ error: "not found" });

  run("DELETE FROM machines WHERE id = ?", [id]);
  res.json({ success: true });
});

/* ================== BADMINTON HOLIDAYS API ================== */

// GET /api/badminton/holidays  -> list all holidays
app.get("/api/badminton/holidays", (req, res) => {
  const rows = all(
    "SELECT id, date, note FROM badminton_holidays ORDER BY date ASC",
  );
  res.json(rows);
});

// POST /api/badminton/holidays  -> add holiday (ADMIN ONLY)
app.post(
  "/api/badminton/holidays",
  authMiddleware,
  requireAdmin,
  (req, res) => {
    const { date, note } = req.body;
    if (!date) {
      return res.status(400).json({ error: "date (YYYY-MM-DD) required" });
    }

    try {
      const info = run(
        "INSERT INTO badminton_holidays (date, note) VALUES (?, ?)",
        [date, note || ""],
      );
      const row = get(
        "SELECT id, date, note FROM badminton_holidays WHERE id = ?",
        [info.lastInsertRowid],
      );
      res.json(row);
    } catch (err) {
      // if duplicate date
      return res
        .status(400)
        .json({ error: "holiday for this date already exists" });
    }
  },
);

// DELETE /api/badminton/holidays/:id  -> remove holiday (ADMIN ONLY)
app.delete(
  "/api/badminton/holidays/:id",
  authMiddleware,
  requireAdmin,
  (req, res) => {
    const id = Number(req.params.id);
    const h = get("SELECT * FROM badminton_holidays WHERE id = ?", [id]);
    if (!h) return res.status(404).json({ error: "not found" });

    run("DELETE FROM badminton_holidays WHERE id = ?", [id]);
    res.json({ success: true });
  },
);

/* ================== BADMINTON BOOKING API ================== */

// GET /api/badminton/slots?start=YYYY-MM-DD&days=2
// returns slots for given days, with current bookings
app.get("/api/badminton/slots", authMiddleware, (req, res) => {
  const now = new Date();

  const startStr = req.query.start || ymd(now);
  let startDate = toDate(startStr);
  if (!startDate) startDate = now;
  startDate.setHours(0, 0, 0, 0);

  let days = parseInt(req.query.days || "2", 10);
  if (isNaN(days) || days < 1) days = 2;
  if (days > 3) days = 3; // limit

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days);

  // load bookings in this range
  const bookings = all(
    "SELECT * FROM badminton_bookings WHERE slot_time >= ? AND slot_time < ? ORDER BY slot_time ASC",
    [startDate.toISOString(), endDate.toISOString()],
  );

  const result = [];

  for (let d = 0; d < days; d++) {
    const day = new Date(startDate);
    day.setDate(day.getDate() + d);

    const dateStr = ymd(day);
    const holiday = isHolidayDate(dateStr);

    // slots from 6:00 to 22:00 (6 AM to 10 PM)
    for (let hour = 6; hour < 22; hour++) {
      const slotStart = new Date(day);
      slotStart.setHours(hour, 0, 0, 0);

      // skip past times
      if (slotStart < now) continue;

      // skip weekday academic hours (Mon-Fri 10-16) except holidays
      if (isWeekday(slotStart) && !holiday && hour >= 10 && hour < 16) {
        continue;
      }

      const slotIso = slotStart.toISOString();
      const bookedForSlot = bookings.filter((b) => b.slot_time === slotIso);

      result.push({
        slot_time: slotIso,
        date: dateStr,
        hour,
        users: bookedForSlot.map((b) => ({
          booking_id: b.id,
          user_id: b.user_id,
          user_name: b.user_name,
        })),
        remaining: Math.max(0, 6 - bookedForSlot.length),
      });
    }
  }

  res.json(result);
});

/* ================== SPORTS ITEMS API ================== */

// GET /api/sports/items  -> list all sports items
app.get("/api/sports/items", authMiddleware, (req, res) => {
  const rows = all(
    "SELECT * FROM sports_items ORDER BY category ASC, name ASC",
  );
  res.json(rows);
});

// POST /api/sports/items  -> add new item (ADMIN ONLY)
app.post("/api/sports/items", authMiddleware, requireAdmin, (req, res) => {
  const { name, category, quantity } = req.body;
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }
  const qty = Number(quantity) || 1;

  const info = run(
    "INSERT INTO sports_items (name, category, in_use, quantity, in_use_count) VALUES (?, ?, 0, ?, 0)",
    [name, category || null, qty],
  );

  const item = get("SELECT * FROM sports_items WHERE id = ?", [
    info.lastInsertRowid,
  ]);
  res.json(item);
});

// PUT /api/sports/items/:id  -> rename / change category (ADMIN ONLY)
app.put("/api/sports/items/:id", authMiddleware, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { name, category, quantity } = req.body;

  const item = get("SELECT * FROM sports_items WHERE id = ?", [id]);
  if (!item) return res.status(404).json({ error: "not found" });

  let newQty = item.quantity;
  if (quantity !== undefined) newQty = Math.max(1, Number(quantity) || 1);

  // Cannot reduce quantity below number in use
  if (newQty < item.in_use_count) {
    return res
      .status(400)
      .json({ error: "quantity cannot be less than items currently in use" });
  }

  run(
    "UPDATE sports_items SET name = ?, category = ?, quantity = ? WHERE id = ?",
    [name || item.name, category || item.category, newQty, id],
  );

  const updated = get("SELECT * FROM sports_items WHERE id = ?", [id]);
  res.json(updated);
});

// DELETE /api/sports/items/:id  -> remove item (ADMIN ONLY)
app.delete(
  "/api/sports/items/:id",
  authMiddleware,
  requireAdmin,
  (req, res) => {
    const id = Number(req.params.id);
    const item = get("SELECT * FROM sports_items WHERE id = ?", [id]);
    if (!item) {
      return res.status(404).json({ error: "not found" });
    }

    run("DELETE FROM sports_items WHERE id = ?", [id]);
    res.json({ success: true });
  },
);

// POST /api/sports/items/:id/use  -> user takes item (set out_time)
app.post("/api/sports/items/:id/use", authMiddleware, (req, res) => {
  const id = Number(req.params.id);

  const item = get("SELECT * FROM sports_items WHERE id = ?", [id]);
  if (!item) return res.status(404).json({ error: "not found" });

  const qty = item.quantity;
  const used = item.in_use_count;

  if (used >= qty) {
    return res.status(400).json({ error: "all pieces are already in use" });
  }

  run(
    `UPDATE sports_items
     SET in_use_count = in_use_count + 1,
         in_use = CASE WHEN in_use_count + 1 >= quantity THEN 1 ELSE in_use END
     WHERE id = ?`,
    [id],
  );

  const updated = get("SELECT * FROM sports_items WHERE id = ?", [id]);
  res.json(updated);
});

// POST /api/sports/items/:id/return  -> return item (owner or admin)
app.post("/api/sports/items/:id/return", authMiddleware, (req, res) => {
  const id = Number(req.params.id);

  const item = get("SELECT * FROM sports_items WHERE id = ?", [id]);
  if (!item) return res.status(404).json({ error: "not found" });

  const used = item.in_use_count;

  if (used <= 0) {
    return res.status(400).json({ error: "all items are already free" });
  }

  const now = new Date().toISOString();

  run(
    `UPDATE sports_items
     SET in_use_count = in_use_count - 1,
         last_in_time = ?,
         in_use = CASE WHEN in_use_count - 1 <= 0 THEN 0 ELSE 1 END
     WHERE id = ?`,
    [now, id],
  );

  const updated = get("SELECT * FROM sports_items WHERE id = ?", [id]);
  res.json(updated);
});

// POST /api/badminton/book
// body: { slot_time: ISO string }
app.post("/api/badminton/book", authMiddleware, (req, res) => {
  const { slot_time } = req.body;
  if (!slot_time) {
    return res.status(400).json({ error: "slot_time is required" });
  }

  const now = new Date();
  const slotStart = toDate(slot_time);
  if (!slotStart) {
    return res.status(400).json({ error: "invalid slot_time" });
  }

  // must be in future
  if (slotStart <= now) {
    return res.status(400).json({ error: "cannot book past slot" });
  }

  // must be within next 2 days
  const diffMs = slotStart - now;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays > 2) {
    return res
      .status(400)
      .json({ error: "you can only book within the next 2 days" });
  }

  // weekday academic hours block, unless holiday
  const dateStr = ymd(slotStart);
  const holiday = isHolidayDate(dateStr);
  const hour = slotStart.getHours();
  if (isWeekday(slotStart) && !holiday && hour >= 10 && hour < 16) {
    return res.status(400).json({
      error: "slot is blocked between Mon-Fri 10am-4pm (except holidays)",
    });
  }

  // max 6 users per slot
  const countRow = get(
    "SELECT COUNT(*) as c FROM badminton_bookings WHERE slot_time = ?",
    [slotStart.toISOString()],
  );
  if (countRow.c >= 6) {
    return res.status(400).json({ error: "slot is full (6 users)" });
  }

  // user limits: max 2 slots per day, with 1-hour gap
  const userId = req.user.id;
  const sameDayBookings = all(
    "SELECT * FROM badminton_bookings WHERE user_id = ? AND substr(slot_time,1,10) = ?",
    [userId, dateStr],
  );

  if (sameDayBookings.length >= 2) {
    return res.status(400).json({ error: "you can only book 2 slots per day" });
  }

  // enforce 1-hour gap after previous slot (slot length = 1 hour)
  // => start times must be at least 2 hours apart
  for (const b of sameDayBookings) {
    const existingStart = toDate(b.slot_time);
    if (!existingStart) continue;
    const diffMin = Math.abs(slotStart - existingStart) / (1000 * 60);
    if (diffMin < 120) {
      return res.status(400).json({
        error:
          "need 1 hour gap after your previous slot; choose a slot at least 2 hours apart",
      });
    }
  }

  const info = run(
    "INSERT INTO badminton_bookings (slot_time, user_id, user_name, created_at) VALUES (?, ?, ?, ?)",
    [slotStart.toISOString(), userId, req.user.name, now.toISOString()],
  );

  const booking = get("SELECT * FROM badminton_bookings WHERE id = ?", [
    info.lastInsertRowid,
  ]);
  res.json(booking);
});

// DELETE /api/badminton/bookings/:id
// user can cancel own; admin can cancel any
app.delete("/api/badminton/bookings/:id", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const booking = get("SELECT * FROM badminton_bookings WHERE id = ?", [id]);
  if (!booking) {
    return res.status(404).json({ error: "booking not found" });
  }

  const isOwner = booking.user_id === req.user.id;
  const isAdmin = req.user.role === "admin";
  if (!isOwner && !isAdmin) {
    return res
      .status(403)
      .json({ error: "only owner or admin can cancel this booking" });
  }

  run("DELETE FROM badminton_bookings WHERE id = ?", [id]);
  res.json({ success: true });
});

/* ========== serve frontend static files ========== */

module.exports = app;
