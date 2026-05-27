require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const pino = require('pino');
const logger = pino();
const rateLimit = require('telegraf-ratelimit');
const { parseTransaction } = require('./parser');
const { 
  getUserContext,
  saveTransaction, 
  getBalance, 
  resetTransactions, 
  getRecentTransactions,
  getAllTransactions,
  getWorkspaces,
  setActiveWorkspace,
  createWorkspace,
  deleteWorkspace
} = require('./db');

const botToken = process.env.BOT_TOKEN;
if (!botToken) {
  logger.error('BOT_TOKEN is not set in environment variables');
  process.exit(1);
}

const bot = new Telegraf(botToken);

bot.use(rateLimit({
  window: 60_000, // 1 menit
  limit: 20,      // maks 20 per menit per user
  keyGenerator: (ctx) => ctx.from?.id.toString() || 'anonymous'
}));

// Tracking bot messages for cleanup
const userMessages = new Map();

function trackMessage(userId, messageId) {
  if (!userMessages.has(userId)) {
    userMessages.set(userId, []);
  }
  userMessages.get(userId).push(messageId);
}

async function cleanChat(ctx) {
  const userId = ctx.from.id;
  const msgs = userMessages.get(userId) || [];
  for (const msgId of msgs) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, msgId);
    } catch (e) {
      // Ignore if message already deleted or too old
    }
  }
  userMessages.set(userId, []);
}

bot.catch((err, ctx) => {
  logger.error('Bot error', err);
});

bot.command('clear', async (ctx) => {
  await cleanChat(ctx);
  await sendMainMenu(ctx);
});

bot.command('saldo', async (ctx) => {
  const { balance, activeWorkspace, error } = await getBalance(ctx.from.id);
  if (error) {
    return ctx.reply('⚠️ Tidak dapat mengambil saldo.');
  }
  const formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(balance);
  const m = await ctx.reply(`💰 Saldo [${activeWorkspace.name}]: ${formatted}`);
  trackMessage(ctx.from.id, m.message_id);
});

bot.command('reset', async (ctx) => {
  const result = await resetTransactions(ctx.from.id);
  if (result.error) {
    return ctx.reply('⚠️ Terjadi kesalahan saat menghapus data Anda.');
  }
  const m = await ctx.reply('🗑️ Semua catatan transaksi pada Kas ini telah berhasil dihapus.\nSaldo Anda sekarang Rp0.');
  trackMessage(ctx.from.id, m.message_id);
});

bot.command('export', async (ctx) => {
  await cleanChat(ctx);
  const { data: txns, activeWorkspace, error } = await getAllTransactions(ctx.from.id);
  if (error || !txns) {
    const m = await ctx.reply('⚠️ Gagal mengambil data transaksi.');
    trackMessage(ctx.from.id, m.message_id);
    return;
  }
  
  if (txns.length === 0) {
    const m = await ctx.reply(`Belum ada transaksi di [${activeWorkspace.name}].`);
    trackMessage(ctx.from.id, m.message_id);
    return;
  }
  
  let csvContent = 'Tanggal,Jam,Tipe,Nominal,Kategori,Keterangan\\n';
  txns.forEach(t => {
    const date = new Date(t.created_at);
    const dateStr = date.toLocaleDateString('id-ID');
    const timeStr = date.toLocaleTimeString('id-ID');
    const typeStr = t.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
    
    // escape quotes in description
    const desc = (t.description || '').replace(/"/g, '""');
    
    csvContent += `"${dateStr}","${timeStr}","${typeStr}","${t.amount}","${t.category}","${desc}"\\n`;
  });
  
  try {
    const m = await ctx.replyWithDocument({
      source: Buffer.from(csvContent, 'utf-8'),
      filename: `Laporan_${activeWorkspace.name.replace(/\\s+/g, '_')}.csv`
    }, { caption: `✅ Laporan format CSV untuk kas [${activeWorkspace.name}] siap!` });
    trackMessage(ctx.from.id, m.message_id);
  } catch (err) {
    logger.error('Error sending CSV', err);
    ctx.reply('⚠️ Terjadi kesalahan saat mengirim file CSV.');
  }
  
  await sendMainMenu(ctx);
});

const handleLaporan = async (ctx) => {
  const telId = ctx.from.id;
  const { data: txns, activeWorkspace, error: txnsErr } = await getRecentTransactions(telId, 5);
  const { balance, error: balanceErr } = await getBalance(telId);
  
  if (txnsErr || balanceErr) {
    return ctx.reply('⚠️ Terjadi kesalahan saat mengambil laporan.');
  }
  
  if (!txns || txns.length === 0) {
    const m = await ctx.reply(`Belum ada transaksi di [${activeWorkspace.name}].`);
    trackMessage(telId, m.message_id);
    return;
  }
  
  let msg = `<blockquote>📊 <b>Laporan 5 Transaksi Terakhir (${activeWorkspace.name})</b>\n\n`;
  txns.reverse().forEach((t) => {
    const sign = t.type === 'income' ? '+' : '-';
    const emoji = t.type === 'income' ? '📈' : '📉';
    const amount = new Intl.NumberFormat('id-ID').format(t.amount);
    msg += `${emoji} ${t.description}: ${sign}Rp${amount}\n`;
  });
  
  const formattedBalance = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(balance);
  msg += `\n💰 <b>Total Saldo: ${formattedBalance}</b></blockquote>`;
  
  const m = await ctx.reply(msg, { parse_mode: 'HTML' });
  trackMessage(telId, m.message_id);
};

bot.command('laporan', handleLaporan);

const sendMainMenu = async (ctx) => {
  const telId = ctx.from.id;
  const name = ctx.from?.first_name || ctx.from?.username || 'Pengguna';
  
  const { activeWorkspace, error } = await getUserContext(telId);
  if (error) {
    return ctx.reply('⚠️ Gagal memuat data kas.');
  }

  const wsName = activeWorkspace ? activeWorkspace.name : 'Belum ada Kas';
  
  const combinedMsg = `👋 Halo <b>${name}</b>!\n\n` +
    `Selamat datang di NeuroKas —\nasisten pencatatan kas & keuangan berbasis AI.\n\n` +
    `📂 Kas aktif: <b>${activeWorkspace?.icon || '📁'} ${wsName}</b>\n\n` +
    `<blockquote expandable>` +
    `✨ <b>Fitur NeuroKas</b>\n\n` +
    `• Catat transaksi otomatis\n` +
    `• Scan foto struk\n` +
    `• Cek saldo & laporan\n` +
    `• Insight AI keuangan\n\n` +
    `📖 <b>Contoh penggunaan</b>\n\n` +
    `📉 <b>Pengeluaran</b> awali dengan (-)\n` +
    `    "- makan siang 25rb"\n` +
    `    "- bayar listrik 350k"\n\n` +
    `📈 <b>Pemasukan</b> awali dengan (+)\n` +
    `    "+ gaji 10jt"\n` +
    `    "+ saldo awal 5juta"\n` +
    `⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀` +
    `</blockquote>`;

  const m = await ctx.reply(combinedMsg, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '➕ Tambahkan saldo awal', callback_data: 'btn_saldo_awal' }
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
          { text: '📂 Ganti Kas', callback_data: 'btn_ganti_kas' }
        ]
      ]
    }
  });
  
  trackMessage(telId, m.message_id);
};

bot.start(async (ctx) => {
  await cleanChat(ctx);
  await sendMainMenu(ctx);
});

const backMarkup = { reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'btn_back' }]] } };

bot.action('btn_back', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  return sendMainMenu(ctx);
});

bot.action('btn_saldo_awal', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  userState.set(ctx.from.id, 'WAITING_SALDO_AWAL');
  const m = await ctx.reply('Silakan masukkan nominal saldo awal Anda (contoh: 50000 atau 50k):', {
    reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'btn_cancel_kas' }]] }
  });
  trackMessage(ctx.from.id, m.message_id);
});

bot.action('btn_catat', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  const m = await ctx.reply('Silakan ketik transaksi Anda.\nPengeluaran: "- makan siang 25rb"\nPemasukan: "+ dapat bonus 50k"', backMarkup);
  trackMessage(ctx.from.id, m.message_id);
});
bot.action('btn_scan', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  const m = await ctx.reply('Fitur 📷 Scan Struk (NeuroKas Pro) segera hadir.', backMarkup);
  trackMessage(ctx.from.id, m.message_id);
});
bot.action('btn_saldo', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  const { balance, activeWorkspace, error } = await getBalance(ctx.from.id);
  if (error) return ctx.reply('⚠️ Tidak dapat mengambil saldo.', backMarkup);
  const formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(balance || 0);
  const m = await ctx.reply(`💰 Saldo [${activeWorkspace.name}]: ${formatted}`, backMarkup);
  trackMessage(ctx.from.id, m.message_id);
});
bot.action('btn_laporan', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  return handleLaporan(ctx);
});

bot.action('btn_insight', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  const m = await ctx.reply('Fitur 🤖 AI Insight khusus untuk workspace sedang dipersiapkan.', backMarkup);
  trackMessage(ctx.from.id, m.message_id);
});

bot.action('btn_ganti_kas', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  const { data: workspaces, activeWorkspaceId, error } = await getWorkspaces(ctx.from.id);
  
  if (error || !workspaces) {
    const m = await ctx.reply('⚠️ Gagal mengambil daftar Kas.', backMarkup);
    trackMessage(ctx.from.id, m.message_id);
    return;
  }
  
  const buttons = workspaces.map(ws => {
    const isActive = ws.id === activeWorkspaceId;
    return [{
      text: `${ws.icon} ${ws.name} ${isActive ? '✅' : ''}`,
      callback_data: `sel_ws_${ws.id}`
    }];
  });
  
  buttons.push([{ text: '➕ Buat Kas Baru', callback_data: 'btn_new_kas' }, { text: '🗑 Hapus Kas', callback_data: 'btn_hapus_kas_menu' }]);
  buttons.push([{ text: '🔙 Kembali', callback_data: 'btn_back' }]);
  
  const m = await ctx.reply('📂 Pilih Kas yang ingin Anda gunakan:', {
    reply_markup: {
      inline_keyboard: buttons
    }
  });
  trackMessage(ctx.from.id, m.message_id);
});

bot.action(/sel_ws_(.+)/, async (ctx) => {
  const wsId = ctx.match[1];
  await setActiveWorkspace(ctx.from.id, wsId);
  await ctx.answerCbQuery('✅ Kas berhasil diganti');
  await ctx.deleteMessage().catch(() => {});
  await sendMainMenu(ctx);
});

bot.action('btn_hapus_kas_menu', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  const { data: workspaces, error } = await getWorkspaces(ctx.from.id);
  if (error || !workspaces) {
    const m = await ctx.reply('⚠️ Gagal mengambil daftar Kas.', backMarkup);
    trackMessage(ctx.from.id, m.message_id);
    return;
  }
  
  if (workspaces.length <= 1) {
    const m = await ctx.reply('⚠️ Anda hanya memiliki 1 Kas. Buat kas baru terlebih dahulu sebelum menghapus.', backMarkup);
    trackMessage(ctx.from.id, m.message_id);
    return;
  }
  
  const buttons = workspaces.map(ws => {
    return [{
      text: `🗑 Hapus ${ws.name}`,
      callback_data: `del_ws_${ws.id}`
    }];
  });
  buttons.push([{ text: '🔙 Batal', callback_data: 'btn_ganti_kas' }]);
  
  const m = await ctx.reply('⚠️ Pilih Kas yang ingin Anda HAPUS PERMANEN beserta seluruh transaksinya:', {
    reply_markup: { inline_keyboard: buttons }
  });
  trackMessage(ctx.from.id, m.message_id);
});

bot.action(/del_ws_(.+)/, async (ctx) => {
  const wsId = ctx.match[1];
  const { error } = await deleteWorkspace(ctx.from.id, wsId);
  if (error) {
    await ctx.answerCbQuery(error.message || '⚠️ Gagal menghapus kas');
    return;
  }
  await ctx.answerCbQuery('✅ Kas berhasil dihapus');
  await ctx.deleteMessage().catch(() => {});
  await sendMainMenu(ctx);
});

// Simple state for creating new kas
const userState = new Map();

bot.action('btn_new_kas', async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  userState.set(ctx.from.id, 'WAITING_KAS_NAME');
  const m = await ctx.reply('Silakan ketik NAMA KAS BARU yang ingin Anda buat (contoh: "Kas Komunitas A"):', {
    reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'btn_cancel_kas' }]] }
  });
  trackMessage(ctx.from.id, m.message_id);
});

bot.action('btn_cancel_kas', async (ctx) => {
  userState.delete(ctx.from.id);
  await ctx.deleteMessage().catch(() => {});
  return sendMainMenu(ctx);
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const state = userState.get(ctx.from.id);
  
  if (state === 'WAITING_SALDO_AWAL') {
    userState.delete(ctx.from.id);
    await ctx.deleteMessage().catch(() => {});
    
    const parsed = parseTransaction(`+ saldo awal ${text}`);
    if (!parsed) {
      const m = await ctx.reply('⚠️ Nominal tidak valid. Gagal menambahkan saldo awal.');
      trackMessage(ctx.from.id, m.message_id);
      return sendMainMenu(ctx);
    }
    
    const { data, activeWorkspace, error } = await saveTransaction(ctx.from.id, parsed);
    if (error) {
      const m = await ctx.reply('⚠️ Gagal menyimpan saldo awal.');
      trackMessage(ctx.from.id, m.message_id);
      return sendMainMenu(ctx);
    }
    
    const sign = parsed.type === 'income' ? '+' : '-';
    const m = await ctx.reply(`✅ Saldo awal berhasil ditambahkan (${sign}Rp${parsed.amount.toLocaleString('id-ID')})\n📂 [${activeWorkspace.name}]`);
    trackMessage(ctx.from.id, m.message_id);
    return sendMainMenu(ctx);
  }

  if (state === 'WAITING_KAS_NAME') {
    userState.delete(ctx.from.id);
    await ctx.deleteMessage().catch(() => {}); // delete user msg
    const { error } = await createWorkspace(ctx.from.id, text);
    if (error) {
      const m = await ctx.reply('⚠️ Gagal membuat kas baru.');
      trackMessage(ctx.from.id, m.message_id);
      return sendMainMenu(ctx);
    }
    const m = await ctx.reply(`✅ Kas "${text}" berhasil dibuat dan diaktifkan.`);
    trackMessage(ctx.from.id, m.message_id);
    return sendMainMenu(ctx);
  }

  const parsed = parseTransaction(text);
  if (!parsed) {
    const m = await ctx.reply('⚠️ Tidak dapat mengerti transaksi. Kirim contoh: "makan siang 25rb"');
    trackMessage(ctx.from.id, m.message_id);
    return;
  }
  
  const { data, activeWorkspace, error } = await saveTransaction(ctx.from.id, parsed);
  if (error) {
    logger.error('Gagal menyimpan transaksi', error);
    const errMsg = error.message || JSON.stringify(error);
    const m = await ctx.reply(`⚠️ Gagal menyimpan transaksi: ${errMsg}`);
    trackMessage(ctx.from.id, m.message_id);
    return;
  }
  
  await ctx.deleteMessage().catch(() => {});

  const typeLabel = parsed.type === 'income' ? '📈 Pemasukan' : '📉 Pengeluaran';
  const sign = parsed.type === 'income' ? '+' : '-';
  const m = await ctx.reply(`✅ ${typeLabel}: ${parsed.description} (${sign}Rp${parsed.amount.toLocaleString('id-ID')})\n📂 [${activeWorkspace.name}]`);
  trackMessage(ctx.from.id, m.message_id);
});

bot.launch().then(async () => {
  await bot.telegram.setMyCommands([
    { command: 'start', description: '🏠 Mulai & Lihat Menu' },
    { command: 'clear', description: '🧹 Bersihkan Chat (UI Saja)' },
    { command: 'saldo', description: '💰 Cek Saldo Kas Aktif' },
    { command: 'laporan', description: '📊 Laporan Transaksi Kas Aktif' },
    { command: 'export', description: '📥 Download Laporan (CSV)' },
    { command: 'reset', description: '🗑️ Hapus Catatan Kas Aktif' },
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
