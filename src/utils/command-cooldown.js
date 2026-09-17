export const MENU_HELP_COOLDOWN_SECONDS = 20;

export function getCommandCooldownSeconds(command, customerCommand = {}) {
  // Giữ nguyên countdown của bot/command; không áp thêm giới hạn toàn cục.
  return Math.max(0, Number(customerCommand.countdown ?? command?.countdown ?? 0));
}
