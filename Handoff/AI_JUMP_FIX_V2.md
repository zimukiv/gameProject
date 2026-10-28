# AI路径接续与开发者安全复位窄修（v2）

状态：实现与纯C#自测完成，源码冻结等待主代理独立验收。没有启动Unity/游戏，没有构建、压缩、提交或推送；成品尚未包含本轮修复，由主代理验收后重建并仍以v2交付。

## 远端基线与范围

修改前读取本工程AGENTS.md及dirty状态。主代理显式fetch全部heads，核对参考分支`origin/codex/roomlab-ddl13-v3-handoff-2026-10-26`与本地HEAD同为`a0ecb6aa4517f14afaa2e32c825fdc71b0d246b6`。本代理再次读取两个SHA确认一致；没有reset/clean或覆盖原dirty。旧默认fetch指向已删除phase3的阻断及处理已由主代理记录。

原源码快照及SHA在`Validation/Native/AIJumpV2/before/`、`baseline.json`。正式关卡只读，SHA始终为`03b948a705210aafd718306a70947e90b41f7d1fa013a53a4087091d51809836`。没有改作者参数、连接、JSON、素材或旧oracle。

实际生产写入只有：

- `Assets/RoomLabNative/Core/NativeGameplayAI.cs`：Demo弹射轨迹持续采样及着陆接续；开发者AI追踪重置helper。
- `Assets/RoomLabNative/Core/NativeMotion.cs`：仅在既有LockHealth越界复位分支中，DeveloperEnabled时调用helper。

新增测试在`Tools/RoomLabNative/AIJumpChecks/`。未实施原先讨论的回收状态/信标方案；`NativeGameplayState.cs`和`NativePixelWorld.cs`均未修改，也没有新runtime字段、存档版本或Snapshot字段。普通RetryGameplay保持原实现。

## 实际根因与证据边界

本轮使用systematic-debugging调查，并按test-driven-development先跑RED再改生产。

1. **范围喷射本身是合法行为。** 原生代码、编辑器2.5.5及冻结旧引擎都按affectAI和range给附近AI施力。真实玩家落板用例：AI不接触板、距离pivot70或95px时会被range=3格弹射，97px不弹。不能因看起来“跳起”就全局关闭该能力。
2. **视频对应的接续缺口。** 用户提供新房间10的10.57秒视频；主代理及独立审查员回传：约6.65秒是合法同步弹射，7.75–8.5秒AI落回右侧喷气附近后斜追高台玩家。本代理没有直接操作视频窗口，以上为主代理逐帧取证结论。源码在LaunchAI清trail、flight期间不记录玩家路线、着陆后再次清trail只放当前PlayerCenter，丢失了历史拐点。
3. **开发者专有复位缺口。** 用户明确追加“复活后AI沿着死前路线走，仅开发者模式”。源码LockHealth越界分支只恢复Player并ClearFlightMotion，没有重置AI。RED以真实E激活、SetDeveloperOptions(true,true,false)、仅右移走出短地面触发；玩家y622.25→入口y324，而AI旧trail68点保持68点，flight/warning也各自残留。此证据直接对应开发者描述，但不把所有视频中的AI运动归为同一个问题。

## 修复行为

**仅Demo的合法弹射接续：** 触发和重喷均保留已有玩家历史；飞行期间以原有大于4px的阈值继续采样，保持1400点上限；着陆后找到离AI落点最近的历史点，只删除其之前的部分，保留后续按时间排列的折线和拐点。距离相同优先较新的点。正常追踪的speed×dt步进和旧profile流程不变。

**仅显式开发者锁血越界：** 玩家按原分支回到检查点/入口后，清AI未完成flight、vx/vy、warning和旧trail，记录新PlayerCenter；恢复0.8秒处理延迟并清抓取冷却。保持同一个AI对象的id/active/tier/speed/steal、courseAI状态、已经完成的teleported路由列表；不改世界机关、检查点对象、分数、库存、token或死亡计数。

AI默认重新放在新玩家位置左165px、同高度。因为AiProcessing只阻止抓取而不阻止收藏领取，helper在有未领取收藏品重叠时有界地向左挪到该物件左边，避免安全复位送出10000分；不全局关闭正常AiProcessing期间的合法AI领奖。该位置策略保留原先AI可以从入口左侧画面外接近的行为。

## RED → GREEN与回归

日志均为真实.NET8控制台执行，未调用Unity GUI或模拟游戏画面。

| 证据 | 结果 |
|---|---|
| `red.log` | 原较宽诊断阶段16例，7失败；范围/affectAI和正常平地通过 |
| `developer-red.log` | 原精准开发者Demo三例，15断言/3失败 |
| `video-dev-red.log` | 视频范围收窄后18例/7失败 |
| `before-final-red.log` | 相同最终25例对before源码，224断言/14失败，exit1 |
| `green.log` | 最终25例/358断言/0失败，exit0 |
| `motion-regression.log` | 原运动9679断言；107帧轨道及16接触检查通过 |
| `gameplay-regression.log` | 24旧参考trace/1151操作，4110794断言；共享390项通过 |
| `demo-regression.log` | 原DemoRuleChecks30项通过 |

最终定向用例包括：

- 无喷气平地不抬升；三profile的合法range喷射与affectAI=false。
- flight采样、重复喷射、1400点边界。
- L形路径每步验证：必须先走完竖腿到(160,220)，再沿y220横腿移动；旧版会先斜向当前玩家而失败，固定版通过，不能只靠trail非空制造通过。
- 三profile各真实启动与右移掉落，清旧trail/flight/warning；身份、等级、速度、偷取量、course状态、已完成路由及同一检查点对象保持。
- 开发者复位不直接站到未领取收藏品上领奖，正常弹射期间的收藏仍可领取。
- Editor255Compat/LatestPhysics旧着陆、回收坐标与Snapshot schema不变。

复现命令见测试README。全部SDK命令显式使用`E:/Unity/6000.6.4f1/Editor/Data/DotNetSdk/dotnet.exe`。

## 明确保留的诊断与待验收项

原先更宽的out-of-bounds恢复方案在视频到达后被主代理明确暂停：视频没有AI落出底边的证据，不能借本次修复顺便加入重定位信标、保护窗或新的AI状态机。

对应五例仍保留于`--recovery-diagnostics`，输出`known-recovery-diagnostics.log`真实exit1：30例367断言/5失败。前两例复现既有AI落底瞬移、同帧收藏误领；后三例依赖未实现的恢复提示/保护状态。它们不是默认验收套件，也没有删除旧预期或伪称这些已解决。

本次没有新成品试玩、视频回放自动对齐、Unity编译或窗口验收。主代理仍须独立复核差异、重建v2成品、对照原视频位置试玩，再在上传前重新核对远端并记录提交/包SHA。当前周changelog与发布记录由主代理一并更新；本代理未扩大到未授权日志路径。该修复针对可复现的接续机理与开发者复位，不能保证所有未知群友路径场景已覆盖。

## 独立审查追加：取消待完成传送时释放预占路由

独立审查发现portal warning创建时就向teleported加入routeId，实际到达发生在0.65秒后。因此开发者复位若只清warning但保留它的预占标记，就把一次取消的传送误当成已完成。

本次追加修改前再次读取HEAD/dirty并显式fetch全部heads，参考分支仍为a0ecb6a完整SHA，与本地一致。仅在ResetAITrackingAtPlayer中，warning非空时移除其id对应的标记，再清warning；其他已完成标记保持。普通portal逻辑、Compat/Latest规则和普通Retry均未改。

新用例先真实E启动AI，再以正常right输入走出地面；临近越界时将AI放到真实portalIn附近，由生产Tick同时创建warning及pending-route预占标记。警告计时未完即触发开发者回落。用例验证：pending标记释放、原completed-route保留；再次接近入口能够重新触发并实际完成传送；后续又一次开发者回落保留两个真正完成的标记。没有仅手造一个不含预占标记的warning来替代真实流程。

- `pending-portal-red.log`：26例369断言，1失败，准确定位取消warning后路由仍被永久标记，exit1。
- `pending-portal-green.log`：最终26例373断言，0失败，exit0。
- `pending-portal-gameplay.log`：原24trace/1151操作、4110794断言与共享390项通过，exit0。

以上为最新自测结果；前文25例日志为首次修复的保留历史，不覆盖或重写历史RED。没有改关卡/原oracle、未构建，追加窄修后再次冻结等待独立复核。


## 主代理独立验收及发布范围（2026-10-29）

最终定向回归由主代理独立执行：AI26例/373断言、旧24trace/1151操作/4110794断言、Progress572、旧Node导入兼容14例均通过。Unity6000.6.4f1构建退出0；构建出的EXE生产验收CORE388、ICE30、IMPORT12、异常0。实际关卡SHA03b948…09836保持；原result.json中coreChecks390是历史硬编码，当前计数以日志388为准。

用户最后明确要求“先不试玩，上传后停止”，因此本轮不继续实际操作跑关；不能把自动出口定位/核心回归当成11房正常通关证明。游戏窗口可能仍由用户使用，不强行退出，也不恢复旧存档覆盖其新进度。出界回收的旧机制及显式诊断已知失败仍按上文保留。发布仍为v2，源码与Windows成品均标20261029；上传前再次核对云端，完成上传及文件完整性核对后结束。
