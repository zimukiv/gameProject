# 高数终局 dα 回收纸阶异常修复

已复现并修复：普通输入走完 α、β 后踩下 dα，在纸阶回收的约半秒内向右跳落到回收纸阶，角色会把该纸阶当成支撑，随后被回收位移带到收纳高度。原地站在固定 dα 台面不会必然触发；问题来自跳落或边缘接触后的支撑携带，AI 没有施加这次上抛。

## 复现与同输入对照

Repro/before-run.log 与 Repro/jump-frames.json 保存修复前逐帧记录；Repro.csproj 使用 source-before/NativeReworkRules.cs，可再次重现旧行为。After 保存修复后同一控制输入的逐帧记录。5 种动作的逐帧输入均完全一致。

最明显的跳落轨迹：旧版落到 paper-013 后被带到脚底 y=2.0203 格；修复后最高只到正常跳跃的 y=15.3854 格。原平台高度为 y=17，原异常额外抬升约 13.37 格。对应动作最大单帧移动由 18.2685 像素降到 5.6199 像素。这是支撑规则修复的结果，没有更改速度、重力、跳跃高度、生命或输入位置。

完整量值见 trajectory-comparison.json；原地站立、左走、右走、冲刺的同输入轨迹未改出新的抬升。

## 最小修复

仅修改 Assets/RoomLabNative/Core/NativeReworkRules.cs 的回收支撑判断：纸页向初始位置向上收回时，如果有人站在其上，保持该纸页的当前进度；玩家走开或跳开后继续回收。纸页保持实体支撑，未隐藏碰撞，也未瞬移角色。正常展开的电梯上升与向下回程继续载人。

没有修改关卡 JSON、存档格式、角色物理参数或其它 Core 文件。JSON SHA 保持 523b045170f88881cf14cc4a401f023f76f5169a16aaf8f98b5bb2a9ca472ab5，现有来源绑定不因这次修复改变。源码修复 SHA：1d1aff4c9c30d5c19fa4bf6c2a05b425bf2092c157e086f4c8719ebe55fefed1。完整前后校验见 source-integrity.json，修改前文件见 source-before 与 backup-manifest.json。

## 验收

- Checks/results.json：8 场景、27 断言、0 失败。覆盖 4 个回收时机的普通跳落、真实落到回收纸阶后站住、边缘走开后恢复回收、跳着踩 dα、真实 M05 纸电梯普通输入上升及下降载人、完整终局 α→β→dα→γ→互动键出口（AI与藏品条件保持）。
- InteractDoorsChecks/results.json：当前门互动与存档专项 50/50。原 InteractDoors 的历史结果没有覆盖重写。
- Compatibility：旧 guided 50、network 92、Gameplay 4,110,794 断言/24 轨迹/1,151 操作、Progress 572、Editor3 18、AIJump 378 断言/26 场景全部通过。
- Compatibility/oracle-integrity.json：52 份冻结 oracle 文件哈希一致，原验收标准未改。

所有新动作验证直接编译生产 Core/Data，使用普通移动、跳跃、冲刺和互动输入。终局从真实房间入口启动，没有指定角色位置或手动改机关状态。这里证明此缺陷及相关Core回归；Windows画面和最终发布验收由主流程另行执行，不能把此报告称为三章真人完整通关。
