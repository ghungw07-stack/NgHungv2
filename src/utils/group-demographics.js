export function normalizeMemberId(member) {
  const raw = typeof member === "object" && member !== null
    ? member.id ?? member.uid ?? member.userId ?? member.memId
    : member;
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const versionedId = value.match(/^(\d+)_\d+$/);
  return versionedId ? versionedId[1] : value;
}

export function normalizeGender(value) {
  if (value === 0 || value === "0" || /^male$|^nam$/i.test(String(value))) return "male";
  if (value === 1 || value === "1" || /^female$|^nữ$|^nu$/i.test(String(value))) return "female";
  return "unknown";
}

export function calculateGenderStats(memberIds, profiles = {}) {
  const counts = { male: 0, female: 0, unknown: 0 };
  for (const id of memberIds) {
    const profile = profiles[id] || profiles[String(id)];
    counts[normalizeGender(profile?.gender ?? profile?.genderId)]++;
  }
  const total = memberIds.length;
  const percent = (count) => total === 0 ? 0 : Number(((count * 100) / total).toFixed(1));
  return {
    total,
    ...counts,
    malePercent: percent(counts.male),
    femalePercent: percent(counts.female),
    unknownPercent: percent(counts.unknown),
  };
}
