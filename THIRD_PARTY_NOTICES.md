# 第三方素材与转换说明

本文件记录随附第三方素材的历史出处，不代表项目之间存在代码、构建或运行依赖。游戏所需资源均已包含在本项目中。

当前这批图像和音效最初从 `PlantsVsZombies-Qt/PlantsVsZombies/rc` 收集，其来源仓库的 `LICENSE` 为 Apache License 2.0，已逐字节保留到 [licenses/PlantsVsZombies-Qt-LICENSE](licenses/PlantsVsZombies-Qt-LICENSE)。这份副本保留原始文本，没有替换版权人或追加授权条款。

《植物大战僵尸》名称、角色、美术及音效的原始权利归其各自权利人（包括 PopCap Games / Electronic Arts）所有。复制上述仓库的 LICENSE 是记录来源；它不表示本项目另行取得这些商业游戏素材或商标的授权。

## 导入内容

- 43 个独立 GIF 转为 43 张 RGBA PNG 动画图集和 43 张首帧预览；名单为下列 41 项以及额外的 `NewsDie`、`PoleZombieDie`。
- 12 张静态图原样复制：1400 × 600 的 `background1.jpg`、九张 `card_*.png`、`Shovel.png`、`mainlogo.png`。
- 14 个 WAV 原样复制：`Boom`、`Eat`、`Fire`、`Lose`、`Mush`、`NewsLost`、`NotEnoughSun`、`Pea`、`PeaHit`、`Place`、`Pole`、`Potato`、`ShieldHit`、`Sun`。
- 从 `mainlogo.png` 生成透明、等比居中的 favicon 和应用图标，使用 Lanczos 抗锯齿和预乘 alpha 缩放。输出包括 `public/favicon.png`，以及 `src-tauri/icons/32x32.png`、`128x128.png`、`128x128@2x.png`、`icon.png` 和包含 16/24/32/48/64/128/256 像素尺寸的 `icon.ico`。

必需动画的原始基名如下，大小写与源文件一致：

```text
Peashooter SunFlower WallNut Wallnut_1 Wallnut_2 Repeater IcePeaShooter
FireTree CherryBomb PotatoMine PotatoMine_1 Mushroom Sun
Zombie ZombieAttack ZombieFlag ZombieFlagAttack ZombieCone ZombieConeAttack
ZombieBucket ZombieBucketAttack PoleZombie PoleZombieWalk PoleZombieAttack
PoleZombieJump PoleZombieJump2 NewsWalk_1 NewsAttack_1 NewsLost NewsWalk NewsAttack
Pea PeaIce PeaFire Mush PeaHit Fire Boom PotatoMine_mashed BurnDie ZombieDie
```

## 转换与修改记录

转换脚本 `scripts/import_assets.py` 是可选的素材开发工具，依赖 Pillow，不参与普通开发启动、构建或运行。现有资源已经随项目提供，无需重新导入。

需要更新原始素材时，显式指定包含所列 GIF、图片和 WAV 的目录；可选地指定需要一并保存的许可证文件：

```powershell
python scripts/import_assets.py --source "D:\Artwork\GardenGuard" --license "D:\Artwork\LICENSE.txt"
```

脚本不查找相邻项目、不假设许可证位置；素材目录可以位于本项目内或其他位置，但不能使用生成资源目录作为输入。输出位置始终相对于本项目。通过 `--license` 提供的文件保存为 `licenses/imported-assets-LICENSE`，现有历史许可证副本保留。脚本只写入明确列举的生成文件，不清空目录，不修改来源目录，也不删除其他文件。导入新素材时需同步更新本文件中的来源记录。

GIF 通过 Pillow 按帧顺序 `seek`，先处理 disposal 和局部帧合成，再转换为完整原始画布尺寸的 RGBA 图像。图集按行排列，每张图集的宽高均不超过 8192 像素；动画的透明留白、锚点画布和逐帧尺寸保持不变。PNG 元数据和 `public/assets/manifest.json` 均记录转换来源。

原始逐帧时长以毫秒记录在 manifest 的 `sourceDurationsMs` 中；播放时长在 `durationsMs` 中，零值或缺失值按 100 毫秒处理。为避免一次性特效被极长的最后一帧拖住，`Boom`、`BurnDie`、`ZombieDie`、`NewsDie`、`PoleZombieDie` 的最后一帧播放时长最多为 250 毫秒；其他帧保留原始非零时长。`durationMs` 是实际播放时长之和。

静态 JPG/PNG 和 WAV 直接复制，内容不作转换；应用图标经过透明裁边、等比缩放和留白，GIF 衍生图集及预览均为本次修改产生的文件。

## 运行时资源约定

`Assets.load()` 从同源 `assets/manifest.json` 加载全部静态图、动画图集和首帧预览。资源根遵循 Vite 的 `import.meta.env.BASE_URL`，默认根为 `/assets/`。无需访问外部网址。

资源名使用原文件基名，不带扩展名。`image(name)` / `url(name)` 对动画返回独立首帧预览，对静态资源返回复制的原图。`size(name)` 返回原图或单帧画布尺寸；`duration(name)` 返回秒，静态图为零。`draw(ctx, name, x, y, time, scale = 1, loop = true)` 的坐标是绘制左上角，时间单位是秒，按单帧原尺寸缩放；非循环动画到结尾后保持最后一帧，生命周期清理由调用方负责。加载进度计数包含 manifest、静态图、图集和预览，不包含延迟解码的音效。

`GameAudio.unlock()` 应在用户鼠标/指针等交互回调中调用，以创建或恢复 WebAudio；首次解锁预加载并缓存所有 WAV，每个文件只读取和解码一次。`play` 使用 WAV 基名。声音每类最多同时 3 路、总计最多 16 路，并按音效设置最小触发间隔；全局满载时结束最早的声道。关闭音效和 `stop()` 会结束当前声道并取消待解码音效的后续播放。音频加载、解码或 WebAudio 不可用时静默降级，不影响游戏流程；不创建游戏动画定时器。
