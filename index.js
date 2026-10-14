require("dotenv").config();
const fs = require("fs");
const { Telegraf, Markup } = require("telegraf");
const chain = require("./chain");
const { trending } = require("./trends");
const { decide } = require("./analytics");

const bot = new Telegraf(process.env.BOT_TOKEN);
const SOL_PRICE_USD = 109, SCALE_AT_USD = 1000, GAS = 0.05, DEV_BUY = 0.05;
const FILE = "state.json";
const load = () => fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE))
  : { wallet: null, coins: [], budget: 0.5, mode: "STARTER", spam: false };
const STATE = load();
const save = () => fs.writeFileSync(FILE, JSON.stringify(STATE, null, 2));
let pending = null, pendingKind = "trend", lastTrends = [], spamOn = false;

const menu = () => Markup.inlineKeyboard([
  [Markup.button.callback("💼 Add Wallet", "add"), Markup.button.callback("🪙 See Coins", "coins")],
  [Markup.button.callback("🔥 Make Coin", "make"), Markup.button.callback("📈 Trending", "trend")],
  [Markup.button.callback("😴 Spam Mode", "spam"), Markup.button.callback("💰 Balance", "bal")],
  [Markup.button.callback("ℹ️ Info", "info")]]);
const pickKind = () => Markup.inlineKeyboard([
  [Markup.button.callback("✨ Use a trend", "gen:trend")],
  [Markup.button.callback("📋 Copy a trending coin", "gen:copy")],
  [Markup.button.callback("🏠 Menu", "home")]]);
const yesno = () => Markup.inlineKeyboard([
  [Markup.button.callback("✅ Good", "fire"), Markup.button.callback("🔁 New one", "reroll")]]);
const live = () => Markup.inlineKeyboard([
  [Markup.button.callback("💰 Pull Money", "pull")], [Markup.button.callback("🏠 Menu", "home")]]);

async function refreshBudget() {
  const sol = await chain.walletBalanceSol(), usd = sol * SOL_PRICE_USD;
  STATE.mode = usd >= SCALE_AT_USD ? "SCALED" : "STARTER";
  STATE.budget = Math.min(usd >= SCALE_AT_USD ? 3.0 : 0.5, Math.max(0, sol - GAS) * 0.35);
  save();
}
const NARR = [["Elon", "a degen SpaceX intern"], ["Cat", "the CEO cat"], ["AI", "an AI that rugs for fun"], ["Frog", "a frog that day-trades"], ["Trump", "a gold meme machine"]];
async function ideaFresh() {
  const t = NARR[Math.floor(Math.random() * NARR.length)];
  return { ticker: t[0].toUpperCase().slice(0, 4) + Math.floor(10 + Math.random() * 89),
    name: t[0] + " " + ["Goblin", "King", "Bot"][Math.floor(Math.random() * 3)],
    desc: `Meet ${t[1]}. 100% vibes 🚀` };
}
async function ideaCopy() {
  const tr = await trending(8);
  if (!tr.length) return ideaFresh();
  const t = tr[Math.floor(Math.random() * tr.length)];
  return { ticker: t.symbol.slice(0, 6), name: t.name.slice(0, 24), desc: `Copying the ${t.symbol} trend 🚀` };
}
async function showIdea(ctx) {
  pending = pendingKind === "copy" ? await ideaCopy() : await ideaFresh();
  ctx.editMessageText(`🍳 Here's one:\n\n*$${pending.ticker}* — ${pending.name}\n${pending.desc}\n\nGood?`,
    { parse_mode: "Markdown", ...yesno() });
}
async function monitor(chatId, coin) {
  const tokens = await chain.tokenBalance(coin.mint);
  const p0 = await chain.priceUsd(coin.mint) || 0;
  const entry = tokens * p0, samples = [p0];
  let peakProfit = 0;
  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 20000));
    const p = await chain.priceUsd(coin.mint); if (!p) continue;
    samples.push(p);
    const value = tokens * p, profit = value - entry;
    if (profit > peakProfit) peakProfit = profit;
    const [should, why] = decide(samples, entry, value, peakProfit);
    if (should) {
      await bot.telegram.sendMessage(chatId, `📉 ${why} — pulling $${coin.ticker}`);
      await chain.sellAll(coin.mint);
      await bot.telegram.sendMessage(chatId, `💰 $${coin.ticker} sold. Money's back. 🦾`);
      return;
    }
  }
}
async function launch(chatId, idea) {
  await bot.telegram.sendMessage(chatId, `🚀 Creating *$${idea.ticker}*…`, { parse_mode: "Markdown" });
  const img = await chain.makeImage(idea.ticker);
  const r = await chain.createCoin({ name: idea.name, symbol: idea.ticker, description: idea.desc, imagePath: img, devBuySol: DEV_BUY });
  if (!r.ok) return bot.telegram.sendMessage(chatId, "❌ launch failed.");
  const coin = { ...idea, mint: r.mint }; STATE.coins.push(coin); save();
  await bot.telegram.sendMessage(chatId, `✅ *$${idea.ticker}* LIVE 🚀\nhttps://dexscreener.com/solana/${r.mint}`,
    { parse_mode: "Markdown", ...live() });
  await bot.telegram.sendMessage(chatId, `👉 Promote it: promotememes.com\nPaste: \`${r.mint}\``, { parse_mode: "Markdown" });
  monitor(chatId, coin);
}

bot.start(ctx => ctx.reply("Yo boss! 🔥 What's the move?", menu()));
bot.action("home", ctx => ctx.editMessageText("🏠 Menu", menu()));
bot.action("info", ctx => ctx.editMessageText(
  "ℹ️ *Everything this bot does*\n\n" +
  "💼 *Add Wallet* — send your wallet's private key (the long random string).\n" +
  "🪙 *See Coins* — coins made so far.\n" +
  "🔥 *Make Coin* — asks: use a trend or copy one → generates a coin → you tap Good or New one.\n" +
  "📈 *Trending* — live trending coins; tap one to copy.\n" +
  "😴 *Spam Mode* — does everything automatically while you sleep.\n" +
  "💰 *Balance* — mode + budget.\n" +
  "💰 *Pull Money* — sells everything now.\n\n" +
  "*Auto rules:* pulls if it loses too much, locks in if it falls back under $500, sells near the top.\n\n" +
  "*Commands:* /start /stop /status",
  { parse_mode: "Markdown", ...menu() }));
bot.action("bal", async ctx => { await refreshBudget();
  ctx.editMessageText(`💰 Mode: ${STATE.mode}\nBudget: ${STATE.budget.toFixed(3)} SOL\nWallet: ${STATE.wallet || "none"}\nCoins: ${STATE.coins.length}`, menu()); });
bot.action("add", ctx => ctx.editMessageText("Send me your wallet's private key (the long random string):"));
bot.action("coins", ctx => ctx.editMessageText(STATE.coins.length
  ? "🪙 " + STATE.coins.slice(-10).map(c => `$${c.ticker}`).join(", ") : "Empty, boss.", menu()));

bot.action("make", ctx => ctx.editMessageText("🔥 Make a coin — how?", pickKind()));
bot.action(["gen:trend", "gen:copy"], ctx => { pendingKind = ctx.match[1]; showIdea(ctx); });
bot.action("reroll", ctx => showIdea(ctx));
bot.action("fire", async ctx => { await ctx.editMessageText("Firing…"); launch(ctx.chat.id, pending); });

bot.action("trend", async ctx => {
  await ctx.editMessageText("📈 Grabbing live trends…");
  lastTrends = await trending(5);
  if (!lastTrends.length) return ctx.editMessageText("No trends — try Make Coin.", menu());
  const rows = lastTrends.map((t, i) => [Markup.button.callback(`${i + 1}. $${t.symbol} — ${t.name}`, `pick:${i}`)]);
  rows.push([Markup.button.callback("🏠 Menu", "home")]);
  ctx.editMessageText("📈 *Trending now* — tap one to copy:", { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
});
bot.action(/^pick:(\d+)$/, ctx => {
  const t = lastTrends[+ctx.match[1]]; if (!t) return;
  pendingKind = "copy";
  pending = { ticker: t.symbol.slice(0, 6), name: t.name.slice(0, 24), desc: `Copying the ${t.symbol} trend 🚀` };
  ctx.editMessageText(`Copying:\n\n*$${pending.ticker}* — ${pending.name}\nGood?`, { parse_mode: "Markdown", ...yesno() });
});
bot.action("pull", async ctx => { const c = STATE.coins.at(-1);
  await ctx.editMessageText("💰 Pulling everything…");
  if (c) { await chain.sellAll(c.mint); ctx.reply(`Done — $${c.ticker} sold. 🦾`, menu()); } });

bot.action("spam", async ctx => {
  spamOn = !spamOn; STATE.spam = spamOn; save();
  if (!spamOn) return ctx.editMessageText("😴 Spam OFF.", menu());
  await refreshBudget();
  ctx.editMessageText(`😴 Spam Mode ON — fully automatic, no input needed. Budget ${STATE.budget.toFixed(3)} SOL.`, menu());
  const chatId = ctx.chat.id;
  (async () => {
    while (spamOn) {
      const bal = await chain.walletBalanceSol();
      if (bal < GAS + 0.03) { await bot.telegram.sendMessage(chatId, "💤 Out of SOL — spam stopped."); spamOn = false; STATE.spam = false; save(); return; }
      pendingKind = Math.random() < 0.5 ? "trend" : "copy";
      await launch(chatId, pendingKind === "copy" ? await ideaCopy() : await ideaFresh());
      await new Promise(r => setTimeout(r, 30000));
    }
  })();
});
bot.command("stop", ctx => { spamOn = false; STATE.spam = false; save(); ctx.reply("Stopped. 😴"); });
bot.command("status", ctx => ctx.reply(`mode=${STATE.mode} spam=${spamOn} coins=${STATE.coins.length}`));
bot.on("text", ctx => { const t = ctx.message.text.trim();
  if (t.length > 40) { STATE.wallet = t.slice(0, 6) + "…" + t.slice(-4); save(); ctx.reply("Wallet saved 💼", menu()); } });

bot.launch();
console.log("Bot running…");
