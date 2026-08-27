// -*- coding: utf-8 -*-
const express = require("express");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const slugify = require("slugify");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const SESSIONS_DIR = path.join(__dirname, "data", "sessions");
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

app.use(session({
  store: new FileStore({ path: SESSIONS_DIR, ttl: 60 * 60 * 24 * 30, retries: 1, logFn: () => {} }),
  secret: process.env.SESSION_SECRET || "troque-este-segredo-em-producao",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 }, // 30 dias
}));

// Disponibiliza o usuário logado (se houver) em todas as views
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  if (req.session.user) {
    const row = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0").get(req.session.user.id);
    res.locals.unreadNotifications = row.n;
  } else {
    res.locals.unreadNotifications = 0;
  }
  next();
});

/* ==========================================================================
   UPLOADS (capas e páginas de capítulo)
   ========================================================================== */
const COVERS_DIR = path.join(__dirname, "public", "uploads", "covers");
const CHAPTERS_DIR = path.join(__dirname, "public", "uploads", "chapters");
fs.mkdirSync(COVERS_DIR, { recursive: true });
fs.mkdirSync(CHAPTERS_DIR, { recursive: true });

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function imageFileFilter(req, file, cb) {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Tipo de arquivo não permitido. Envie apenas imagens (jpg, png, webp, gif)."));
}

const coverStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, COVERS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `cover_${Date.now()}_${Math.round(Math.random()*1e6)}${ext}`);
  },
});
const uploadCover = multer({ storage: coverStorage, fileFilter: imageFileFilter, limits: { fileSize: 8 * 1024 * 1024 } });

const chapterStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CHAPTERS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `page_${Date.now()}_${Math.round(Math.random()*1e6)}${ext}`);
  },
});
const uploadPages = multer({ storage: chapterStorage, fileFilter: imageFileFilter, limits: { fileSize: 8 * 1024 * 1024, files: 100 } });

/* ==========================================================================
   HELPERS
   ========================================================================== */
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
  next();
}

function uniqueSlug(title) {
  const base = slugify(title, { lower: true, strict: true }).slice(0, 60) || "manga";
  let slug = base;
  let n = 1;
  const exists = db.prepare("SELECT id FROM manga WHERE slug = ?");
  while (exists.get(slug)) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

function getMangaBySlug(slug) {
  return db.prepare("SELECT manga.*, users.username AS author_username FROM manga JOIN users ON users.id = manga.author_id WHERE manga.slug = ?").get(slug);
}

function isBookmarked(userId, mangaId) {
  if (!userId) return false;
  return !!db.prepare("SELECT id FROM bookmarks WHERE user_id = ? AND manga_id = ?").get(userId, mangaId);
}

function flashError(req, msg) { req.session.flashError = msg; }
function flashInfo(req, msg) { req.session.flashInfo = msg; }
function popFlash(req) {
  const f = { error: req.session.flashError || null, info: req.session.flashInfo || null };
  delete req.session.flashError; delete req.session.flashInfo;
  return f;
}

/* ==========================================================================
   AUTENTICAÇÃO
   ========================================================================== */
app.get("/register", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("register", { flash: popFlash(req) });
});

app.post("/register", (req, res) => {
  const { username, email, password, password2 } = req.body;
  const cleanUsername = (username || "").trim();
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanUsername || !cleanEmail || !password) {
    flashError(req, "Preencha todos os campos.");
    return res.redirect("/register");
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(cleanUsername)) {
    flashError(req, "Usuário deve ter 3-20 caracteres (letras, números, _).");
    return res.redirect("/register");
  }
  if (password.length < 6) {
    flashError(req, "A senha precisa ter pelo menos 6 caracteres.");
    return res.redirect("/register");
  }
  if (password !== password2) {
    flashError(req, "As senhas não coincidem.");
    return res.redirect("/register");
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ? OR email = ?").get(cleanUsername, cleanEmail);
  if (existing) {
    flashError(req, "Já existe uma conta com esse usuário ou e-mail.");
    return res.redirect("/register");
  }

  const hash = bcrypt.hashSync(password, 10);
  const colors = ["#7c3aed","#dc2626","#ea580c","#16a34a","#0891b2","#2563eb","#db2777"];
  const color = colors[Math.floor(Math.random()*colors.length)];
  const info = db.prepare("INSERT INTO users (username, email, password_hash, avatar_color) VALUES (?,?,?,?)")
    .run(cleanUsername, cleanEmail, hash, color);

  req.session.user = { id: info.lastInsertRowid, username: cleanUsername, avatar_color: color };
  res.redirect("/");
});

app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("login", { flash: popFlash(req), next: req.query.next || "/" });
});

app.post("/login", (req, res) => {
  const { identifier, password, next } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ? OR email = ?")
    .get((identifier||"").trim(), (identifier||"").trim().toLowerCase());

  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    flashError(req, "Usuário/e-mail ou senha incorretos.");
    return res.redirect("/login");
  }
  req.session.user = { id: user.id, username: user.username, avatar_color: user.avatar_color };
  res.redirect(next && next.startsWith("/") ? next : "/");
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/* ==========================================================================
   HOME / BUSCA
   ========================================================================== */
app.get("/", (req, res) => {
  const q = (req.query.q || "").trim();
  let mangaList;
  if (q) {
    mangaList = db.prepare(`
      SELECT manga.*, users.username AS author_username,
        (SELECT COUNT(*) FROM chapters WHERE chapters.manga_id = manga.id) AS chapter_count
      FROM manga JOIN users ON users.id = manga.author_id
      WHERE manga.title LIKE ? OR manga.genre LIKE ?
      ORDER BY manga.updated_at DESC
    `).all(`%${q}%`, `%${q}%`);
  } else {
    mangaList = db.prepare(`
      SELECT manga.*, users.username AS author_username,
        (SELECT COUNT(*) FROM chapters WHERE chapters.manga_id = manga.id) AS chapter_count
      FROM manga JOIN users ON users.id = manga.author_id
      ORDER BY manga.updated_at DESC
      LIMIT 60
    `).all();
  }
  res.render("home", { mangaList, q, flash: popFlash(req) });
});

/* ==========================================================================
   PAINEL DO USUÁRIO / BIBLIOTECA
   ========================================================================== */
app.get("/dashboard", requireLogin, (req, res) => {
  const myManga = db.prepare(`
    SELECT manga.*, (SELECT COUNT(*) FROM chapters WHERE chapters.manga_id = manga.id) AS chapter_count
    FROM manga WHERE author_id = ? ORDER BY updated_at DESC
  `).all(req.session.user.id);
  res.render("dashboard", { myManga, flash: popFlash(req) });
});

app.get("/library", requireLogin, (req, res) => {
  const saved = db.prepare(`
    SELECT manga.*, users.username AS author_username,
      (SELECT COUNT(*) FROM chapters WHERE chapters.manga_id = manga.id) AS chapter_count
    FROM bookmarks
    JOIN manga ON manga.id = bookmarks.manga_id
    JOIN users ON users.id = manga.author_id
    WHERE bookmarks.user_id = ?
    ORDER BY bookmarks.created_at DESC
  `).all(req.session.user.id);
  res.render("library", { saved });
});

app.get("/notifications", requireLogin, (req, res) => {
  const notifications = db.prepare(`
    SELECT notifications.*, manga.title AS manga_title, manga.slug AS manga_slug,
           manga.cover_path, chapters.number AS chapter_number, chapters.title AS chapter_title
    FROM notifications
    JOIN manga ON manga.id = notifications.manga_id
    JOIN chapters ON chapters.id = notifications.chapter_id
    WHERE notifications.user_id = ?
    ORDER BY notifications.created_at DESC
    LIMIT 100
  `).all(req.session.user.id);

  db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0").run(req.session.user.id);
  res.locals.unreadNotifications = 0;

  res.render("notifications", { notifications });
});

app.get("/profile/:username", (req, res) => {
  const user = db.prepare("SELECT id, username, bio, avatar_color, created_at FROM users WHERE username = ?").get(req.params.username);
  if (!user) return res.status(404).render("404");
  const mangaList = db.prepare(`
    SELECT manga.*, (SELECT COUNT(*) FROM chapters WHERE chapters.manga_id = manga.id) AS chapter_count
    FROM manga WHERE author_id = ? ORDER BY created_at DESC
  `).all(user.id);
  res.render("profile", { profileUser: user, mangaList });
});

/* ==========================================================================
   CRIAR / EDITAR / EXCLUIR MANGÁ
   ========================================================================== */
app.get("/manga/new", requireLogin, (req, res) => {
  res.render("manga_form", { flash: popFlash(req), manga: null });
});

app.post("/manga/new", requireLogin, (req, res) => {
  uploadCover.single("cover")(req, res, (err) => {
    if (err) { flashError(req, err.message); return res.redirect("/manga/new"); }

    const { title, description, genre, status } = req.body;
    if (!title || !title.trim()) {
      flashError(req, "O título é obrigatório.");
      return res.redirect("/manga/new");
    }
    const slug = uniqueSlug(title.trim());
    const coverPath = req.file ? `/uploads/covers/${req.file.filename}` : "";

    const info = db.prepare(`
      INSERT INTO manga (title, slug, description, cover_path, genre, status, author_id)
      VALUES (?,?,?,?,?,?,?)
    `).run(title.trim(), slug, (description||"").trim(), coverPath, (genre||"").trim(), status || "em andamento", req.session.user.id);

    res.redirect(`/manga/${slug}`);
  });
});

app.get("/manga/:slug/edit", requireLogin, (req, res) => {
  const manga = getMangaBySlug(req.params.slug);
  if (!manga) return res.status(404).render("404");
  if (manga.author_id !== req.session.user.id) return res.status(403).send("Você não é o autor deste mangá.");
  res.render("manga_form", { flash: popFlash(req), manga });
});

app.post("/manga/:slug/edit", requireLogin, (req, res) => {
  const manga = getMangaBySlug(req.params.slug);
  if (!manga) return res.status(404).render("404");
  if (manga.author_id !== req.session.user.id) return res.status(403).send("Você não é o autor deste mangá.");

  uploadCover.single("cover")(req, res, (err) => {
    if (err) { flashError(req, err.message); return res.redirect(`/manga/${manga.slug}/edit`); }
    const { title, description, genre, status } = req.body;
    const coverPath = req.file ? `/uploads/covers/${req.file.filename}` : manga.cover_path;

    db.prepare(`
      UPDATE manga SET title=?, description=?, genre=?, status=?, cover_path=?, updated_at=datetime('now')
      WHERE id=?
    `).run((title||manga.title).trim(), (description||"").trim(), (genre||"").trim(), status||manga.status, coverPath, manga.id);

    res.redirect(`/manga/${manga.slug}`);
  });
});

app.post("/manga/:slug/delete", requireLogin, (req, res) => {
  const manga = getMangaBySlug(req.params.slug);
  if (!manga) return res.status(404).render("404");
  if (manga.author_id !== req.session.user.id) return res.status(403).send("Você não é o autor deste mangá.");
  db.prepare("DELETE FROM manga WHERE id = ?").run(manga.id); // cascata apaga capítulos, páginas, favoritos, comentários
  res.redirect("/dashboard");
});

/* ==========================================================================
   PÁGINA DE DETALHE DO MANGÁ
   ========================================================================== */
app.get("/manga/:slug", (req, res) => {
  const manga = getMangaBySlug(req.params.slug);
  if (!manga) return res.status(404).render("404");

  const chapters = db.prepare(`
    SELECT chapters.*, (SELECT COUNT(*) FROM pages WHERE pages.chapter_id = chapters.id) AS page_count
    FROM chapters WHERE manga_id = ? ORDER BY number ASC
  `).all(manga.id);

  const comments = db.prepare(`
    SELECT comments.*, users.username, users.avatar_color
    FROM comments JOIN users ON users.id = comments.user_id
    WHERE manga_id = ? ORDER BY comments.created_at DESC LIMIT 100
  `).all(manga.id);

  const bookmarked = req.session.user ? isBookmarked(req.session.user.id, manga.id) : false;
  const isOwner = req.session.user ? req.session.user.id === manga.author_id : false;

  res.render("manga_detail", { manga, chapters, comments, bookmarked, isOwner, flash: popFlash(req) });
});

app.post("/manga/:slug/bookmark", requireLogin, (req, res) => {
  const manga = getMangaBySlug(req.params.slug);
  if (!manga) return res.status(404).render("404");
  const existing = db.prepare("SELECT id FROM bookmarks WHERE user_id = ? AND manga_id = ?").get(req.session.user.id, manga.id);
  if (existing) db.prepare("DELETE FROM bookmarks WHERE id = ?").run(existing.id);
  else db.prepare("INSERT INTO bookmarks (user_id, manga_id) VALUES (?,?)").run(req.session.user.id, manga.id);
  res.redirect(`/manga/${manga.slug}`);
});

app.post("/manga/:slug/comment", requireLogin, (req, res) => {
  const manga = getMangaBySlug(req.params.slug);
  if (!manga) return res.status(404).render("404");
  const body = (req.body.body || "").trim().slice(0, 1000);
  if (body) {
    db.prepare("INSERT INTO comments (manga_id, user_id, body) VALUES (?,?,?)").run(manga.id, req.session.user.id, body);
  }
  res.redirect(`/manga/${manga.slug}#comentarios`);
});

/* ==========================================================================
   CAPÍTULOS
   ========================================================================== */
app.get("/manga/:slug/chapter/new", requireLogin, (req, res) => {
  const manga = getMangaBySlug(req.params.slug);
  if (!manga) return res.status(404).render("404");
  if (manga.author_id !== req.session.user.id) return res.status(403).send("Você não é o autor deste mangá.");
  res.render("chapter_form", { manga, flash: popFlash(req) });
});

app.post("/manga/:slug/chapter/new", requireLogin, (req, res) => {
  const manga = getMangaBySlug(req.params.slug);
  if (!manga) return res.status(404).render("404");
  if (manga.author_id !== req.session.user.id) return res.status(403).send("Você não é o autor deste mangá.");

  uploadPages.array("pages", 100)(req, res, (err) => {
    if (err) { flashError(req, err.message); return res.redirect(`/manga/${manga.slug}/chapter/new`); }

    const number = parseFloat(req.body.number);
    const title = (req.body.title || "").trim();
    if (isNaN(number)) {
      flashError(req, "Informe um número de capítulo válido.");
      return res.redirect(`/manga/${manga.slug}/chapter/new`);
    }
    if (!req.files || req.files.length === 0) {
      flashError(req, "Envie pelo menos uma imagem de página.");
      return res.redirect(`/manga/${manga.slug}/chapter/new`);
    }
    const dup = db.prepare("SELECT id FROM chapters WHERE manga_id = ? AND number = ?").get(manga.id, number);
    if (dup) {
      flashError(req, `Já existe um capítulo ${number} para este mangá.`);
      return res.redirect(`/manga/${manga.slug}/chapter/new`);
    }

    const insertChapter = db.prepare("INSERT INTO chapters (manga_id, number, title) VALUES (?,?,?)");
    const insertPage = db.prepare("INSERT INTO pages (chapter_id, page_order, image_path) VALUES (?,?,?)");
    const insertNotification = db.prepare("INSERT INTO notifications (user_id, manga_id, chapter_id) VALUES (?,?,?)");
    const getBookmarkers = db.prepare("SELECT user_id FROM bookmarks WHERE manga_id = ? AND user_id != ?");

    const tx = db.transaction(() => {
      const info = insertChapter.run(manga.id, number, title);
      req.files.forEach((file, idx) => {
        insertPage.run(info.lastInsertRowid, idx + 1, `/uploads/chapters/${file.filename}`);
      });
      db.prepare("UPDATE manga SET updated_at = datetime('now') WHERE id = ?").run(manga.id);

      const bookmarkers = getBookmarkers.all(manga.id, req.session.user.id);
      bookmarkers.forEach(b => insertNotification.run(b.user_id, manga.id, info.lastInsertRowid));
    });
    tx();

    res.redirect(`/manga/${manga.slug}`);
  });
});

app.post("/manga/:slug/chapter/:number/delete", requireLogin, (req, res) => {
  const manga = getMangaBySlug(req.params.slug);
  if (!manga) return res.status(404).render("404");
  if (manga.author_id !== req.session.user.id) return res.status(403).send("Você não é o autor deste mangá.");
  db.prepare("DELETE FROM chapters WHERE manga_id = ? AND number = ?").run(manga.id, parseFloat(req.params.number));
  res.redirect(`/manga/${manga.slug}`);
});

app.get("/manga/:slug/chapter/:number", (req, res) => {
  const manga = getMangaBySlug(req.params.slug);
  if (!manga) return res.status(404).render("404");
  const number = parseFloat(req.params.number);
  const chapter = db.prepare("SELECT * FROM chapters WHERE manga_id = ? AND number = ?").get(manga.id, number);
  if (!chapter) return res.status(404).render("404");

  const pages = db.prepare("SELECT * FROM pages WHERE chapter_id = ? ORDER BY page_order ASC").all(chapter.id);

  const allChapters = db.prepare("SELECT number FROM chapters WHERE manga_id = ? ORDER BY number ASC").all(manga.id);
  const idx = allChapters.findIndex(c => c.number === number);
  const prevChapter = idx > 0 ? allChapters[idx-1].number : null;
  const nextChapter = idx >= 0 && idx < allChapters.length - 1 ? allChapters[idx+1].number : null;

  if (req.session.user) {
    db.prepare(`
      INSERT INTO reading_progress (user_id, manga_id, chapter_id, updated_at)
      VALUES (?,?,?, datetime('now'))
      ON CONFLICT(user_id, manga_id) DO UPDATE SET chapter_id = excluded.chapter_id, updated_at = datetime('now')
    `).run(req.session.user.id, manga.id, chapter.id);
  }

  res.render("chapter_reader", { manga, chapter, pages, prevChapter, nextChapter });
});

/* ==========================================================================
   ERROS
   ========================================================================== */
app.use((req, res) => res.status(404).render("404"));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Erro no servidor: " + err.message);
});

app.listen(PORT, () => {
  console.log(`Manga site rodando em http://localhost:${PORT}`);
});

module.exports = app;
