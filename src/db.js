// src/db.js
// Supabase client wrapper for NeuroCash AI bot
// Stores transactions and provides query helpers.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL or SUPABASE_KEY not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Save a transaction for a given Telegram user.
 * @param {number} telegramId - Telegram user ID (bigint)
 * @param {{description:string, amount:number, type?:string, category?:string}} txn
 * @returns {Promise<object>} result object containing data or error
 */
async function saveTransaction(telegramId, txn) {
  // Resolve user id (internal) or create user if not exists
  const { data: user, error: userErr } = await supabase
    .from('User')
    .select('id')
    .eq('telegram_id', telegramId)
    .single();

  if (userErr && userErr.code !== 'PGRST116') {
    // Unexpected error
    return { error: userErr };
  }

  let userId = user?.id;
  if (!userId) {
    // Create user record
    const { data: newUser, error: createErr } = await supabase
      .from('User')
      .insert({ telegram_id: telegramId })
      .select('id')
      .single();
    if (createErr) return { error: createErr };
    userId = newUser.id;
  }

  const { data, error } = await supabase
    .from('Transaction')
    .insert({
      user_id: userId,
      type: txn.type || 'expense',
      amount: txn.amount,
      category: txn.category || 'Uncategorized',
      description: txn.description || null,
    })
    .select()
    .single();

  return { data, error };
}

/**
 * Get balance (sum of amounts) for a Telegram user.
 * @param {number} telegramId
 * @returns {Promise<number>} total balance (positive = income, negative = expense)
 */
async function getBalance(telegramId) {
  const { data: user, error: userErr } = await supabase
    .from('User')
    .select('id')
    .eq('telegram_id', telegramId)
    .single();

  if (userErr && userErr.code === 'PGRST116') {
    return { balance: 0 };
  }
  if (userErr) return { error: userErr };

  const { data, error } = await supabase
    .rpc('get_user_balance', { uid: user.id }); // assumes a Postgres function
  if (error) return { error };
  return { balance: data || 0 };
}

/**
 * Delete all transactions for a given Telegram user.
 * @param {number} telegramId
 */
async function resetTransactions(telegramId) {
  const { data: user, error: userErr } = await supabase
    .from('User')
    .select('id')
    .eq('telegram_id', telegramId)
    .single();

  if (userErr && userErr.code === 'PGRST116') {
    return { success: true }; // No user, nothing to delete
  }
  if (userErr) return { error: userErr };

  const { error } = await supabase
    .from('Transaction')
    .delete()
    .eq('user_id', user.id);
  
  if (error) return { error };
  return { success: true };
}

module.exports = { saveTransaction, getBalance, resetTransactions };
