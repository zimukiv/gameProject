# GitHub 源码与发布

源码仓库：https://github.com/zimukiv/gameProject 。Unity 游戏仍在仓库根目录；本编辑器位于 Tools/RoomLab/room-editor，云同步服务源码位于 Tools/RoomLab/room-cloud。Room Lab 编辑器与根目录 Unity 游戏、PhysicsLevelEditor r5 是不同组件，请不要互相覆盖或按版本号直接比较。

每次收到更改需求，首先执行 `node scripts/check-upstream.cjs`。脚本抓取 main 到 test-output 下的裸缓存，读取源码清单并比较本机已同步基线；不修改工程、不自动合并。如果远端变化或无法核验，先对比同步，保留本地改动，确认后用 `--record` 记录基线。已经记录的远端清单未变时，本地工作中的差异会列出，不会误当作远端更新。新克隆且源码完全一致时可直接记录基线。

直接在 Git 克隆中工作时，还须先 `git fetch origin main`，检查分支及未提交改动，确认其他组件的更新。严禁用旧工作副本覆盖队友新提交，不使用强推或清理命令丢弃现有工作。

Room Lab 发布使用独立标签 roomlab-editor-v版本号。Windows 程序包和含云端服务的源码包放在对应 GitHub Release，附 SHA256SUMS.txt；完整解压程序包后运行 RoomLab.exe。运行库、缓存、连接密钥和个人关卡草稿不提交。

本机原始维护目录保持 G:/project null/room-editor（云服务为相邻 room-cloud）。test-output/github-publication 只是本次发布的隔离暂存克隆，不是第二个长期源码目录。后续可在原维护目录继续开发，先使用核对脚本；发布时基于最新远端提交同步这两个组件。
