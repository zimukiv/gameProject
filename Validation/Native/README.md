# 原生迁移 P0 冻结基线

本目录是离线兼容与行为基线，不是原生 Unity 已通过的验收报告。P0 初次独立审查为 PASS，编辑器来源散列 Minor 已关闭；本次快照修复另待独立复核，后续阶段进展以 `Handoff/NATIVE_EXECUTION.md` 为准。

## 2026 年 10 月 27 日快照别名修复

P3 对照发现旧生成器的 `snap(g)` 直接持有 `Engine.snapshot()` 返回的浅层机关状态引用。后续tick会回改已经捕获的初始/历史观察；重复生成一致也无法证明时刻正确。本次先用真实喷气顶面接触复现：捕获时 `used=false/cooldown=0`，下一tick后旧浅快照随引擎变成`true/1`，同刻的深拷贝仍为`false/0`。旧冻结actual-jet-trigger初始状态错误记录为`used=true/cooldown=0.808333333333334`。

生成器现于捕获瞬间深拷贝整个snapshot，事件切片也独立拷贝；每个case结束后断言所有已捕获帧与机关快照仍与捕获时序列化结果相同。将snap临时恢复旧浅层实现而仅在内存执行时，新断言实际拒绝`actual-jet-trigger: object snapshot mutated after capture`，且在写产物前退出。生成模式现在只写字节有变化的文件，避免触碰未变化的原始fixture。

修复仅改变`actual-jet-trigger`与7个checkpoint的历史预期，共8份trace，以及派生的`frozen-files.json`。修复后喷气初始为`false/0`、首次真实接触为`true/1`。16个case、817个输入操作保持原样；36份fixture/scenario/来源manifest/index逐个SHA256未变，15项editorSources和参考源码身份未变。完整前后文件散列、输入操作散列和复现值在`P0_SNAPSHOT_ALIAS_REPAIR.json`。修复值来自同一干净a0ecb6a引擎的捕获时刻，不使用原生实现的输出修改预期。

实际运行生成与完整`--check`通过；快照别名修复状态为`fixed_awaiting_independent_acceptance`。此前P0通过结论不能替代本次修复的独立复核。本次没有修改P3源码、第一物理大关输入或扩展Demo范围。

## 复跑

在工程根目录执行：

```powershell
node Tools/RoomLabNative/freeze-baseline.cjs --check
```

需要 Node 24（本次为 24.18.1），只用于离线验证。工具依赖只读参考提取目录和真实 2.5.5 编辑器；可通过 `ROOMLAB_REFERENCE_ROOT` 和 `ROOMLAB_EDITOR_ROOT` 明确指定。默认分别是父目录 `.project-backups/roomlab255-reference-a0ecb6a` 与 `room-editor`。

`--check` 在内存重新计算所有输出、逐字节比较冻结数据，差异返回非零，不写冻结文件。修改规格后才执行不带 `--check` 的显式重新生成，并审查所有散列差异。工具固定 Date 与伪随机种子，ZIP 时间戳、轨道节点 ID 与数据顺序可重复。

每次运行先把提取目录的 71 个项目、玩法源码和素材文件逐个与 Git 提交 `a0ecb6aa4517f14afaa2e32c825fdc71b0d246b6` 比较。Git archive 在本机转换过 CRLF，所以文本先统一换行验证内容，manifest 同时保留 Git 规范字节哈希和提取文件原始字节哈希；不是仅因目录名含提交号就信任它。冻结的默认 JSON 采用 Git 原始字节，未经过 2.5.5 迁移。

## 文件

- `baseline-manifest.json`：来源、71 个参考文件的散列、15 个实际编辑器/fflate来源文件的路径与SHA256、实际数量、参数、模块版本、房间和素材身份。`editorSources` 固定model、compatibility、collision、jet-params、registry、rail、common、archive、performance、play-camera、temperature、rail-nodes、编辑器package.json及真正解析到的fflate实现和package.json；`--check`先对照这些源身份，不能仅靠2.5.5版本字符串放行编辑器改动。
- `frozen-files.json`：生成产物散列，不包含自身以避免递归；`--check` 也直接比较其内容。
- `Fixtures/ddl13-custom-original.json` 与 `Fixtures/assets`：完整 DDL1.3 默认项目和 9 个原素材。原始 JSON 的 SHA-256 为 `404098abcf1e3ccf2f856482d95b558f2d62d2e008b08d32bf8d10ba4fbc6c8f`。
- `Fixtures/editor255-export.json/.zip`：调用真实编辑器 `model`、`registry` 和 `archive.pack` 生成，再经编辑器 `archive.unpack` 验证。包含实体存档点、左喷气与开启侧面触发的轨道，不是自制 ZIP 写读自洽测试。
- `Fixtures/legacy252-project.json`：原参考模型生成的普通旧项目，不带 compatibility 标记和新 checkpoint。
- `Fixtures/friend252-project.json`：无标记且有 checkpoint 的朋友版迁移签名。
- `Fixtures/unknown-major.json`：有效导出结构，但轨道依赖为 9.0.0，必须明确拒绝，不能自动降级。
- `Fixtures/truncated.zip`：截去真实编辑器 ZIP 后半段，中央目录缺失。
- `Fixtures/corrupt.zip`：真实编辑器 ZIP 的首项中央目录 CRC 改变一个字节，正文不变；必须校验 CRC，不能仅“解压成功就接受”。
- `Fixtures/oversized-declared.zip`：真实 fflate ZIP 的首项声明解压尺寸改为 26 MiB；在实际解压前拒绝超限或头部不一致。
- `trace-index.json`、`Traces`、`Scenarios`：16 个测试场景、817 个操作的逐步预期，固定步长 1/120 秒。
- `hardware-baseline.json`：本次只读机器信息。它不参与重新生成，因此不把机器变化或采样时间伪装成行为变化。
- `COMPATIBILITY_CONTRACT.md`：权威来源、现有冲突、素材能力与 P1 具体合同。

## Replay 格式

每份 trace 的 `project` 指向本目录内的完整测试项目，`courseId/roomId` 使用稳定 ID。构造与初始化后应用 `setup.game/player`，得到 `initial`。每个 `frames` 项按顺序执行 `op`，比较 `expected` 和新增语义 `events`。`expected.objectStatesRef` 引用 trace 顶层 `objectSnapshots`，避免每个冻结 tick 重复全部机关状态。

`tick` 消费 `dt` 与 `input`；缺少 dt 时为 1/120。`patch`、`launch`、`startRail`、`retry`、`pause` 是明确的测试装置操作。`patch` 不是玩家操作，也不属于关卡文件格式；原生运行时不能暴露给玩家。直接调用 launch/startRail 只验证对应规则，不代替真实碰撞、触发和键盘验收。

真实默认开局、真实喷气顶面接触、AI追逐1 实际多段导轨及两枚 Token、全部 7 个实际旗子接触另有 trace。7 个 checkpoint trace 保留原 flag ID，并验证 tokens=17、charges=2、recharge=7、score=1234 经修改与重试后恢复，60 个冻结 tick 结束后输入不泄漏。

基础运动使用清空机关的专用场景，避免跨房和危险物干扰。覆盖 50ms 短按、反向、松开停步、土狼跳、落地跳跃缓存、免费和付费冲刺、第三次冲刺拒绝、落地恢复、横向喷射控制、暂停冻结复活倒计时。

初始比较容差：位置/速度 0.001（编辑器像素坐标）、时间 0.00001 秒；离散资源和语义事件顺序必须一致。P2 如需调整容差，必须用具体求解器差异和路线结果审查，不能为了让失败变绿而扩大容差。

## 验收分层

P0 只证明可复现的来源和 oracle 预期。P1 验证 C# 数据读取与保真。P2 验证原生控制器和真实输入/接触。P3 验证机关与检查点，P4 验证全部房间和 UI，P5 验证实际 Windows 包与性能。任何 Node/JS 绿色结果均不能写成“原生 Unity 玩法已通过”。
