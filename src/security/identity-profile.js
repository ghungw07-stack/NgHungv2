// Không lấy hồ sơ của UID khác làm bằng chứng cấp quyền cho người đang gọi.
export function getIdentityProfile(response, userId) {
  if (userId == null || String(userId) === "") return null;
  const profiles = response?.profiles;
  if (!profiles || typeof profiles !== "object") return null;
  for (const key of [String(userId), `${userId}_0`]) {
    if (Object.hasOwn(profiles, key) && profiles[key]) return profiles[key];
  }
  return null;
}
