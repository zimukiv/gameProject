# 功能块扩展接口

每个物理机关一个 CommonJS 模块，集中在 registry.cjs 注册。这是源码层插件扩展：新增或修改行为需要重建发布，界面不执行任意导入代码。模块不要依赖 DOM、Electron、文件系统或直接修改项目。

## 定义与钩子

定义必须包含 type（稳定命名空间）、version、name、glyph、category、courses、slots、defaults、schema。collider 为 pad/tile 或省略，trigger 为 foot/region/none。schema 支持 number（min/max）、boolean、select（values）、zone、path、text。模块版本写入项目 pluginManifest，主版本不兼容时拒绝试玩。

```javascript
module.exports = {
  type: 'physics.example', version: '1.0.0', name: '示例踏板',
  glyph: '↑', category: '物理', courses: ['physics'],
  slots: ['idle', 'active'], collider: 'pad', trigger: 'foot',
  defaults: { launchY: -600 },
  schema: [{ key: 'launchY', label: '上抛速度', kind: 'number', min: -2000, max: 0 }],
  createState(ctx, object) { return {}; },
  onTrigger(ctx, object, state) { ctx.launchPlayer(0, object.params.launchY); },
  visual(ctx, object, state) { return state.cooldown > 0 ? 'active' : 'idle'; }
};
```

引擎先附加 used/cooldown/firedDuringContact 等公共状态，createState 增加模块状态；每步调用 tick(ctx,o,s,dt)，符合接触、AI 条件和冷却时调用 onTrigger。isSolid 控制当前碰撞实体，surface 返回 friction/acceleration，visual 返回 slots 中状态名。所有状态必须可 JSON 克隆，不能存函数、DOM 或循环引用。

ctx 提供 player/ai/project/room 的运行副本，temperature(object)、setTemperature(zoneId,value)、actorOverlaps(object)、launchPlayer(x,y)、launchAI(object,range,x,y)、startRail(object)、activateAI(object)、emit(type,data)、say(message)。具体接口签名以 engine.context 为准，特殊 legacy.transformGroup 仅用于迁移兼容。

## 死亡副作用

对象状态与外部效果分开，避免回退只改 used 而温度未恢复。模块可实现 restoreEffects(ctx,o,s) 用于 preserve 后重施效果；restoreSnapshotEffects(o,s,cache) 用于 life 回退房间缓存，cache 含 objects/zones/environment/movables。温控板是对应实现示例。一般纯对象状态机关不需要这两个钩子。

## 新增流程

1. 在 src/plugins/physics 新建模块，并在 registry 的 modules 引入。
2. 使用新 type 和版本，定义参数范围与素材状态；defaults 的 room-specific 引用留空，轨道节点在房间中编辑。
3. 如果扩展 context，先在引擎统一实现；不要让机关各自复制物理和资源规则。
4. 增加有意义的行为与回退测试，再在 UI 放置并试玩。运行 pnpm docs 更新参数目录，pnpm build 后验证生成界面。
5. 若破坏现有参数含义，升级主版本并提供项目迁移，再打包与检查真实 exe。

自定义参数表自动生成编辑表单；自定义行为不是只改表单。只换美术无需改模块，使用素材绑定即可。

`serializeRoom()` 必须生成独立深拷贝，不得将 Map 值的运行对象直接写进出生点或缓存；否则 used/cooldown/anim 会污染回退基准。可选 `afterRetry(ctx, object, state)` 在通用回退和 preserve 效果恢复后执行。AI 启动板用它协调「AI 不存在」和「一次性已用」状态，不改变其他机关的 preserve 语义。
