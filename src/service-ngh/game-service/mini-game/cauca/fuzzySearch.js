function removeVietnameseAccents(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

// Tính độ tương đồng giữa 2 chuỗi (Levenshtein distance)
function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Tính similarity score (0-1, cao = giống nhau hơn)
function calculateSimilarity(str1, str2) {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
}

// Fuzzy match với support index và tên
export function fuzzyMatch(input, items, options = {}) {
  const {
    threshold = 0.6, // Ngưỡng similarity
    maxResults = 5,
    searchFields = ['name'], // Fields để search
    returnIndex = false // Có trả về index không
  } = options;

  if (!input || !items || items.length === 0) {
    return null;
  }

  // Chuẩn hóa input
  const normalizedInput = removeVietnameseAccents(input.toLowerCase().trim());

  // Kiểm tra nếu input là số (index)
  const inputIndex = parseInt(normalizedInput) - 1; // 1-based to 0-based
  if (!isNaN(inputIndex) && inputIndex >= 0 && inputIndex < items.length) {
    return {
      item: items[inputIndex],
      index: inputIndex,
      confidence: 1.0,
      method: 'index'
    };
  }

  // Fuzzy search
  const matches = [];

  items.forEach((item, index) => {
    for (const field of searchFields) {
      if (item[field]) {
        const fieldValue = removeVietnameseAccents(item[field].toLowerCase());
        const similarity = calculateSimilarity(normalizedInput, fieldValue);

        if (similarity >= threshold) {
          matches.push({
            item,
            index,
            similarity,
            field,
            method: 'fuzzy'
          });
          break; // Chỉ match field đầu tiên
        }
      }
    }
  });

  // Sắp xếp theo độ tương đồng
  matches.sort((a, b) => b.similarity - a.similarity);

  // Trả về kết quả tốt nhất
  if (matches.length > 0) {
    const bestMatch = matches[0];
    return {
      item: bestMatch.item,
      index: bestMatch.index,
      confidence: bestMatch.similarity,
      method: bestMatch.method,
      field: bestMatch.field
    };
  }

  return null;
}

// Tìm item trong shop
export function findShopItem(input, shopItems) {
  return fuzzyMatch(input, shopItems, {
    searchFields: ['name', 'id'],
    threshold: 0.5
  });
}

// Tìm item trong inventory
export function findInventoryItem(input, inventoryItems) {
  return fuzzyMatch(input, inventoryItems, {
    searchFields: ['name', 'id'],
    threshold: 0.5
  });
}

// Tìm map location
export function findMapLocation(input, maps) {
  return fuzzyMatch(input, maps, {
    searchFields: ['name', 'id'],
    threshold: 0.5
  });
}

// Tìm recipe
export function findRecipe(input, recipes) {
  return fuzzyMatch(input, recipes, {
    searchFields: ['name', 'id'],
    threshold: 0.5
  });
}

// Validate và parse input
export function parseItemInput(input, items, context = 'item') {
  if (!input || !items) return null;

  const trimmed = input.trim();

  // Nếu là số
  const index = parseInt(trimmed);
  if (!isNaN(index)) {
    const itemIndex = index - 1; // 1-based
    if (itemIndex >= 0 && itemIndex < items.length) {
      return {
        item: items[itemIndex],
        index: itemIndex,
        method: 'index',
        originalInput: trimmed
      };
    }
  }

  // Fuzzy search
  let result = null;
  switch (context) {
    case 'shop':
      result = findShopItem(trimmed, items);
      break;
    case 'inventory':
      result = findInventoryItem(trimmed, items);
      break;
    case 'map':
      result = findMapLocation(trimmed, items);
      break;
    case 'recipe':
      result = findRecipe(trimmed, items);
      break;
    default:
      result = fuzzyMatch(trimmed, items);
  }

  if (result) {
    return {
      ...result,
      originalInput: trimmed
    };
  }

  return null;
}

