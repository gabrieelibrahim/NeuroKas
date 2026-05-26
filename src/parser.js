function parseTransaction(message) {
  let type = 'expense';
  let textToParse = message.trim();
  
  if (textToParse.startsWith('+')) {
    type = 'income';
    textToParse = textToParse.substring(1).trim();
  }
  
  const regex = /(.+?)\s+([\d.,]+)\s*(rb|k|ribu|juta)?/i;
  const match = textToParse.match(regex);
  if (!match) return null;
  
  let amount = match[2].replace(/[.,]/g, '');
  const unit = match[3] ? match[3].toLowerCase() : '';
  if (unit.startsWith('rb') || unit.startsWith('ribu')) amount = parseInt(amount) * 1000;
  else if (unit.startsWith('k')) amount = parseInt(amount) * 1000;
  else if (unit.startsWith('juta')) amount = parseInt(amount) * 1000000;
  else amount = parseInt(amount);

  let description = match[1].trim();
  
  if (type === 'expense') {
    const lowerDesc = description.toLowerCase();
    if (lowerDesc.includes('saldo awal') || lowerDesc.includes('masuk') || lowerDesc.includes('gaji') || lowerDesc.includes('bonus')) {
      type = 'income';
    }
  }

  return {
    type: type,
    description: description,
    amount: amount
  };
}

module.exports = { parseTransaction };
