import type { DifficultyDefinition, DifficultyId, PlantDefinition, PlantKind, UpgradeDefinition, ZombieDefinition, ZombieKind } from './types';

export const WORLD = { width: 900, height: 600, x: 130, y: 85, cellWidth: 81, cellHeight: 100, rows: 5, cols: 9 } as const;
export const LAST_WAVE = 12;
export const STEP = 0.02;

export const PLANTS: Record<PlantKind, PlantDefinition> = {
  sunflower: { id: 'sunflower', name: '向日葵', cost: 50, cooldown: 5, hp: 200, interval: 12, sprite: 'SunFlower', card: 'card_Sunflower', role: '阳光生产', description: '每 12 秒生产 25 阳光。先投资一排向日葵，让花园持续生长。' },
  peashooter: { id: 'peashooter', name: '豌豆射手', cost: 100, cooldown: 5, hp: 200, interval: 1.4, sprite: 'Peashooter', card: 'card_PeaShooter', role: '基础输出', description: '向前方发射豌豆，每发造成 20 伤害。可靠的花园主力。' },
  wallnut: { id: 'wallnut', name: '坚果墙', cost: 50, cooldown: 15, hp: 1800, interval: 0, sprite: 'WallNut', card: 'card_WallNut', role: '前排防御', description: '拥有 1800 生命，挡住僵尸。留意撑杆僵尸会越过第一株植物。' },
  repeater: { id: 'repeater', name: '双发射手', cost: 200, cooldown: 7, hp: 200, interval: 1.4, sprite: 'Repeater', card: 'card_Repeater', role: '双倍火力', description: '连续发射两颗豌豆。搭配火炬树桩可以制造更强的火力走廊。' },
  icepea: { id: 'icepea', name: '寒冰射手', cost: 175, cooldown: 7, hp: 200, interval: 1.5, sprite: 'IcePeaShooter', card: 'card_IcePeaShooter', role: '减速控制', description: '造成 20 伤害并减速 4 秒。冰豌豆经过火炬后会变为火豌豆，失去减速。' },
  torchwood: { id: 'torchwood', name: '火炬树桩', cost: 175, cooldown: 10, hp: 300, interval: 0, sprite: 'FireTree', card: 'card_FireTree', role: '弹道强化', description: '把经过的普通与冰豌豆点燃，伤害翻倍，并对附近僵尸造成溅射伤害。' },
  cherry: { id: 'cherry', name: '樱桃炸弹', cost: 150, cooldown: 35, hp: 2000, interval: 0.65, sprite: 'CherryBomb', card: 'card_CherryBomb', role: '范围清场', description: '种下 0.65 秒后爆炸，对附近三行僵尸造成 1800 伤害。' },
  potato: { id: 'potato', name: '土豆地雷', cost: 25, cooldown: 15, hp: 200, interval: 12, sprite: 'PotatoMine', card: 'card_PotatoMine', role: '延迟埋伏', description: '需要 12 秒成熟。僵尸踩中后对同格附近敌人造成 1800 伤害。' },
  puff: { id: 'puff', name: '小喷菇', cost: 0, cooldown: 8, hp: 100, interval: 1.2, sprite: 'Mushroom', card: 'card_Mushroom', role: '免费应急', description: '免费但射程仅 260 像素。本版白天也可种植，适合救急与拖延。' },
};
export const PLANT_LIST = Object.values(PLANTS);
export const DEFAULT_DECK: PlantKind[] = ['sunflower', 'peashooter', 'wallnut', 'icepea', 'cherry', 'potato'];
export const DIFFICULTIES: Record<DifficultyId, DifficultyDefinition> = {
  easy: { id: 'easy', name: '休闲', subtitle: '从容布阵，享受花园', sun: 300, health: 0.8, speed: 0.9, count: 0.8, skyInterval: 7, preparation: 30 },
  normal: { id: 'normal', name: '标准', subtitle: '经典节奏，策略取胜', sun: 200, health: 1, speed: 1, count: 1, skyInterval: 8, preparation: 25 },
  hard: { id: 'hard', name: '困难', subtitle: '精打细算，应对强敌', sun: 150, health: 1.25, speed: 1.1, count: 1.25, skyInterval: 9, preparation: 20 },
  nightmare: { id: 'nightmare', name: '噩梦', subtitle: '极限压力，寸土必争', sun: 125, health: 1.5, speed: 1.2, count: 1.5, skyInterval: 10, preparation: 15 },
};
export const ZOMBIES: Record<ZombieKind, ZombieDefinition> = {
  normal: { id: 'normal', name: '普通僵尸', hp: 200, armor: 0, speed: 12, budget: 1, unlock: 1 },
  flag: { id: 'flag', name: '旗帜僵尸', hp: 240, armor: 0, speed: 14, budget: 1, unlock: 3 },
  cone: { id: 'cone', name: '路障僵尸', hp: 200, armor: 200, speed: 12, budget: 2, unlock: 3 },
  bucket: { id: 'bucket', name: '铁桶僵尸', hp: 200, armor: 500, speed: 11, budget: 3, unlock: 9 },
  pole: { id: 'pole', name: '撑杆僵尸', hp: 250, armor: 0, speed: 24, budget: 2, unlock: 5 },
  newspaper: { id: 'newspaper', name: '读报僵尸', hp: 240, armor: 100, speed: 12, budget: 2, unlock: 7 },
};
export const UPGRADES: UpgradeDefinition[] = [
  { id: 'damage', name: '饱满豌豆', icon: '✦', description: '所有弹体伤害 +20%，最多 5 级。', max: 5, requires: ['peashooter', 'repeater', 'icepea', 'puff'] },
  { id: 'attackSpeed', name: '生长节拍', icon: '»', description: '射手攻击间隔缩短 12%，最多 4 级。', max: 4, requires: ['peashooter', 'repeater', 'icepea', 'puff'] },
  { id: 'sunshine', name: '光合作用', icon: '☀', description: '向日葵产出间隔缩短 15%，最多 4 级。', max: 4, requires: ['sunflower'] },
  { id: 'cooldown', name: '沃土培育', icon: '❧', description: '所有卡片冷却缩短 12%，最多 4 级。', max: 4 },
  { id: 'ice', name: '深冬来信', icon: '❄', description: '寒冰减速持续时间 +2 秒，最多 4 级。', max: 4, requires: ['icepea'] },
  { id: 'wall', name: '坚实外壳', icon: '▣', description: '坚果最大生命 +35%，同时修复现有坚果，最多 4 级。', max: 4, requires: ['wallnut'] },
  { id: 'bounty', name: '丰收赏金', icon: '✧', description: '击杀僵尸直接获得 5 阳光，最多 4 级。', max: 4 },
  { id: 'mine', name: '快速扎根', icon: '⌁', description: '地雷成熟时间缩短 20%，最多 3 级。', max: 3, requires: ['potato'] },
];
export const SUPPLIES: UpgradeDefinition[] = [
  { id: 'supply', name: '阳光补给', icon: '☀', description: '立即获得 150 阳光。一次性补给。', max: 0 },
  { id: 'repair', name: '花园护理', icon: '♡', description: '所有存活植物恢复 40% 最大生命。一次性补给。', max: 0 },
  { id: 'overdrive', name: '最后冲刺', icon: 'ϟ', description: '下一波所有弹体伤害提高 35%。只持续一波。', max: 0 },
];
export const cellCenter = (col: number) => WORLD.x + (col + 0.5) * WORLD.cellWidth;
export const rowFoot = (row: number) => WORLD.y + (row + 1) * WORLD.cellHeight - 5;
export const isPlaying = (phase: string) => phase === 'preparing' || phase === 'battle' || phase === 'intermission';
