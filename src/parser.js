function parseTransaction(message) {
  const regex = /(.+?)\s+([\d.,]+)\s*(rb|k|ribu|juta)?/i;
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

module.exports = { parseTransaction };
