export const MENU_HELP_COOLDOWN_SECONDS = 20;

export function getCommandCooldownSeconds(command, customerCommand = {}) {
  // `menu` được resolve về command chuẩn `help`, nên hai cách gọi dùng chung
  // một bộ đếm và không thể đổi alias để né cooldown.
  if (command?.name === "help") return MENU_HELP_COOLDOWN_SECONDS;
  return Number(customerCommand.countdown ?? command?.countdown ?? 0);
}
