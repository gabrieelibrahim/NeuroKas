require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const pino = require('pino');
const logger = pino();
const rateLimit = require('telegraf-ratelimit');
const { parseTransaction } = require('./parser');
const { saveTransaction, getBalance, resetTransactions, getRecentTransactions } = require('./db');

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

// Laporan logic
const handleLaporan = async (ctx) => {
  const telId = ctx.from.id;
  const [balanceRes, txnsRes] = await Promise.all([
    getBalance(telId),
    getRecentTransactions(telId, 5)
  ]);
  
  if (balanceRes.error || txnsRes.error) {
    return ctx.reply('⚠️ Terjadi kesalahan saat mengambil laporan.');
  }
  
  const balance = balanceRes.balance || 0;
  const txns = txnsRes.data || [];
  
  if (txns.length === 0) {
    return ctx.reply('Belum ada catatan transaksi. Coba catat pengeluaran atau pemasukan pertama Anda!');
  }
  
  let msg = `<blockquote>📊 <b>Laporan 5 Transaksi Terakhir</b>\n\n`;
  txns.reverse().forEach((t) => {
    const sign = t.type === 'income' ? '+' : '-';
    const emoji = t.type === 'income' ? '📈' : '📉';
    const amount = new Intl.NumberFormat('id-ID').format(t.amount);
    msg += `${emoji} ${t.description}: ${sign}Rp${amount}\n`;
  });
  
  const formattedBalance = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(balance);
  msg += `\n💰 <b>Total Saldo: ${formattedBalance}</b></blockquote>`;
  
  await ctx.reply(msg, { parse_mode: 'HTML' });
};

bot.command('laporan', handleLaporan);

const sendMainMenu = async (ctx) => {
  const name = ctx.from?.first_name || ctx.from?.username || 'Pengguna';
  
  const combinedMsg = `👋 Halo <b>${name}</b>!\n` +
    `Selamat datang di NeuroKas —\nasisten pencatatan kas & keuangan berbasis AI.\n\n` +
    `<blockquote expandable>` +
    `✨ <b>Fitur NeuroKas</b>\n` +
    `• Catat transaksi otomatis\n` +
    `• Scan foto struk\n` +
    `• Cek saldo & laporan\n` +
    `• Insight AI keuangan\n` +
    `──────────────────\n` +
    `📖 <b>Cara Penggunaan</b>\n\n` +
    `📉 <b>Pengeluaran</b> — awali dengan -\n` +
    `"- makan siang 25rb"\n` +
    `"- bayar listrik 350k"\n\n` +
    `📈 <b>Pemasukan</b> — awali dengan +\n` +
    `"+ gaji 10jt"\n` +
    `"+ saldo awal 5juta"\n` +
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
};

bot.start(sendMainMenu);

bot.action('btn_back', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  return sendMainMenu(ctx);
});

// Inline button actions
const backMarkup = { reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'btn_back' }]] } };

bot.action('btn_saldo_awal', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  return ctx.reply('Silakan ketik nominal saldo awal Anda.\nContoh: "+ saldo awal 5juta" atau "masuk saldo awal 5juta"', backMarkup);
});
bot.action('btn_catat', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  return ctx.reply('Silakan ketik transaksi Anda.\nPengeluaran: "- makan siang 25rb"\nPemasukan: "+ dapat bonus 50k"', backMarkup);
});
bot.action('btn_scan', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  return ctx.reply('Fitur 📷 Scan Struk segera hadir.', backMarkup);
});
bot.action('btn_saldo', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  const result = await getBalance(ctx.from.id);
  if (result.error) return ctx.reply('⚠️ Tidak dapat mengambil saldo.', backMarkup);
  const balance = result.balance || 0;
  const formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(balance);
  return ctx.reply(`💰 Saldo Anda: ${formatted}`, backMarkup);
});
bot.action('btn_laporan', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  return handleLaporan(ctx);
});
bot.action('btn_insight', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  return ctx.reply('Fitur 🤖 AI Insight segera hadir.', backMarkup);
});
bot.action('btn_bantuan', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  return ctx.reply('Cukup ketik pengeluaran atau pemasukan Anda secara langsung (contoh: "- makan 20rb" atau "+ gaji 5jt"), dan AI akan mencatatnya.', backMarkup);
});

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
  
  // Hapus pesan user agar chat bersih
  await ctx.deleteMessage().catch(() => {});

  const typeLabel = parsed.type === 'income' ? '📈 Pemasukan' : '📉 Pengeluaran';
  const sign = parsed.type === 'income' ? '+' : '-';
  await ctx.reply(`✅ ${typeLabel}: ${parsed.description} (${sign}Rp${parsed.amount.toLocaleString('id-ID')})`);
});

bot.launch().then(async () => {
  await bot.telegram.setMyCommands([
    { command: 'start', description: '🏠 Mulai & Lihat Menu' },
    { command: 'saldo', description: '💰 Cek Saldo' },
    { command: 'laporan', description: '📊 Lihat Laporan Transaksi' },
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
