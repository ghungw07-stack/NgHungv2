export function createDefaultAutoRaiLinkConfig(defaultIntervalMinutes = 30) {
  return {
    enabled: false,
    revision: 0,
    homeGroupId: "",
    homeGroupLink: "",
    content: "",
    replyContent: "✅ Đã chéo thành công! Bạn vào nhóm mình xem nha.",
    returnContent: "🔁 Link trả từ nhóm {group}:",
    returnLinkEnabled: true,
    intervalMinutes: defaultIntervalMinutes,
    whitelist: [],
    advertisedGroups: [],
    lastBroadcastAt: 0,
    lastCrossedAt: {},
  };
}

export function normalizeAutoRaiLinkConfig(rawConfig = {}, defaultIntervalMinutes = 30) {
  const defaults = createDefaultAutoRaiLinkConfig(defaultIntervalMinutes);
  const config = { ...defaults, ...rawConfig };
  config.enabled = config.enabled === true;
  config.revision = Math.max(0, Number.isSafeInteger(Number(config.revision)) ? Number(config.revision) : 0);
  config.homeGroupId = String(config.homeGroupId || "");
  config.homeGroupLink = String(config.homeGroupLink || "");
  config.content = String(config.content || "");
  config.replyContent = String(config.replyContent ?? defaults.replyContent);
  config.returnContent = String(config.returnContent ?? defaults.returnContent);
  config.returnLinkEnabled = config.returnLinkEnabled !== false;
  config.intervalMinutes = Number(config.intervalMinutes) || defaultIntervalMinutes;
  config.whitelist = [...new Set((config.whitelist || []).map(String))];
  config.advertisedGroups = [...new Set((config.advertisedGroups || []).map(String))];
  config.lastCrossedAt = config.lastCrossedAt && typeof config.lastCrossedAt === "object"
    ? config.lastCrossedAt
    : {};
  return config;
}

export function nextAutoRaiLinkRevision(config) {
  return Math.max(0, Number(config?.revision) || 0) + 1;
}

export function resetAutoRaiLinkConfig(config, defaultIntervalMinutes = 30) {
  return {
    ...createDefaultAutoRaiLinkConfig(defaultIntervalMinutes),
    revision: nextAutoRaiLinkRevision(config),
  };
}

export function isAutoRaiLinkRunActive(config, revision) {
  return config?.enabled === true && Number(config.revision || 0) === Number(revision || 0);
}
