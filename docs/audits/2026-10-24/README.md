# PCS/MV v2: CC 复审后的补充修正

**2026-10-24 时点：本地修正，未 commit/push/PR/部署，待用户安排复审。**
基线仍是 `c10efb04673041822edbb1547e7e31c2b4ae5623`。本页续接
[2026-10-23 初版证据](../2026-10-23/README.md)，不覆盖旧 hash、截图、指标或原时点状态。

## 复审来源与边界

用户转交的 CC 报告确认初版无阻断问题：Blender5.1.2 重建逐字节一致，
Node24.21.0 独立副本通过307/25、lint与Pages构建，Switchyard未变。
CC 同时发现左柜深度测试可误命中共用mesh的端板，以及百叶、线缆、底部间隙和文档问题。
因此初版的“实体柜身测试通过”不能作为充分证明；本轮补上真正的回归保护。

CC 报告的原生 Chrome / ANGLE Metal / Apple M5 检查只覆盖旧hash
`63885292c25b6f130d3b0971063c6d0b7de82e9b60afd55797ccd9b751ed98ef`
的08:00静态正反面和PCS点击：未见明显自阴影条纹/静态摩尔纹，内部设备偏暗但可辨。
这是**用户提供的独立验证**，不是Codex本轮实测，也不覆盖修正版、移动闪烁或夜景。
本轮没有调用CC或其他外部审查模型。

## 修正内容

- 柜体测试从80mm柜间空隙发射，校验两侧准确命中位置和40mm距离，各测三个深度。
- 负向对照移除左柜实体三角面，保留足以骗过旧探针的端面/门板。旧断言仍通过，新侧面契约拒绝该模型；右柜仍正常。
- 四个朝向的百叶统一为外缘低、内缘高；真实GLB射线对比内外高度。这只是几何方向修正，不构成防雨等级认证。
- 六根连接线分开横向通道及高度，末端落入对应柜体，不再三相重合或悬停柜顶；补实际线段和落点测试。
- 底板顶面由0.28m补到0.30m，承接柜底和变压器托盘；变压器支脚同时接入油箱底部。设备包络、场景位置和共同缩放不变。
- CLAUDE仅保留约束；README/文档索引不重复易过时的候选状态。发布状态放在有日期的证据页，不编造尚不存在的PR编号。
- Vault路线图使用稳定block锚点；已发布文档入口改固定SHA GitHub链接。新审计尚未公开，暂列repo相对路径，发布后再补链接，不制造404。

无调度、PCC、金额、能流拓扑、相机、缓存材质或依赖变更；上一轮的全局normalBias=0.035保持不变。

## 资产与验证

| 指标 | 10-23 初版v2 | 10-24 修正版v2 |
| --- | ---: | ---: |
| bytes | 1,010,176 | 1,034,084 |
| triangles | 21,804 | 22,332 |
| assembly/material meshes | 26 | 26 |
| materials / textures | 9 / 0 | 9 / 0 |
| 实测W×H×D (m) | 6×3×3.0275445 | 6×3×3.0275445 |

当前GLB SHA256：`3fd747a9e03d0df819b685b9c0bb49b6e38b7cbe898d295dc5860f10836e0a5c`。
Blender5.1.2沙箱外后台导出两次，`cmp`逐字节一致；没有GPU渲染或修改Switchyard。
重建方法见[模型说明](../../../public/models/README.md)。

- Node24.21.0：318 tests / 25 files、lint、type-check与Pages子路径构建通过。
- EquipmentModel文件20用例，较初版净增11；原始GLB复现前后百叶、底板间隙和线缆测试失败，重生成后通过。
- 预览测得包络不变，主渲染pass 27 calls / 22,334 triangles，包含地面；不是整帧GPU成本或FPS结论。
- 浏览器结果与截图见下方证据；Chromium/SwiftShader不等于原生GPU/触摸验收。
- 未重跑npm audit或托管CI；旧CI/Pages绿灯不覆盖这个工作树。

### 浏览器复验

复用冻结的 `../2026-10-23/asset-preview.mjs` 和 `browser-check.mjs`，输出到新目录。
预览在开发服务读取真实GLB；应用验证在 `BASE_URL=/BESS-Storage-Simulator/` 生产构建上运行。
首次preview启动漏传相同BASE_URL，导致子路径资源未正确加载、标签等待超时；修正服务参数后重验，未改应用来绕过问题。

最终[应用结果](results.json)：三台GLB均HTTP200，无pageerror；三个标签hover/click、站级等效说明、平移缩放/Full site及桌面双抽屉通过。
真实RAF运行至13:07/21:07；640×480时HUD底78、卡片顶86/底217.1875px，仍保留8px间距。
[受控预览数据](asset-preview-results.json)、[正面](after-front.png)、[背面](after-rear.png)、[应用近景](pcs-closeup.png)、[实际夜景](night-overview.png)为本轮新证据。
检查了静态画面；网罩后设备可辨，应用夜景仍整体偏暗，不把测试通过写成视觉问题全部消失。

```bash
BASE_URL=/BESS-Storage-Simulator/ npm run build
BASE_URL=/BESS-Storage-Simulator/ npm run preview -- --host 127.0.0.1 --port 4173
PLAYWRIGHT_MODULE=/path/to/playwright node docs/audits/2026-10-23/asset-preview.mjs http://127.0.0.1:5173 /tmp/pcs-followup/preview
PLAYWRIGHT_MODULE=/path/to/playwright node docs/audits/2026-10-23/browser-check.mjs http://127.0.0.1:4173/BESS-Storage-Simulator/ /tmp/pcs-followup/app
```

## 文档保护与下一步

上一轮8份审计/脚本/截图保持原字节；Vault仅维护BESS五篇，其他29个脏文件不动。
2026-10-13及更早迭代正文保持字节一致，历史hash/run ID及身份frontmatter保留。
冻结历史里的原始本机路径不批量改写；当前入口提供跨设备链接。
Switchyard HEAD仍为`fd28b09c112cd9f1b11b01285c24755d56b26e22`，HEAD/status/源脚本/GLB前后核对不变。

建议CC重点复核：负向测试是否真能拒绝空心柜；重生成资产与脚本一致性；新百叶方向、线缆及支撑接触；当前说明与旧证据是否分开。
修正版原生GPU移动/远景网格、夜景可读性和实体手机仍待人工验证。用户通过后才决定提交/PR；Switchyard回流另行授权。

## 同日后续：CC 最终复审与测试收口

用户随后转交CC最终报告：上一轮五项问题均独立复现修复，没有新阻断问题，可进入提交决策。
该结论覆盖修正版GLB `3fd747a9e03d0df819b685b9c0bb49b6e38b7cbe898d295dc5860f10836e0a5c`，
不是上文初版hash。CC报告在Blender5.1.2重建逐字节一致、开发服务加载同一文件；
Node24.21.0干净副本通过318/25、lint、Pages子路径构建，dist只有v2。
换回旧GLB时恰好四项失败：正面/背面百叶、底板间隙、线缆；端面百叶旧版即正确。
空柜反例也被独立复现。以上为用户提供的CC结果，Codex未调用或代跑CC。

据CC报告，修正版在Apple M5 / Metal下08:00静态正反面无自阴影条纹；
新百叶从上方更封闭，但仍可辨为通风口。三相连接最近间距约3.6cm、层间7cm，
底板贴合且上下观察无重面闪烁。这些是报告中的几何/静态检查，不是全路径净距认证或动态验收。
原生GPU转动时的远景网格闪烁、夜景可读性、实体手机表现仍未完成。

同次报告另有两条非阻塞建议，已局部采纳：
- 从空柜反例移除旧探针的存在/距离断言，避免CI要求旧错误永远可复现；保留新射线拒绝空柜及右柜正常的断言。原误判实验作为本页历史证据保留。
- 将线缆测试名收窄为逐通道采样高度与柜内落点，不宣称已检测全路径间距或所有相交。

这两处属于CC报告后的测试清理，不称作再次获CC批准；没有改运行代码、生成脚本或GLB，
因此不重生成模型。Codex本地重跑318/25、lint与Pages构建；生产产物逐字节不变。
Vault五篇同步最终报告与剩余人工验收项，历史正文、原始审计文件、其他脏文件不变。
**本次收口时仍未commit/push/PR/部署；需用户另行授权。**
