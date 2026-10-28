# GitHub 协作规则

- 每次有更改需求，先 git fetch origin main，检查分支、工作区状态及相关组件的最新提交，再开始修改。远端有更新先对比并保留本地改动，不从旧副本覆盖队友内容，不 reset/clean 或强推。
- Unity 游戏位于根目录。Room Lab 编辑器及独立云服务位于 Tools/RoomLab；该编辑器的进一步维护先读 Tools/RoomLab/room-editor/AGENTS.md，可运行其中 scripts/check-upstream.cjs 核对源码清单。
- 不同组件使用独立发布标签；源码提交 Git，程序 ZIP 放 GitHub Releases。不要提交缓存、运行库、密钥或个人存档。
