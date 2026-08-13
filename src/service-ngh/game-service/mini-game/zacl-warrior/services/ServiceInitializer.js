/**
 * ServiceInitializer.js
 * Khởi tạo và đăng ký các service vào ServiceRegistry
 */

import { getServiceRegistry } from './ServiceRegistry.js';
import { GameService } from './GameService.js';
import { PlayerService } from './PlayerService.js';
import { CombatService } from './CombatService.js';
import { ItemService } from './ItemService.js';
import { MonsterService } from './MonsterService.js';
import { AreaService } from './AreaService.js';
import { QuestService } from './QuestService.js';
import { SkillService } from './SkillService.js';
import { TradeService } from './TradeService.js';
import { ShopService } from './ShopService.js';
import { NpcService } from './NpcService.js';
import { ClanService } from './ClanService.js';
import { CodeService } from './CodeService.js';
import { RankingService } from './RankingService.js';
import { PvpService } from './PvpService.js';
import { WorldBossService } from './WorldBossService.js';
import { CraftService } from './CraftService.js';

/**
 * Đăng ký tất cả các service vào registry
 */
export function initializeServices(gameType) {
  const registry = getServiceRegistry();

  console.log(`[${gameType}] Tiến hành đăng ký các service...`);

  // Đăng ký các service
  registry.registerService('GameService', () => new GameService());
  registry.registerService('PlayerService', () => new PlayerService());
  registry.registerService('CombatService', () => new CombatService());
  registry.registerService('ItemService', () => new ItemService());
  registry.registerService('MonsterService', () => new MonsterService());
  registry.registerService('AreaService', () => new AreaService());
  registry.registerService('QuestService', () => new QuestService());
  registry.registerService('SkillService', () => new SkillService());
  registry.registerService('TradeService', () => new TradeService());
  registry.registerService('ShopService', () => new ShopService());
  registry.registerService('NpcService', () => new NpcService());
  registry.registerService('ClanService', () => new ClanService());
  registry.registerService('CodeService', () => new CodeService());
  registry.registerService('RankingService', () => new RankingService());
  registry.registerService('PvpService', () => new PvpService());
  registry.registerService('WorldBossService', () => new WorldBossService());
  registry.registerService('CraftService', () => new CraftService());
  
  return registry;
}

export default {
  initializeServices
}; 