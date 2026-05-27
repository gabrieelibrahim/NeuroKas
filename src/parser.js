function parseTransaction(message) {
  let type = 'expense';
  let textToParse = message.trim();
  
  if (textToParse.startsWith('+')) {
    type = 'income';
    textToParse = textToParse.substring(1).trim();
  } else if (textToParse.startsWith('-')) {
    type = 'expense';
    textToParse = textToParse.substring(1).trim();
  }
  
  // Try matching amount at the end: "makan 20k"
  let regexEnd = /^(.*?)\s*([\d.,]+)\s*(rb|k|ribu|juta|jt)?$/i;
  // Try matching amount at the start: "20k makan"
  let regexStart = /^([\d.,]+)\s*(rb|k|ribu|juta|jt)?\s+(.*)$/i;
  
  let match = textToParse.match(regexEnd);
  let amountStr, unit, description;

  if (match) {
    description = match[1] ? match[1].trim() : '';
    amountStr = match[2];
    unit = match[3] ? match[3].toLowerCase() : '';
  } else {
    match = textToParse.match(regexStart);
    if (match) {
      amountStr = match[1];
      unit = match[2] ? match[2].toLowerCase() : '';
      description = match[3] ? match[3].trim() : '';
    } else {
      return null;
    }
  }

  if (!description) {
    description = type === 'income' ? 'Pemasukan' : 'Pengeluaran';
  }
  
  let amount = amountStr.replace(/[.,]/g, '');
  if (unit.startsWith('rb') || unit.startsWith('ribu') || unit.startsWith('k')) amount = parseInt(amount) * 1000;
  else if (unit.startsWith('juta') || unit.startsWith('jt')) amount = parseInt(amount) * 1000000;
  else amount = parseInt(amount);
  
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
