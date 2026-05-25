require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');

const botToken = process.env.BOT_TOKEN;
if (!botToken) {
  console.error('BOT_TOKEN is not set in environment variables');
  process.exit(1);
}

const bot = new Telegraf(botToken);

// Simple start command
bot.start((ctx) => ctx.reply('👋 Selamat datang! Bot siap mencatat transaksi Anda.'));

// Helper to parse simple transaction messages like "makan siang 25rb"
function parseTransaction(message) {
  const regex = /(\w+)\s+([\d,.]+)\s*(rb|k|ribu|juta)?/i;
  const match = message.match(regex);
  if (!match) return null;
  let amount = match[2].replace(/[.,]/g, '');
  const unit = match[3] ? match[3].toLowerCase() : '';
  if (unit.startsWith('rb') || unit.startsWith('ribu')) amount = parseInt(amount) * 1000;
  else if (unit.startsWith('k')) amount = parseInt(amount) * 1000;
  else if (unit.startsWith('juta')) amount = parseInt(amount) * 1000000;
  else amount = parseInt(amount);
  return {
    type: 'expense',
    description: match[1],
    amount: amount
  };
}

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const parsed = parseTransaction(text);
  if (!parsed) {
    await ctx.reply('⚠️ Tidak dapat mengerti transaksi. Kirim contoh: "makan siang 25rb"');
    return;
  }
  // Here you would store to DB; for demo we just echo back
  await ctx.reply(`✅ Tercatat: ${parsed.description} - Rp${parsed.amount.toLocaleString()}`);
});

bot.launch().then(() => console.log('🤖 Bot launched'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
