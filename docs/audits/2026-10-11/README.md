# 2026-10-11 修复、CC复审与PR #25发布记录

## 状态与范围

- 基线：`891198b30731637848148b9b26f279cfc37e34fc`；实现提交`af0830f`及状态文档`06abd38`经[PR #25](https://github.com/crashchen/BESS-Storage-Simulator/pull/25)于2026-10-13 squash合并为`4ea9a58`，合并树与已复审head完全一致。
- 用户授权：修图表时间轴、定向依赖升级、HUD重叠，整理repo与Vault文档；经用户安排CC两轮复审后，先本地提交、push/开PR，随后明确授权squash merge并同步合并后的housekeeping。
- PR #25已合并并发布；同合并SHA的main CI和Pages均通过，详见下方发布节点。Codex没有自动调用CC或其他外部审查模型。
- 用户已转交CC最终通过报告：初批及三项P3补充均无阻塞，302/25、按锁文件安装、lint/type-check/Pages build及两范围audit均由CC独立复现。新增浏览器检查的范围与归属见下。
- PR head `06abd38`的CI38133996334与合并SHA的CI/Pages分别核验；不混用旧head或旧发布基线的成功记录。
- 不改dispatch策略、reducer、tick、PCC/金额结算、GridState字段、GLB资产、相机或Switchyard。

## 改动及审查重点

### 1. 图表时间轴

原问题：snapshot用每日时钟且保留3位小数；XAxis默认分类轴。1×切1440×后，不同模拟时长被等距绘制，午夜还会回绕。

修复：`useGridSimulation`的独立chartTimeRef累计同一tick使用的dt×speed，保留完整精度；`GridSnapshot.t`明确为不回绕的模拟小时。XAxis为numeric，domain为数据起止；共享formatSimulationTime显示D1/D2及HH:MM。按CC补充反馈，保留秒数的窗口从不足一分钟扩至不足十分钟，tooltip始终带秒。

Pause不累计图表时间；Stop/Reset/preset的resetHistory副作用同时重新锚定起点。滑动200点窗口不丢失日号。该ref不是新物理state，不改变引擎。

重点看：`useGridSimulation.ts`、`TelemetryChart.tsx`、`formatTime.ts`及对应测试。测试覆盖1×→1440×、跨午夜/多日/滚动淘汰、暂停恢复、三种清历史命令与午夜取整。

### 2. 开发依赖

锁文件仅更新source-map-js 1.2.1→1.2.2（版本、下载地址、integrity三项）。原依赖范围允许此补丁，没有新增依赖、override或强制大版本升级。

[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)涉及恶意source map offsets阻塞事件循环。原项目命中来自开发工具链，不是已证明的线上可利用路径。定向更新及按锁文件安装后，全量/omit=dev均为零公告；这不是无漏洞保证。

### 3. HUD与卡片

原问题：640×360暂停长标签使HUD换行至约78px底部，卡片仍从62px开始，重叠约16px。

修复：`useHudClearance`用ResizeObserver测HUD真实bottom，相对app shell写CSS变量；resize补获margin变化。只在布局事件测量，不加入RAF频率React状态。按CC反馈，top避让扩至全部横屏；普通横屏max-height减去新增top偏移、保持原停靠下边界，短横屏仍保留底部94px空间。竖屏与相机规则不改。

测试保护真实App/HUD接线、换行/缩回、StrictMode清理、无ResizeObserver时的resize兜底及CSS消费契约。jsdom不证明实际几何；浏览器回归另外量HUD/card边界和滚动。

### 4. 文档与metadata

- README聚焦启动、操作、边界；CLAUDE聚焦当前架构/不变量；CONTRIBUTING补Node、锁文件、子路径构建和浏览器门禁。
- 新增docs/README证据索引；旧审计文件/截图未删，原长README/CLAUDE仍可从基线Git树追溯。
- package描述/关键词统一为illustrative value / energy arbitrage，不再暗示完整project finance。
- Vault仅整理项目五篇笔记，保留已有frontmatter字段与aliases/tags，以及本轮开始前已有的PR23/24 housekeeping和历史记录。当前验证汇总集中在迭代记录；其他四篇各司其职。
- 推送阶段Vault保留旧部署hash、记录PR head；2026-10-13合并后只在同提交CI/Pages成功后前移，记录见下。没有修改无关笔记或memory。

## 初批验证（CC已复现）

2026-10-11，本地Node 24.21.0：

| 检查 | 结果 |
| --- | --- |
| 安装 | 定向lockfile更新后，按锁文件npm ci --ignore-scripts通过 |
| 单元/组件 | 297/297，25文件；较基线新增15用例、2文件 |
| Lint / type-check / build | 通过；Pages子路径构建也通过 |
| 依赖安全 | [全量](audit-full.json)和[生产范围](audit-production.json)均0公告 |
| 图表浏览器 | 1×→1440×的真实SVG刻度按模拟时间比例排列；真实RAF跨午夜后显示D2，不回绕 |
| HUD浏览器 | 640×360、667×375、932×430、568×320、1280×720、390×844共6档均无HUD/卡片重叠；4档矮横屏展开Details后End可滚动 |
| 代表几何 | 640×360：HUD bottom=78、card top=86、bottom=266，8px间隔且留出底部94px |
| 浏览器错误 | 未捕获pageerror；SwiftShader Chromium，不是原生GPU或实体手机验收 |
| 文档 | 五篇Vault元数据原字段/alias/tag保留；原迭代正文保留；repo本地链接及Vault wikilink/标题目标检查通过 |

浏览器结果：[results.json](results.json)。截图：[倍速轴](speed-axis.png)、[跨午夜](midnight-axis.png)、[短横屏摘要](paused-summary-640x360.png)、[Details滚动到底](paused-hud-640x360.png)。大负金额为人工DOM换行压力样本，不是仿真收益结果。

主阅读文档README+CLAUDE合计约74KB→21KB；Vault五篇约126KB→71KB，主要压缩四篇当前说明中的重复历史。初批检查保护了原迭代正文，但漏掉其他笔记frontmatter中的历史流水线编号；CC指出后本轮补回，不能把初批描述为历史编号已完整保留。

## CC补充反馈与收口

1. HUD：高度超过430px的横屏同样可能换行。清除组件中固定top/height的重复配置，统一由CSS消费测量值；补全普通横屏高度扣减契约。
2. 时间轴：1–3×下200点窗口会跨过一分钟。增加30/75/240/599秒和600秒边界测试，前四者显示秒、600秒开始显示分钟；数值坐标与累计时间不变。
3. Vault：在PR #21/#22历史段补回CI/Pages四个编号36176889549 / 36176889988 / 36177570989 / 36177571484。来源为Vault原Git版本，前两项亦有repo历史审计支持；没有声称本轮重跑这些历史流水线。跨五篇原工作树及旧Git元数据的10个历史run ID均已确认留存，不再只检查迭代正文。
4. 状态措辞：repo README、CLAUDE、docs索引及Vault五篇随实际节点更新。2026-10-11节点为CC完整复审通过、PR待合并；2026-10-13获准合并后，再按同提交CI/Pages结果更新为已发布。

本轮单元/组件测试302/302（25文件），比CC复现版本增加5项；lint及Pages子路径构建通过，全量及omit=dev audit重跑均0。物理模型、价格、锁文件和GLB均未因这些补充发生变化。

补充浏览器验证：[完整结果](cc-followup/results.json)，十档尺寸无HUD/卡片重叠、无pageerror，原四档短横屏Details的End滚动通过。新增三档真实充电后暂停的金额为负，不靠构造异常值复现换行；800×600和原六档另外使用人工大负金额。

| 新增场景 | HUD底部 / 卡片顶部 / 卡片底部（px） | 样本 |
| --- | --- | --- |
| 640×480 | 78 / 86 / 217.19 | 真实充电后暂停 |
| 700×500 | 78 / 86 / 226 | 真实充电后暂停 |
| 768×480 | 78 / 86 / 214.63 | 真实充电后暂停 |
| 800×600 | 78 / 86 / 274 | DOM大负金额压力样本 |

截图：[640×480无重叠](cc-followup/paused-hud-640x480.png)、[800×600无重叠](cc-followup/paused-hud-800x600.png)、[低速秒刻度](cc-followup/slow-axis.png)。1×实测标签为D1 08:00:00 / 08:00:16 / 08:00:33 / 08:01:01，均不重复；1×→1440×比例和跨午夜D2另行通过。

执行说明：第一轮脚本等待可见轴跨度≥70秒而超时；截图已显示正常秒刻度，但SwiftShader与引擎dt限幅使200点滑动窗口未达到该等待值。脚本改为验证实际问题边界“可见跨度>60秒”，仍走真实RAF，无注入时间或放宽唯一性断言。最终完整重跑通过。保存的是通过轮的证据；初批六档结果仍原样保留。软件渲染不证明真机触摸/原生GPU行为。

## 最终CC复审与提交收尾

2026-10-11用户转交的CC最终报告确认三项补充全部修好、没有新问题。以下是CC报告的独立证据，不冒充Codex再次执行：

- Node24.21.0独立副本与送审工作树逐文件一致；按锁文件安装、302/25、lint、type-check、Pages子路径构建通过，全量和omit=dev audit均0。
- 重跑本页脚本得到相同十档几何；另外15档尺寸分别用真实充电暂停值与人工大负金额，共30组无HUD或底部工具栏重叠。普通横屏下边缘等于原公式值，短横屏保留底部94px。
- 800×600不resize、只改HUD内容，两轮顶部62→86→62→86均跟随；软件渲染中200ms等待不足，600ms后两个方向均正确。这不是原生GPU性能数据。
- 1×运行75秒和100秒的刻度带秒、不重复；7×/8×跨十分钟窗口边界时分别用秒/分钟且均不重复；倍速比例、跨日D2及无pageerror再次确认。
- PR #21/#22四个历史流水线编号及PR #18/#19的273/23历史数字保留；Vault范围仍只五篇。

用户随后授权提交。提交轮只更新复审/提交状态，不再修改运行代码；Node24 lint、302/25和Pages构建再次通过。项目提交为`af0830f`，Vault五篇的本地提交为`af632a6`，排除其他九个脏文件。该提交节点尚无远端CI；后续推送节点见下。真机触摸和真实GPU验收仍待人工完成。

## PR #25推送节点（2026-10-11历史）

用户另行授权后，已推送实现提交并创建[PR #25](https://github.com/crashchen/BESS-Storage-Simulator/pull/25)，base为main。后续文档提交只回填PR状态，不改运行代码；本地lint、302/25和Pages构建再次通过，14个dist文件与已验证构建逐字节一致。远端CI须与PR最新head一致，不将旧head通过当成新head通过；确切run链接/提交号同步到Vault迭代记录，并可从PR检查查看。未启用自动合并，未合并或触发本批Pages发布，main仍是`891198b`。

## 2026-10-13 合并与发布

用户明确授权squash merge PR #25、核验合并后CI/Pages并同步repo与Vault housekeeping。合并前再次确认PR head为`06abd38c4cc10bfe4cbd981273136232e93d5e77`、检查成功且可合并；以`--match-head-commit`限定该head执行squash，得到`4ea9a58e07f08ce65ab3d020f58d131547687a87`，保留Codex co-author。时间为2026-10-13 14:45 CEST（12:45 UTC）。本地main fast-forward至合并提交，文件树与已复审head逐项相同。

| 验证 | 精确提交 / 结果 |
| --- | --- |
| 合并后main CI | [38399647078](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/38399647078)，headSha=`4ea9a58e07f08ce65ab3d020f58d131547687a87`，SUCCESS；Node24.21.0、302/25、lint及type-check/build通过 |
| 合并后Pages | [38399647051](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/38399647051)，同一headSha，quality/build/deploy均SUCCESS；发布该run质量门禁产物 |
| 线上资产 | HTML、JS、CSS、三台GLB及models说明共14文件全部HTTP200，逐文件SHA256与合并提交的本地Pages子路径构建一致 |

此次收尾只更新README、CLAUDE、docs索引与本页，不改代码、配置、依赖或模型。文档提交会再触发main CI/Pages，必须在最终文档head再次核验后才结束交付；其最终SHA与run编号在Vault迭代记录集中回填，避免公共文档为记录自身hash而循环提交。

已知Actions Node20运行时和ubuntu-latest迁移提醒仍为非阻塞后续项，本轮不顺带改工作流。2026-10-11的audit和浏览器记录保留原日期；本轮线上检查是HTTP/资产一致性smoke，未重跑布局脚本，不代表真机触摸、原生GPU或用户观感验收。

## 浏览器复验方式

浏览器脚本：[browser-check.mjs](browser-check.mjs)。使用已安装的外部Playwright，不引入项目依赖，也不是CI gate：

```bash
# Node 24.21.0
npm ci --ignore-scripts
npm run lint
npm run test
BASE_URL=/BESS-Storage-Simulator/ npm run build
BASE_URL=/BESS-Storage-Simulator/ npm run preview -- --host 127.0.0.1 --port 4313 --strictPort
# 另一终端，外部runtime路径按本机填写：
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
CHROMIUM_EXECUTABLE=/absolute/path/to/chromium \
node docs/audits/2026-10-11/browser-check.mjs \
  http://127.0.0.1:4313/BESS-Storage-Simulator/ /tmp/bess-browser-review
```

脚本先在1×下等到可见数值轴跨度超过一分钟，确认秒标签不重复，再用真实RAF推进到次日；测SVG刻度而非被图表库向内挪动的标签框。640×480、700×500、768×480用真实充电后暂停的金额，800×600及原六档另用DOM大负金额压力样本；后者不能当作模型计算结果。renderer明确记录SwiftShader，不冒充实体手机/原生GPU。

## 复审边界与后续

- 本批提交包含新增hook、测试、审计脚本和截图；复查时使用相对基线的完整commit diff。
- 新日期的零audit取代当前健康判断，不回改2026-09-19的历史audit快照。
- Three大chunk提示、阴影弃用警告仍保留；本轮不做性能状态库迁移或灯光风格调整。
- CC最终复审通过。真实手机、原生GPU故障、任意相机姿态的自动避让仍不在验收范围。
- PR #25已合并且同提交CI/Pages成功。后续更新仍保持repo/Vault分别圈定路径，不对Vault全量stage；文档收尾的最后提交也要独立核验CI/Pages。
