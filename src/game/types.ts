export type PlantKind = 'sunflower' | 'peashooter' | 'wallnut' | 'repeater' | 'icepea' | 'torchwood' | 'cherry' | 'potato' | 'puff';
export type ZombieKind = 'normal' | 'flag' | 'cone' | 'bucket' | 'pole' | 'newspaper';
export type DifficultyId = 'easy' | 'normal' | 'hard' | 'nightmare';
export type Mode = 'campaign' | 'endless';
export type Phase = 'menu' | 'preparing' | 'battle' | 'intermission' | 'upgrade' | 'paused' | 'won' | 'lost';
export type UpgradeId = 'damage' | 'attackSpeed' | 'sunshine' | 'cooldown' | 'ice' | 'wall' | 'bounty' | 'mine' | 'supply' | 'repair' | 'overdrive';
export type BulletKind = 'pea' | 'ice' | 'fire' | 'spore';

export interface PlantDefinition {
  id: PlantKind; name: string; cost: number; cooldown: number; hp: number;
  interval: number; sprite: string; card: string; description: string; role: string;
}
export interface ZombieDefinition {
  id: ZombieKind; name: string; hp: number; armor: number; speed: number; budget: number; unlock: number;
}
export interface DifficultyDefinition {
  id: DifficultyId; name: string; subtitle: string; sun: number; health: number;
  speed: number; count: number; skyInterval: number; preparation: number;
}
export interface UpgradeDefinition {
  id: UpgradeId; name: string; icon: string; description: string; max: number;
  requires?: PlantKind[];
}
export interface UpgradeChoice extends UpgradeDefinition { level: number }
export interface Plant {
  id: number; kind: PlantKind; row: number; col: number; x: number; y: number;
  hp: number; maxHp: number; age: number; timer: number; burst: number; armed: boolean;
}
export interface Zombie {
  id: number; kind: ZombieKind; row: number; x: number; hp: number; maxHp: number;
  armor: number; maxArmor: number; age: number; slow: number;
  action: 'walk' | 'eat' | 'jump' | 'rage'; actionTime: number;
  hasPole: boolean; rage: boolean; elite: boolean; dead: boolean;
}
export interface Bullet {
  id: number; kind: BulletKind; row: number; x: number; y: number;
  damage: number; traveled: number; range: number; dead: boolean;
}
export interface Sun {
  id: number; x: number; y: number; targetY: number; age: number; value: number; dead: boolean;
}
export interface Effect {
  kind: 'hit' | 'fire' | 'explosion' | 'potato' | 'death' | 'burn' | 'text' | 'spark';
  x: number; y: number; row: number; age: number; duration: number; text?: string;
}
export interface Mower { row: number; x: number; active: boolean; spent: boolean }
export interface StartOptions { mode: Mode; difficulty: DifficultyId; deck: PlantKind[] }
export interface GameState {
  phase: Phase; mode: Mode; difficulty: DifficultyId; deck: PlantKind[];
  sun: number; wave: number; completedWave: number; kills: number; score: number;
  time: number; elapsed: number; speed: 1 | 2; selected: PlantKind | 'shovel' | null;
  cooldowns: Record<PlantKind, number>; plants: Plant[]; zombies: Zombie[]; bullets: Bullet[];
  suns: Sun[]; effects: Effect[]; mowers: Mower[];
  upgrades: Record<UpgradeId, number>; upgradeChoices: UpgradeChoice[];
  countdown: number; spawnRemaining: number; upcoming: string;
  message: string; messageTime: number; collected: number; planted: number;
}
export interface GameRecord { wave: number; kills: number; score: number; won: boolean }
export interface Profile {
  version: number; sound: boolean; totalRuns: number; records: Record<string, GameRecord>;
}
