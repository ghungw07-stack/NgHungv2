export const Permission = Object.freeze({ EVERYONE: "everyone", ADMIN: "admin", LEADER: "leader" });

export function createPermissionService({ botId, mainBotId, ownerIds = [], adminIds = [] }) {
  const owners = new Set(ownerIds.map(String));
  const admins = new Set(adminIds.map(String));
  const isLeader = (userId) => String(userId) === String(mainBotId) || owners.has(String(userId));
  return {
    isLeader,
    isAdmin: (userId) => isLeader(userId) || String(userId) === String(botId) || admins.has(String(userId)),
    allows(permission, userId) {
      if (permission === Permission.EVERYONE) return true;
      if (permission === Permission.LEADER) return isLeader(userId);
      return this.isAdmin(userId);
    },
  };
}
