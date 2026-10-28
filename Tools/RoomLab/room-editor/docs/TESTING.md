# 测试与验收

2.5.4：`features-2.5.4-ui-smoke.cjs` 覆盖混合导入/覆盖确认、素材冲突、连线、整体撤销、标签拖动/缩放保留、回放/实际游戏暂停、退出保存全选反选和自命名；`cloud-graph-desktop-smoke.cjs` 增加名称/详情、云端多选导入及不隐式 checkout。核心测试覆盖批量原子性、端口保留、排序冲突、元数据校验与只下载项目说明、回放分段、名字与轨迹 ID 稳定性。

2.5.3：`cloud-browser-auth.test.cjs` 覆盖公开握手、私有拒绝/未知页面、不重放写请求及加密配置修复；`cloud-chromium-ui-smoke.cjs` 使用隔离 HTTP 服务模拟 curl 被拒及过期服务凭据，验证实际桌面 Chromium 请求、无效密钥拒绝、错误展示和诊断脱敏。

2.5.2 新增 `tests/play-camera.test.cjs` 和 `tests/play-camera-ui-smoke.cjs`：旧整房变换等值、边界限制、窗口比例、房间设置、跟随玩家、重试复位、编辑缩放保留以及复制/ZIP/导入保留。通过 EDITOR_EXE 复验实际发布程序。

2.5.1 新增 `tests/room-transfer-ui-smoke.cjs`（真实文件选择、追加、取消、素材冲突、撤销重做），`tests/cloud-graph-desktop-smoke.cjs`（简化后的三分区、只读云端图、切换与上传父节点、房间导出），`tests/cloud-graph-api-smoke.cjs`（随机工作区、并发关系编辑、循环与跨工作区防护、删除恢复）。`tests/cloud-desktop-smoke.cjs` 验证两台隔离桌面客户端即时协作及云端版本切换。通过 EDITOR_EXE 指定实际打包程序后复验。旧 `worktree-ui-smoke.cjs` 对应 2.4.1 的本地树界面，2.5.1 已移除该界面，不再作为当前 UI 验收入口；底层草稿兼容由核心测试覆盖。

核心测试：`pnpm test`。覆盖项目迁移、房间缩放保留、复制重绑定、连接、素材 ID/ZIP、磁盘保存、冲刺/温控/冰块/轨道、AI条件与状态回退。夹具在 tests/fixtures 内，不依赖旧 demo 文件夹。

界面测试需要 Playwright 和 Windows Edge。可以在开发环境另装 `pnpm add -D playwright`；也可设置环境变量 PLAYWRIGHT_MODULE 为现有 Playwright 模块路径。以下测试打开生成的本地页面或桌面程序并自动关闭，不使用用户浏览器会话。

```text
pnpm build
pnpm test:ui
pnpm test:assets
pnpm test:play
pnpm test:desktop
```

布局预览检查：`node tests/layout-ui-smoke.cjs`。验证顶部房间栏、窗口自适应画布、收起属性、连续图标放置、帮助弹窗、三级素材分类与候选过滤、接线板缩放平移后接线/选线及窄窗口布局。核心的 layout-assets.test.cjs 检查素材范围与旧分类兼容、端口真实坐标投影。

2.2 回归检查：`pnpm test:fixes`。检查实际画布绘制位置、空格命中、功能块擦除及撤销、拖动连放、两种 AI 板选择，以及试玩画布像素尺寸与窗口滚动。ai-blocks.test.cjs 验证实体/空心板实际碰撞与启动，以及电磁炮轨道实例独立性。

2.3.1 检查：`pnpm test:nodes` 覆盖节点图、精确坐标、排序、罗马数字、缩放后拖动、父级带动、提示开关、区域角点与温控初始状态。`pnpm test:traces` 覆盖轨迹录制、项目持久化、不同颜色同时绘制、勾选和 JSON 往返；桌面检查包含原生路径文件读写。

- ui-smoke：接线板、命名入口、尺寸缩小保留、地形与撤销、参数、草稿恢复。
- assets-ui-smoke：真实图片导入、绑定、覆盖、替换保持 ID、ZIP 往返、默认参数不改旧实例。
- play-ui-smoke：用真实键盘贯通三房，喷气、温控冰桥、AI 跨房、电磁加速、完成、暂停与重试。
- desktop-smoke：实际 Electron/便携 exe，原生磁盘读写与图片选择、中文空格路径、隔离渲染器、实际键盘试玩。

打包后设置 EDITOR_EXE 为 release 实际 RoomLab.exe 的绝对路径，再运行 `pnpm test:desktop`。仅打包成功不能代替此验收。桌面自动测试专用 ROOM_EDITOR_TEST=1 开启离屏窗口与临时文件选择参数；正常应用不接受这些参数。

日志和屏幕截图写 test-output，发布源码不包含测试运行数据。重新验收只运行涉及变化的检查；发给队友前至少运行核心、完整通关与最终 exe 桌面测试。

## 人工关卡验收

测试每个入口、安全落点与方向；出口意图是否连线或结束；冷热与冰块累计多次踩踏；轨道的路径/出射角；每种回退策略；AI 条件等待；房间缩放后的可读性。既要测试正向通关，也要故意失误验证能回退。现有示例侧重机关展示，尚需玩家试玩调整难度与路线选择。

## 2.4.0 云与兼容性检查

- `pnpm test`：77 项核心，包括旧文件/读取模块往返、碰撞覆盖、AI 别名迁移、温控目标切换与再生成。
- `node tests/save-guard-ui-smoke.cjs`：取消、取消保存、保存失败与保存后继续，不丢原大关。
- `node tests/collision-ui-smoke.cjs`：统一 AI、碰撞属性、真实 Canvas 虚线与撤销。
- `node tests/thermal-zone-ui-smoke.cjs`：空间覆盖预览、冰块绑定选项已移除、初始冷态。
- `node tests/cloud-modes-smoke.cjs`：本地 Worker 两端即时草稿，不产生自动版本；手动版本从最后读取来源分支；同字段冲突与处理。带 `--stdin` 可在隐藏输入中接受正式服务授权，始终随机创建隔离验收工作区。
- `node tests/cloud-relay-smoke.cjs`：分块校验、素材往返、原子提交冲突、工作区隔离、去重；相同隐藏输入方式支持正式服务。
- `node tests/cloud-desktop-smoke.cjs`：两个实际桌面客户端的模式选择、界面即时显示、子分支、草稿恢复与密钥加密。打包后同样通过 EDITOR_EXE 指向真正的 exe 运行。

旧读取模块和默认旧项目保留在 tests/fixtures/compat-2.3.1，未来从源码 ZIP 重建也能运行，无需依赖本机旧 release。云服务的源码包含在源码包中的 room-cloud，生产授权不随包分发。


AI 死亡回归：ai-retry.test.cjs 覆盖实体/空心、三条命、快照无引用污染、保留状态重就绪、继承禁用后召回和不二次收费；ai-retry-ui-smoke.cjs 通过键盘移动与重试实际触发，设置 EDITOR_EXE 可验收最终便携程序。


## 2.4.1 定向验收

核心新增 worktree-management、cloud-key-errors、room-limits、marquee 与 rail-children 用例。桌面脚本 `worktree-ui-smoke.cjs`、`cloud-key-errors-ui-smoke.cjs`、`room-view-ui-smoke.cjs`、`marquee-ui-smoke.cjs` 均支持 EDITOR_EXE 指向便携包；测试使用隔离 profile，原生覆盖取消检查逐字节比较文件。`cloud-desktop-smoke.cjs` 验证两个隔离客户端的即时/手动模式。`rail-edit-ui-smoke.cjs` 检查 0 标记与缩放后的实际文字变换。

工作树本机关联变化不等于云端版本重写。连接配置解密成功、只读云端认证、队友实际成功导入和双端自然协作是独立证据；不能相互替代。
## 2.5.5 朋友版升级回归

`cloud-legacy-snapshot.test.cjs` 使用没有 runtime 标记的旧快照和朋友版快照，验证原字节/指纹保留、读取后迁移，以及版本篡改在读取分块前拒绝。
`tests/friend-gameplay.test.cjs` 检查空心/实心存档点复活、资源和机关快照、轨道侧面触发可选及喷气碰撞独立；`friend-compatibility.test.cjs` 检查一次迁移、原数据不变、普通旧关卡不套用、导出依赖与未知模块版本保留；`zone-bounds-repair.test.cjs` 检查显式裁剪的空间交集和无交集拒绝。

`tests/friend-255-ui-smoke.cjs` 通过 FRIEND_ARCHIVE 指定升级后的实际 11 房 ZIP，验证逐房启动、7 存档点和12侧触轨道保留，再用独立测试房真实按键经过存档点/重试及修改侧触开关。没有上传生产云端或修改原存档。发布后必须设置 EDITOR_EXE 对实际 RoomLab.exe 复验；保存/命名/排序/回放沿用 features-2.5.4-ui-smoke.cjs，并回归云同步/认证和旧15房存档。

