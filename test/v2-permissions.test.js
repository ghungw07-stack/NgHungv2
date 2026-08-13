import assert from "node:assert/strict";
import test from "node:test";
import { createPermissionService, Permission } from "../src-v2/core/permissions.js";

test("leader and admin permissions are separated", () => {
  const permissions = createPermissionService({ botId: "bot", mainBotId: "main", ownerIds: ["leader"], adminIds: ["admin"] });
  assert.equal(permissions.allows(Permission.LEADER, "leader"), true);
  assert.equal(permissions.allows(Permission.LEADER, "admin"), false);
  assert.equal(permissions.allows(Permission.ADMIN, "admin"), true);
  assert.equal(permissions.allows(Permission.ADMIN, "guest"), false);
  assert.equal(permissions.allows(Permission.EVERYONE, "guest"), true);
});
