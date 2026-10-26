# 策划关卡导入 · 2026-10-26

> 此页为之前保留 Unity 规则的历史导入版。用户已改为完全采用 RoomLab 原规则；当前入口和验证见 [ROOMLAB_EXACT.md](ROOMLAB_EXACT.md)。

已从 `D:\minigame\策划\第一大关 · 物理 DDL.json` 导入 17 个物理房间、1833 块地形、571 个功能对象。

## 现在怎么玩

双击 `D:\minigame\RoomLab-Unity-Playtest-20261026\RoomLabUnityPlaytest.exe`。

A/D 移动，空格/W 跳跃，Shift 水平冲刺，靠近温控板按 E，R 重试，F1 选择任意房间，Esc 暂停。
试玩程序使用独立 Company/Product，与原游戏存档分开。

Unity 主工程：`D:\minigame\B-three-levels-demo`。
场景目录：`Assets/RoomLabImports/import-235bb7bfa554/Scenes`。
打开 `Room01.unity` 并 Play，可通过 F1 切换其他房间。完整名称对应见上一级 `scene-index.json`。
这些是独立导入场景；主线 MainMenu/Level1/Level2/Level3 未替换，未自动加入正式通关和解锁流程。

## 规则对应

按用户选择，保留现有 Unity 玩家操控、单槽水平冲刺、AI 技能和 Token 减速规则。

- 每格转换为 1 个 Unity 世界单位；Y 轴翻转；喷气的像素速度除以 32。
- 地形、碰撞开关、机关位置、入口出口与来源 ID 保留。
- 小 Token 使用 TokenItem，大 Token 使用 BigTokenItem；收藏品使用现有 CollectibleItem。
- 冰块使用现有温控融冰机制；RoomLab 的累计站立计时、冰面摩擦参数保留在来源 JSON 中，暂不驱动 Unity。
- 温控区域按矩形范围对应，重叠热区优先；靠近按 E 切换，避免在玩家身上生成冰块。
- 电磁平台支持所有有效路径节点，沿轨道载人运动，保留当前水平抛出和空格/W 跳离规则。
- 新进入追逐阶段时消耗携带 Token，按现有公式削弱 AI；跨房保留单槽冲刺资源，并在新入口建立复活点。
- RoomLab 免费落地冲刺、三次冲刺与其角色运动参数不启用。原始完整参数保留在每个 RoomLabSourceObject 上，便于之后调整。

## 尚需策划调整的具体内容

- 17 个房间只有一条连接：喷气起跳 → 电磁加速。未接线出口只结束单房测试并打开选房菜单，不视为整个大关通关。
- XX 房间的 `object-mvnkr562-rynyda`、`object-mvnkr562-6lrms9` 没有轨道节点，保留为禁用灰色平台。
- XX 房间的 `block-mvnzity1-m1xubg` 没有对应传送出口，保留为未启用入口。
- 9 张源 SVG 已保留在导入目录 assets；当前 Unity 场景使用颜色占位，尚未做原美术绑定。
- 已验证导入和运行稳定性，尚未人工逐房验证路线都可按当前 Unity 跳跃/冲刺规则通关。

## 之后更新策划文件

1. 从 RoomLab 保存项目 JSON 和同目录 assets，或导出完整项目包后解压。
2. 在主工程目录运行：

```powershell
python Tools/RoomLabImport/prepare.py "策划导出的project.json" --asset-root "包含assets文件夹的目录"
```

3. Unity 菜单 `RoomLab > Import prepared project` 选择脚本生成的 `project.unity.json`。
4. 工具按来源 SHA 建立独立目录，拒绝覆盖已有生成场景，以保留手动调整。
5. 在新生成的场景中测试并调整间距、喷气力度和轨道。以 `import-report.json` 检查差异。

## 验证证据

- 17 场景的完整对象数量、来源坐标、轨道节点、玩家速度 8、跳速 15、单槽冲刺、AI 基础速度 14 校验通过。
- 实际 Windows Player 113 项检查通过：逐房加载、复活、跨房资源、Token 对 AI 的减速、轨道第二段载人、跳离与重置。
- 原 Level1 喷气/载人平台 49 项 Unity 回归检查通过。
- 四个原场景文件 SHA 保持一致。
- 构建与日志：`D:\minigame\RoomLabUnityImport-20261026`。
- 可复现验证脚本：`Validation/RoomLab`；复制到独立测试工程 Assets 对应位置后运行，勿在正式工程改变产品标识。
