> 2026-10-27 换版提示：源关卡已从 `73c0df8eb955f22ae9fa56e30537e87751e2dfab3b45143d81885d873b2a5ad9`（1,839,449 字节）换为 `880a65111ff27bc0389da57ac110784a15c412a70fa99f0f2c0aeeb00633ee06`（1,840,048 字节）。本文写于换版前，其中 SHA 与 695对象/1311地形/7检查点 属历史记录；当前为 696对象/1310地形/8检查点。

# 用户指定关卡：控温独立诊断

2026-10-27，用户指定 `G:/project null/存档/第一大关 · 物理 DDL.json` 为关卡设定准据。只读诊断由 native_p1 执行，未修改源文件、Unity/P4界面或存档代码。

源文件 SHA256：`73c0df8eb955f22ae9fa56e30537e87751e2dfab3b45143d81885d873b2a5ad9`，1,839,449字节；1大关、11房、10连接、1311地形、695对象、9素材。9项旁置assets与既有素材字节相同。相对旧参考项目有267处语义差异，不能仅按数量认定同一关卡。

## 复现与根因

临时独立.NET runner链接实际Data/Core并排除变化中的NativeProgress，不调用Fire/SetTemperature，实际从控温板上方1px落下。

| 同一份源数据 | Editor255Compat | 旧Demo使用的LatestPhysics |
| --- | --- | --- |
| 冰引入初始：zone hot、板inherit、trigger foot | hot，0/42固态冰，0冰碰撞 | 相同 |
| 真正落到板顶 | cold，42/42固态冰，42冰碰撞 | 仍hot、0固态冰 |
| 持续接触150步，超过冷却 | 不反复触发 | 无踩踏触发 |
| 离开150步后再落板 | hot，冰与冰碰撞全部消失 | 无踩踏触发 |
| E边沿 | 按原文件踩踏规则 | cold，42固态冰 |

差异来自NativeMotion.TriggerObjects对LatestPhysics强制手动E，覆盖原文件foot模式。温区/初温实际已读取，不能通过把hot改成cold或强制显示非实体冰掩盖。正式默认应使用用户文件原字节及Editor255Compat，保留已验证旧规则为历史对照。

## 状态表及额外对照

原文件实际3个温区：冰引入初始hot（42冰全融化）；8初始cold（32冰固态）；AI追逐1初始cold（18冰固态）。冰跑酷无温区cold（26固态）；XX无温区、板显式cold（232固态）。其余房间无冰。

15项独立定向通过：显式板cold覆盖zone hot；显式板hot覆盖zone cold；XX板cold覆盖room hot；inherit遵循zone/room；冰重叠冷热区时热区优先。文件SHA前后不变。尚未以本诊断声明最终EXE载入来源/Unity显示/物理键盘已通过，后续由实际包检查补齐。
