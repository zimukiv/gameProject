# 接入现有 GitHub 仓库

共同仓库：https://github.com/zimukiv/gameProject

2026-10-14 核对时，远端默认分支为 main，只有提交 `65030fc` 和简短的 README，没有 Unity 工程。A 的本地目录 D:/minigame 已连接 origin。T01/T02 的工程文件将保留在原位置，并在继承远端历史的 `a/t01-t02-baseline` 分支提交，再由团队检查并合并到 main。

## 三个概念

- 本地仓库：你电脑上的 `.git` 记录提交历史，工程文件仍在 D:/minigame。
- 远端仓库：团队 GitHub 上的 gameProject，origin 是本地给它取的简称。
- 分支：从共同起点各自开发。main 保存团队合并结果；A/B 的开发分别在自己的分支中进行。

提交 commit 是把本地修改记录为一个版本；推送 push 才把这个版本传到 GitHub。配置作者名和邮箱只用于提交署名，不等同于 GitHub 登录。使用 noreply 邮箱可以避免在提交中记录私人邮箱。

## A 接入流程

1. 取回远端 main 的历史；保留本地工程文件，把原有短 README 扩充为 Unity 工程说明。
2. 从共同历史开出 `a/t01-t02-baseline`，加入已验收的 Assets、Packages、ProjectSettings、策划案和 Docs。
3. 用 A 的身份提交并推送该分支。Library、Temp、Logs、UserSettings、测试截图和交接 zip 均排除。
4. 团队核对后把这条基线分支合并到 main。没有获得明确合并指令时，不代替团队执行合并。
5. 双方从同一个已验收基线开始：A 用 `a/t03-player-dash`，B 用 `b/t03-resources`。

## B 在另一台电脑上接收

基线合并 main 后，在自己的开发目录运行：

```powershell
git clone https://github.com/zimukiv/gameProject.git
cd gameProject
git switch -c b/t03-resources
```

如果 main 还没有基线，由 A 提供已经推送的基线分支和提交号，B 从那一提交开出开发分支。首次克隆时如需 GitHub 登录，由 B 使用自己的账号登录。

Unity Hub 添加 `gameProject/UnityProject`。导入完成后打开 A_GameplayTest 复现跑跳；功能开发与测试留在 B_SystemTest。B 第一批任务见 Docs/04-发给B的交接单.md。

## 后续日常协作

开始工作前检查当前分支和工作区；完成一个可验收的小步骤就提交，推送自己的分支，再由团队检查合并。不要用整个工程文件夹覆盖对方的工作。新资产连同 .meta 提交；保持场景和预制体的维护边界。

以前制作的 Handoff 压缩包只是备份，它不含 Git 历史；其中让 B 重新建立共同仓库的旧说明已失效。
