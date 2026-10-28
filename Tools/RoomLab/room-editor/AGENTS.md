# Room Lab 项目上下文

第一大关物理编辑器，源代码与旧 demo 隔离。先读 README.md、ARCHITECTURE.md、docs/CHANGELOG.md，再改相关模块。工程分工遵守用户当前指令及上层规则，本文件不改变 DSH/Codex 分工偏好。

## 维护约束

- 云端源码仓库为 https://github.com/zimukiv/gameProject ，本组件对应 Tools/RoomLab/room-editor，云同步服务对应相邻 room-cloud。每次收到更改需求，先运行 `node scripts/check-upstream.cjs` 核对 GitHub main 最新源码与本地基线，再开始实现；此处“云端版本”指 GitHub 源码，不是关卡云同步节点。
- 如果检查提示远端源码已变化或无法联网核验，先报告并对比/同步远端改动，保留本地未提交内容；不得在过期副本上直接覆盖远端，也不得 reset/clean 或强推。同步确认后可使用 `--record` 记录本机基线。

- 只提供物理关示例，AI 技能保持 ID 接口；新增内容先确认需求范围。
- 源码在 src，build 为生成文件，不能只改 build。插件定义是参数及素材状态唯一源。
- ID 和素材相对路径必须稳定。改名不能重建 ID；复制房间要重映射内部引用。
- 缩小房间保留越界数据，试玩拒绝越界。删除端口必须清理相应接线；温控区失联需修复。
- 共享引擎拥有物理、资源与死亡状态；方块模块只通过 context 操作，不能控制文件或 DOM。
- 不覆盖旧 demo 或策划文档。发行脚本默认保留历史；用户明确要求清理旧发布时，先验收新包，再仅删除指定 release 旧产物。保存/导出前处理素材，保持备份。
- 修改相关行为后运行核心测试及对应 UI 验收；打包后必须运行实际 exe 测试。记录变更与真实限制。

## 快速定位

模型/接线：src/project；机关：src/plugins；运动/回退：src/runtime；界面：src/editor/pages；素材：src/assets；Windows IO：src/desktop；构建/发布：scripts；测试：tests。
