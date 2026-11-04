# 三主题素材来源

2026-11-05 根据用户指定最新策划及像素风清单，用 imagegen 生成并人工检查：

- calculus-background.png：白纸、坐标与演算背景。
- slacker-background.png：绘画梦境校园背景。
- theme-mechanisms.png：积分、求导、签到、清醒，每类待机/激活两状态。
- calculus-world.png：纸格地形、坐标移动砖、纸面算子与坐标终点。
- slacker-world.png：拼贴地形、画板平台与绘画出口。

贴图采用 Point、无 Mipmap、无压缩；世界仍32 PPU，主画面经像素渲染目标显示。图集保留生成源分辨率，切片坐标见 NativePixelWorld.ThemeMechanism，运行时按实际机关矩形缩放。新增美术不是碰撞数据，不改变作者关卡几何。

物理地形与角色继续复用；高数/水课地形和出口使用独立主题图集。不宣称已量产三套独立角色动画。用户包显式素材绑定优先于新增回退图。

NativeMathPresentation使用坐标线和真实平台位置表现聚合/展开，单网格固定缓冲区；NativeDreamPresentation使用固定梦雾、Z、星光和速度尾迹，读取清醒板实际触发次数。清醒视觉包络1.2秒，仅表示反馈，不新增玩法增益时长。默认背景由灰紫转明亮再回落；暂停冻结，复活/换房重置，继续旧存档不假触发。
