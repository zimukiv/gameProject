# 原生兼容权威与 P1 合同

## 来源优先级

1. 用户目标：Unity 原生 C# 执行玩法、场景渲染和界面，Windows 构建运行不需要 Electron/Node/TCP 图片桥接。
2. RoomLab 2.5.5 的项目结构、模块版本兼容与迁移规则，以只读 `room-editor/src/project`、`src/plugins` 为依据。
3. 参考提交 a0ecb6a 的 DDL1.3 项目级数据与已确认定制玩法，以本目录冻结原始 JSON、原参考 JS 和交接说明为依据。保留碰撞/触发、2 秒冰块、尖刺朝向、免费加付费冲刺等，不用普通编辑器默认值覆盖。
4. 原生旧三关/旧导入器仅为可复用资源，不是上述规则的裁判。隔离工作区既有套壳补丁未验收，不作为 oracle。

默认定制存档无 compatibility 标记却包含 checkpoint。不能对它自动套用“朋友版迁移”而重写水平喷气碰撞与轨道侧触。P1 需有显式导入 profile（CustomDdl13Preserve / EditorAuto 等），记录选择和来源哈希；默认内置定制存档使用保留模式。一般外部未标记朋友版按编辑器迁移；有标记数据幂等处理。迁移结果只在新数据中，来源字节永不写回。

## 已确认冲突及取舍

| 项目 | 当前来源及差异 | 原生目标 |
| --- | --- | --- |
| 冲刺 | 旧 PlayerController / DashChargeMeter 单槽；参考核心免费+付费库存3，空中最多免费+一次付费 | 参考核心规则，不复用旧单槽容量 |
| 跳跃 | 通用 JS 默认 jump=560；定制 project.settings.performance.jump=400；旧 Unity 默认 jumpVelocity=19 世界单位 | 用项目覆盖后的400px/s，不直接搬旧数值 |
| 移动 | 参考 speed=220px/s、起步0.1s、松键停、反向重起步 | 保留项目配置与0.1s默认；坐标换算集中维护 |
| 温控 | 旧 Unity 温控要靠近按E；编辑器模块接触触发且 collision 与 trigger 独立 | 按模块和对象trigger参数，不能强制E |
| 冰块 | 旧 prepare.py 明示站立融化只保留源数据 | 真正实现累计融化、区域冷热、再生和重叠安全 |
| 存档 | 旧 prepare.py SUPPORTED不含checkpoint；参考实际7个点 | 全部支持、稳定ID、安全复活及资源/机关快照 |
| 轨道 | 旧原生导入器强制实体并用水平出口；2.5.5有sideTrigger，参考保留多段路径、出口角度、脱离等 | 参数完整保真和行为逐项实现，1.x默认不侧触 |
| 素材 | 旧转换器复制SVG但场景使用色块 | 保留9个SVG与绑定，并在原生呈现阶段等效显示 |
| 相机 | 旧原生跟随有固定偏移；编辑器有room/follow及视野尺寸 | 按房间配置和边界，不照搬固定相机参数 |
| 持久化 | 原参考checkpoint只在当前房间本次运行有效；键位PlayerPrefs保存 | 不擅自添加持久续关；改产品名需处理键位迁移 |

来源定位：`Tools/RoomLabImport/prepare.py:10,104-109` 明示旧适配限制；`Assets/Scripts/Player/PlayerController.cs:17,24,31` 有旧参数/容量入口；`room-editor/src/project/compatibility.cjs` 为2.5.5单次迁移；`baseline-manifest.json.settings` 为定制覆盖，`Traces` 为规则预期。

## 数据兼容矩阵

| 范围 | P1 数据要求 | 后续玩法要求 |
| --- | --- | --- |
| 身份 | 保留project/course/room/object/port IDs与未知字段、10条连接、相对素材路径 | 不因重建场景重新生成身份 |
| 参数 | 合并模块默认、blockDefaults及实例覆盖；有限数值/边界/引用验证；32px格坐标集中换算 | 不丢喷气向量、完整轨道节点、角度、冷却、once/requiresAI/distance等 |
| 模块 | 按当前支持模块与 compatibleMajors 检查；未知必要模块明确报错 | 绝不静默忽略模块主版本 |
| 迁移 | jet v1向量与v2方向力度、thermal.initial旧别名、aiStartHollow与独立collision、rail1/2、checkpoint签名与标记幂等 | sideTrigger默认和实体/空心点行为不同 |
| 安全 | ZIP条目/总量、CRC、尺寸一致、路径和重复项；错误保留旧会话 | 只在候选加载完全成功后替换 |
| 资料保真 | 原始字节和SHA、原始JSON树、未识别扩展字段、图形元数据和素材原字节保留 | 不把“未实现解码”当成丢弃素材的许可 |

## 素材能力矩阵

编辑器接受png/jpg/jpeg/webp/gif/svg（`room-editor/src/assets/manager.cjs`）。目前原生运行时尚未实现，以下全部是待实现能力。

| 格式 | P1要求 | 呈现阶段要求 |
| --- | --- | --- |
| PNG/JPEG | 保存字节、mime、稳定ID、路径、尺寸和帧参数 | Unity纹理解码、透明PNG正确、绑定覆盖 |
| SVG | 完整保存原文件，冻结默认9项 | 选择有许可证的受控SVG方案或原生纹理缓存，等效图形；不能另启浏览器截图 |
| WebP | 原字节及元数据保留 | 选定可随包的解码实现并验证；未完成时明确能力错误，不静默色块替代 |
| GIF | 原字节及元数据保留 | 确认编辑器实际动画语义并验证等效显示，不能把静态首帧称为动画兼容 |
| Sprite sheet | 保存frameWidth/frameHeight/fps与课程/对象assetOverrides | 原生切帧、时序、缩放和覆盖 |

P1只做数据适配，不以未完成SVG/WebP/GIF解码拒绝保存/规范化项目；只有尝试原生播放时才由能力矩阵明确阻止缺能力的完整导入/启动。

## P1 唯一写入合同

写入工程仍为 `G:\project null\gameProject-roomlab255`。允许新增 `Assets/RoomLabNative/Data`、对应 `.meta`、独立编辑器导入/测试入口、`Validation/Native/P1` 与纯C#验证工具；必要时单独锁定 JSON/ZIP 依赖。不得改旧 `RoomLabData`、旧场景、旧控制器、套壳运行器或编辑器源码。用户本会话已指定子代理实现，不调用DSH，不改变全局分工偏好。

1. 独立C#数据层读取JSON/ZIP，不执行JS；采用严格解析。Unity可锁定官方 `com.unity.nuget.newtonsoft-json` 3.2.2（依赖引入需真实编译与lockfile核验），避免自制宽松解析器。
2. 保留原始字节、SHA256与原始JSON树/未知字段；规范化对象另外保存。原始JSON读取与写回分开，此阶段没有写回源文件功能。
3. 输入支持 `Fixtures` 中真实2.5.5导出、普通旧2.5.2、朋友版签名、定制DDL1.3保留profile；源语义与实例覆盖顺序写成可测契约。
4. 构造候选DataProject完全成功之后才替换当前会话引用；坏文件、未知主版本、无效数值、路径越界、缺失素材与引用错误均不得破坏旧会话。没有素材根的纯JSON可明确区分“数据有效、素材未解析”与“可播放”，不能假报完整加载。
5. 编辑器入口输出到专用新目录，支持审查全部11房、695对象、1311地形、10连接、7检查点、214尖刺、9素材。不要批量生成游戏场景；P2控制器选型前只产出可检查数据资产/报告。
6. 纯C#测试可用 `E:/Unity/6000.6.4f1/Editor/Data/DotNetSdk/dotnet.exe`（SDK8.0.318/runtime8.0.21），避免默认dotnet仅runtime造成误报。

P1独立验收要求：真实C#读取全部正常/异常fixture；对比ID/连接/参数/来源散列；迁移幂等与profile保留；未知字段与素材字节保真；CRC/尺寸/重复路径/未知版本失败；原子失败测试；Unity 6000.6.4f1编译成功；验证没有启动Node/Electron、没有写回源数据。Data层通过并不代表运动/AI/图形已完成。

## 测试机器与目标

本次只读采样：Core Ultra 9 275HX、24核心/24逻辑处理器、约63.5GiB物理内存、RTX5080 Laptop GPU（另有Intel与虚拟显示适配器），活动显示2560×1440/180Hz，详见 `hardware-baseline.json`。拟固定基准为1920×1080窗口、游戏渲染目标60fps；物理显示器仍为180Hz，未改变用户系统显示设置，也没有取得真实60Hz显示器的结果。构建通过明确的targetFrameRate/VSync配置控制渲染，并记录实际显示刷新率、帧率与构建模式；30/60/120/144fps另测输入。最低配置设备未获得，不能以此高配本机结果代替低配验收。

性能目标沿用总计划：稳定玩法p95≤16.7ms、p99≤25ms；核心持续分配目标0B/帧；软件输入到画面提交p95≤33.3ms（60Hz基准）。这些是P5目标，目前没有原生性能结果。P0的旧PNG往返数字也不是输入到屏幕发光的端到端延迟。
