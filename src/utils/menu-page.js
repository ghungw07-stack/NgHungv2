/** Parse an optional page argument while keeping the menu on a valid page. */
export function parseMenuPage(value, totalPages) {
  const maxPage = Math.max(1, Number.parseInt(totalPages, 10) || 1);
  const page = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(page) || page < 1) return 1;
  return Math.min(page, maxPage);
}
