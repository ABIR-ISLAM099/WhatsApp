"use strict";

// ── Suppress Baileys noise ────────────────────
const _ow = process.stdout.write.bind(process.stdout);
const _oe = process.stderr.write.bind(process.stderr);
const NOISE = ['"level"', "SessionEntry", "chainKey", "Bad MAC",
               "Failed to decrypt", "libsignal", "session_cipher"];
process.stdout.write = (c, ...a) => {
  const s = c.toString();
  if (s.trim().startsWith("{") && s.includes('"level"')) return true;
  if (NOISE.some(p => s.includes(p))) return true;
  return _ow(c, ...a);
};
process.stderr.write = (c, ...a) => {
  const s = c.toString();
  if (NOISE.some(p => s.includes(p))) return true;
  return _oe(c, ...a);
};

const express  = require("express");
const fs       = require("fs-extra");
const P        = require("pino");
const QRCode   = require("qrcode");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(express.json());

const sessions = {};

function removeSession(id) {
  try { fs.removeSync(`sessions/${id}`); } catch {}
  delete sessions[id];
}

// ── Send creds.json to WhatsApp ────────────────
async function sendCredsMessage(sock, sessionPath) {
  try {
    const credsPath = `${sessionPath}/creds.json`;
    if (!fs.existsSync(credsPath)) return;

    const fileMsg = await sock.sendMessage(sock.user.id, {
      document: fs.readFileSync(credsPath),
      fileName: "creds.json",
      mimetype: "application/json",
      caption:  "📄 Your session file — keep it safe!",
    });

    await sock.sendMessage(sock.user.id, {
      text:
        "╔══════════════════════════╗\n" +
        "║   🤖  *IMRAN BOT*        ║\n" +
        "║   _Session Generated!_  ║\n" +
        "╚══════════════════════════╝\n\n" +
        "✅ *সংযোগ সফল হয়েছে!*\n\n" +
        "📌 *ব্যবহার করতে:*\n" +
        "উপরের *creds.json* ফাইলটি তোমার bot folder এ রাখো:\n" +
        "_project/creds.json_\n\n" +
        "👤 *Owner:* https://wa.me/+8801689903267\n" +
        "📘 *Facebook:* https://facebook.com/Imran.Ahmed099\n\n" +
        "⚠️ *সতর্কতা:*\n" +
        "_এই ফাইলটি কাউকে দিও না!_\n" +
        "_এটি তোমার WhatsApp এর সম্পূর্ণ access দেয়।_",
    }, { quoted: fileMsg });

    console.log("✅ creds.json sent:", sock.user.id);
  } catch (err) {
    console.error("❌ Send failed:", err.message);
  }
}

// ── Create socket helper ───────────────────────
async function createSocket(sessionPath) {
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version }          = await fetchLatestBaileysVersion();
  const logger               = P({ level: "silent" });

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser:             Browsers.ubuntu("Chrome"),
    printQRInTerminal:   false,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);
  return sock;
}

// ════════════════════════════════════════════
//   PAIR CODE — GET /pair?number=8801XXXXXXX
// ════════════════════════════════════════════
app.get("/pair", async (req, res) => {
  const number = req.query.number?.replace(/[^0-9]/g, "");
  if (!number || number.length < 7)
    return res.json({ error: "Enter a valid number" });

  // Kill old session
  if (sessions[number]) {
    try { sessions[number].end(); } catch {}
    removeSession(number);
  }

  const id          = number;
  const sessionPath = `sessions/${id}`;
  await fs.ensureDir(sessionPath);

  let responded = false;
  const reply = (data) => { if (!responded) { responded = true; res.json(data); } };

  try {
    const sock      = await createSocket(sessionPath);
    sessions[id]    = sock;

    // ── Request pair code ──────────────────────
    await new Promise(r => setTimeout(r, 2500));
    try {
      const code = await sock.requestPairingCode(number);
      reply({ code });
    } catch (err) {
      reply({ error: "Pair code failed: " + err.message });
      try { sock.end(); } catch {}
      removeSession(id);
      return;
    }

    // ── Connection events ──────────────────────
    sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        console.log("✅ PAIR connected:", id);
        await sendCredsMessage(sock, sessionPath);
        setTimeout(() => { try { sock.end(); } catch {} removeSession(id); }, 15000);
      }
      if (connection === "close") {
        const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) removeSession(id);
      }
    });

  } catch (err) {
    console.error("[PAIR]", err.message);
    reply({ error: err.message });
    removeSession(id);
  }
});

// ════════════════════════════════════════════
//   QR CODE — GET /qr
// ════════════════════════════════════════════
app.get("/qr", async (req, res) => {
  const id          = "qr_" + Date.now();
  const sessionPath = `sessions/${id}`;
  await fs.ensureDir(sessionPath);

  let responded = false;
  const reply = (data) => { if (!responded) { responded = true; res.json(data); } };

  try {
    const sock   = await createSocket(sessionPath);
    sessions[id] = sock;

    // 60s timeout
    const timeout = setTimeout(() => {
      reply({ error: "Timeout. Try again." });
      try { sock.end(); } catch {}
      removeSession(id);
    }, 60000);

    sock.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
      // ── QR এলে response দাও ─────────────────
      if (qr) {
        clearTimeout(timeout);
        try {
          const qrImg = await QRCode.toDataURL(qr, {
            width: 280, margin: 2,
            color: { dark: "#111", light: "#fff" },
          });
          reply({ qr: qrImg });
        } catch {
          reply({ error: "QR generation failed" });
          try { sock.end(); } catch {}
          removeSession(id);
        }
      }

      if (connection === "open") {
        console.log("✅ QR connected:", id);
        await sendCredsMessage(sock, sessionPath);
        setTimeout(() => { try { sock.end(); } catch {} removeSession(id); }, 15000);
      }

      if (connection === "close") {
        const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) removeSession(id);
        if (!responded) reply({ error: "Connection closed. Try again." });
      }
    });

  } catch (err) {
    console.error("[QR]", err.message);
    reply({ error: err.message });
    removeSession(id);
  }
});

// ── Admin stats ────────────────────────────────
app.get("/sessions", async (req, res) => {
  let list = [];
  try { list = await fs.readdir("sessions"); } catch {}
  res.json({ total: list.length, active: Object.keys(sessions).length, list });
});

// ── Start ──────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  🤖 IMRAN BOT — Pro Linker`);
  console.log(`  ✅ Running → http://localhost:${PORT}\n`);
});
