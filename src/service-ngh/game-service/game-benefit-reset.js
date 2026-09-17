export function getGameBenefitResetSpec(type) {
  switch (String(type || "").trim().toLowerCase()) {
    case "all":
      return {
        label: "Daily, Cứu trợ, Trợ cấp và thưởng Hội viên",
        fields: {
          lastDailyReward: null,
          lastRescueAt: null,
          lastWeeklyAllowanceWeek: null,
          lastAllowanceAt: null,
          allowanceFundWeek: null,
          allowanceFundUsed: "0",
          lastMemberRewardDay: null,
          lastMemberRewardAt: null,
        },
      };
    case "daily":
      return { label: "Daily", fields: { lastDailyReward: null } };
    case "cuutro":
    case "cứutrợ":
    case "cứu-trợ":
      return { label: "Cứu trợ", fields: { lastRescueAt: null } };
    case "trocap":
    case "trợcấp":
    case "trợ-cấp":
      return {
        label: "Trợ cấp",
        fields: {
          lastWeeklyAllowanceWeek: null,
          lastAllowanceAt: null,
          allowanceFundWeek: null,
          allowanceFundUsed: "0",
        },
      };
    case "hoivien":
    case "hội-viên":
      return { label: "thưởng Hội viên", fields: { lastMemberRewardDay: null, lastMemberRewardAt: null } };
    default:
      return null;
  }
}

export function canUseGameBenefitReset(botId, senderId, checkBotLeader) {
  const normalizedSenderId = senderId == null ? "" : String(senderId);
  return normalizedSenderId !== "" && checkBotLeader(botId, normalizedSenderId);
}
