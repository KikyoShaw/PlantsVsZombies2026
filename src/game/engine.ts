import { cellCenter, DEFAULT_DECK, DIFFICULTIES, isPlaying, LAST_WAVE, PLANTS, rowFoot, STEP, SUPPLIES, UPGRADES, WORLD, ZOMBIES } from './config';
import type { BulletKind, Effect, GameState, Phase, Plant, PlantKind, StartOptions, UpgradeId, Zombie, ZombieKind } from './types';

const shuffle = <T>(values: T[]): T[] => {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
};
const levels = (): GameState['upgrades'] => ({ damage: 0, attackSpeed: 0, sunshine: 0, cooldown: 0, ice: 0, wall: 0, bounty: 0, mine: 0, supply: 0, repair: 0, overdrive: 0 });
const cooldowns = (): GameState['cooldowns'] => Object.fromEntries(Object.keys(PLANTS).map(id => [id, 0])) as GameState['cooldowns'];

function initialState(): GameState {
  return {
    phase: 'menu', mode: 'campaign', difficulty: 'normal', deck: [...DEFAULT_DECK],
    sun: 200, wave: 0, completedWave: 0, kills: 0, score: 0, time: 0, elapsed: 0,
    speed: 1, selected: null, cooldowns: cooldowns(), plants: [], zombies: [], bullets: [],
    suns: [], effects: [], mowers: Array.from({ length: 5 }, (_, row) => ({ row, x: 104, active: false, spent: false })),
    upgrades: levels(), upgradeChoices: [], countdown: 0, spawnRemaining: 0,
    upcoming: '普通僵尸', message: '', messageTime: 0, collected: 0, planted: 0,
  };
}

export class GameEngine {
  state: GameState = initialState();
  private nextId = 1;
  private accumulator = 0;
  private skyClock = 0;
  private spawnClock = 0;
  private spawnInterval = 3;
  private resumePhase: Phase = 'battle';
  private lanes: number[] = [];
  private pressureFlag = false;
  private pressureElite = false;

  constructor(private readonly sound: (name: string) => void = () => {}) {}

  start(options: StartOptions): void {
    const deck = [...new Set(options.deck)].filter(id => id in PLANTS);
    if (deck.length !== 6) return;
    this.state = initialState();
    Object.assign(this.state, {
      mode: options.mode, difficulty: options.difficulty, deck,
      phase: 'preparing', sun: DIFFICULTIES[options.difficulty].sun,
      countdown: DIFFICULTIES[options.difficulty].preparation,
    });
    this.nextId = 1;
    this.accumulator = 0;
    this.skyClock = 4;
    this.spawnClock = 0;
    this.lanes = [];
    this.pressureFlag = false;
    this.pressureElite = false;
    this.state.upcoming = this.wavePreview(1);
    this.notify('先种向日葵，再为每一行准备防线');
  }

  update(realSeconds: number): void {
    if (!isPlaying(this.state.phase)) {
      this.accumulator = 0;
      return;
    }
    this.accumulator += Math.min(Math.max(realSeconds, 0), 0.2) * this.state.speed;
    let ticks = 0;
    while (this.accumulator >= STEP && ticks < 20 && isPlaying(this.state.phase)) {
      this.accumulator -= STEP;
      this.tick(STEP);
      ticks++;
    }
    if (ticks >= 20) this.accumulator = 0;
  }

  select(kind: PlantKind | 'shovel' | null): void {
    if (!isPlaying(this.state.phase)) return;
    if (kind && kind !== 'shovel' && !this.state.deck.includes(kind)) return;
    this.state.selected = this.state.selected === kind ? null : kind;
  }

  click(x: number, y: number): void {
    const s = this.state;
    if (!isPlaying(s.phase)) return;
    const sun = [...s.suns].reverse().find(item => !item.dead && Math.hypot(item.x - x, item.y - y) < 35);
    if (sun) {
      sun.dead = true;
      s.sun += sun.value;
      s.collected += sun.value;
      this.effect('text', sun.x, sun.y, 0, 0.9, `+${sun.value}`);
      this.sound('Sun');
      return;
    }
    if (!s.selected) return;
    const col = Math.floor((x - WORLD.x) / WORLD.cellWidth);
    const row = Math.floor((y - WORLD.y) / WORLD.cellHeight);
    if (col < 0 || col >= WORLD.cols || row < 0 || row >= WORLD.rows) return;
    const existing = s.plants.find(p => p.hp > 0 && p.row === row && p.col === col);
    if (s.selected === 'shovel') {
      if (existing) {
        existing.hp = 0;
        this.effect('spark', existing.x, existing.y - 25, row, 0.45);
        this.sound('Place');
      }
      s.selected = null;
      return;
    }
    const definition = PLANTS[s.selected];
    if (existing) { this.notify('这里已经有一株植物了'); return; }
    if (s.sun < definition.cost) { this.notify('阳光不足，收集一些阳光再来'); this.sound('NotEnoughSun'); return; }
    if (s.cooldowns[s.selected] > 0) { this.notify('这张卡片还在冷却中'); return; }
    const hp = definition.hp * (definition.id === 'wallnut' ? 1 + 0.35 * s.upgrades.wall : 1);
    s.plants.push({
      id: this.nextId++, kind: definition.id, row, col,
      x: cellCenter(col), y: rowFoot(row), hp, maxHp: hp,
      age: 0, timer: definition.id === 'sunflower' ? 7 : definition.interval,
      burst: 0, armed: false,
    });
    s.sun -= definition.cost;
    s.cooldowns[definition.id] = definition.cooldown * Math.pow(0.88, s.upgrades.cooldown);
    s.planted++;
    this.effect('spark', cellCenter(col), rowFoot(row) - 20, row, 0.5);
    this.sound('Place');
    s.selected = null;
  }

  pause(): void {
    if (isPlaying(this.state.phase)) {
      this.resumePhase = this.state.phase;
      this.state.phase = 'paused';
      this.accumulator = 0;
    }
  }

  togglePause(): void {
    if (this.state.phase === 'paused') {
      this.state.phase = this.resumePhase;
      this.accumulator = 0;
    } else this.pause();
  }

  setSpeed(speed: 1 | 2): void { this.state.speed = speed; }

  skipPreparation(): void {
    if (this.state.phase === 'preparing' || this.state.phase === 'intermission') {
      this.state.countdown = 0;
      this.beginWave();
    }
  }

  chooseUpgrade(id: UpgradeId): void {
    const s = this.state;
    if (s.phase !== 'upgrade' || !s.upgradeChoices.some(choice => choice.id === id)) return;
    if (id === 'supply') s.sun += 150;
    else if (id === 'repair') {
      for (const plant of s.plants) plant.hp = Math.min(plant.maxHp, plant.hp + plant.maxHp * 0.4);
    } else if (id === 'overdrive') s.upgrades.overdrive = 1;
    else {
      s.upgrades[id]++;
      if (id === 'wall') {
        for (const plant of s.plants.filter(p => p.kind === 'wallnut' && p.hp > 0)) {
          plant.maxHp = PLANTS.wallnut.hp * (1 + 0.35 * s.upgrades.wall);
          plant.hp = plant.maxHp;
        }
      }
      if (id === 'cooldown') {
        for (const kind of s.deck) s.cooldowns[kind] *= 0.88;
      }
      if (id === 'sunshine') {
        for (const plant of s.plants.filter(p => p.kind === 'sunflower')) plant.timer *= 0.85;
      }
    }
    const choice = s.upgradeChoices.find(c => c.id === id)!;
    s.upgradeChoices = [];
    this.notify(`已获得「${choice.name}」`);
    this.intermission();
  }

  abandon(): void {
    if (this.state.phase === 'menu' || this.state.phase === 'won' || this.state.phase === 'lost') return;
    this.state.phase = 'lost';
    this.state.selected = null;
    this.state.message = '这次先到这里，下次花园见';
    this.state.messageTime = 3;
    this.accumulator = 0;
  }

  returnToMenu(): void {
    this.state = initialState();
    this.accumulator = 0;
  }

  notify(text: string): void { this.state.message = text; this.state.messageTime = 3; }

  private tick(dt: number): void {
    const s = this.state;
    s.time += dt;
    s.elapsed += dt;
    s.messageTime = Math.max(0, s.messageTime - dt);
    for (const kind of s.deck) s.cooldowns[kind] = Math.max(0, s.cooldowns[kind] - dt);
    for (const effect of s.effects) effect.age += dt;
    s.effects = s.effects.filter(effect => effect.age < effect.duration);
    this.skyClock -= dt;
    if (this.skyClock <= 0) {
      this.skyClock = DIFFICULTIES[s.difficulty].skyInterval;
      this.addSun(WORLD.x + 35 + Math.random() * (WORLD.cellWidth * 9 - 70), -25, 140 + Math.random() * 380);
    }
    for (const sun of s.suns) {
      sun.age += dt;
      sun.y = Math.min(sun.targetY, sun.y + dt * 65);
      if (sun.age > 18) sun.dead = true;
    }
    s.suns = s.suns.filter(sun => !sun.dead);
    this.updatePlants(dt);
    this.updateBullets(dt);
    this.updateZombies(dt);
    this.updateMowers(dt);
    this.cleanup();
    if (!isPlaying(s.phase)) return;
    if (s.phase === 'preparing' || s.phase === 'intermission') {
      s.countdown = Math.max(0, s.countdown - dt);
      if (s.countdown <= 0) this.beginWave();
    } else {
      this.spawnClock -= dt;
      if (s.spawnRemaining > 0 && this.spawnClock <= 0 && s.zombies.length < 60) {
        this.spawnNext();
        this.spawnClock = this.spawnInterval;
      }
      if (s.spawnRemaining <= 0 && s.zombies.length === 0) this.finishWave();
    }
  }

  private updatePlants(dt: number): void {
    const s = this.state;
    for (const p of s.plants) {
      if (p.hp <= 0) continue;
      p.age += dt;
      p.timer -= dt;
      const def = PLANTS[p.kind];
      if (p.kind === 'sunflower') {
        if (p.timer <= 0) {
          p.timer = def.interval * Math.pow(0.85, s.upgrades.sunshine);
          this.addSun(p.x + (Math.random() - 0.5) * 24, p.y - 55, p.y - 15);
        }
      } else if (p.kind === 'cherry') {
        if (p.age >= def.interval) {
          this.explode(p.x, p.row, 150, true);
          p.hp = 0;
        }
      } else if (p.kind === 'potato') {
        p.armed = p.age >= def.interval * Math.pow(0.8, s.upgrades.mine);
        if (p.armed && s.zombies.some(z => !z.dead && z.row === p.row && z.action !== 'jump' && Math.abs(z.x - p.x) <= 42)) {
          this.explode(p.x, p.row, 85, false);
          p.hp = 0;
        }
      } else if (p.kind !== 'wallnut' && p.kind !== 'torchwood') {
        if (p.burst > 0) {
          p.burst -= dt;
          if (p.burst <= 0) this.fire(p);
        }
        const range = p.kind === 'puff' ? 260 : WORLD.width + 100;
        const enemyAhead = s.zombies.some(z => !z.dead && z.row === p.row && z.x > p.x - 5 && z.x < Math.min(935, p.x + range));
        if (p.timer <= 0 && enemyAhead) {
          p.timer = def.interval * Math.pow(0.88, s.upgrades.attackSpeed);
          this.fire(p);
          if (p.kind === 'repeater') p.burst = 0.16;
        }
      }
    }
  }

  private fire(plant: Plant): void {
    const s = this.state;
    const kind: BulletKind = plant.kind === 'icepea' ? 'ice' : plant.kind === 'puff' ? 'spore' : 'pea';
    const damage = 20 * (1 + 0.2 * s.upgrades.damage) * (s.upgrades.overdrive ? 1.35 : 1);
    s.bullets.push({
      id: this.nextId++, kind, row: plant.row, x: plant.x + 25, y: plant.y - (kind === 'spore' ? 32 : 48),
      damage, traveled: 0, range: kind === 'spore' ? 260 : 1200, dead: false,
    });
    this.sound(kind === 'spore' ? 'Mush' : 'Pea');
  }

  private updateBullets(dt: number): void {
    const s = this.state;
    for (const bullet of s.bullets) {
      if (bullet.dead) continue;
      const oldX = bullet.x;
      const movement = Math.min(360 * dt, bullet.range - bullet.traveled);
      bullet.x += movement;
      bullet.traveled += movement;
      if (bullet.kind === 'pea' || bullet.kind === 'ice') {
        const torch = s.plants.find(p => p.kind === 'torchwood' && p.hp > 0 && p.row === bullet.row && p.x >= oldX - 10 && p.x <= bullet.x + 10);
        if (torch) { bullet.kind = 'fire'; bullet.damage *= 2; }
      }
      const target = s.zombies.filter(z => !z.dead && z.row === bullet.row && z.x + 18 >= oldX && z.x - 18 <= bullet.x)
        .sort((a, b) => a.x - b.x)[0];
      if (target) {
        this.hitZombie(target, bullet.damage, bullet.kind === 'fire');
        if (bullet.kind === 'ice' && !target.dead) target.slow = 4 + 2 * s.upgrades.ice;
        if (bullet.kind === 'fire') {
          for (const other of s.zombies) {
            if (!other.dead && other.id !== target.id && other.row === target.row && Math.abs(other.x - target.x) < 65) this.hitZombie(other, bullet.damage * 0.5, true);
          }
        }
        this.effect(bullet.kind === 'fire' ? 'fire' : 'hit', target.x, bullet.y, target.row, 0.22);
        this.sound(target.armor > 0 ? 'ShieldHit' : 'PeaHit');
        bullet.dead = true;
      }
      if (bullet.x > 960 || bullet.traveled >= bullet.range) bullet.dead = true;
    }
  }

  private updateZombies(dt: number): void {
    const s = this.state;
    const difficulty = DIFFICULTIES[s.difficulty];
    for (const z of s.zombies) {
      if (z.dead) continue;
      z.age += dt;
      z.actionTime += dt;
      z.slow = Math.max(0, z.slow - dt);
      const slow = z.slow > 0 ? 0.5 : 1;
      if (z.action === 'jump') {
        // The pole jump crosses one cell once; the plant remains intact.
        if (z.actionTime >= 0.9) {
          z.x -= 100;
          this.action(z, 'walk');
        }
        continue;
      }
      if (z.action === 'rage') {
        if (z.actionTime >= 0.85) this.action(z, 'walk');
        continue;
      }
      const plant = s.plants.filter(p => p.hp > 0 && p.row === z.row && p.x <= z.x + 12 && p.x >= z.x - 38)
        .sort((a, b) => b.x - a.x)[0];
      if (plant) {
        if (z.hasPole) {
          z.hasPole = false;
          this.action(z, 'jump');
          this.sound('Pole');
          continue;
        }
        this.action(z, 'eat');
        plant.hp -= (z.rage ? 90 : 45) * slow * dt;
        if (Math.floor(z.actionTime * 2) !== Math.floor((z.actionTime - dt) * 2)) this.sound('Eat');
      } else {
        this.action(z, 'walk');
        const base = ZOMBIES[z.kind].speed * (z.kind === 'pole' && !z.hasPole ? 0.5 : 1) * (z.rage ? 2 : 1);
        z.x -= base * difficulty.speed * slow * dt;
      }
      if (z.x < WORLD.x - 8) {
        const mower = s.mowers[z.row];
        if (!mower.spent && !mower.active) {
          mower.active = true;
          this.sound('Fire');
          this.notify(`第 ${z.row + 1} 行割草机出动！`);
        } else if (mower.spent || (mower.active && z.x < mower.x - 35)) {
          if (z.x < 60) {
            s.phase = 'lost';
            s.selected = null;
            this.sound('Lose');
            this.notify('防线被突破了，下次试试新的阵容');
            return;
          }
        }
      }
    }
  }

  private updateMowers(dt: number): void {
    const s = this.state;
    for (const mower of s.mowers) {
      if (!mower.active) continue;
      const before = mower.x;
      mower.x += dt * 470;
      for (const z of s.zombies) {
        if (!z.dead && z.row === mower.row && z.x >= before - 42 && z.x <= mower.x + 42) this.hitZombie(z, 1000000, false);
      }
      if (mower.x > 1020) { mower.active = false; mower.spent = true; }
    }
  }

  private hitZombie(zombie: Zombie, damage: number, burned: boolean): void {
    if (zombie.dead) return;
    const armorDamage = Math.min(zombie.armor, damage);
    zombie.armor -= armorDamage;
    zombie.hp -= damage - armorDamage;
    if (zombie.hp <= 0) {
      zombie.dead = true;
      this.state.kills++;
      this.state.score += (zombie.elite ? 100 : 10) + ZOMBIES[zombie.kind].budget * 5;
      this.state.sun += this.state.upgrades.bounty * 5;
      this.effect(burned ? 'burn' : 'death', zombie.x, rowFoot(zombie.row), zombie.row, burned ? 1.5 : 1);
    } else if (zombie.kind === 'newspaper' && zombie.armor <= 0 && !zombie.rage) {
      zombie.rage = true;
      this.action(zombie, 'rage');
      this.sound('NewsLost');
    }
  }

  private explode(x: number, row: number, radius: number, cherry: boolean): void {
    for (const z of this.state.zombies) {
      if (!z.dead && Math.abs(z.row - row) <= (cherry ? 1 : 0) && Math.abs(z.x - x) < radius) this.hitZombie(z, 1800, true);
    }
    this.effect(cherry ? 'explosion' : 'potato', x, rowFoot(row) - 38, row, cherry ? 0.85 : 0.75);
    this.sound(cherry ? 'Boom' : 'Potato');
  }

  private action(zombie: Zombie, action: Zombie['action']): void {
    if (zombie.action !== action) { zombie.action = action; zombie.actionTime = 0; }
  }

  private cleanup(): void {
    const s = this.state;
    s.plants = s.plants.filter(plant => plant.hp > 0);
    s.zombies = s.zombies.filter(zombie => !zombie.dead);
    s.bullets = s.bullets.filter(bullet => !bullet.dead);
  }

  private addSun(x: number, y: number, targetY: number): void {
    this.state.suns.push({ id: this.nextId++, x, y, targetY, age: 0, value: 25, dead: false });
  }

  private effect(kind: Effect['kind'], x: number, y: number, row: number, duration: number, text?: string): void {
    this.state.effects.push({ kind, x, y, row, age: 0, duration, text });
  }

  private beginWave(): void {
    const s = this.state;
    s.wave++;
    s.phase = 'battle';
    s.countdown = 0;
    const pressure = s.wave % 3 === 0;
    const budget = Math.max(3, Math.round((6 + 3 * (s.wave - 1)) * DIFFICULTIES[s.difficulty].count * (pressure ? 1.25 : 1)));
    s.spawnRemaining = budget;
    this.spawnInterval = Math.max(0.55, 36 / budget);
    this.spawnClock = 0.8;
    this.pressureFlag = pressure;
    this.pressureElite = pressure;
    s.upcoming = this.wavePreview(s.wave);
    this.notify(pressure ? `第 ${s.wave} 波 · 精英来袭，守住花园！` : `第 ${s.wave} 波开始`);
  }

  private spawnNext(): void {
    const s = this.state;
    let kind: ZombieKind;
    let elite = false;
    if (this.pressureFlag) {
      kind = 'flag';
      this.pressureFlag = false;
    } else if (this.pressureElite && s.spawnRemaining <= Math.max(3, Math.round((6 + 3 * (s.wave - 1)) * 0.7))) {
      kind = s.wave >= 9 ? 'bucket' : s.wave >= 5 ? 'pole' : 'cone';
      elite = true;
      this.pressureElite = false;
    } else {
      const allowed = Object.values(ZOMBIES).filter(z => z.id !== 'flag' && z.unlock <= s.wave && z.budget <= s.spawnRemaining);
      kind = allowed[Math.floor(Math.random() * allowed.length)]?.id ?? 'normal';
    }
    const def = ZOMBIES[kind];
    s.spawnRemaining = Math.max(0, s.spawnRemaining - def.budget);
    if (this.lanes.length === 0) this.lanes = shuffle([0, 1, 2, 3, 4]);
    const row = this.lanes.pop()!;
    const scaling = DIFFICULTIES[s.difficulty].health + Math.max(0, s.wave - 12) * 0.04;
    const hp = def.hp * scaling * (elite ? 2 : 1);
    const armor = def.armor * scaling * (elite ? 1.5 : 1);
    s.zombies.push({
      id: this.nextId++, kind, row, x: 925 + Math.random() * 25,
      hp, maxHp: hp, armor, maxArmor: armor, age: 0, slow: 0,
      action: 'walk', actionTime: 0, hasPole: kind === 'pole',
      rage: false, elite, dead: false,
    });
  }

  private finishWave(): void {
    const s = this.state;
    s.completedWave = s.wave;
    s.score += s.wave * 100;
    s.bullets = [];
    s.upgrades.overdrive = 0;
    if (s.mode === 'campaign' && s.wave >= LAST_WAVE) {
      s.phase = 'won';
      s.selected = null;
      this.notify('十二波全部守住，花园因你而盛开！');
      return;
    }
    s.upcoming = this.wavePreview(s.wave + 1);
    if (s.wave % 3 === 0) {
      const available = shuffle(UPGRADES.filter(u => s.upgrades[u.id] < u.max && (!u.requires || u.requires.some(kind => s.deck.includes(kind)))));
      const candidates = available.slice(0, 3);
      for (const supply of shuffle([...SUPPLIES])) {
        if (candidates.length >= 3) break;
        candidates.push(supply);
      }
      s.upgradeChoices = candidates.map(choice => ({ ...choice, level: choice.max ? s.upgrades[choice.id] + 1 : 0 }));
      s.phase = 'upgrade';
      s.selected = null;
      this.accumulator = 0;
    } else this.intermission();
  }

  private intermission(): void {
    this.state.phase = 'intermission';
    this.state.countdown = 8;
    this.state.upcoming = this.wavePreview(this.state.wave + 1);
    this.accumulator = 0;
  }

  private wavePreview(wave: number): string {
    const enemies = Object.values(ZOMBIES).filter(z => z.id !== 'flag' && z.unlock <= wave).map(z => z.name.replace('僵尸', ''));
    return `${wave % 3 === 0 ? '精英压力波 · ' : ''}${enemies.join(' / ')}`;
  }
}