# Physics Level Editor｜队友使用说明（Windows）

> **推荐使用已验收的 Phase 3 版本**：GitHub 分支 `codex/physics-level-editor-phase3`。本说明面向首次使用者。Phase 4 的 V2 组件和 Unity 往返扩展仍在开发/验收中，暂不作为团队稳定版。
>
> **目前尚无打包好的 Windows EXE**。工作台以 Electron 源码方式启动：首次需要安装 Git、Node.js 和依赖，之后可以直接从 PowerShell 打开桌面窗口。只使用此工作台**不需要运行 Unity Editor**。

## 一、首次安装（Windows PowerShell）

准备：Windows 10/11、Git、**Node.js 22 或更新版本**（含 npm）、网络连接。先在 PowerShell 检查：

```powershell
git --version
node --version
npm.cmd --version
```

第一次下载和运行已验收版本：

```powershell
cd "$HOME\Desktop"
git clone --branch codex/physics-level-editor-phase3 --single-branch https://github.com/zimukiv/gameProject.git gameProject-level-editor
cd ".\gameProject-level-editor\Tools\PhysicsLevelEditor"
npm.cmd ci
npm.cmd run desktop
```

- `git clone`：下载对应的**已验收分支**，不是默认 `main`。
- `npm.cmd ci`：根据仓库的 `package-lock.json` 安装依赖（包括 Electron）。第一次需要联网。
- `npm.cmd run desktop`：先构建 TypeScript/React，再启动独立桌面编辑器。

**日后再次启动**，不需要重新安装依赖：

```powershell
cd "$HOME\Desktop\gameProject-level-editor\Tools\PhysicsLevelEditor"
npm.cmd run desktop
```

请保留整个仓库的目录结构，不能只拷贝 `Tools/PhysicsLevelEditor` 一个文件夹，否则「打开 Phase 1 样本」可能找不到关卡数据。

## 二、五分钟快速体验

1. 点击顶部 **「打开 Phase 1 样本」**。左侧 Hierarchy 应出现 `Start ground`、`Air vent`、`Token 3` 三个对象。**PARTIAL COVERAGE** 提示代表它们只是完整 Level1 的一小部分。
2. 点击 `Air vent`，在右侧 Inspector 找到喷气力度 **Force**，修改数字并按 Enter（或点击输入框外）以提交改动。
3. 点击 `Start ground`，按住 Ctrl 再点击 `Token 3`，Inspector 会显示「选中 2 个对象」。不同数值显示 **Mixed**。在「批量世界坐标偏移」中输入 `ΔX=1.25`、`ΔY=-0.75`，点击「应用偏移 · 一次撤销」；两个物体应一起移动、相对距离不变。
4. 按 **Ctrl+Z** 撤销，按 **Ctrl+Y** 重做。
5. 点击 **「另存为」**，保存到自己的 `Documents` 文件夹，例如 `Level1.team-demo.json`。**不要覆盖仓库内原始的 `Levels/Physics/Level1.phase1.json`。**
6. 点击 **「打开」**，选择刚保存的 JSON，确认参数和对象依然存在。**保存 JSON 不会自动修改 Unity Scene，也不会同步到其他队友电脑。**

## 三、界面与快捷键

| 区域 | 做什么 |
| --- | --- |
| **Hierarchy（左侧）** | 管理对象、搜索、选择、复制、删除、父子分组、展开/折叠、隐藏和锁定 |
| **Scene Canvas（中间）** | 在 Unity 世界坐标下预览位置、拖动对象、调整网格与 Collider 控制点 |
| **Inspector（右侧）** | 修改 Transform、BoxCollider2D、喷气力度、Token 数量等已注册参数；多选显示 Mixed |
| **文件与状态（下方）** | 查看当前 JSON 路径、验证错误、未保存修改与兼容性提示 |

| 操作 | 方法 |
| --- | --- |
| 选择 / 多选 | 单击；Ctrl / Shift + 单击；在画布空白处框选 |
| 平移画布 | 鼠标中键或右键拖动；也可按住 Alt 拖动 |
| 缩放画布 | 鼠标滚轮 |
| 移动物体 | 拖动已选对象；工具栏可开关网格吸附并设置步长 |
| 调整 Collider | 拖动碰撞框角点；**不会直接修改 Transform Scale** |
| 复制 / 删除 | Ctrl+D / Delete |
| 撤销 / 重做 | Ctrl+Z / Ctrl+Y（或 Ctrl+Shift+Z） |
| 保存 / 另存为 | Ctrl+S / 顶部「另存为」 |
| 建立父子关系 | 先选父对象，再多选子对象，点击「分组」；不支持的变换会被拒绝 |
| 锁定 / 隐藏 | Hierarchy 的锁定/眼睛按钮；仅本次会话有效，不保存到 V1 JSON |

**坐标提示：** Canvas 使用 Unity 2D 世界坐标，Y 轴向上。`Transform Scale` 是对象整体缩放，`BoxCollider2D Size` 是碰撞体自身尺寸，两者不同。建立父子关系后，移动父对象会带动子对象；编辑器尽量保持重新分组时的世界位置，无法安全表达的变换会拒绝。

## 四、当前功能边界和协作规则

- 当前稳定编辑器只支持 `LevelDataV1` 的 **partial JSON**；已验收的对象类型为**普通平台、AirVent 和 Token**，采用固定的已注册组件组合。**不能把三个对象的示例当作完整 Level1。**
- 这不是游戏运行器：目前没有独立游戏试玩、运行时热更新、Unity 场景自动覆盖、完整 LevelPack 打包等功能。**不能直接在工作台中打开 `.unity` 场景。**
- Sprite 使用 Unity 资源 GUID 和 local file ID；任意本地 PNG/WAV 不会自动转化为可用的 Unity 资产引用。未知组件或不合法字段会被验证器拒绝。
- 推荐把个人编辑的示例 JSON **另存到仓库外**。如果要把关卡数据交给队友，请创建单独的功能分支和 Pull Request，不要直接覆盖原始样本或向团队 `main` 提交未经验证的场景修改。
- 如果使用 Unity 进行游戏验证，团队当前已验证的版本为 **Unity 6000.6.4f1**。应使用隔离测试工程/测试场景。**不要执行 `MiniGame > Rebuild generated scenes`**：这会覆盖正式 Unity 场景。
- Phase 4/V2 数据和机关适配尚在开发，当前 Phase 3 版本不能直接编辑其新 JSON 格式。

## 五、测试与常见问题

在 `Tools\PhysicsLevelEditor` 目录：

```powershell
npm.cmd run check
npm.cmd run build
```

`check` 执行 TypeScript 与数据测试；有一项依赖 Unity 导出夹具的既有测试可能标为 `skipped`，不能据此声称全部 Unity 运行行为已验证。

| 问题 | 处理方法 |
| --- | --- |
| `git`、`node` 或 `npm.cmd` 不存在 | 安装 Git 和 Node.js 22+，然后重新打开 PowerShell |
| PowerShell 禁止运行 `npm.ps1` | 使用这里的 **`npm.cmd`**，不要直接用 `npm` |
| `npm.cmd ci` 失败 | 检查网络/代理和 Node 版本；不要删除 `package-lock.json` |
| 找不到 Phase 1 样本 | 保持完整仓库结构，并确认 `Levels/Physics/Level1.phase1.json` 存在 |
| V2 JSON 提示不支持 | 当前稳定 GUI 只支持 LevelDataV1，V2 仍在开发 |
| 没有完整关卡或试玩按钮 | 正常限制：当前只实现 partial JSON 编辑，不是 Unity 游戏 |
| 自动化/沙盒下 Electron 提示 AppContainer ACL | 优先在正常 Windows 桌面用户会话启动，不要自行关闭安全隔离 |

更多实现和验收细节可阅读 [编辑器开发 README](Tools/PhysicsLevelEditor/README.md)。
