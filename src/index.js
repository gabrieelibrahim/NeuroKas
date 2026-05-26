require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const pino = require('pino');
const logger = pino();
const rateLimit = require('telegraf-ratelimit');
const { parseTransaction } = require('./parser');
const { saveTransaction, getBalance, resetTransactions } = require('./db');

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

// Command to reset all data
bot.command('reset', async (ctx) => {
  const result = await resetTransactions(ctx.from.id);
  if (result.error) {
    logger.error('Gagal mereset transaksi', result.error);
    return ctx.reply('⚠️ Terjadi kesalahan saat menghapus data Anda.');
  }
  await ctx.reply('🗑️ Semua catatan transaksi (termasuk saldo awal) telah berhasil dihapus.\nSaldo Anda sekarang Rp0.');
});
bot.start(async (ctx) => {
  const name = ctx.from.first_name || ctx.from.username || 'Pengguna';
  
  const combinedMsg = `👋 Halo <b>${name}</b>!\n` +
    `Selamat datang di NeuroKas —\nasisten pencatatan kas & keuangan berbasis AI.\n\n` +
    `<blockquote expandable>` +
    `✨ <b>Fitur NeuroKas</b>\n` +
    `• Catat transaksi otomatis\n` +
    `• Scan foto struk\n` +
    `• Cek saldo & laporan\n` +
    `• Insight AI keuangan\n` +
    `──────────────────\n` +
    `📖 <b>Contoh penggunaan</b>\n` +
    `"makan siang 25rb"\n` +
    `"gaji masuk 5 juta"\n` +
    `⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀` +
    `</blockquote>`;

  await ctx.reply(combinedMsg, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🏦 Catat Saldo Awal', callback_data: 'btn_saldo_awal' }
        ],
        [
          { text: '➕ Catat Transaksi', callback_data: 'btn_catat' },
          { text: '📷 Scan Struk', callback_data: 'btn_scan' }
        ],
        [
          { text: '💰 Saldo', callback_data: 'btn_saldo' },
          { text: '📊 Laporan', callback_data: 'btn_laporan' }
        ],
        [
          { text: '🤖 AI Insight', callback_data: 'btn_insight' },
          { text: '❓ Bantuan', callback_data: 'btn_bantuan' }
        ]
      ]
    }
  });
});

// Inline button actions
bot.action('btn_saldo_awal', (ctx) => ctx.reply('Silakan ketik nominal saldo awal Anda.\nContoh: "+ saldo awal 5juta" atau "masuk saldo awal 5juta"'));
bot.action('btn_catat', (ctx) => ctx.reply('Silakan ketik transaksi Anda.\nPengeluaran: "makan siang 25rb"\nPemasukan: "+ dapat bonus 50k"'));
bot.action('btn_scan', (ctx) => ctx.reply('Fitur 📷 Scan Struk segera hadir.'));
bot.action('btn_saldo', async (ctx) => {
  const result = await getBalance(ctx.from.id);
  if (result.error) return ctx.reply('⚠️ Tidak dapat mengambil saldo.');
  const balance = result.balance || 0;
  const formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(balance);
  return ctx.reply(`💰 Saldo Anda: ${formatted}`);
});
bot.action('btn_laporan', (ctx) => ctx.reply('Fitur 📊 Laporan segera hadir.'));
bot.action('btn_insight', (ctx) => ctx.reply('Fitur 🤖 AI Insight segera hadir.'));
bot.action('btn_bantuan', (ctx) => ctx.reply('Cukup ketik pengeluaran atau pemasukan Anda secara langsung (contoh: "makan 20rb"), dan AI akan mencatatnya.'));

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
    const errMsg = saveResult.error.message || JSON.stringify(saveResult.error);
    await ctx.reply(`⚠️ Gagal menyimpan transaksi: ${errMsg}`);
    return;
  }
  
  const typeLabel = parsed.type === 'income' ? '📈 Pemasukan' : '📉 Pengeluaran';
  const sign = parsed.type === 'income' ? '+' : '-';
  await ctx.reply(`✅ ${typeLabel}: ${parsed.description} (${sign}Rp${parsed.amount.toLocaleString()})`);
});

bot.launch().then(async () => {
  await bot.telegram.setMyCommands([
    { command: 'start', description: '🏠 Mulai & Lihat Menu' },
    { command: 'saldo', description: '💰 Cek Saldo' },
    { command: 'reset', description: '🗑️ Hapus Semua Catatan' },
  ]);
  try {
    await bot.telegram.callApi('setChatMenuButton', {
      menu_button: { type: 'commands' }
    });
    logger.info('✅ Menu button set');
  } catch (err) {
    logger.error('❌ Gagal set menu button:', err.message);
  }
  logger.info('🤖 Bot launched');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
