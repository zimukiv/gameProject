# 关卡换版 + 导入机制修复 初稿（2026-10-27）

用户提供新关卡 `D:\QQ download\第一大关 · 物理 DDL (1).json`，并反馈三条：①修正没进包 ②导入没素材 ③导入后机制变回原样。本文整理问题、实测证据与修改初稿，待确认后实施。

## 一、问题整理（含实测证据）

### 1. 你的关卡修正确实没进包

| 项 | 包内现用 | 你的新文件 |
| --- | --- | --- |
| 文件 | `Assets/StreamingAssets/RoomLabNative/AuthoredPhysics/authored-physics.json` | `D:\QQ download\第一大关 · 物理 DDL (1).json` |
| 字节 | 1,839,449 | 1,840,048 |
| SHA256 | `73c0df8eb955f22ae9fa56e30537e87751e2dfab3b45143d81885d873b2a5ad9` | `880a65111ff27bc0389da57ac110784a15c412a70fa99f0f2c0aeeb00633ee06` |

逐项差异（新文件相对包内）：

| 房间 | 变化 |
| --- | --- |
| `8` | 机关 `block-mvnea26w-8ofltv` x 11 → 9；新增 `common.checkpoint`(19,1)；删除 1 块冰（冰 32 → 31） |
| `AI追逐1` | 删除地形格 (44,7)，在该格新增 `physics.ice`（冰 18 → 19、地形 84 → 83、对象 73 → 74）；温区有改动 |
| `XX` | 地形 (41,40) → (41,41)；一条导轨补全显式参数（acceleration 2400 / allowExit / cooldown 2 / launchAngle −120 / maxSpeed 900）；房间入口有改动 |

总计：11 房 / 10 连接 / **696 对象（+1）** / **1310 地形（−1）** / **8 检查点（+1）** / 9 素材。
`settings.paidStockCap` 仍是 3（这是编辑器 2.5.5 工程自身的设置，不是本次修正）。

### 2. 「导进去没素材」= 只发 JSON、没带 assets 目录

用探针（新增 `Tools/RoomLabNative/ImportProbe`）实测三种输入：

```
带 assets 目录：   OK rooms=11 assets=9 sha=880a6511ff27bc0389da57ac110784a15c412a70fa99f0f2c0aeeb00633ee06
只有 JSON：        FAIL NativeDataException: 缺少素材：assets/seed-metal.svg
旧 物理 DDL.zip：  FAIL NativeDataException: 对象或地形越界：AI追逐1
```

- 导入固定走 `RequireAssets=true`，`assets/` 不在 JSON 同目录就直接拒绝，游戏保留原关卡 —— 玩家看到的就是「导进去没变化/没素材」。
- 好消息：你这份 (1) 正是修 `对象或地形越界：AI追逐1` 的那一版（删掉越界地形格、改成冰块），所以旧 zip 进不去、新 JSON 能进。
- 9 个 SVG 与包内逐字节相同，换版不需要动美术。

### 3. 「机制又变回原来的」= 导入关卡固定使用 2.5.5 兼容规则

`Presentation/NativePhysicsDemoPlayer.cs → ImportFile()` 里写死：

```csharp
CommitCandidate(data,NativeGameplayRules.Editor255Compat,false);
```

而内置关卡用的是 `DemoPhysics`。所以导入后：付费冲刺回到 3/3 上限 3、AI 每次偷 `1+2×tier` 个 token、AI 启动板踩踏触发、收藏品玩家可拾取、喷气板任意接触触发。

## 二、修改初稿

### A. 把内置关卡换成你的新文件（原字节）

1. 覆盖 `Assets/StreamingAssets/RoomLabNative/AuthoredPhysics/authored-physics.json` 为 `880a6511…` 原字节；`assets/` 保持不动（已核对逐字节相同）。
2. 更新 `AuthoredPhysics/provenance.json` 的源 SHA 与字节数。
3. 更新所有写死源 SHA 的位置：`Handoff/AUTHORED_THERMAL_DIAGNOSIS.md`、`Handoff/NATIVE_EXECUTION.md`、`Handoff/NATIVE_P4_CONTRACT.md`、`Handoff/NATIVE_P5_CONTRACT.md`、`Validation/Native/P4/README.md`、`Validation/Native/P4/final-provenance.json`、`Tools/RoomLabNative/AuthoredChecks/Program.cs`。
4. 重新生成 P0 冻结基线（`Tools/RoomLabNative/freeze-baseline.cjs`），否则 `--check` 会因源字节变化报红。
5. 存档身份含源 SHA，旧进度自动隔离；群测说明里写明「换版后进度不继承」。

### B. 导入容错：没带 assets 也能进（用内置美术兜底）

`ImportFile()` 改两段式（v2 已具备「缺绑定回退内置像素美术」的能力，这里补上「缺素材文件」的入口）：

```csharp
try { data = NativeProjectLoader.LoadFile(path,new ImportOptions{Profile=ImportProfile.EditorAuto,RequireAssets=true}); }
catch(NativeDataException e) when (e.Message.StartsWith("缺少素材：")||e.Message.StartsWith("项目包缺少素材：")) {
    data = NativeProjectLoader.LoadFile(path,new ImportOptions{Profile=ImportProfile.EditorAuto,RequireAssets=false});
    fallbackArt = true;                     // 提示：未随包提供 assets，已用内置像素美术替代
}
```

并行改提示语，直接告诉玩家怎么修：

- 缺素材 → 「未找到 assets 目录：请把 assets 文件夹与 JSON 放在同一目录，或导入编辑器导出的 ZIP；本次已用内置美术替代」
- 其它失败 → 保留现有「导入失败，当前实验保留：<原因>」

### C. 导入沿用本包规则（DemoPhysics）

1. `ImportFile()` 改为 `CommitCandidate(data,NativeGameplayRules.DemoPhysics,false)`。
2. 同步改断言与文案：
   - `Presentation/NativeDemoAcceptance.cs`：`app.Game.Rules==Editor255Compat` → `DemoPhysics`
   - `NativePhysicsDemoPlayer.Verify()`：`Game.Rules!=Editor255Compat` 断言、`NATIVE_PHYSICS_UI_PASS` 文案
   - 导入存档 identity 由 `import-<sha>-Editor255Compat` 变 `import-<sha>-DemoPhysics`（旧导入进度不继承）
3. 建议加一个开关（默认关）：设置 → 显示 里「导入关卡沿用 2.5.5 原规则」，勾上时导入仍用 `Editor255Compat`，方便别人拿自制关按原设定验证。
4. `NativeGameplayRules` 保留 `Editor255Compat` / `LatestPhysics` 两档给回归与策划案派生档，`DemoPhysics` 成为「本包统一规则」。

### D. 需要跟着改的测试（已实测确认范围很小）

已用探针把新关卡跑过全部冰检查：

```
带 assets 导入： OK rooms=11 assets=9 sha=880a6511…ee06
ICE_RULES_PASS checks=30 rules=Editor255Compat
```

也就是说 `NativeAuthoredIceChecks` 的 30 项断言在新数据下**全部通过**，原因是它只依赖「冰引入」（42 冰，未改）与「冰跑酷」（26 冰 = 25×5s/1s + 1×1s/1s，未改）；本次改动的房间 `8`（冰 32→31、新增检查点 1 个）与 `AI追逐1`（冰 18→19、地形 84→83）不在断言范围内。

需要改的只有：

- `Tools/RoomLabNative/AuthoredChecks/Program.cs`：硬编码的源 SHA `73c0df8e…` → `880a6511…`（这是 31 项里的第 31 项「源字节一致」断言）。
- `NativePhysicsDemoPlayer.Verify()` 的 `RoomCount==11 / ConnectionCount==10 / assets==9` 仍成立，无需改。
- 建议顺手把 `AuthoredChecks` 的 SHA 断言改成「可传入期望值」，避免以后每次换版都要改代码。

### E. 验收与打包

1. 无 Unity 回归：`DataChecks 117`、`MotionChecks 9679`、`ProgressChecks 572`、`GameplayChecks 4,110,794`、`DemoRuleChecks`（新增 4 项：带 assets 导入成功、无 assets 兜底导入成功、导入后 Rules==DemoPhysics、导入关卡 E 启动 AI + AI 扣半两击）。
2. 实机：`-nativePhysicsVerify`（生产验收）+ `-nativeUiMatrix`（7 分辨率 × 8 界面 + 专项截图）重跑，全部 0 PROBLEM。
3. 重出 v2 群测包（替换现有 zip 与目录），更新 `FILES_SHA256.json`、zip SHA256 文本与 `先看我_群测说明.txt`（写明新关卡 SHA、进度不继承、导入无需 assets 也能进）。
4. 新增探针工具留在 `Tools/RoomLabNative/ImportProbe`，用于以后快速判定「这份 JSON/ZIP 能不能进」。

## 三、待拍板

1. 导入默认用本包规则（DemoPhysics）？我建议：默认用，并留「按 2.5.5 原规则」开关。
2. 同意重新生成 P0 冻结基线？（它只是测试夹具，不影响玩法，但不重新生成 `--check` 会红。）

确认后我按 A→E 全量实施并重新出包。

---

## 四、实施结果（2026-10-27 已按 A→E 执行）

初稿已全部落地，与初稿的差异只有一处：**P0 冻结基线不需要重新生成**。原因是 Validation/Native/baseline-manifest.json 冻结的是自己的 DDL1.3 副本（Fixtures/ddl13-custom-original.json），与 AuthoredPhysics/authored-physics.json 无关；换版后 P0_CHECK_PASS files=53 oracleFiles=71 cases=16 operations=817 仍绿，已实测确认。

| 步骤 | 结果 |
| --- | --- |
| A 换内置关卡 | AuthoredPhysics/authored-physics.json = 880a6511…（1,840,048 字节原字节）；provenance.json 记录新旧 SHA 与换版说明；4 份历史文档加换版提示行；AuthoredChecks 源 SHA 参数化（--expect-sha=），绿 AUTHORED_ICE_PASS checks=31 source=880a6511…、红控制 --old-baseline 如期失败 |
| B 导入容错 | 两段式 ImportFile：缺 assets 时 RequireAssets=false 重试；NativeDemoAssets.Decode(allowUnresolved) 跳过未解析素材，Has(id) 让渲染层回退内置美术；提示语可操作。实机 BARE_JSON accepted=True rules=DemoPhysics，像素统计 17,821 色、纯白 0.01% |
| C 导入本包规则 | 导入改用 DemoPhysics；NativeDemoAcceptance / Verify 断言与日志同步（NATIVE_PHYSICS_UI_PASS … rules=DemoPhysics）；新增设置开关「导入关卡：按 2.5.5 原规则」，默认本包规则 |
| D 测试 | DATA 117 / MOTION 9679 / PROGRESS 572 / GAMEPLAY 4,110,794 / DEMO RULES 30（+4：换版 SHA、696/1310/8 计数、裸 JSON 必须先被拒、再走兜底可载入）/ AUTHORED ICE 31 |
| E 打包 | 生产验收 CORE 390、IMPORT 12、ICE 30、SOUND、EXIT 10、UI PASS；矩阵 61 张 0 PROBLEM；v2 包重出 |

打包后独立验证：ZIP 解压到临时目录直接跑 -nativeUiMatrix → 退出 0、0 PROBLEM、59 张截图；解压目录 Assembly-CSharp.dll = A3AAB112800186BB51E7452CD1C280FF13E2D6DD38296E358B6F917E515F94D9，与清单一致。

v2 包：交付/物理DDL_Demo_群测版_v2_20261027.zip，68,830,784 字节，SHA256  b149f355e725dab01fee49b3deea776d2bb17798bdb1aaa137f88c65e7327bf。
