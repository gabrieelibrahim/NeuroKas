// src/db.js
// Supabase client wrapper for NeuroCash AI bot

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL or SUPABASE_KEY not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Get or Create user context (User + Active Workspace)
async function getUserContext(telegramId) {
  let { data: user, error: userErr } = await supabase
    .from('User')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (userErr && userErr.code === 'PGRST116') {
    // Create new user
    const { data: newUser, error: createErr } = await supabase
      .from('User')
      .insert({ telegram_id: telegramId })
      .select('*')
      .single();
    if (createErr) return { error: createErr };
    user = newUser;
  } else if (userErr) {
    return { error: userErr };
  }

  // Check if active workspace exists
  if (!user.active_workspace_id) {
    let { data: workspaces } = await supabase
      .from('Workspace')
      .select('*')
      .eq('owner_id', user.id)
      .limit(1);
    
    let activeWs;
    if (!workspaces || workspaces.length === 0) {
      // Create default Workspace
      const { data: newWs } = await supabase
        .from('Workspace')
        .insert({ owner_id: user.id, name: 'Kas Pribadi', icon: '💰' })
        .select('*')
        .single();
      activeWs = newWs;
    } else {
      activeWs = workspaces[0];
    }
    
    if (activeWs) {
      await supabase.from('User').update({ active_workspace_id: activeWs.id }).eq('id', user.id);
      user.active_workspace_id = activeWs.id;
      return { user, activeWorkspace: activeWs };
    }
  }

  // Fetch the active workspace object
  const { data: ws } = await supabase
    .from('Workspace')
    .select('*')
    .eq('id', user.active_workspace_id)
    .single();
    
  return { user, activeWorkspace: ws };
}

// Transaction operations
async function saveTransaction(telegramId, txn) {
  const { user, activeWorkspace, error: ctxErr } = await getUserContext(telegramId);
  if (ctxErr) return { error: ctxErr };
  
  const { data, error } = await supabase
    .from('Transaction')
    .insert({
      user_id: user.id,
      workspace_id: activeWorkspace.id,
      type: txn.type || 'expense',
      amount: txn.amount,
      category: txn.category || 'Uncategorized',
      description: txn.description || null,
    })
    .select()
    .single();

  return { data, activeWorkspace, error };
}

async function getBalance(telegramId) {
  const { user, activeWorkspace, error: ctxErr } = await getUserContext(telegramId);
  if (ctxErr) return { error: ctxErr };

  // Assume the SQL function get_user_balance has been updated to accept uid and wid
  const { data, error } = await supabase
    .rpc('get_user_balance', { uid: user.id, wid: activeWorkspace.id });
  if (error) return { error };
  return { balance: data || 0, activeWorkspace };
}

async function getRecentTransactions(telegramId, limit = 5) {
  const { user, activeWorkspace, error: ctxErr } = await getUserContext(telegramId);
  if (ctxErr) return { error: ctxErr };

  const { data, error } = await supabase
    .from('Transaction')
    .select('*')
    .eq('user_id', user.id)
    .eq('workspace_id', activeWorkspace.id)
    .order('created_at', { ascending: false })
    .limit(limit);
    
  if (error) return { error };
  return { data, activeWorkspace };
}

async function resetTransactions(telegramId) {
  const { user, activeWorkspace, error: ctxErr } = await getUserContext(telegramId);
  if (ctxErr) return { error: ctxErr };

  const { error } = await supabase
    .from('Transaction')
    .delete()
    .eq('user_id', user.id)
    .eq('workspace_id', activeWorkspace.id);
  
  if (error) return { error };
  return { success: true };
}

// Workspace operations
async function getWorkspaces(telegramId) {
  const { user, error: ctxErr } = await getUserContext(telegramId);
  if (ctxErr) return { error: ctxErr };
  
  const { data, error } = await supabase
    .from('Workspace')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true });
    
  return { data, activeWorkspaceId: user.active_workspace_id, error };
}

async function setActiveWorkspace(telegramId, workspaceId) {
  const { data: user, error: userErr } = await supabase
    .from('User')
    .select('id')
    .eq('telegram_id', telegramId)
    .single();
  if (userErr) return { error: userErr };
  
  const { error } = await supabase
    .from('User')
    .update({ active_workspace_id: workspaceId })
    .eq('id', user.id);
    
  return { error };
}

async function createWorkspace(telegramId, name, icon = '📂') {
  const { data: user, error: userErr } = await supabase
    .from('User')
    .select('id')
    .eq('telegram_id', telegramId)
    .single();
  if (userErr) return { error: userErr };
  
  const { data, error } = await supabase
    .from('Workspace')
    .insert({ owner_id: user.id, name, icon })
    .select('*')
    .single();
    
  if (!error && data) {
    await setActiveWorkspace(telegramId, data.id);
  }
  return { data, error };
}

module.exports = { 
  getUserContext,
  saveTransaction, 
  getBalance, 
  resetTransactions, 
  getRecentTransactions,
  getWorkspaces,
  setActiveWorkspace,
  createWorkspace
};
