const permissionMap = { all: "everyone", adminBot: "admin", adminBox: "admin", adminLevelHigh: "leader" };

export function applyCommandContracts(legacyCommands, registry) {
  for (const legacy of legacyCommands || []) {
    const command = registry.resolve(legacy.name);
    if (!command || command.name.toLowerCase() !== String(legacy.name).toLowerCase()) continue;
    command.permission = permissionMap[legacy.permission] || legacy.permission || command.permission;
    command.cooldownMs = Number(legacy.countdown || 0) * 1_000;
    if (typeof legacy.active === "boolean") command.active = legacy.active;
    for (const alias of legacy.alias || legacy.aliases || []) registry.addAlias(command, alias);
  }
  return registry;
}

export function auditCommandContracts(legacyCommands, registry) {
  const mismatches = [];
  for (const legacy of legacyCommands) {
    const command = registry.resolve(legacy.name);
    if (!command || command.name.toLowerCase() !== legacy.name.toLowerCase()) continue;
    const expectedAliases = new Set((legacy.alias || legacy.aliases || []).map((value) => String(value).toLowerCase()));
    const actualAliases = new Set((command.aliases || []).map((value) => String(value).toLowerCase()));
    for (const alias of expectedAliases) if (!actualAliases.has(alias)) mismatches.push({ name: legacy.name, field: "alias", expected: alias, actual: "missing" });
    const expectedPermission = permissionMap[legacy.permission] || legacy.permission;
    if (expectedPermission && command.permission !== expectedPermission) mismatches.push({ name: legacy.name, field: "permission", expected: expectedPermission, actual: command.permission });
    const expectedCooldown = Number(legacy.countdown || 0) * 1_000;
    if (Number(command.cooldownMs || 0) !== expectedCooldown) mismatches.push({ name: legacy.name, field: "cooldownMs", expected: expectedCooldown, actual: Number(command.cooldownMs || 0) });
    if (typeof legacy.active === "boolean" && command.active !== legacy.active) mismatches.push({ name: legacy.name, field: "active", expected: legacy.active, actual: command.active });
  }
  return mismatches;
}
