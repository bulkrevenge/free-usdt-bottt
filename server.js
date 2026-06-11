const express = require("express");
const cors    = require("cors");
const https   = require("https");

const app        = express();
const BOT_TOKEN  = "8805582934:AAEBMvYKYxv0u8IZ-ajJQR9tzabn2wwQwxY";
const MINI_APP_URL = "https://nova-prime001.vercel.app/"; // ← change to your Netlify URL

app.use(cors());
app.use(express.json());

// ── Helper: call Telegram Bot API ────────────────────────────────
function telegramPost(method, body) {
  return new Promise((resolve, reject) => {
    const data    = JSON.stringify(body);
    const options = {
      hostname: "api.telegram.org",
      path:     `/bot${BOT_TOKEN}/${method}`,
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res) => {
      let result = "";
      res.on("data", chunk => result += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(result)); }
        catch(e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function telegramGet(method, params) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams(params).toString();
    const url   = `https://api.telegram.org/bot${BOT_TOKEN}/${method}?${query}`;
    https.get(url, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on("error", reject);
  });
}

// ── Health check ─────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "Free USDT Bot — online ✅" });
});

// ── Send withdrawal notification to admin channel ─────────────────
async function notifyWithdrawal({ firstName, username, userId, amount, address, network }) {
  const usernameText = username ? "@" + username : "No username";
  const msg = `
💸 *NEW WITHDRAWAL REQUEST*

👤 *Name:* ${escapeMarkdown(firstName)}
🔗 *Username:* ${usernameText}
🆔 *User ID:* \`${userId}\`

💰 *Amount:* $${Number(amount).toFixed(2)} USDT
🌐 *Network:* ${network.toUpperCase()}
📬 *Wallet Address:*
\`${address}\`

⏰ *Time:* ${new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" })} (WAT)
📊 *Status:* ⏳ Pending
  `.trim();

  await telegramPost("sendMessage", {
    chat_id:    "@paymentchannel",
    text:       msg,
    parse_mode: "MarkdownV2"
  });
}

function escapeMarkdown(text) {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\]/g, "\$&");
}

// ── Webhook — receives all Telegram messages ──────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // always reply 200 fast

  const update = req.body;
  if (!update) return;

  // Handle /start command
  const msg = update.message;
  if (!msg) return;

  const chatId    = msg.chat.id;
  const userId    = msg.from.id;
  const firstName = msg.from.first_name || "Friend";
  const text      = msg.text || "";

  if (text.startsWith("/start")) {
    // Extract referral param — /start 123456789
    const parts    = text.split(" ");
    const refParam = parts[1] ? parts[1].trim() : null;

    // Build Mini App URL — pass referrer ID as startapp param
    const appUrl = refParam && refParam !== String(userId)
      ? `${MINI_APP_URL}?ref=${refParam}`
      : MINI_APP_URL;

    const welcomeMsg = `
💵 *Welcome to Free USDT Bot, ${firstName}!*

Earn real USDT by completing simple tasks\\!

✅ Join channels to earn USDT
👥 Invite friends & earn *\\$0\\.02* per referral
💸 Withdraw anytime to your wallet

*Minimum withdrawal:* \\$5\\.00 USDT

Tap the button below to open the app and start earning\\! 🚀
    `.trim();

    await telegramPost("sendMessage", {
      chat_id:    chatId,
      text:       welcomeMsg,
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: [[
          {
            text:          "💵 Open Free USDT App",
            web_app:       { url: appUrl }
          }
        ],[
          {
            text: "👥 Invite Friends",
            url:  `https://t.me/share/url?url=https://t.me/FreelUsdt_bot?start=${userId}&text=💸 Earn FREE USDT daily! Join me and get $0.20 USDT just for signing up!`
          }
        ]]
      }
    });
  }
});

// ── Withdrawal notification endpoint ─────────────────────────────
app.post("/notify-withdrawal", async (req, res) => {
  const { firstName, username, userId, amount, address, network } = req.body;

  if (!userId || !amount || !address) {
    return res.status(400).json({ ok: false, error: "Missing fields" });
  }

  try {
    await notifyWithdrawal({ firstName, username, userId, amount, address, network });
    return res.json({ ok: true });
  } catch(err) {
    console.error("Notify error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Check membership ─────────────────────────────────────────────
app.post("/check-member", async (req, res) => {
  const { userId, channel } = req.body;

  if (!userId || !channel) {
    return res.status(400).json({ ok: false, error: "Missing userId or channel" });
  }

  try {
    const result = await telegramGet("getChatMember", {
      chat_id: channel,
      user_id: userId
    });

    if (!result.ok) {
      return res.json({ ok: false, member: false, error: result.description || "Not found" });
    }

    const status = result.result?.status;
    const joined = ["member", "administrator", "creator"].includes(status);

    return res.json({ ok: true, member: joined, status });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Set webhook helper ────────────────────────────────────────────
app.get("/set-webhook", async (req, res) => {
  const webhookUrl = req.query.url;
  if (!webhookUrl) return res.json({ error: "Pass ?url=YOUR_RENDER_URL/webhook" });

  const result = await telegramGet("setWebhook", { url: webhookUrl + "/webhook" });
  res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Free USDT Bot running on port ${PORT}`));
