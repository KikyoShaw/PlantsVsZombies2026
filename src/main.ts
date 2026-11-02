import './style.css';
import { Assets } from './game/assets';
import { GameAudio } from './game/audio';
import { GameEngine } from './game/engine';
import { DEFAULT_DECK, DIFFICULTIES, LAST_WAVE, PLANTS, PLANT_LIST, SUPPLIES, UPGRADES, WORLD, isPlaying } from './game/config';
import { Renderer } from './game/renderer';
import type { HoverCell } from './game/renderer';
import type { DifficultyId, GameState, Mode, PlantKind, Profile, StartOptions, UpgradeId } from './game/types';
import { loadProfile, recordRun, saveProfile } from './storage';

const icon = (name: string, size = 20): string => {
  const paths: Record<string, string> = {
    leaf: '<path d="M20 4c0 10-4 16-11 16-4 0-6-3-5-6C5 7 11 5 20 4Z"/><path d="m4 21 11-11"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    sound: '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    muted: '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="m16 9 6 6m0-6-6 6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2m0 3h.01"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
    shovel: '<path d="m14 10 5-5m-3-3 6 6M3 21c-1-6 0-9 5-11l6 6c-2 5-5 6-11 5Z"/>',
    flag: '<path d="M5 22V3m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
    trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v3c0 3 2 4 5 4m7-7h4v3c0 3-2 4-5 4m-3 1v5m-4 3h8m-6-3h4"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/>',
    reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.leaf}</svg>`;
};
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const number = (value: number): string => Math.floor(value).toLocaleString('zh-CN');
const duration = (seconds: number): string => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const modeName = (mode: Mode): string => mode === 'campaign' ? '花园闯关' : '无尽生存';
const app = document.querySelector<HTMLDivElement>('#app')!;
const assets = new Assets();
const audio = new GameAudio();
const engine = new GameEngine(name => audio.play(name));
let renderer: Renderer | null = null;
let profile: Profile | null = null;
let profileReady = false;
let assetsReady = false;
let loading = false;
let deck: PlantKind[] = [...DEFAULT_DECK];
let mode: Mode = 'campaign';
let difficulty: DifficultyId = 'normal';
let hover: HoverCell | null = null;
let lastOptions: StartOptions | null = null;
let recorded = false;
let phaseSignature = '';
let deckSignature = '';
let upgradesSignature = '';
let utility: 'help' | 'leave' | null = null;
let pauseReason = '';
let returnFocus: HTMLElement | null = null;
let saveQueue: Promise<void> = Promise.resolve();
let lastFrame = performance.now();
let lastHud = 0;
let noticeTimer = 0;

app.innerHTML = `
  <div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
  <div id="shell" class="shell">
    <header class="site-header">
      <a class="brand" href="#" data-action="brand" aria-label="花园守卫首页"><span class="brand-mark">${icon('leaf', 27)}</span><span><strong>花园守卫</strong><small>PLANTS VS. ZOMBIES</small></span></a>
      <span class="header-tag">一片草坪，无限可能</span>
      <div class="header-actions"><span class="local-label"><i></i> 单人 · 离线花园</span><button class="icon-button audio-button" data-action="sound" title="切换声音" aria-label="切换声音">${icon('sound')}</button><button class="icon-button" data-action="help" title="游戏说明" aria-label="游戏说明">${icon('help')}</button></div>
    </header>
    <main id="menu-page" class="menu-page">
      <section class="welcome">
        <div><p class="eyebrow"><span></span> WELCOME TO YOUR GARDEN</p><h1>今天，也要守护<span>每一寸绿意。</span></h1><p class="welcome-copy">收集阳光，种下伙伴。用你的策略，<br class="wide-break">让不速之客止步于花园之外。</p></div>
        <div class="welcome-art" aria-hidden="true"><div class="art-orbit"></div><img data-asset="SunFlower" class="art-sunflower" alt=""><img data-asset="Peashooter" class="art-peashooter" alt=""><span class="art-label">LET IT GROW.</span></div>
      </section>
      <div class="menu-grid">
        <section class="setup-panel panel">
          <div class="section-heading"><span class="section-number">01</span><div><h2>开启一段花园时光</h2><p>选择适合你的节奏</p></div></div>
          <div class="field-heading"><h3>游戏模式</h3><span>单人策略防守</span></div>
          <div class="mode-options"><button class="mode-option selected" data-mode="campaign" aria-pressed="true"><span class="option-icon">${icon('flag', 23)}</span><strong>花园闯关</strong><small>守住 12 波，赢下这片阳光</small><i class="option-check">${icon('check', 13)}</i></button><button class="mode-option" data-mode="endless" aria-pressed="false"><span class="option-icon infinity">∞</span><strong>无尽生存</strong><small>不断生长，探索防线的极限</small><i class="option-check">${icon('check', 13)}</i></button></div>
          <div class="field-heading"><h3>挑战难度</h3><span id="difficulty-subtitle"></span></div>
          <div class="difficulty-options">${Object.values(DIFFICULTIES).map(item => `<button data-difficulty="${item.id}" aria-pressed="${item.id === difficulty}" class="difficulty-option ${item.id === difficulty ? 'selected' : ''}">${item.name}<span>${'·'.repeat(Object.keys(DIFFICULTIES).indexOf(item.id) + 1)}</span></button>`).join('')}</div>
          <p id="difficulty-summary" class="difficulty-summary"></p>
          <div class="best-record"><span class="record-icon">${icon('trophy', 23)}</span><div><span id="record-category" class="record-category"></span><strong id="record-summary">还没有记录，第一片绿意等你种下</strong></div></div>
          <details class="record-details"><summary>查看全部分类记录 <span>8 项</span></summary><div id="all-records"></div></details>
          <button id="start-button" class="button button-primary start-button" data-action="start" disabled><span>${icon('play', 19)} 出发，守护花园</span>${icon('arrow', 20)}</button>
          <p id="start-hint" class="start-hint">正在准备花园资源…</p>
        </section>
        <section class="deck-panel panel">
          <div class="section-heading"><span class="section-number">02</span><div><h2>带上你的植物伙伴</h2><p>九选六，搭配属于你的防线</p></div><button class="text-button recommend" data-action="recommend">${icon('spark', 15)} 推荐阵容</button></div>
          <div class="deck-selection"><span>本局出战 <strong id="deck-count">6 / 6</strong></span><div id="deck-slots" class="deck-slots"></div></div>
          <div class="plant-library">${PLANT_LIST.map(plant => `<button class="library-card" data-plant="${plant.id}" aria-pressed="false" aria-label="${plant.name}，${plant.cost}阳光，${plant.role}。${plant.description}"><span class="library-art"><img data-asset="${plant.sprite}" alt=""><span class="plant-order"></span></span><span class="plant-card-name">${plant.name}</span><span class="plant-card-meta"><span>${icon('sun', 12)} ${plant.cost}</span><span>${plant.role}</span></span></button>`).join('')}</div>
          <div id="plant-description" class="plant-description"><span class="description-leaf">${icon('leaf', 19)}</span><div><strong>向日葵 <span>阳光生产</span></strong><p>${PLANTS.sunflower.description}</p></div></div>
        </section>
      </div>
      <footer class="menu-footer"><span>种一点耐心，收获一整个花园。</span><span>原版素材 · 全新波次 · 随机强化</span></footer>
    </main>
    <main id="game-page" class="game-page" hidden>
      <div class="battle-heading"><div><p class="eyebrow">THE GARDEN IS IN YOUR HANDS</p><h1 id="battle-title">花园闯关 <span>标准</span></h1></div><div class="battle-tools"><button class="tool-button" data-action="pause" id="pause-button">${icon('pause', 17)}<span>暂停</span><kbd>空格</kbd></button><button class="tool-button" data-action="speed" id="speed-button" title="切换 1 倍 / 2 倍速度">1× 速度</button><button class="tool-button" data-action="shovel" id="shovel-button">${icon('shovel', 17)}<span>铲子</span><kbd>Q</kbd></button><button class="tool-button menu-return" data-action="leave">${icon('back', 17)}<span>返回</span></button></div></div>
      <div class="battle-layout">
        <section class="battle-main">
          <div class="seed-bank panel"><div class="sun-bank"><span>${icon('sun', 27)}</span><strong id="sun-value">200</strong><small>可用阳光</small></div><div id="battle-cards" class="battle-cards"></div></div>
          <div class="lawn-frame"><div class="lawn-corner">${icon('leaf', 13)} MY LITTLE GARDEN</div><canvas id="lawn" width="900" height="600" aria-label="五行九列草坪，先选择植物，再点击空格种植" tabindex="0"></canvas><div id="board-message" class="board-message" role="status" hidden></div><div id="selection-label" class="selection-label">点击阳光收集 · 选择植物后点击草坪种植</div></div>
          <div class="battle-footnote"><span><kbd>1</kbd>–<kbd>6</kbd> 选卡　<kbd>Q</kbd> 铲除　<kbd>Esc</kbd> / 右键取消</span><span>切到后台会自动暂停</span></div>
        </section>
        <aside class="battle-sidebar">
          <section class="wave-panel panel"><p class="eyebrow">GARDEN JOURNAL</p><div class="wave-heading"><span class="wave-icon">${icon('flag', 23)}</span><div><small>当前波次</small><strong id="wave-value">01 <span>/ 12</span></strong></div></div><div id="phase-label" class="phase-label">布阵时间</div><p id="wave-description" class="wave-description"></p><button id="skip-button" class="button button-outline" data-action="skip">准备好了，开始这一波 ${icon('arrow', 15)}</button><div class="sidebar-divider"></div><h3 class="sidebar-title">下一步，做好准备</h3><p id="upcoming" class="upcoming"></p><div class="run-totals"><span>得分 <strong id="score-value">0</strong></span><span>击败 <strong id="kills-value">0</strong></span><span>用时 <strong id="elapsed-value">00:00</strong></span></div></section>
          <section class="upgrades-panel panel"><div class="sidebar-title upgrades-heading">${icon('spark', 17)} 花园强化 <span id="upgrade-count">0</span></div><div id="earned-upgrades" class="earned-upgrades"><p class="empty-upgrades">每守住 3 波，<br>为花园选择一份成长礼物。</p></div></section>
          <div class="garden-tip">${icon('leaf', 22)}<p>先种阳光，再筑防线。<br>每一株伙伴，都有它的位置。</p></div>
        </aside>
      </div>
    </main>
    <p id="storage-note" class="storage-note" role="status" hidden></p>
  </div>
  <div id="loading-screen" class="loading-screen"><div class="loading-card"><span class="loading-mark">${icon('leaf', 38)}</span><p class="eyebrow">A LITTLE SUNSHINE IS ON THE WAY</p><h1 id="loading-title">花园正在苏醒</h1><p id="loading-description">正在准备植物、草坪与声音，请稍候。</p><progress id="load-progress" value="0" max="1" aria-label="素材加载进度"></progress><p id="loading-count">准备素材…</p><button id="retry-button" class="button button-primary" data-action="retry" hidden>重新加载 ${icon('reset', 17)}</button></div></div>
  <div id="phase-overlay" class="overlay" hidden></div>
  <div id="utility-overlay" class="overlay utility-overlay" hidden></div>
  <div id="notice" class="notice" role="status" hidden></div>
`;

const get = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const menuPage = get('menu-page');
const gamePage = get('game-page');
const canvas = get<HTMLCanvasElement>('lawn');
const phaseOverlay = get('phase-overlay');
const utilityOverlay = get('utility-overlay');
const startButton = get<HTMLButtonElement>('start-button');
const allUpgrades = [...UPGRADES, ...SUPPLIES];

function notice(text: string, persistent = false): void {
  window.clearTimeout(noticeTimer);
  const element = get('notice');
  element.textContent = text;
  element.hidden = false;
  if (!persistent) noticeTimer = window.setTimeout(() => { element.hidden = true; }, 4800);
}

function persist(): void {
  if (!profile) return;
  const snapshot: Profile = { ...profile, records: { ...profile.records } };
  saveQueue = saveQueue.then(() => saveProfile(snapshot)).catch(() => {
    const note = get('storage-note');
    note.textContent = '本地保存失败，本次会话仍可继续游玩；关闭应用后最新设置或成绩可能丢失。';
    note.hidden = false;
    notice('保存失败：请检查本地存储权限或磁盘空间。', true);
  });
}

function updateAudio(): void {
  document.querySelectorAll<HTMLButtonElement>('.audio-button').forEach(button => {
    button.innerHTML = icon(audio.enabled ? 'sound' : 'muted');
    button.title = audio.enabled ? '声音已开启，点击静音' : '声音已关闭，点击开启';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(audio.enabled));
  });
}

function updateMenu(): void {
  const definition = DIFFICULTIES[difficulty];
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(button => {
    const active = button.dataset.difficulty === difficulty;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  get('difficulty-subtitle').textContent = definition.subtitle;
  get('difficulty-summary').textContent = `初始 ${definition.sun} 阳光 · ${definition.preparation} 秒整备 · 僵尸生命 ×${definition.health} · 数量 ×${definition.count}`;
  document.querySelectorAll<HTMLButtonElement>('[data-plant]').forEach(button => {
    const index = deck.indexOf(button.dataset.plant as PlantKind);
    button.classList.toggle('selected', index >= 0);
    button.setAttribute('aria-pressed', String(index >= 0));
    button.querySelector('.plant-order')!.textContent = index >= 0 ? `${index + 1}` : '+';
  });
  get('deck-count').textContent = `${deck.length} / 6`;
  get('deck-slots').innerHTML = Array.from({ length: 6 }, (_, index) => deck[index] ? `<span class="deck-slot filled" title="快捷键 ${index + 1}：${PLANTS[deck[index]].name}"><img src="${assetsReady ? assets.url(PLANTS[deck[index]].sprite) : ''}" alt="${PLANTS[deck[index]].name}"><small>${index + 1}</small></span>` : `<span class="deck-slot empty" aria-label="空卡槽 ${index + 1}">+</span>`).join('');
  startButton.disabled = !assetsReady || !profileReady || deck.length !== 6;
  get('start-hint').textContent = !assetsReady || !profileReady ? '正在准备花园资源与本地记录…' : deck.length === 6 ? '已带齐 6 位伙伴，准备好就出发吧。' : `还需要选择 ${6 - deck.length} 张植物卡`;
  updateRecords();
}

function updateRecords(): void {
  const record = profile?.records[`${mode}:${difficulty}`];
  get('record-category').textContent = `${modeName(mode)} · ${DIFFICULTIES[difficulty].name} · 最佳记录`;
  get('record-summary').textContent = record ? `${record.won ? '已守住花园 · ' : ''}最高 ${record.wave} 波 · ${number(record.score)} 分 · 击败 ${record.kills}` : '还没有记录，第一片绿意等你种下';
  get('all-records').innerHTML = (['campaign', 'endless'] as Mode[]).flatMap(recordMode => Object.values(DIFFICULTIES).map(item => {
    const entry = profile?.records[`${recordMode}:${item.id}`];
    return `<div class="record-row"><span>${modeName(recordMode)} · ${item.name}</span><strong>${entry ? `${entry.won ? '通关 · ' : ''}${entry.wave} 波 / ${number(entry.score)} 分` : '等待挑战'}</strong></div>`;
  })).join('') + `<p class="total-runs">已完成 ${profile?.totalRuns || 0} 局花园守卫</p>`;
}

function describePlant(kind: PlantKind): void {
  const plant = PLANTS[kind];
  get('plant-description').innerHTML = `<span class="description-leaf">${icon('leaf', 19)}</span><div><strong>${plant.name} <span>${plant.role} · 冷却 ${plant.cooldown} 秒</span></strong><p>${plant.description}</p></div>`;
}

function refreshAssetElements(): void {
  document.querySelectorAll<HTMLImageElement>('img[data-asset]').forEach(image => { image.src = assets.url(image.dataset.asset!); });
}

async function prepareAssets(): Promise<void> {
  if (loading) return;
  loading = true;
  assetsReady = false;
  get('loading-screen').hidden = false;
  get('loading-title').textContent = '花园正在苏醒';
  get('loading-description').textContent = '正在准备植物、草坪与声音，请稍候。';
  get('retry-button').hidden = true;
  get<HTMLProgressElement>('load-progress').value = 0;
  try {
    await assets.load((loaded, total) => {
      get<HTMLProgressElement>('load-progress').value = total ? loaded / total : 0;
      get('loading-count').textContent = `花园素材 ${loaded} / ${total}`;
    });
    renderer?.dispose();
    renderer = new Renderer(canvas, assets);
    assetsReady = true;
    refreshAssetElements();
    updateMenu();
    if (profileReady) get('loading-screen').hidden = true;
    else get('loading-description').textContent = '素材已准备好，正在读取本地设置与记录…';
  } catch (error) {
    get('loading-title').textContent = '花园暂时没有准备好';
    get('loading-description').textContent = `素材加载失败：${error instanceof Error ? error.message : '无法读取本地素材'}。请确认 assets 文件完整，并通过开发服务器或桌面应用打开。`;
    get('loading-count').textContent = '修复资源后可以重新加载，无需重复开启应用。';
    get('retry-button').hidden = false;
  } finally { loading = false; }
}

async function prepareProfile(): Promise<void> {
  try {
    const loaded = await loadProfile();
    profile = loaded.profile;
    if (loaded.warning) { get('storage-note').textContent = loaded.warning; get('storage-note').hidden = false; }
  } catch {
    profile = { version: 1, sound: true, totalRuns: 0, records: {} };
    get('storage-note').textContent = '本地记录读取失败，已使用本次会话的默认设置；你仍可以正常开始游戏。';
    get('storage-note').hidden = false;
  }
  profileReady = true;
  audio.setEnabled(profile.sound);
  updateAudio();
  updateMenu();
  if (assetsReady) get('loading-screen').hidden = true;
}

function startRun(options?: StartOptions): void {
  if (!assetsReady || !profileReady || utility) return;
  const next = options || { mode, difficulty, deck: [...deck] };
  if (next.deck.length !== 6) return;
  audio.stop();
  audio.unlock();
  recorded = false;
  lastOptions = { ...next, deck: [...next.deck] };
  pauseReason = '';
  hover = null;
  deckSignature = '';
  upgradesSignature = '';
  phaseSignature = '';
  engine.start(next);
  lastFrame = performance.now();
  syncUI();
}

function recordResult(state: GameState): void {
  if (recorded || !profile || (state.phase !== 'won' && state.phase !== 'lost')) return;
  recorded = true;
  profile = recordRun(profile, state);
  persist();
  updateRecords();
}

function renderBattleCards(state: GameState): void {
  const signature = state.deck.join(',');
  if (signature === deckSignature) return;
  deckSignature = signature;
  get('battle-cards').innerHTML = state.deck.map((kind, index) => {
    const plant = PLANTS[kind];
    return `<button class="seed-card" data-card="${kind}" title="${plant.name}：${plant.description}" aria-label="${index + 1}，${plant.name}，${plant.cost} 阳光"><img src="${assets.url(plant.card)}" alt=""><span class="seed-shade"></span><kbd>${index + 1}</kbd><span class="seed-name">${plant.name}</span><strong class="seed-cost">${plant.cost}</strong><span class="seed-cooldown"></span></button>`;
  }).join('');
}

function updateHud(state: GameState): void {
  get('sun-value').textContent = number(state.sun);
  get('wave-value').innerHTML = `${String(state.wave).padStart(2, '0')} <span>${state.mode === 'campaign' ? `/ ${LAST_WAVE}` : '/ ∞'}</span>`;
  get('score-value').textContent = number(state.score);
  get('kills-value').textContent = number(state.kills);
  get('elapsed-value').textContent = duration(state.elapsed);
  const playing = isPlaying(state.phase);
  document.querySelectorAll<HTMLButtonElement>('.seed-card').forEach(button => {
    const kind = button.dataset.card as PlantKind;
    const remaining = state.cooldowns[kind];
    const baseCooldown = PLANTS[kind].cooldown * Math.pow(0.88, state.upgrades.cooldown || 0);
    button.classList.toggle('selected', state.selected === kind);
    button.classList.toggle('unaffordable', state.sun < PLANTS[kind].cost);
    button.classList.toggle('cooling', remaining > 0);
    button.setAttribute('aria-pressed', String(state.selected === kind));
    button.disabled = !playing || utility !== null;
    (button.querySelector('.seed-shade') as HTMLElement).style.height = `${Math.min(100, remaining / Math.max(0.1, baseCooldown) * 100)}%`;
    button.querySelector('.seed-cooldown')!.textContent = remaining > 0 ? `${Math.ceil(remaining)}s` : state.sun < PLANTS[kind].cost ? '阳光不足' : '';
  });
  const labels: Record<string, string> = { preparing: '开局整备', battle: state.wave % 3 === 0 ? '压力波 · 精英来袭' : '守护进行中', intermission: '波间整备', paused: '花园已暂停', upgrade: '选择你的成长', won: '花园守护成功', lost: '防线暂时失守' };
  get('phase-label').textContent = labels[state.phase] || '花园时光';
  get('phase-label').classList.toggle('pressure', state.wave % 3 === 0 && state.phase === 'battle');
  get('wave-description').textContent = state.phase === 'preparing' || state.phase === 'intermission' ? `${Math.ceil(state.countdown)} 秒后开始出兵，趁现在布好防线。` : state.phase === 'battle' ? `场上 ${state.zombies.filter(zombie => !zombie.dead).length} 只僵尸 · 待出兵预算 ${Math.ceil(state.spawnRemaining)}` : state.phase === 'paused' ? '所有生长与战斗计时均已停下。' : '每一次选择，都会让花园更强。';
  get('upcoming').textContent = state.upcoming;
  get('skip-button').hidden = state.phase !== 'preparing' && state.phase !== 'intermission';
  get<HTMLButtonElement>('skip-button').disabled = !playing || utility !== null;
  get('speed-button').textContent = `${state.speed}× 速度`;
  get('speed-button').setAttribute('aria-label', `当前 ${state.speed} 倍速度，点击切换`);
  get('shovel-button').classList.toggle('selected', state.selected === 'shovel');
  get('shovel-button').setAttribute('aria-pressed', String(state.selected === 'shovel'));
  get<HTMLButtonElement>('shovel-button').disabled = !playing || utility !== null;
  get('pause-button').innerHTML = `${icon(state.phase === 'paused' ? 'play' : 'pause', 17)}<span>${state.phase === 'paused' ? '继续' : '暂停'}</span><kbd>空格</kbd>`;
  get<HTMLButtonElement>('pause-button').disabled = !playing && state.phase !== 'paused';
  get<HTMLButtonElement>('speed-button').disabled = !playing && state.phase !== 'paused';
  get('selection-label').textContent = state.selected === 'shovel' ? '铲子已就绪 · 点击植物移除，不返还阳光' : state.selected ? `${PLANTS[state.selected].name} · ${PLANTS[state.selected].cost} 阳光 · 点击空格种植` : '点击阳光收集 · 选择植物后点击草坪种植';
  canvas.classList.toggle('has-selection', !!state.selected && playing);
  const message = get('board-message');
  message.hidden = !state.message || state.messageTime <= 0;
  message.textContent = state.message;
  const upgradeKey = allUpgrades.map(upgrade => `${upgrade.id}:${state.upgrades[upgrade.id] || 0}`).join('|');
  if (upgradeKey !== upgradesSignature) {
    upgradesSignature = upgradeKey;
    const earned = allUpgrades.filter(upgrade => state.upgrades[upgrade.id] > 0);
    const count = earned.reduce((total, upgrade) => total + state.upgrades[upgrade.id], 0);
    get('upgrade-count').textContent = String(count);
    get('earned-upgrades').innerHTML = earned.length ? earned.map(upgrade => `<div class="earned-upgrade" title="${escapeHtml(upgrade.description)}"><span>${upgrade.icon}</span><div><strong>${upgrade.name}</strong><small>${upgrade.max ? `等级 ${state.upgrades[upgrade.id]} / ${upgrade.max}` : '补给已领取'}</small></div><b>×${state.upgrades[upgrade.id]}</b></div>`).join('') : '<p class="empty-upgrades">每守住 3 波，<br>为花园选择一份成长礼物。</p>';
  }
}

function freezeForPanel(): void {
  if (isPlaying(engine.state.phase)) { engine.pause(); pauseReason = '操作面板开启时，花园会停下来等你。'; }
  hover = null;
}

function setInert(): void {
  const primaryOpen = !phaseOverlay.hidden;
  get('shell').inert = primaryOpen || utility !== null || !get('loading-screen').hidden;
  phaseOverlay.inert = utility !== null;
}

function focusDialog(overlay: HTMLElement): void {
  queueMicrotask(() => (overlay.querySelector<HTMLElement>('[data-focus], button') || overlay).focus());
}

function openUtility(kind: 'help' | 'leave'): void {
  if (!assetsReady || !profileReady) return;
  if (kind === 'leave' && engine.state.phase === 'menu') return;
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  freezeForPanel();
  utility = kind;
  if (kind === 'help') {
    utilityOverlay.innerHTML = `<section class="modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button class="modal-close icon-button" data-action="close-panel" aria-label="关闭说明">${icon('close')}</button><p class="eyebrow">A FIELD GUIDE TO YOUR GARDEN</p><h2 id="help-title">让花园，好好生长</h2><p class="modal-intro">一点阳光，一点策略，还有一群可靠的植物伙伴。</p><div class="help-columns"><div><h3>从第一株向日葵开始</h3><ol><li>九种植物选六种，选定模式与难度后出发。</li><li>点击天降或向日葵产出的阳光，购买植物。</li><li>先点卡片，再点草坪空格；有阳光且冷却结束即可种植。</li><li>抵挡每一波僵尸。每行割草机可救场一次，被越过防线则失败。</li></ol><h3>波次与成长</h3><p>闯关共 12 波，无尽持续挑战。清完当前波才进入下一波，每 3 波获得三选一强化，闯关最后一波直接结算。第 3、6、9、12 波及之后的每个三倍数波有精英压力。</p></div><div><h3>顺手的花园工具</h3><dl class="shortcut-list"><div><dt><kbd>1</kbd>–<kbd>6</kbd></dt><dd>选择对应植物卡</dd></div><div><dt><kbd>Q</kbd></dt><dd>选择铲子，移除植物</dd></div><div><dt><kbd>空格</kbd></dt><dd>暂停 / 继续对局</dd></div><div><dt><kbd>Esc</kbd> / 右键</dt><dd>取消选卡或铲子</dd></div><div><dt>1× / 2×</dt><dd>切换模拟速度</dd></div></dl><h3>记住这几件小事</h3><p>撑杆僵尸能越过一株植物，读报僵尸丢失报纸后会暴走。火炬会点燃冰豌豆，使其失去减速。小喷菇白天可用，但射程较短；土豆雷要等它成熟。</p></div></div><p class="help-note">切后台或窗口失焦会自动暂停，返回后需主动继续。离开未完成的对局会按失守结算。只保存设置与分类最佳成绩，不提供中途存档。</p><button class="button button-primary" data-action="close-panel" data-focus>记住了，去照顾花园 ${icon('leaf', 18)}</button></section>`;
  } else {
    utilityOverlay.innerHTML = `<section class="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="leave-title"><span class="modal-emblem">${icon('leaf', 33)}</span><p class="eyebrow">TAKE A LITTLE BREAK</p><h2 id="leave-title">要暂时离开花园吗？</h2><p class="modal-intro">当前对局会以失守结算，并保存本局成绩。植物与强化不会保留，下次将从新花园开始。</p><div class="modal-actions"><button class="button button-outline" data-action="close-panel" data-focus>留下，继续守护</button><button class="button button-danger" data-action="confirm-leave">结束本局并返回</button></div></section>`;
  }
  utilityOverlay.hidden = false;
  syncUI();
  setInert();
  focusDialog(utilityOverlay);
}

function closeUtility(): void {
  utility = null;
  utilityOverlay.hidden = true;
  syncUI();
  if (!phaseOverlay.hidden) focusDialog(phaseOverlay);
  else if (returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
}

function showPhaseOverlay(state: GameState): void {
  const visible = ['paused', 'upgrade', 'won', 'lost'].includes(state.phase);
  phaseOverlay.hidden = !visible;
  if (!visible) { phaseOverlay.innerHTML = ''; return; }
  if (state.phase === 'paused') {
    phaseOverlay.innerHTML = `<section class="modal pause-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title"><span class="modal-emblem">${icon('pause', 33)}</span><p class="eyebrow">LET THE GARDEN TAKE A BREATH</p><h2 id="pause-title">阳光慢一点，也很好。</h2><p class="modal-intro">${escapeHtml(pauseReason || '花园已经暂停。所有战斗、生长和冷却都在等你回来。')}</p><button class="button button-primary" data-action="resume" data-focus>${icon('play', 18)} 继续守护 <kbd>空格</kbd></button><div class="pause-secondary"><button class="text-button" data-action="help">查看游戏说明</button><button class="text-button" data-action="leave">结束本局并返回</button></div></section>`;
  } else if (state.phase === 'upgrade') {
    phaseOverlay.innerHTML = `<section class="modal upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="upgrade-title"><p class="eyebrow">A LITTLE STRONGER, A LITTLE GREENER</p><span class="chapter-pill">已守住第 ${state.completedWave} 波</span><h2 id="upgrade-title">为下一段生长，选一份礼物。</h2><p class="modal-intro">三选一，强化只在本局生效。此时花园已暂停。</p><div class="upgrade-choices">${state.upgradeChoices.map((choice, index) => `<button class="upgrade-choice" data-upgrade="${choice.id}" ${index === 0 ? 'data-focus' : ''}><span class="upgrade-art">${choice.icon}</span><span class="upgrade-type">${choice.max ? `成长强化 · ${choice.level} / ${choice.max}` : '即刻补给'}</span><strong>${choice.name}</strong><p>${escapeHtml(choice.description)}</p><span class="upgrade-pick">选择这份礼物 ${icon('arrow', 17)}</span></button>`).join('')}</div><button class="text-button" data-action="leave">结束本局并返回菜单</button></section>`;
  } else {
    const won = state.phase === 'won';
    phaseOverlay.innerHTML = `<section class="modal result-modal ${won ? 'is-won' : ''}" role="dialog" aria-modal="true" aria-labelledby="result-title"><span class="modal-emblem">${icon(won ? 'trophy' : 'leaf', 38)}</span><p class="eyebrow">${won ? 'A BEAUTIFUL DAY IN YOUR GARDEN' : 'EVERY GARDEN STARTS AGAIN'}</p><h2 id="result-title">${won ? '每一寸绿意，都守住了。' : '休息一下，再种一片希望。'}</h2><p class="modal-intro">${modeName(state.mode)} · ${DIFFICULTIES[state.difficulty].name}　${won ? '成功守住全部 12 波' : `防线在第 ${state.wave} 波暂时失守`}</p><div class="result-values"><div><small>本局得分</small><strong>${number(state.score)}</strong></div><div><small>守住波次</small><strong>${state.completedWave}<span>${state.mode === 'campaign' ? ' / 12' : ' 波'}</span></strong></div><div><small>击败僵尸</small><strong>${state.kills}</strong></div><div><small>花园时光</small><strong>${duration(state.elapsed)}</strong></div></div><p class="result-note">本局已计入对应模式与难度的记录。</p><div class="modal-actions"><button class="button button-outline" data-action="result-menu">${icon('back', 17)} 返回菜单</button><button class="button button-primary" data-action="restart" data-focus>${icon('reset', 17)} 相同阵容再来一局</button></div></section>`;
  }
  if (!utility) focusDialog(phaseOverlay);
}

function syncUI(): void {
  const state = engine.state;
  const inMenu = state.phase === 'menu';
  menuPage.hidden = !inMenu;
  gamePage.hidden = inMenu;
  document.body.classList.toggle('in-game', !inMenu);
  recordResult(state);
  if (!inMenu && assetsReady) {
    renderBattleCards(state);
    get('battle-title').innerHTML = `${modeName(state.mode)} <span>${DIFFICULTIES[state.difficulty].name}</span>`;
    updateHud(state);
  }
  const signature = `${state.phase}:${state.phase === 'upgrade' ? state.upgradeChoices.map(choice => `${choice.id}-${choice.level}`).join(',') : ''}`;
  if (signature !== phaseSignature) {
    phaseSignature = signature;
    showPhaseOverlay(state);
    if (inMenu) updateMenu();
  }
  setInert();
}

function returnToMenu(): void {
  utility = null;
  utilityOverlay.hidden = true;
  engine.returnToMenu();
  audio.stop();
  hover = null;
  syncUI();
}

function togglePause(): void {
  if (utility || (!isPlaying(engine.state.phase) && engine.state.phase !== 'paused')) return;
  pauseReason = '';
  engine.togglePause();
  hover = null;
  syncUI();
}

function select(kind: PlantKind | 'shovel'): void {
  if (utility || !isPlaying(engine.state.phase)) return;
  engine.select(engine.state.selected === kind ? null : kind);
  updateHud(engine.state);
}

app.addEventListener('click', event => {
  const target = (event.target as Element).closest<HTMLButtonElement | HTMLAnchorElement>('button, a[data-action]');
  if (!target || target instanceof HTMLButtonElement && target.disabled) return;
  audio.unlock();
  const { action } = target.dataset;
  if (target.dataset.mode) { mode = target.dataset.mode as Mode; updateMenu(); return; }
  if (target.dataset.difficulty) { difficulty = target.dataset.difficulty as DifficultyId; updateMenu(); return; }
  if (target.dataset.plant) {
    const kind = target.dataset.plant as PlantKind;
    const index = deck.indexOf(kind);
    if (index >= 0) deck.splice(index, 1);
    else if (deck.length < 6) deck.push(kind);
    else notice('六个卡槽都满了，先取消一位伙伴，再选择新的植物。');
    describePlant(kind);
    updateMenu();
    return;
  }
  if (target.dataset.card) { select(target.dataset.card as PlantKind); return; }
  if (target.dataset.upgrade && !utility && engine.state.phase === 'upgrade') {
    engine.chooseUpgrade(target.dataset.upgrade as UpgradeId);
    syncUI();
    return;
  }
  switch (action) {
    case 'brand': event.preventDefault(); if (engine.state.phase !== 'menu') {
      if (engine.state.phase === 'won' || engine.state.phase === 'lost') returnToMenu(); else openUtility('leave');
    } break;
    case 'start': startRun(); break;
    case 'recommend': deck = [...DEFAULT_DECK]; updateMenu(); notice('已选好均衡阵容：产能、输出、防御、减速与应急清场。'); break;
    case 'sound':
      if (!profileReady || !profile) break;
      audio.setEnabled(!audio.enabled); profile = { ...profile, sound: audio.enabled }; updateAudio(); persist(); break;
    case 'help': openUtility('help'); break;
    case 'close-panel': closeUtility(); break;
    case 'pause': case 'resume': togglePause(); break;
    case 'speed': if (!utility && (isPlaying(engine.state.phase) || engine.state.phase === 'paused')) { engine.setSpeed(engine.state.speed === 1 ? 2 : 1); updateHud(engine.state); } break;
    case 'shovel': select('shovel'); break;
    case 'skip': if (!utility && isPlaying(engine.state.phase)) { engine.skipPreparation(); syncUI(); } break;
    case 'leave': openUtility('leave'); break;
    case 'confirm-leave': engine.abandon(); recordResult(engine.state); returnToMenu(); break;
    case 'result-menu': returnToMenu(); break;
    case 'restart': if (lastOptions) startRun({ ...lastOptions, deck: [...lastOptions.deck] }); break;
    case 'retry': void prepareAssets(); break;
  }
});

const inspectPlant = (event: Event): void => {
  const button = (event.target as Element).closest<HTMLElement>('[data-plant]');
  if (button) describePlant(button.dataset.plant as PlantKind);
};
get('menu-page').addEventListener('pointerover', inspectPlant);
get('menu-page').addEventListener('focusin', inspectPlant);
canvas.addEventListener('pointermove', event => {
  if (!renderer || utility || !isPlaying(engine.state.phase)) { hover = null; return; }
  const point = renderer.point(event);
  const col = Math.floor((point.x - WORLD.x) / WORLD.cellWidth);
  const row = Math.floor((point.y - WORLD.y) / WORLD.cellHeight);
  hover = row >= 0 && row < WORLD.rows && col >= 0 && col < WORLD.cols ? { row, col } : null;
});
canvas.addEventListener('pointerleave', () => { hover = null; });
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !renderer || utility || !isPlaying(engine.state.phase)) return;
  event.preventDefault();
  canvas.focus({ preventScroll: true });
  audio.unlock();
  const point = renderer.point(event);
  engine.click(point.x, point.y);
  syncUI();
});
gamePage.addEventListener('contextmenu', event => {
  event.preventDefault();
  if (!utility && isPlaying(engine.state.phase)) { engine.select(null); hover = null; updateHud(engine.state); }
});

document.addEventListener('keydown', event => {
  const dialog = utility ? utilityOverlay : !phaseOverlay.hidden ? phaseOverlay : null;
  if (event.key === 'Tab' && dialog) {
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'));
    const first = controls[0]; const last = controls[controls.length - 1];
    if (first && (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    return;
  }
  if (utility) { if (event.key === 'Escape') { event.preventDefault(); closeUtility(); } return; }
  if ((event.target as HTMLElement).matches('input, textarea, select, [contenteditable="true"]') || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.code === 'Space' && (isPlaying(engine.state.phase) || engine.state.phase === 'paused')) { event.preventDefault(); togglePause(); return; }
  if (!isPlaying(engine.state.phase)) return;
  if (/^[1-6]$/.test(event.key)) { event.preventDefault(); const kind = engine.state.deck[Number(event.key) - 1]; if (kind) select(kind); }
  else if (event.code === 'KeyQ') { event.preventDefault(); select('shovel'); }
  else if (event.key === 'Escape') { event.preventDefault(); engine.select(null); hover = null; updateHud(engine.state); }
});

function autoPause(): void {
  if (!isPlaying(engine.state.phase)) return;
  pauseReason = '你刚刚离开了窗口，花园已自动暂停。准备好后，点击继续。';
  engine.pause();
  hover = null;
  syncUI();
}
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });

// One animation loop for the entire application; speed and fixed steps belong to the engine.
function frame(now: number): void {
  const delta = Math.max(0, Math.min(0.2, (now - lastFrame) / 1000));
  lastFrame = now;
  if (assetsReady && profileReady && !utility && !document.hidden) engine.update(delta);
  if (assetsReady && engine.state.phase !== 'menu') renderer?.draw(engine.state, utility ? null : hover);
  if (now - lastHud >= 100) { syncUI(); lastHud = now; }
  requestAnimationFrame(frame);
}
updateMenu();
updateAudio();
setInert();
void prepareProfile();
void prepareAssets();
requestAnimationFrame(frame);
window.addEventListener('pagehide', () => { audio.stop(); renderer?.dispose(); });