# 隐藏开发入口验证

入口组合为实际方向键 `↑ ↑ ↓ ↓ ← → ← →`。每次需要新的按下边缘，两键间隔最多 2 秒；超时、错误键或失焦后重新开始。错误的 ↑ 可作为新序列的第一键。WASD、改绑方向键、鼠标均不能代替实际 Arrow KeyCodes。同帧出现多个键时视为无序输入并重置。

实现分为不依赖 Unity 的 `NativeHiddenDeveloperSequence` 与新 partial `NativeHiddenDeveloper`。前者只接收 key-down edge，后者使用 `GameInput.WasPressedExact`，不使用 held 输入累计序列。只在 menu / play / pause 接受；待选存档、保存/读取/覆盖模态、改绑与其它页面重置。

`HandleHiddenDeveloperInput()` 在 Update 普通输入前调用，成功返回 true 后本帧应提前返回。成功时会清空游戏 keys / timeline，调用 `OpenHiddenDeveloper()`，清除 EventSystem 当前选择。该方法及页面入口由 maps 代理接入 Player。

`FeedHiddenDeveloperKey(KeyCode,float)` 为同一个生产分支的 runtime 验收入口。通过它喂入序列属于合成输入验证，不等于真人键盘试玩；本目录没有把合成事件包装成真人证据。

纯逻辑测试结果：66 / 66。覆盖每个序列前缀、0/0.2/2 秒边界、每个位置超时或错键、模态 Reset、无效与倒退时钟、↑ 重启、重复完整序列。完整证据见 results.json。Unity UI 行为和真人按键由主代理进一步验收。

在工程根目录重跑：

```powershell
& 'E:/Unity/6000.6.4f1/Editor/Data/DotNetSdk/dotnet.exe' run --project Validation/Native/Guided20261107/HiddenDeveloperChecks/HiddenDeveloperChecks.csproj
```
