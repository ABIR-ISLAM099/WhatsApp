const express = require('express');
const fs      = require('fs');
const pino    = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');

const router = express.Router();

// ── Random ID generator ───────────────────────
function makeid(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result  = '';
  for (let i = 0; i < length; i++)
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

// ── Remove session folder ─────────────────────
function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
}

// ════════════════════════════════════════════
//   GET /?number=880XXXXXXXXXX
// ════════════════════════════════════════════
router.get('/', async (req, res) => {
  const id  = makeid();
  let   num = req.query.number;

  if (!num) return res.send({ code: 'Number required' });

  async function IMRAN_MD_PAIR_CODE() {
    const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);

    try {
      // ── Exact Sigma MD socket setup ───────────
      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys:  makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: 'fatal' }).child({ level: 'fatal' })
          ),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
        browser: ['Chrome (Linux)', '', ''],
      });

      // ── Request pair code ─────────────────────
      if (!sock.authState.creds.registered) {
        await delay(1500);
        num = num.replace(/[^0-9]/g, '');
        const code = await sock.requestPairingCode(num);
        if (!res.headersSent) await res.send({ code });
      }

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect } = s;

        // ── Connected ──────────────────────────
        if (connection === 'open') {
          await delay(5000);

          // creds.json → base64
          const data    = fs.readFileSync(`./temp/${id}/creds.json`);
          await delay(800);
          const b64data = Buffer.from(data).toString('base64');

          // Send session ID text
          const session = await sock.sendMessage(sock.user.id, {
            text: 'IMRAN-MD;;;' + b64data,
          });

          // Send info message (quoted)
          const IMRAN_MD_TEXT =
            `\n╔════◇\n` +
            `║ *『 WAOW YOU CHOOSE IMRAN-MD 』*\n` +
            `║ _You complete first step to making Bot._\n` +
            `╚════════════════════════╝\n` +
            `╔═════◇\n` +
            `║  『••• 𝗩𝗶𝘀𝗶𝘁 𝗙𝗼𝗿 𝗛𝗲𝗹𝗽 •••』\n` +
            `║ *Owner:* _https://wa.me/+8801689903267_\n` +
            `║ *Facebook:* _https://facebook.com/Imran.Ahmed099_\n` +
            `║ *Note:* _Don't provide your SESSION_ID to_\n` +
            `║ _anyone otherwise they can access your account!_\n` +
            `╚════════════════════════╝`;

          await sock.sendMessage(
            sock.user.id,
            { text: IMRAN_MD_TEXT },
            { quoted: session }
          );

          await delay(100);
          await sock.ws.close();
          return removeFile('./temp/' + id);
        }

        // ── Reconnect on non-logout error ──────
        if (
          connection === 'close' &&
          lastDisconnect?.error?.output?.statusCode !== 401
        ) {
          await delay(10000);
          IMRAN_MD_PAIR_CODE();
        }
      });

    } catch (err) {
      console.log('[PAIR] Error:', err.message);
      removeFile('./temp/' + id);
      if (!res.headersSent) await res.send({ code: 'Service Unavailable' });
    }
  }

  return await IMRAN_MD_PAIR_CODE();
});

module.exports = router;
