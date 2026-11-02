import { PLANTS, WORLD, cellCenter, isPlaying, rowFoot } from './config';
import type { Bullet, Effect, GameState, Plant, Zombie } from './types';
import type { Assets } from './assets';

export interface HoverCell { row: number; col: number }

/** All positions use the original 900 × 600 lawn; CSS size and DPR stay separate. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private dpr = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly assets: Assets) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('此设备无法创建 Canvas 2D 战场，请检查 WebView2 或浏览器。');
    this.ctx = context;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round((rect.width || WORLD.width) * this.dpr));
    const height = Math.max(1, Math.round((rect.height || WORLD.height) * this.dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  point(event: PointerEvent | MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * WORLD.width / rect.width, y: (event.clientY - rect.top) * WORLD.height / rect.height };
  }

  draw(state: GameState, hover: HoverCell | null): void {
    if (this.dpr !== Math.max(1, window.devicePixelRatio || 1)) this.resize();
    const ctx = this.ctx;
    ctx.setTransform(this.canvas.width / WORLD.width, 0, 0, this.canvas.height / WORLD.height, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#6c9144';
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.drawImage(this.assets.image('background1'), -120, 0);

    if (hover && state.selected && isPlaying(state.phase)) this.drawHover(state, hover);
    // Render each row from its ground to its foreground, so lower rows occlude taller sprites.
    for (let row = 0; row < WORLD.rows; row++) {
      for (const plant of state.plants) if (plant.row === row) this.drawPlant(plant);
      for (const effect of state.effects) if (effect.row === row && (effect.kind === 'death' || effect.kind === 'burn')) this.drawEffect(effect);
      const zombies = state.zombies.filter(zombie => zombie.row === row && !zombie.dead).sort((a, b) => a.x - b.x);
      for (const zombie of zombies) this.drawZombie(zombie);
      const mower = state.mowers.find(item => item.row === row);
      if (mower && (!mower.spent || mower.active)) this.drawMower(mower.x, rowFoot(row), mower.active, state.time);
      for (const bullet of state.bullets) if (bullet.row === row && !bullet.dead) this.drawBullet(bullet, state.time);
      for (const effect of state.effects) if (effect.row === row && effect.kind !== 'death' && effect.kind !== 'burn') this.drawEffect(effect);
    }
    if (hover && state.selected && isPlaying(state.phase)) this.drawGhost(state, hover);
    for (const sun of state.suns) {
      if (sun.dead) continue;
      const size = this.assets.size('Sun');
      const scale = 0.76;
      ctx.save();
      if (sun.age > 9) ctx.globalAlpha = 0.65 + Math.sin(state.time * 8) * 0.25;
      this.assets.draw(ctx, 'Sun', sun.x - size.width * scale / 2, sun.y - size.height * scale / 2, sun.age, scale);
      ctx.restore();
    }
  }

  private drawHover(state: GameState, hover: HoverCell): void {
    const ctx = this.ctx;
    const x = WORLD.x + hover.col * WORLD.cellWidth;
    const y = WORLD.y + hover.row * WORLD.cellHeight;
    const occupied = state.plants.some(plant => plant.row === hover.row && plant.col === hover.col);
    const selected = state.selected;
    const valid = selected === 'shovel' ? occupied : selected !== null && !occupied && state.sun >= PLANTS[selected].cost && state.cooldowns[selected] <= 0;
    ctx.fillStyle = valid ? 'rgba(255,239,160,.22)' : 'rgba(159,56,37,.22)';
    ctx.fillRect(x, y, WORLD.cellWidth, WORLD.cellHeight);
    ctx.strokeStyle = valid ? '#fff4c3' : '#efaa83';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, WORLD.cellWidth - 4, WORLD.cellHeight - 4);
  }

  private plantSprite(plant: Plant): string {
    if (plant.kind === 'wallnut') return plant.hp / plant.maxHp < 1 / 3 ? 'Wallnut_2' : plant.hp / plant.maxHp < 2 / 3 ? 'Wallnut_1' : 'WallNut';
    if (plant.kind === 'potato') return plant.armed ? 'PotatoMine' : 'PotatoMine_1';
    return PLANTS[plant.kind].sprite;
  }

  private drawPlant(plant: Plant): void {
    const sprite = this.plantSprite(plant);
    const { width, height } = this.assets.size(sprite);
    const scale = plant.kind === 'cherry' ? 0.85 : 1;
    this.shadow(plant.x, plant.y - 2, plant.kind === 'puff' ? 18 : 28);
    this.assets.draw(this.ctx, sprite, plant.x - width * scale / 2, plant.y - height * scale, plant.age, scale);
    if (plant.hp < plant.maxHp) this.health(plant.x - 23, plant.y + 3, 46, plant.hp / plant.maxHp, '#e4eaa8');
    if (plant.kind === 'potato' && !plant.armed) {
      const ctx = this.ctx;
      ctx.fillStyle = '#fff3c3';
      ctx.font = '600 14px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('生根中', plant.x, plant.y - 32);
    }
  }

  private drawGhost(state: GameState, hover: HoverCell): void {
    const ctx = this.ctx;
    const x = cellCenter(hover.col);
    const y = rowFoot(hover.row);
    if (!state.selected) return;
    if (state.selected === 'shovel') {
      ctx.save();
      ctx.translate(x + 15, y - 34);
      ctx.rotate(0.5);
      ctx.fillStyle = '#e0b27b';
      ctx.fillRect(-4, -43, 8, 45);
      ctx.fillStyle = '#e2e6d6';
      ctx.beginPath();
      ctx.moveTo(-15, -2); ctx.lineTo(15, -2); ctx.lineTo(11, 17); ctx.lineTo(0, 26); ctx.lineTo(-11, 17); ctx.closePath(); ctx.fill();
      ctx.restore();
      return;
    }
    if (state.plants.some(plant => plant.row === hover.row && plant.col === hover.col)) return;
    const sprite = state.selected === 'potato' ? 'PotatoMine_1' : PLANTS[state.selected].sprite;
    const { width, height } = this.assets.size(sprite);
    const scale = state.selected === 'cherry' ? 0.85 : 1;
    ctx.save();
    ctx.globalAlpha = 0.48;
    this.assets.draw(ctx, sprite, x - width * scale / 2, y - height * scale, state.time, scale);
    ctx.restore();
  }

  private drawZombie(zombie: Zombie): void {
    const ctx = this.ctx;
    const foot = rowFoot(zombie.row);
    let sprite = 'Zombie';
    let anchorX = 105;
    let anchorY = 142;
    let time = zombie.age;
    let loop = true;
    const eating = zombie.action === 'eat';
    if (zombie.kind === 'pole') {
      anchorX = 238;
      anchorY = 201;
      sprite = eating ? 'PoleZombieAttack' : zombie.hasPole ? 'PoleZombie' : 'PoleZombieWalk';
      if (zombie.action === 'jump') {
        const firstDuration = this.assets.duration('PoleZombieJump');
        const secondDuration = this.assets.duration('PoleZombieJump2');
        const progress = Math.min(1, zombie.actionTime / 0.9);
        sprite = progress < 0.55 ? 'PoleZombieJump' : 'PoleZombieJump2';
        time = progress < 0.55 ? progress / 0.55 * firstDuration : (progress - 0.55) / 0.45 * secondDuration;
        loop = false;
      }
    } else if (zombie.kind === 'newspaper') {
      anchorX = 98;
      anchorY = 158;
      sprite = zombie.armor > 0 ? (eating ? 'NewsAttack_1' : 'NewsWalk_1') : eating ? 'NewsAttack' : 'NewsWalk';
      if (zombie.action === 'rage') { sprite = 'NewsLost'; time = zombie.actionTime; loop = false; }
    } else if (zombie.kind === 'flag') {
      sprite = eating ? 'ZombieFlagAttack' : 'ZombieFlag';
    } else if (zombie.kind === 'cone' && zombie.armor > 0) {
      sprite = eating ? 'ZombieConeAttack' : 'ZombieCone';
      anchorX = 118;
    } else if (zombie.kind === 'bucket' && zombie.armor > 0) {
      sprite = eating ? 'ZombieBucketAttack' : 'ZombieBucket';
      anchorX = 99;
    } else if (eating) sprite = 'ZombieAttack';
    this.shadow(zombie.x, foot - 1, 24);
    if (zombie.elite) {
      ctx.save();
      ctx.strokeStyle = '#e4bd58'; ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.ellipse(zombie.x, foot - 3, 33, 11, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    if (zombie.slow > 0) { ctx.shadowColor = '#a6eaff'; ctx.shadowBlur = 9; }
    this.assets.draw(ctx, sprite, zombie.x - anchorX, foot - anchorY, time, 1, loop);
    ctx.restore();
    if (zombie.elite || zombie.hp < zombie.maxHp || zombie.armor < zombie.maxArmor) {
      const ratio = (zombie.hp + zombie.armor) / (zombie.maxHp + zombie.maxArmor);
      this.health(zombie.x - 23, foot - 127, 46, ratio, zombie.elite ? '#efc95e' : '#c4dba4');
    }
    if (zombie.elite) {
      ctx.fillStyle = '#fff0b2'; ctx.font = '700 14px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('精英', zombie.x, foot - 138);
    }
    if (zombie.slow > 0) {
      ctx.fillStyle = '#d0f4ff'; ctx.font = '700 16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('❄', zombie.x + 24, foot - 102);
    }
  }

  private drawBullet(bullet: Bullet, time: number): void {
    const sprite = { pea: 'Pea', ice: 'PeaIce', fire: 'PeaFire', spore: 'Mush' }[bullet.kind];
    // Pea GIFs contain asymmetric transparent padding; anchor their visible projectile.
    const offsetX = bullet.kind === 'pea' || bullet.kind === 'ice' ? 39 : bullet.kind === 'spore' ? 27 : 29;
    this.assets.draw(this.ctx, sprite, bullet.x - offsetX, bullet.y - 17, time);
  }

  private drawEffect(effect: Effect): void {
    const ctx = this.ctx;
    const sprites: Partial<Record<Effect['kind'], string>> = { hit: 'PeaHit', fire: 'Fire', explosion: 'Boom', potato: 'PotatoMine_mashed', death: 'ZombieDie', burn: 'BurnDie' };
    const sprite = sprites[effect.kind];
    if (sprite) {
      const { width, height } = this.assets.size(sprite);
      const ground = effect.kind === 'death' || effect.kind === 'burn';
      const scale = effect.kind === 'explosion' ? 1.3 : 1;
      ctx.save();
      ctx.globalAlpha = effect.age > effect.duration * 0.7 ? Math.max(0, (effect.duration - effect.age) / (effect.duration * 0.3)) : 1;
      this.assets.draw(ctx, sprite, effect.x - (ground ? 105 : width * scale / 2), effect.y - (ground ? 142 : height * scale / 2), effect.age, scale, false);
      ctx.restore();
    } else if (effect.kind === 'text') {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - effect.age / effect.duration);
      ctx.font = '700 22px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
      ctx.strokeStyle = '#315332'; ctx.lineWidth = 3;
      ctx.strokeText(effect.text || '', effect.x, effect.y - effect.age * 30);
      ctx.fillStyle = '#fff4ba'; ctx.fillText(effect.text || '', effect.x, effect.y - effect.age * 30);
      ctx.restore();
    } else {
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - effect.age / effect.duration);
      ctx.strokeStyle = '#fff5c1'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(effect.x, effect.y, 7 + effect.age * 35, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  private drawMower(x: number, y: number, active: boolean, time: number): void {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y - 12);
    if (active) ctx.translate(0, Math.sin(time * 45) * 1.2);
    this.shadow(0, 12, 24);
    ctx.strokeStyle = '#344d3e'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-14, -11); ctx.lineTo(-24, -37); ctx.lineTo(-36, -37); ctx.stroke();
    ctx.fillStyle = '#b84435'; ctx.beginPath(); ctx.roundRect(-25, -12, 48, 22, 6); ctx.fill();
    ctx.fillStyle = '#dd6c4b'; ctx.fillRect(-13, -21, 24, 13);
    ctx.fillStyle = '#f0c876'; ctx.fillRect(15, -8, 11, 10);
    ctx.fillStyle = '#283a30';
    for (const wheel of [-15, 15]) { ctx.beginPath(); ctx.arc(wheel, 10, 9, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#d0d5bc';
    for (const wheel of [-15, 15]) { ctx.beginPath(); ctx.arc(wheel, 10, 3.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  private shadow(x: number, y: number, width: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(27,51,26,.18)';
    ctx.beginPath(); ctx.ellipse(x, y, width, 7, 0, 0, Math.PI * 2); ctx.fill();
  }

  private health(x: number, y: number, width: number, ratio: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(24,49,29,.7)'; ctx.beginPath(); ctx.roundRect(x - 1, y - 1, width + 2, 6, 3); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, Math.max(0, Math.min(1, ratio)) * width, 4, 2); ctx.fill();
  }

  dispose(): void { this.observer.disconnect(); }
}