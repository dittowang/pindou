# 架构

## 一屏看懂

```
main.ts ── Studio（app/studio.ts）─┬─ World（app/world.ts）：three 场景、灯光、桌子、板、钉上的豆、豆盘（TrayModel + TrayBeads）
        │                          ├─ CameraRig（app/cameraRig.ts）：命名镜头 + 访客有限的旋转 / 缩放 / 平移
        │                          ├─ BuildController / IronController / FinishController（interact/）：三个阶段的手感
        │                          └─ AudioEngine（audio/）
        ├─ Session（app/session.ts）：阶段（选板→取豆→拼→熨烫→成品）、setup（豆规格/板/图纸）、镜头切换
        └─ Shell（ui/shell.ts）：顶栏、各阶段面板、HUD、欢迎页 —— 纯 DOM，监听 Session 的事件总线
```

每帧（`Studio.loop`）：相机 → 指针射线 → 豆盘 → 摆豆 → 引导圈 → 熨烫 → 成品 → 钉上豆子的熔化数据推到 GPU → 渲染。
每秒统计一次帧率，`govern()` 用「试探—回退」自动在 high / medium / low 与 DPR 之间调节，用户不用开设置。

## 约定

| 约定 | 内容 |
|---|---|
| 单位 | 世界单位 = 1 cm，桌面 `y = 0`；豆板中心在原点；`+x` 向右，`+z` 朝向观众 |
| 豆规格 | `config/physical.ts` 的 `makeDims('mini' \| 'midi')`：钉距、豆外径 / 孔径 / 高度 / 公差、钉子、板厚、分格盘、`closeSeconds`（140 °C 下一个面烫到孔闭合的秒数：mini 14 s、midi 28 s） |
| 格子索引 | `k = j * cols + i`；`PegBeads` 的 CPU 数组按格子索引，GPU 属性按「槽位」索引（只画存在的豆，删除时把最后一槽搬进空位） |
| 熔化 | 每颗豆每个面一个热量剂量 `u`：`0` 松散 · `.25` 边缘融合 · `.45–.75` 孔洞缩小（目标）· `1` 孔闭合 · `>1.3` 过熔（见 `docs/research/materials-physics.md §3.2`） |
| 随机 | 所有随机源走 `lib/rng.ts` 的 `mulberry32`（会话种子），便于复现；只有「钻孔会不会裂」等少数几个用了 `Math.random()` |

## 渲染

- **豆子**：一个 `InstancedMesh`（`render/pegBeads.ts`）画所有钉上的豆；每实例属性 `aBead = (熔化上, 熔化下, 种子+1, 长度系数)`、`aTilt`、`aFin / aAlt`（特殊豆）。顶点着色器（`render/beadShader.ts`）把圆柱变成「圆角方」、收孔、压扁；`lit`、`depth`、`normal` 三种材质共用同一份变形，阴影和 AO 才会跟着变。片元着色器（`render/beadMaterial.ts`）做邻色晕染、解析 AO、纸屑 / 毛发、盖布压痕、过熔变色。豆盘里站着的豆（`render/trayBeads.ts`）是另一个实例化网格，共用同一套塑料材质（`createBeadMaterial`），位置全部由 `TrayModel` 的格子数据决定。
- **烘焙纸**（`render/paper.ts`）：一块高度跟随豆顶的网格 + 着色器，数据纹理里存熔化、温度、占用；可揭一角；带热成像模式。
- **透明板**：不用折射。底色薄雾 + 掠射角更不透明的壁（`rimAlpha`）+ 叠加反射 + 贴花（`render/board.ts`）。
- **桌上的小东西**（`render/props.ts`）：便利贴（画布手写字体，一角微翘）和按图纸用色摆出的 30 ml 豆瓶（透明塑料壁用与豆板同一套掠射角透明材质，瓶里是画布生成的豆粒贴图）。
- **程序纹理**：橡木、拉丝金属、纸纤维、皱褶、大理石都在 `render/bake.ts` 里用一个全屏 fragment 烘焙到渲染目标（注意：渲染目标纹理不能 `.clone()`，要再烘一份）。
- **后处理**：Render → [GTAO，默认关] → Output → 暗角 + S 曲线（grade）→ [SMAA]。`userData.noAO` 的网格（透明件）在 AO 预通道里被隐藏。
- **相机**（`app/cameraRig.ts`）：镜头用「必须装进空闲视口的区域大小」（或每厘米多少像素）描述，距离按 UI 遮挡后的空闲区域计算，因此同一个镜头在桌面和手机上都能构图正确；`setViewOffset` 把桌面居中到空闲区域。

## 豆盘、摆豆与熨烫模型

- **没有物理引擎。** 豆盘（`interact/trayModel.ts`）只是数据：每格一个颜色、一个总数、一个 n×n 的「站着的豆」网格；`render/trayBeads.ts` 把它画成一个 `InstancedMesh`（孔朝上，一排排，按阅读顺序填；夹走一颗，后面的补上来）。放豆、取豆、撤销只是改这份数据——确定、可预测，不会有豆子滚出去。
- **摆豆**（`interact/build.ts`）：每帧用指针射线求出「它指着什么」（钉子 / 豆盘的一格 / 没有），工具尖就骑在这条射线上（所以画面上工具尖永远在鼠标下面）；按下时用**按下那一刻的射线**判断，豆笔划过时用**这一帧内的每个指针位置**（`PointerState.trail`），所以快速划过也不漏钉。套进钉子是一个很短的下落动画（`PegBeads.setLift`）。
- **熨烫模型**（`sim/melt.ts`）：`du/dt = (1/closeSeconds) · 2^((T−140)/15) · 压力系数 · 材料系数 · 起效门槛`；豆子温度滞后底板温度；大理石是散热垫；不同盖布有不同的「粘豆」阈值；停留时间、熨斗足迹（旋转矩形）、压力决定哪些格子受热；无孔烫时 `conduct` 让热量穿过豆子到另一面。
- **诊断**（`sim/report.ts`）：把摆豆统计 + 熨烫结果 + 成品测量（厚度标准差、孤立豆、碎块、翘曲）变成 S–D 等级和若干「症状 / 病因 / 处方」。

## 交互

- `interact/pointer.ts` 统一鼠标和触摸（触摸时工具尖抬到手指上方）。
- `interact/build.ts`：镊子的夹取 / 携带 / 落下 / 拔豆 / 撤销，豆笔的装豆与划过，画面上的目标圈；`interact/toolRig.ts` 是手里的工具（工具尖 = 指针）。
- `interact/iron.ts`：熨烫流程状态机。有孔烫：`prep → lint → iron → cool → peeling → onboard → flipping → flipped → lint → back → cool → peeling → press → pressing → done`；无孔烫（`mode = 'flat'`）：`prep → tape → flipping → flipped → lint → back → cool → peeling → press …`——`tape` 里滚筒给每个格子累积 `stick`，`transferBoard()` 按它决定谁掉；`conduct` 让热量穿过豆子到另一面。
- `interact/finish.ts`：成品展示（桌面 / 钥匙扣 / 相框）、钻孔、摆动、特殊豆的灯光把戏。

## 界面

`ui/` 是没有框架的 DOM：`shell.ts` 管顶栏的「豆串」步骤条、面板切换和 HUD；每个阶段一个 `stage*.ts` 返回 `{ el, foot, show, hide }`；设计 token 全在 `styles.css` 顶部。

## 怎么扩展

| 想加…… | 改这里 |
|---|---|
| 一张内置图纸 | `config/patterns.ts`：用 `Art` 画笔画，返回 `artToPattern(…)`，加进 `builtinPatterns()` |
| 一种豆的特殊质感 | `render/beadFinish.ts`：加一个 `FIN` id，在片元片段里写外观，在 `finishAttrsFor` 里取色 |
| 一种盖布 | `render/paper.ts` 的 `COVERS`（透明度、粗糙度、粘豆阈值、压痕）；`render/beadMaterial.ts` 里的压痕图案 |
| 一种翻车 | `sim/report.ts` 里加一个 `add({ id, name, slang, sev, what, why, fix })`，并在 `Outcome` 里记录它需要的数据 |
| 一个阶段 | `app/session.ts` 的 `STAGES` + 一个控制器 + 一个 `ui/stage*.ts` 面板 |

## 两条不能破的规矩（都是踩过的坑）

1. **画布上方的任何东西都不能吃掉指针事件。** `.hud` 盖满整个画布；只有真正的控件（按钮、工具栏、调色条）才可以 `pointer-events: auto`，装饰层和标签一律 `none`。曾经一条 `#app .hud > * { pointer-events: auto }` 让透明的标签层盖住了整个画布，真实鼠标根本到不了 3D 场景（而脚本直接给画布派发事件，测不出来）。
2. **面板刷新不能换掉用户正在按的按钮。** 阶段面板里凡是会被计时器 / 控制器频繁刷新的（熨烫面板），用 `ui/dom.ts` 的 `patch()`（把新树折进旧树，复用已有元素）而不是 `mount()`（整块替换）；摆豆 / 取豆面板则只在事件发生时原地更新数字。否则「按下」和「抬起」落在两个不同的元素上，点击就丢了。
