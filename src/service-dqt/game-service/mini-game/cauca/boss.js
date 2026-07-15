import { loadBossState, saveBossState, loadPlayerData, savePlayerData } from './dataManager.js';
 
import { getActiveGames } from '../index.js';
import { gameTypeCauCa, GAME_MESSAGE_TIME_TO_LIVE } from './game-manager.js';
export class Boss {
  constructor(bossData) {
    this.id = bossData.id || `boss_${Date.now()}`;
    this.name = bossData.name || 'Boss Huyền Bí';
    this.description = bossData.description || 'Một con boss mạnh mẽ xuất hiện định kỳ.';
    this.maxHp = bossData.maxHp || 100000;
    this.currentHp = bossData.currentHp || this.maxHp;
    this.attack = bossData.attack || 5000;
    this.defense = bossData.defense || 3000;
    this.spawnTime = bossData.spawnTime || Date.now();
    this.endTime = bossData.endTime || (Date.now() + 15 * 60 * 1000); // 15 minutes
    this.status = bossData.status || 'active'; // active, defeated
    this.participants = bossData.participants || {}; // {playerId: {damage: number, attacks: number}}
    this.rewards = bossData.rewards || {
      exp: 50000,
      money: 100000,
      tickets: 5
    };
  }

  isExpired() {
    return Date.now() > this.endTime;
  }

  attackBoss(playerId, playerName, damage) {
    if (this.status !== 'active') {
      return { success: false, message: 'Boss đã bị đánh bại hoặc hết hạn.' };
    }

    if (!this.participants[playerId]) {
      this.participants[playerId] = { damage: 0, attacks: 0, name: playerName };
    }

    this.participants[playerId].damage += damage;
    this.participants[playerId].attacks += 1;
    this.currentHp = Math.max(0, this.currentHp - damage);

    let defeated = false;
    if (this.currentHp <= 0) {
      this.status = 'defeated';
      defeated = true;
    }

    return {
      success: true,
      damage,
      currentHp: this.currentHp,
      defeated,
      message: defeated ? `🎉 ${playerName} đã đánh bại boss!` : `💥 ${playerName} gây ${damage} sát thương. HP boss: ${this.currentHp}/${this.maxHp}`
    };
  }

  getTopParticipants(limit = 5) {
    return Object.entries(this.participants)
      .sort(([, a], [, b]) => b.damage - a.damage)
      .slice(0, limit)
      .map(([id, data]) => ({ id, ...data }));
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      maxHp: this.maxHp,
      currentHp: this.currentHp,
      attack: this.attack,
      defense: this.defense,
      spawnTime: this.spawnTime,
      endTime: this.endTime,
      status: this.status,
      participants: this.participants,
      rewards: this.rewards
    };
  }
}

export class BossService {
  constructor() {
    this.activeBoss = null;
    this.lastSpawnTime = 0;
    this.spawnInterval = 24 * 60 * 60 * 1000; // 24 hours
    this.loadBossState();
  }

  loadBossState() {
    const state = loadBossState();
    if (state.activeBoss) {
      this.activeBoss = new Boss(state.activeBoss);
      // Check if expired
      if (this.activeBoss.isExpired() && this.activeBoss.status === 'active') {
        this.activeBoss.status = 'expired';
        this.saveBossState();
      }
    }
    this.lastSpawnTime = state.lastSpawnTime || 0;
  }

  saveBossState() {
    const state = {
      activeBoss: this.activeBoss ? this.activeBoss.toJSON() : null,
      lastSpawnTime: this.lastSpawnTime
    };
    saveBossState(state);
  }

  shouldSpawnBoss() {
    return !this.activeBoss || (this.activeBoss.status !== 'active' && Date.now() - this.lastSpawnTime >= this.spawnInterval);
  }

  spawnBoss() {
    if (!this.shouldSpawnBoss()) return null;

    const bossNames = ['Rồng Lửa', 'Quái Vật Biển Sâu', 'Boss Huyền Bí', 'Thủy Quái Khổng Lồ', 'Quỷ Biển'];
    const randomName = bossNames[Math.floor(Math.random() * bossNames.length)];
    const randomHp = 50000 + Math.floor(Math.random() * 50000); // 50k-100k HP

    this.activeBoss = new Boss({
      name: randomName,
      maxHp: randomHp,
      rewards: {
        exp: Math.floor(randomHp / 10),
        money: Math.floor(randomHp / 5),
        tickets: Math.floor(Math.random() * 10) + 1
      }
    });

    this.lastSpawnTime = Date.now();
    this.saveBossState();

    return this.activeBoss;
  }

  getActiveBoss() {
    if (this.activeBoss && this.activeBoss.status === 'active' && !this.activeBoss.isExpired()) {
      return this.activeBoss;
    }
    return null;
  }

  attackBoss(playerId, playerName, damage) {
    const boss = this.getActiveBoss();
    if (!boss) {
      return { success: false, message: 'Hiện không có boss nào đang hoạt động.' };
    }

    const result = boss.attackBoss(playerId, playerName, damage);
    if (result.defeated) {
      // Distribute rewards
      this.distributeRewards();
    }
    this.saveBossState();
    return result;
  }

  distributeRewards() {
    if (!this.activeBoss || this.activeBoss.status !== 'defeated') return;

    const topParticipants = this.activeBoss.getTopParticipants(3);
    const allPlayers = loadPlayerData();

    topParticipants.forEach((participant, index) => {
      const player = allPlayers[participant.id];
      if (!player) return;

      let rewardMultiplier = 1;
      if (index === 0) rewardMultiplier = 1.5; // First place bonus
      else if (index === 1) rewardMultiplier = 1.2; // Second place
      else if (index === 2) rewardMultiplier = 1.1; // Third place

      player.exp = (player.exp || 0) + Math.floor(this.activeBoss.rewards.exp * rewardMultiplier);
      player.money = (player.money || 0) + Math.floor(this.activeBoss.rewards.money * rewardMultiplier);
      player.inventory = player.inventory || {};
      player.inventory.tickets = (player.inventory.tickets || 0) + Math.floor(this.activeBoss.rewards.tickets * rewardMultiplier);

      player.stats = player.stats || {};
      player.stats.bossKills = (player.stats.bossKills || 0) + 1;
    });

    savePlayerData(allPlayers);
  }

  getBossStatus() {
    const boss = this.getActiveBoss();
    if (!boss) {
      const timeUntilNext = this.spawnInterval - (Date.now() - this.lastSpawnTime);
      const hours = Math.floor(timeUntilNext / (60 * 60 * 1000));
      const minutes = Math.floor((timeUntilNext % (60 * 60 * 1000)) / (60 * 1000));
      return {
        active: false,
        message: `Không có boss đang hoạt động.\n⏰ Boss tiếp theo xuất hiện sau: ${hours}h ${minutes}m`
      };
    }

    const topParticipants = boss.getTopParticipants(5);
    let message = `🐉 ${boss.name}\n❤️ HP: ${boss.currentHp.toLocaleString()}/${boss.maxHp.toLocaleString()}\n\n🏆 Top sát thương:\n`;
    topParticipants.forEach((p, i) => {
      message += `${i + 1}. ${p.name}: ${p.damage.toLocaleString()} dmg\n`;
    });

    return {
      active: true,
      boss,
      message
    };
  }

  getBossList() {
    return ['Rồng Lửa', 'Quái Vật Biển Sâu', 'Boss Huyền Bí', 'Thủy Quái Khổng Lồ', 'Quỷ Biển'];
  }

  spawnBossByIndex(index) {
    const bossNames = this.getBossList();
    if (index < 0 || index >= bossNames.length) return null;

    const name = bossNames[index];
    const randomHp = 50000 + Math.floor(Math.random() * 50000); // 50k-100k HP

    this.activeBoss = new Boss({
      name,
      maxHp: randomHp,
      rewards: {
        exp: Math.floor(randomHp / 10),
        money: Math.floor(randomHp / 5),
        tickets: Math.floor(Math.random() * 10) + 1
      }
    });

    this.lastSpawnTime = Date.now();
    this.saveBossState();

    return this.activeBoss;
  }

  defeatBossInstantly() {
    const boss = this.getActiveBoss();
    if (!boss) {
      return { success: false, message: 'Hiện không có boss nào đang hoạt động.' };
    }

    boss.status = 'defeated';
    boss.currentHp = 0;
    this.distributeRewards();
    this.saveBossState();

    return { success: true, message: `⚔️ Boss ${boss.name} đã bị tiêu diệt ngay lập tức! Phần thưởng đã được phân phối.` };
  }
}

// Singleton instance
export const bossService = new BossService();
