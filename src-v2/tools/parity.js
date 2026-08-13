export function compareCommandParity(legacyCommands, registry) {
  const v2Canonical = new Set(registry.list().map((command) => command.name.toLowerCase()));
  const v2All = new Map();
  for (const command of registry.list()) {
    v2All.set(command.name.toLowerCase(), command.name.toLowerCase());
    for (const alias of command.aliases || []) v2All.set(String(alias).toLowerCase(), command.name.toLowerCase());
  }
  const rows = legacyCommands.map((legacy) => {
    const names = [legacy.name, ...(legacy.alias || legacy.aliases || [])].filter(Boolean).map((value) => String(value).toLowerCase());
    const canonical = String(legacy.name).toLowerCase();
    if (v2Canonical.has(canonical)) return { name: canonical, status: "canonical", mappedTo: canonical };
    const matched = names.find((name) => v2All.has(name));
    return matched ? { name: canonical, status: "alias", mappedTo: v2All.get(matched) } : { name: canonical, status: "missing" };
  });
  return {
    legacyTotal: rows.length,
    canonical: rows.filter((row) => row.status === "canonical").length,
    alias: rows.filter((row) => row.status === "alias").length,
    missing: rows.filter((row) => row.status === "missing").map((row) => row.name),
    rows,
  };
}
