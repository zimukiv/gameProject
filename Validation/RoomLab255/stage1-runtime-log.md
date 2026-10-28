# 阶段1：RoomLab 2.5.5 导出兼容（2026-10-26，基线 a0ecb6a）

本阶段只做兼容，优化传输性能留待验收后的下一阶段。上游 `G:/project null/room-editor`（2.5.5）只读，未修改；本工程为唯一写入目录。未提交、未推送、未删除文件、未重写旧三关场景、未改共享服务与云同步。

## 行为与边界

### 1. 项目迁移（`src/project/compatibility.cjs` 新增）
- `model.migrate`（v2）与 `collision.portable` 在既有 `RailNodes.normalize` / `Collision.normalize` 之后调用 `compatibility.normalize`，顺序与 2.5.5 一致。
- 朋友版识别标志是 **未标记 `compatibility.runtime` 且含 `common.checkpoint` 实体**。一旦识别：
  - `physics.jet` 且 `direction` 为 left/right：`collision=false`、`trigger.mode='region'`；
  - 所有 `physics.rail`：`sideTrigger=true`；
  - 补 `pluginManifest['common.checkpoint']='1.0.0'`；
  - 有 `sideTrigger` 且 rail 主版本为 1（或无记录）时升级为 `2.0.0`；
  - 写 `compatibility={runtime:'2.5.5',importedProfile:'friend-2.5.2'}`，只迁移一次。
- 已标记项目（`compatibility.runtime` 存在）永不再按朋友版迁移。本工程 `project.json` 显式标记：
  `"compatibility": {"runtime":"2.5.5","importedProfile":"friend-2.5.2","customization":"ddl13-roomlab255"}`，并把 `physics.rail` 清单提升为 `2.0.0`；`migrate`/`portable` 后既有 11 房间/10 连线、32 个喷气、12 条导轨（4 条 `sideTrigger:true`）、7 个存档点、214 个尖刺的 `collision`/`trigger`/`sideTrigger` 值不变。
- 未知主版本不猜：`Registry.validateObject` 对不在 `[version 主版本, ...compatibleMajors]` 的 `pluginManifest` 记录报“模块主版本不匹配”，导入入口据此拒绝整包。
- `project.json` 只是运行时数据文件；2.5.2 导出约定中的 `physics.ice.params.zoneId` 仍在文件里保留，运行加载时由既有 `Collision.normalize` 删除（本阶段未改变该行为）。

### 2. 模块版本
| 模块 | 变更 | 旧数据 |
| --- | --- | --- |
| `physics.rail` | 1.0.0 → 2.0.0，`compatibleMajors:['1']`，新增 `sideTrigger`（默认 false）与 `triggerOccupied` | 1.x 数据继续加载；`sideTrigger` 缺省时不做侧向触发 |
| `physics.jet` | 未改代码（本地已含 2.0.0 `direction/force` + 旧 `launchX/launchY` 物化） | 旧 vector 保持，direction 覆盖旧 vector |
| `common.checkpoint` | 保留本地定制插件（`saveCheckpoint` + 安全位置检查 + 激活样式），新增 `ctx.setCheckpoint` 别名 | 2.5.5 实体/空心存档点均可触发 |

### 3. 存档点安全复活
- 2.5.5 空心存档点（`collision:false`）在格内复活：`y = o.y*32 + 4`；实体存档点（`collision:true`）在方块顶部复活：`y = o.y*32 - 28`。
- 两种位置都过既有安全检查（房间边界、碰撞体、尖刺），不安全时回退到玩家当前位置，再不安全则拒绝保存并提示；资源/积分/收集/机关快照与 0.5 秒复活缓冲保持不变。

### 4. 导轨 sideTrigger
- `triggerOccupied` 只在 `params.sideTrigger===true` 时接管，否则返回 `undefined`，沿用原脚部/重叠判定（旧 1.x 行为不变）。
- 开启后：顶部接触 + 左右侧面接触（±8px 容差）+ 空心内部重叠均可启动；AI、冷却、拾取逻辑未改。

### 5. 项目导入入口（真实实现，非仅文档）
- 新模块 `Tools/RoomLabRuntimeApp/src/runtime/project-import.cjs`：`loadProjectFile(path)` 支持 `.json` / `.zip`，以现有 `archive.cjs`（`Archive.unpack`）为基础；JSON 需素材与 project.json 同目录存在。
- 明确错误：未指定路径/文件不存在（“找不到项目文件”）、扩展名不支持、JSON 解析失败、结构/模块校验失败（含重复 ID、未知模块、素材缺失）、ZIP 容量/格式错误。
- 校验顺序：读取 → `model.migrate` → `model.validate` → 每个对象 `Registry.validateObject` → 素材存在性；全部通过后才 `new Engine` 切换。失败时保留当前游戏并显示“导入失败：…”，不回写默认 `project.json` 或来源文件。
- 入口 1（命令行）：`RoomLabCore.exe --roomlab-port=<port> --roomlab-project=<project.json|zip> [--roomlab-project-dialog]`。
- 入口 2（Unity 暂停菜单）：新增“导入项目（JSON / ZIP）…”按钮，发送 `{importProject:"dialog"}`；运行器主进程用 Electron `dialog.showOpenDialog` 打开 **Windows 原生文件对话框**，选择后经校验再切换。Unity 端只需读取下一帧新项目 `rooms`，无需重编译运行器。
- `Archive` 在缺少 `fflate` 的独立运行器中回退到新增的 `src/project/zip.cjs`（Node `zlib`，支持 stored/deflate），因此 `.roomlab-runtime` 无需 npm 安装。

## 兼容矩阵

| 场景 | 数据形态 | 结果 |
| --- | --- | --- |
| 本地定制 DDL1.3（已迁移） | 有 `compatibility.runtime` + 7 空心存档 + 4 条 sideTrigger | 不再迁移；collision/trigger 全部保持；rail 清单 2.0.0 |
| 2.5.2 旧基线/朋友版 | 无标记 + checkpoint | 单次迁移：jet 侧向改空心 region、rail 加 sideTrigger、补 checkpoint 清单 |
| 2.5.5 新导出 | 有 runtime 标记/无 checkpoint | 原样加载；`sideTrigger:false` 保持 false |
| 旧 1.x 导轨 | `pluginManifest.physics.rail=1.0.0` | `compatibleMajors:['1']` 通过；无侧向触发 |
| 旧 vector 喷气 | 仅 `launchX/launchY` | `jet-params` 解析为 custom，向量保持 |
| 2.5.5 实体存档点 | `collision:true` | 顶部复活 + 安全检查 |
| 2.5.5 空心存档点 | `collision:false`, region | 格内复活 + 安全检查 |
| 未知主版本 | 如 checkpoint 8.0.0 | 校验报错，导入被拒绝 |

## 复验命令与结果（本机实际执行）

```powershell
# 新兼容测试（直接跑版本化 src）
node Tools/RoomLabRuntimeApp/tests/roomlab255-compat.test.cjs
# 8/8 通过：旧基线 fixture、2.5.5 fixture、迁移幂等、定制项目不二次迁移、
# sideTrigger 默认/开关/清单、实体+空心存档与资源恢复、未知主版本、JSON/ZIP 导入与失败路径

# 既有回归（12 项，直接跑版本化 src）
$checks=@('checkpoints','developer-mode','flight-map','instant-freeze','dash-input',
 'dash-resources','horizontal-dash','move-acceleration','respawn','spikes','rail-pickups','connections')
# 结果：12/12 PASS（对 .roomlab-runtime 同样 12/12）

# 运行器准备（未改上游二进制目录）
Copy-Item 'room-editor/node_modules/electron/dist/*' .roomlab-runtime -Recurse
Rename-Item .roomlab-runtime/electron.exe RoomLabCore.exe
.\Tools\RoomLabExactHost\setup-runtime.ps1 -ExistingRuntime .roomlab-runtime
# ROOMLAB_RUNTIME_READY ...；resources/app 已同步本阶段源码

# 实际 Electron 桥接自检
node Tools/RoomLabExactHost/verify.cjs .roomlab-runtime
# 未通过：Electron 在 DSH 沙箱下无法启动（见风险）
```

## 风险与未验证项

1. **Electron 桥接验证未跑通**：`verify.cjs` 启动 `RoomLabCore.exe` 时报
   `FATAL:install_dir_access.cc:52 Sandboxed processes cannot read ... .roomlab-runtime: its ACL has an entry for an AppContainer package SID but none for ALL APPLICATION PACKAGES`。
   这是本机/沙箱目录 ACL 限制，不是源码异常（12 项 Node 级回归与 8 项新测试均通过）。需要在实际桌面环境执行
   `icacls .roomlab-runtime /grant *S-1-15-2-1:(OI)(CI)(RX)` 或换非受限目录后重跑 362 项桥接自检。
2. **Unity 侧未编译/未构建**：本阶段按合同不调用 Unity，仅改 `RoomLabExactPlayer.cs`（新增暂停菜单按钮与 `importProject` 字段、面板高度 454→500）。下次构建时需确认按钮不与既有布局重叠，并跑 58 项键位检查与 `-roomLabExactVerify`。
3. **导入交互只在本机 Windows 原生对话框路径实现**；无图形环境时仅能用 `--roomlab-project=`。导入后的存档/键位仍按原有“本次运行/PlayerPrefs”语义，不跟随项目。
4. 项目 `pluginManifest['physics.rail']` 由 1.0.0 改为 2.0.0 是有意的最小数据变更（与 2.5.5 迁移结果一致，且 1.x 兼容），git diff 中会体现。
