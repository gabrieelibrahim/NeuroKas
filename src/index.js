require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const pino = require('pino');
const logger = pino();
const rateLimit = require('telegraf-ratelimit');
const { parseTransaction } = require('./parser');
const { saveTransaction, getBalance } = require('./db');

const botToken = process.env.BOT_TOKEN;
if (!botToken) {
  logger.error('BOT_TOKEN is not set in environment variables');
  process.exit(1);
}

const bot = new Telegraf(botToken);
// Global middlewares
bot.use(rateLimit({
  window: 60_000, // 1 menit
  limit: 20,      // maks 20 per menit per user
  keyGenerator: (ctx) => ctx.from?.id.toString() || 'anonymous'
}));

// Error handling
bot.catch((err, ctx) => {
  logger.error('Bot error', err);
});

// Command to show balance
bot.command('saldo', async (ctx) => {
  const result = await getBalance(ctx.from.id);
  if (result.error) {
    logger.error('Gagal mendapatkan saldo', result.error);
    return ctx.reply('⚠️ Tidak dapat mengambil saldo.');
  }
  const balance = result.balance || 0;
  const formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(balance);
  await ctx.reply(`💰 Saldo Anda: ${formatted}`);
});
bot.start((ctx) => ctx.reply('👋 Selamat datang! Bot siap mencatat transaksi Anda.'));

// Helper to parse simple transaction messages like "makan siang 25rb"

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const parsed = parseTransaction(text);
  if (!parsed) {
    await ctx.reply('⚠️ Tidak dapat mengerti transaksi. Kirim contoh: "makan siang 25rb"');
    return;
  }
  // Simpan ke Supabase DB dengan user_id = ctx.from.id
  const saveResult = await saveTransaction(ctx.from.id, parsed);
  if (saveResult.error) {
    logger.error('Gagal menyimpan transaksi', saveResult.error);
    await ctx.reply('⚠️ Gagal menyimpan transaksi, coba lagi nanti.');
    return;
  }
  await ctx.reply(`✅ Tercatat: ${parsed.description} - Rp${parsed.amount.toLocaleString()}`);
});

bot.launch().then(() => logger.info('🤖 Bot launched'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
