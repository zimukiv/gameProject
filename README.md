# gameProject Unity 2D 原型

Unity 版本固定为 **6000.6.4f1**。Unity Hub 中使用 Add / Add project from disk，选择 `D:/minigame/UnityProject`，不要选择外层文档目录。

共同远端仓库为 `https://github.com/zimukiv/gameProject`。B 克隆后在 Unity Hub 打开自己电脑上的 `gameProject/UnityProject`，无需使用 A 的绝对路径。

当前完成范围：T01 共同工程准备，T02 左右移动、单次跳跃、地面判断、基础跟随摄像机及独立测试场景。打开 `Assets/_Game/Scenes/A_GameplayTest.unity`，点击 Play，在 Game 窗口中按 A/D 或左右方向键移动，空格/W 跳跃，R 回到测试出生点。

- [动手验收和 Inspector 说明](Docs/02-T01-T02验收与学习.md)
- [确认规则、正文和批注的区别](Docs/01-规则与范围.md)
- [A/B 文件维护边界与当前交接](Docs/03-A与B交接.md)
- [接入已有 GitHub 仓库](Docs/05-GitHub协作起点.md)

T03 token 与八方向冲刺尚未实现。B_SystemTest 及 Prototype 当前仅是独立空场景，分别留给系统测试和后续主地图整合。
