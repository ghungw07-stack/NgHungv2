const FOLLOW_PREFIX_PATTERN = /^(?:hat\s+giong|hat)\s+/;

export function normalizePTGFollowName(value) {
  let normalized = String(value || '')
    .trim()
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(FOLLOW_PREFIX_PATTERN, '')
    .replace(/^cay\s+/, '')
    .trim();

  normalized = normalized
    .replace(/\b(?:carot|carrot)\b/g, 'ca rot')
    .replace(/\b(?:ngo|corn)\b/g, 'bap')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized;
}

export function matchesPTGFollow(item, followedName) {
  const expected = normalizePTGFollowName(followedName);
  if (!expected) return false;

  const names = [item?.vi, item?.name, item?.en]
    .map(normalizePTGFollowName)
    .filter(Boolean);

  const expectedTokens = expected.split(' ');
  const compactExpected = expected.replace(/\s+/g, '');

  return names.some((name) => {
    if (name === expected || name.includes(expected)) return true;
    if (name.replace(/\s+/g, '') === compactExpected) return true;

    // Người dùng thường nhập tên rút gọn nhưng không liền nhau, ví dụ
    // "vòi đỏ" cho "Vòi tưới siêu cao cấp (đỏ)".
    if (expectedTokens.length < 2) return false;
    const nameTokens = new Set(name.split(' '));
    return expectedTokens.every((token) => nameTokens.has(token));
  });
}

export function isPTGFollowItemAvailable(item, categoryKey, now = Date.now()) {
  if (categoryKey === 'weather') {
    return Number.isFinite(Date.parse(item?.endTime)) && Date.parse(item.endTime) > now;
  }
  return Number(item?.stock) > 0;
}

function getFollowDisplayName(item) {
  return String(item?.vi || item?.name || item?.en || 'Không rõ tên').trim();
}

export function buildPTGFollowNotification(matches) {
  const uniqueMatches = [];
  const seen = new Set();

  for (const match of matches || []) {
    const name = getFollowDisplayName(match?.item);
    const categoryKey = match?.categoryKey || 'unknown';
    const identity = match?.item?.id ?? normalizePTGFollowName(name);
    const key = `${categoryKey}:${identity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueMatches.push({ name, categoryKey });
  }

  if (!uniqueMatches.length) return '';
  if (uniqueMatches.length === 1) {
    const match = uniqueMatches[0];
    return match.categoryKey === 'weather'
      ? `Thời tiết "${match.name}" đang xuất hiện!`
      : `Mặt hàng "${match.name}" hiện đã có trong cửa hàng!`;
  }

  const lines = uniqueMatches.map((match) =>
    `• ${match.categoryKey === 'weather' ? 'Thời tiết' : 'Mặt hàng'}: ${match.name}`
  );
  return `Các mục bạn theo dõi hiện đã xuất hiện:\n${lines.join('\n')}`;
}

export function buildPTGFollowMentionPrefix(matches) {
  const users = [];
  const seenUserIds = new Set();

  for (const match of matches || []) {
    const userId = String(match?.entry?.userId || '').trim();
    if (!userId || seenUserIds.has(userId)) continue;
    seenUserIds.add(userId);
    users.push({
      uid: userId,
      name: String(match?.entry?.userName || 'Người dùng').trim() || 'Người dùng',
    });
  }

  let text = '';
  const mentions = [];
  for (const user of users) {
    if (text) text += ', ';
    const pos = text.length;
    text += user.name;
    mentions.push({ pos, len: user.name.length, uid: user.uid });
  }

  return { text, mentions };
}

export function getPTGFollowRecipientKey(entry) {
  return [entry?.botId, entry?.threadId, entry?.type]
    .map((value) => String(value ?? ''))
    .join(':');
}

export function chunkPTGFollowMatchesByFollowers(matches, maxFollowers = 15) {
  const limit = Math.max(1, Math.floor(Number(maxFollowers) || 15));
  const matchesByUser = new Map();

  for (const match of matches || []) {
    const userId = String(match?.entry?.userId || '').trim();
    const key = userId || `unknown:${matchesByUser.size}`;
    const userMatches = matchesByUser.get(key) || [];
    userMatches.push(match);
    matchesByUser.set(key, userMatches);
  }

  const batches = [];
  let currentBatch = [];
  let followerCount = 0;
  for (const userMatches of matchesByUser.values()) {
    if (followerCount >= limit) {
      batches.push(currentBatch);
      currentBatch = [];
      followerCount = 0;
    }
    currentBatch.push(...userMatches);
    followerCount++;
  }
  if (currentBatch.length) batches.push(currentBatch);
  return batches;
}

export function getPTGFollowAvailabilityState(wasInStock, isAvailable) {
  const inStock = Boolean(isAvailable);
  return {
    inStock,
    shouldNotify: inStock && wasInStock !== true,
  };
}
