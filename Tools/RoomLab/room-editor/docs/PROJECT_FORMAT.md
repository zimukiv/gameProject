# v2 项目格式

2.5.4 保存的 revision 可带 summary={projectName,courseNames,roomCount}，参与原有版本 ID 校验；项目 JSON version 不变。批量导入为所选房间分配独立内部 ID；覆盖时保留目标 room.id 和匹配端口 ID。轨迹名称仍使用 playTraces[].name，回放按已有 points[].t / break，不新增玩法状态格式。

2.5.2 可选 room.playCamera 为 `{mode: "room" | "follow", cols: 30, rows: 17}`。缺省按整房显示；跟随模式宽高为 1–256 格的有限数字，缺省 30×17，实际画面按窗口比例扩展并限制在房间边缘。只参与渲染，不参与物理或路径记录。

2.5.1 可选 room.artBindings 使用与 course.artBindings 相同的结构，仅覆盖当前房间美术，用于跨项目导入时保留原样。缺省时使用大关绑定。room.importSource 记录来源 ID；单房间包顶层 roomExport 记录来源及未带入运行的跨房连线。普通项目导入/导出保留这些可选字段；不参与机关逻辑。

项目 JSON 的 version=2；格子世界单位为 tileSize=32。顶层有 id/name/notes/settings/courses/assets/blockDefaults/pluginManifest。稳定 ID 是连接与引用的键，不能随名称修改。旧 v1 单大关数据由 model.migrate 转换为 legacy 大关，旧机关单独隔离。

## 大关与房间

course：id/name/kind/notes/aiId/defaultSize/artBindings/rooms/connections。此版内容 kind=physics。artBindings 为 `{blockType: {state: assetId}}`，固定地形用 common.solid。

room：id/name/notes/cols/rows/graph/phase/aiId/aiPolicy/environment/tiles/entries/exits/objects/movables/zones。graph 只存接线板排布。phase=slow/fast/inherit，aiPolicy=off/start/inherit；环境 cold/hot。tiles 是整数 x/y 固定砖列表。

入口：id/name/notes/x/y/face（1或-1）；出口：id/name/notes/x/y/w/h。每房至少一个入口。connection：id、from={roomId,exitId}、to={roomId,entryId}、velocity=reset/keep。接线属于大关，不跨大关。

## 功能对象

object：id/type/name/notes/x/y/w/h/params/trigger/aiId/assetOverrides/resetPolicy。参数默认来自注册表 → 项目默认定义 → 实例覆盖。所有功能块 x,y 表示左上格子，贴图占 w×h 格；pad 的碰撞顶面在 y 行，以顶面脚底接触触发。zone 为 id/name/x/y/w/h/initial。轨道 path 的坐标可以是小数，表示世界格子点。新实例的参数数组独立克隆，轨道不能共用引用。

common.aiStart 为实心实体、foot 触发；common.aiStartHollow 为非实体、region 经过触发。两者共享 AI 启动行为与 ID 继承规则，默认只启动一次。

trigger 可填写 mode=foot/region/none、requiresAI、distance（格）、once、cooldown。AI 距离量到机关，且 ID 必须匹配。踏板在持续接触内触发一次；需要 AI 的踏板允许玩家已站住再等 AI 接近。全局定义不包含 zone 或 path 这类实例关联。

2.3.1 的轨道 path 点增加 id、parentId；x/y 仍为世界格坐标，避免改变旧轨道。节点嵌套在所属对象的 params.path 中，顺序决定 I/II/III。父装置移动同时平移点，复制重新生成点 ID 和 parentId。旧 v2 数据加载时补齐身份信息。

room.playTraces 可选，保存 `{id,name,createdAt,color,visible,points}`；点为世界像素 `{x,y,t,break?}`，break 表示重试或跨房后断开。轨迹不参与碰撞和玩法计算，复制房间时生成独立轨迹 ID。独立文件格式为 room-lab-traces/version=1，含房间尺寸和 traces。

温控 params.initialState 为 inherit/cold/hot，默认 inherit。显式状态初始化其所控区域，初始化先于各机关 createState；缓存与死亡回退沿用既有规则。

## 死亡回退

| resetPolicy | 含义 |
| --- | --- |
| checkpoint | 回到本次进入当前入口时的对象状态（默认） |
| preserve | 保留当前对象的使用、计时等状态；温控板同时恢复其温度效果 |
| initial | 当前房间对象按模块初始状态重建 |
| life | 恢复本条命首次进入各房间时的对象状态，涉及已访问房间缓存 |

死亡恢复当前入口的资源、计分和收集检查点；实际落地免费首冲重新可用。pause 不推进任何运行计时。AI 启动等级在跨房保留，死亡恢复入口时 AI 状态。

## 素材与打包

asset：id/name/path/mime/width/height/courseId/category/subcategory/frameWidth/frameHeight/fps/hash。category 为 terrain/mechanism/item/character/scene/unsorted；subcategory 通常为功能块 type，或同类通用 shared。分类定义见 src/assets/catalog.cjs。新增字段可选，旧 v2 数据从现有素材绑定推断分类；新导入必须归类后才作为对应方块的候选。可用素材满足 courseId 是当前大关或 common、大类匹配、子类匹配 type 或 shared。

path 必须为 `assets/...` 相对路径，禁止 ..、绝对盘符及反斜杠。替换素材 ID、分类及大关归属不变，内容散列与路径改变；旧字节保留在缓存中支持撤销。ZIP 根有 project.json 及 assets/*，引用文件必须全部齐全。ZIP 解压总量限 128 MiB、单项 25 MiB；UI 导入单图限 20 MiB。

缺失模块或主版本不一致拒绝试玩，缺图显示占位。数据越界在编辑状态警告但保留，试玩拒绝。温控关联失联提示并拒绝试玩；需要修复或选择整个房间。桌面 JSON 备份在同目录 .project-backups，替换不改外部图片。

## 2.4.0 扩展与兼容

`collision` 为地形、机关砖及功能块的可选布尔字段。缺失时完全沿用旧类型碰撞规则；false 禁用实体，true 开启实体（冰块仍受冷热生成状态约束）。无碰撞对象画虚线边界。此字段不改变物体的 ID、坐标、素材或普通机关触发规则。

编辑器仅显示 `common.aiStart`，碰撞开启时踩踏触发，关闭时经过触发。旧 `common.aiStartHollow` 读取时按同 ID 转成统一 AI 板并设 collision=false，保留实例素材和区域触发；JSON/ZIP 输出时空心效果仍使用旧别名，使 2.3.1 可按原空心逻辑读取。普通方块的新增碰撞覆盖只有 2.4+ 解释，2.3.1 虽可读写文件但仍执行旧碰撞行为；要体验这些新设置需双方升级。

温控采用单向控制：控制器的 zoneId 选择温控区，冰块不再绑定任何区域。冰块矩形与区域有面积重叠时按该区温度生效；重叠多个冷热区时热优先，区外取房间默认温度。初始预览和运行时共用 temperature.at。旧冰块 zoneId 导入时丢弃；兼容 v2 导出会按几何位置写入供 2.3.1 使用的参考值，新版不读取该值。多个重叠区、范围改变或新碰撞覆盖须双方使用 2.4 才能获得一致玩法。热态融冰，冷态等待 respawnDelay 并避免在玩家/AI 身上生成。

云连接、实时序号、工作树与读取来源均存于项目文件以外。关卡 JSON 继续 version=2，旧 v1 沿用原迁移逻辑。


## 喷气与自定义运动参数兼容

2.5.5 增加 compatibility.runtime/importedProfile 标记，只对无标记且含 common.checkpoint 的朋友版执行一次性转换。普通旧关卡不改变碰撞和轨道行为。common.checkpoint 的运行进度属于 Engine 内存快照，不写入关卡；params.sideTrigger 是轨道布尔选项，默认 false。带该选项的导出声明 physics.rail 2.0（新版兼容旧 1.x），存档点声明 common.checkpoint 1.0。明确未知主版本不被迁移覆盖。见 RELEASE_NOTES_2.5.5.md。

physics.jet 2.0 支持 direction（up/down/left/right/custom）和 force。明确 direction/force 优先于旧 launchX/launchY；custom 保持任意横纵速度。读取和导出为方向模式补齐等效横纵速度，不删除已有扩展字段，旧 1.x 向量项目仍可运行。超过旧硬范围的数值及 2.0 manifest 需要协作双方升级。

功能模块数值 schema 的 min/max 作为建议，输入及运行验证只要求有限数字；房间边界、引用、唯一 ID 和素材路径继续校验。settings.performance 采用 speed/gravity/jump/maxFall/dashSpeed/dashDeceleration/dashTime/coyote/buffer，缺少值用内置默认。温控 initial 兼容为 initialState，显式新字段优先。

## 路径生命编号与位置锁定（2.4.2）

对象/区域/地形的 locked 布尔字段只约束编辑位置，不参与实体碰撞或触发。缺少字段视为未锁定。新放置方块默认 collision=true；已有字段和旧默认语义保留。

新路径记录带 sessionId、life（从 1 开始）、timeOrigin。名称为生命编号；采样点也带 life。保存只消费被勾选生命的未保存采样，同会话/同房间/同生命的已有记录追加新采样并保留 ID。旧路径无这些字段时仍可显示、导出和导入，不自动改写。
