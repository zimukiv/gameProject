# Room Lab 架构

2.5.5：`project/compatibility.cjs` 在 v2 clone 和基础参数迁移后识别未标记的朋友版存档点签名，一次性将左右喷气碰撞/触发、电磁侧面触发物化到各对象。`compatibility.runtime` 防止后续改动被重新覆盖；普通旧项目仅写入标记。导出共用 portable 路径声明 checkpoint / rail 模块依赖。`repair-zone-bounds.cjs` 是显式新副本修复，正常导入仍保留越界编辑数据。`common.checkpoint` 只通过 context 调用 Engine.setCheckpoint，复活快照和资源仍由引擎拥有；实心复活位置位于方块顶面，空心保持朋友版位置。

2.5.4：`room-import-batch.cjs` 准备完整批量结果，`room-import.cjs` 负责单房间重映射、覆盖端口保留与素材复用，`room-import-dialog.cjs` 负责多选与覆盖确认，提交只执行一次 History 操作。云端 `inspectRevision` 只读验证项目 JSON，`readRevision` 获取素材供导入，不执行 checkout；`cloud-room-details.cjs` 渲染名称和房间清单。`room-order.cjs` 只调整数组，`room-tab-order.cjs` 处理标签拖动。`trace-replay.cjs` 负责纯时间采样，`trace-replay-panel.cjs` 在原路径管理弹窗内绘制，保留暂停/恢复所有权；`trace-names.cjs` 和选择按钮模块共用于退出保存与中途保存。

2.5.3：桌面主进程注入 `cloud/chromium-http.cjs`，以 Electron net.fetch 执行请求；共享 Remote 不直接依赖 Electron，CLI 测试仍可用 Windows transport。`Service.remote()` 统一创建网络客户端、记录脱敏状态诊断并保存已验证的认证模式；公开握手只允许 GET state/health，失败写请求不重试。`copyDiagnostics` 在主进程写剪贴板，渲染器收不到密钥；HTTP 诊断不保存响应正文或请求头。

桌面主进程创建一个隔离的编辑器窗口，界面与玩法共用项目模型。在线 AI 保持本地占位，云协作是可选的独立 Sites 服务。浏览器预览可直接服务 build 目录，但原生文件选择与保存只在桌面版提供。

```text
Electron 主进程：src/desktop/main.cjs
  → preload.cjs（限定文件交互接口）
    → build/index.html + ui.js（由 src/editor 构建）
       → Store / History → project/model
       → pages → Canvas draw
       → Engine → plugin registry → physics / common
```

| 改动目标 | 入口与职责 |
| --- | --- |
| 项目、迁移、尺寸、端口验证 | src/project/model.cjs |
| 包含素材的 ZIP 项目包 | src/project/archive.cjs |
| 素材导入、替换、稳定 ID、浏览器字节缓存 | src/assets/manager.cjs |
| 素材大类/子类、旧分类推断、绑定候选过滤 | src/assets/catalog.cjs |
| 一键放置图标栏 | src/editor/palette.cjs |
| 轨道子节点身份、顺序、父级移动与兼容 | src/project/rail-nodes.cjs |
| 节点图管理及相对位置预览 | src/editor/rail-node-panel.cjs |
| 区域四角缩放几何 | src/editor/region-handles.cjs |
| 试玩轨迹采样、路径文件及管理 UI | src/project/play-traces.cjs、src/editor/trace-manager.cjs |
| 温控初始状态统一解析 | src/project/temperature.cjs |
| 示例素材 | src/assets/seeds.cjs |
| 插件注册、默认值、参数验证 | src/plugins/registry.cjs |
| 喷气、冰块、温控、电磁轨道 | src/plugins/physics/*.cjs，各一模块 |
| 收集、危险、AI 启动与传送 | src/plugins/common.cjs |
| 兼容 v1 机关 | src/plugins/legacy.cjs，独立隔离 |
| 运动、碰撞、资源、AI、回退 | src/runtime/engine.cjs |
| 路由、文件流程、输入与固定步长循环 | src/editor/app.cjs |
| 项目存储与撤销 | src/editor/store.cjs、history.cjs |
| 大关接线、房间、素材、定义、外观、试玩 UI | src/editor/pages/*.cjs |
| 静态及运行绘制 | src/editor/draw.cjs |
| 桌面弹窗、路径校验、JSON 备份 | src/desktop/*.cjs |
| 构建、生成参数文档、示例、便携发布 | scripts/*.cjs |

## 数据流

1. UI 的一次编辑经 Store.change 或笔刷 commit 提交项目快照，History 保存撤销；重新绘制，草稿写 localStorage，素材字节单独缓存 IndexedDB。
2. 素材导入产生稳定 ID 与内容散列相对路径。替换保留 ID、改变路径；大关类型/状态绑定 → 实例覆盖 → 缺图占位。碰撞仍按格子，与素材尺寸独立。
   候选图片由 catalog.available 统一过滤，两个应用入口共用规则；库浏览按大类/子类展开。没有分类的旧数据只做引用推断，保持原文件兼容。
3. 试玩克隆项目并校验，引擎读参数注册表，120 Hz 固定步长更新。方块通过 createState/tick/onTrigger 等钩子参与；UI 只渲染快照。
4. 进入出口按 from.roomId/exitId 查接线，在目标命名入口生成玩家。资源、AI 等级继承；房间状态缓存，当前入口形成检查点。
5. JSON 保存由主进程处理选定路径，写入素材后备份原 JSON，再临时文件替换。ZIP 包必须包含引用的所有素材。原生会话按已选择文件和项目 ID 绑定。

## 修改方法

新增功能块按 [插件接口](docs/BLOCK_PLUGIN_API.md)；修改数据格式时增加迁移路径并保持 version 验证；修改物理后运行 [测试](docs/TESTING.md) 的完整物理通关；修改原生 IO 后同时检查中文路径、备份和实际便携 exe。

构建产物可重建；编辑过的用户项目与素材需保留。项目参数目录由 `pnpm docs` 生成，避免 UI、文档、插件参数各写一份。云协作的 HTTP 端点由独立 room-cloud 提供；桌面 IPC 由 preload 限定文件、轨迹与 cloud 操作，渲染器不能直接访问网络授权。

## 2.4.0 云端职责

云服务源码独立位于 `room-cloud`，Sites 私有发布，D1 存版本、分支与协作会话，R2 存校验后的内容分块。客户端 `src/cloud` 拥有本机草稿/版本库、加密连接、Windows 原生 TLS、手动子分支和即时草稿合并；关卡数据模型不依赖云端。

即时协作每秒交换一次状态，8 秒心跳超时；草稿与不可变版本分表。仅明确保存产生版本；以工作树 readRevision（最后读取的云端版本）为父，新建分支。编辑器接收更新前对本轮新输入再做三方合并，同字段冲突先保留草稿并暂停发布。试玩使用进入时的引擎快照，编辑草稿仍同步，退出试玩后显示新内容。

碰撞开关与旧 AI 别名兼容在 `src/project/collision.cjs`，绘制、运行时及序列化共用。温度解析在 `temperature.at`，按空间重叠影响冰块，热优先；控制器单向控制温控区，冰块没有区域关联。



## 2.4.1 工作树与文件关联

2.5.2 试玩摄像机在 `project/play-camera.cjs` 纯函数中计算，参数由 `editor/room-camera-panel.cjs` 编辑，`pages/play.cjs` 每帧依据当前房间、玩家与窗口求视图并传给绘制器。它不修改 Engine、玩家或路径坐标，也不复用编辑器 roomView。旧房间不自动补字段，完整房间变换与原 fit 数值一致。

2.5.1 界面不再暴露本地树管理和历史操作；底层仓库保留兼容已有草稿与快照。`project/room-import.cjs` 纯函数准备追加结果，不修改输入，重映射已知房间内部 ID、素材与接线；`editor/room-transfer.cjs` 负责 ZIP 选择和确认。可选 room.artBindings 仅覆盖该房间的绘制与素材引用，不修改目标大关绑定；移动/冲刺规则仍来自目标项目。

2.5.0 扩展：`cloud-graph-panel.cjs` 只负责云端图布局、选择、缩放和平移，不持有密钥或直接发网络请求；控制器调用主进程 `checkoutRevision` / `manualSave(parentRevision)`。临时上传父节点与 readRevision 分开，切换前备份草稿；重复读取复用干净工作树，有修改的节点保持独立。`project/room-export.cjs` 生成独立 v2 项目，保留房间 ID 和素材路径，移除跨房运行接线并保存来源信息。

`repository.cjs` 持久化可变的工作树管理元数据：parentId 仅代表本机关联，deletedAt 为可恢复删除，localFile 只在本机记录绝对路径和上次读写散列。源码 `worktree-panel.cjs` 独立负责树形 UI 与拖动，`room-limits.cjs` 统一尺寸上限。

版本 revision.parent 和工作树 readRevision 是同步来源，移动管理节点不得修改它们。删除节点提升子节点一级并保留所有快照/草稿；恢复只恢复节点，不抢回已整理的子节点。旧库在读取时补充可推断的父节点与大关说明，并解除损坏的循环关系。

原生文件关联由 main 的文件选择、读取与保存流程建立，渲染器不能直接指定任意读写路径（自动测试除外）。关联不等于自动写回；覆盖前弹窗确认并保留备份，保存时比较当前散列与会话上次散列以提示外部变化。读取本地文件若已有同项目记录则建立单独读取节点，保留旧工作树草稿。

房间尺寸同步只调整 canvas backing dimensions；不再自动调用 fit。显式适应房间和首次进入房间才重新计算视图，编辑提交、区域缩放和机关拖动沿用已有视图。

框选的数据操作集中在 `src/project/selection.cjs`：稳定对象 ID 或地形坐标引用、范围查询、追加/反选、整组移动及关联清理。操作仅修改项目模型，UI 的 multiSelection 为临时状态；整体拖动只在松开时提交一次历史，框选本身不创建项目版本。

喷气双格式解析由 `project/jet-params.cjs` 统一；Registry.params 解析运行/界面值，Collision.normalize/portable 补齐兼容向量，不更改稳定 ID。运动默认与项目覆盖在 `project/performance.cjs`，Engine 为每个实例建立 config，禁止全局常量覆盖用户配置。
