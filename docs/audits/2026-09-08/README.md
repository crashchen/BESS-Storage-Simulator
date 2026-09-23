# BESS Storage Simulator 深度审核与优化计划

审核日期：2026-09-08（Europe/Berlin）\
代码基线：main `033cedd7896696e4f6e8c09efcd8a9f0df7184b4`（2026-07-18，PR #3）\
范围：数值结算、状态与交互、3D/响应式、性能及加载、测试/发布流程、仓库说明、vault 五篇项目笔记。\
审核阶段只新增报告及复现附件；下文发现、行号与 135 个测试的结果均指上述提交基线。修订版纳入用户提供的 CC 独立复核，并新增正常工况对照；本代理未调用或调度 CC。

**实施状态（2026-09-23）**：第一批 PR #4、第二/三批 PR #5、第四批 PR #6 均已发布。第五批的PCS等设备统一尺度、手机全景和键盘入口经[PR #7](https://github.com/crashchen/BESS-Storage-Simulator/pull/7)合并为`29c81d7`，[main CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35779667669)与[Pages](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35779668154)通过，详见[第五批记录](../2026-09-20/batch-5.md)。第六批的手动视角跨resize保持及Full site复位经[PR #8](https://github.com/crashchen/BESS-Storage-Simulator/pull/8)合并为`b5cdf58`，[main CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35780131524)与[Pages](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35780131948)通过；221/21、lint/Pages build及用户安排的CC主体复审详见[第六批记录](../2026-09-22/batch-6.md)。线上浏览器点检确认PCS比例、手动视角窄屏保持及Full site复位，无控制台error；不是实体手机或GPU故障注入。第七批标签、能流图例与加载占位经[PR #10](https://github.com/crashchen/BESS-Storage-Simulator/pull/10)合并为`2989452`，[main CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35789638276)与[Pages](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35789638697)通过；223/21、lint/Pages build、用户安排的CC两轮复审及线上640×360点检见[第七批记录](../2026-09-22/batch-7.md)。第八批累计价值拆分经用户安排的CC复审，收尾后230/21、lint/Pages build通过，[PR #12](https://github.com/crashchen/BESS-Storage-Simulator/pull/12)合并为`20dadaf`，[同提交main CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35915896134)与[Pages](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35915896531)成功，线上明细点检通过，见[第八批记录](../2026-09-23/batch-8.md)；多日 AUTO 峰段无剩余电量是基线既有策略问题，单独决策。原始审计行号与各阶段验收证据保留。

**总体判断**

项目已有清晰的 reducer → tick → settlement 分层和回归测试基础，作为交互演示具备可用性。结合用户提供的 CC 复核与新增正常工况对照，将 SoC 步长问题由 P1 调整为 P2。下一轮优先修太阳板朝向、状态恢复、输入回显与遮挡等直接影响演示的问题，再澄清口径、修数值边界、完善工程韧性。模型定位为视觉演示，收益应按已声明的简化假设理解。

修订理由：初审用合法但极端的单 tick 压力案例证明了机制，严重程度评估却缺少整日正常工况对照。“盈亏翻转”确实发生在该压力案例，不能据此概括正常演示结果整体不可信。原复现保留，新增对照与修订执行顺序见下。

**验证结果与边界**

- `npm run lint`：通过。
- `npm run test`：13 个文件、135 个用例全部通过。
- `npm run build`：通过；three-vendor 724.90 kB（gzip 186.40 kB），触发 500 kB 提示。三个 GLB 总计约 5 MiB。拆成 vendor chunk 不代表按需加载。
- 实际浏览器：本地 Vite 页面，1280×720 桌面和 390×844 手机视口；验证启动/暂停、双抽屉、断点变化、电价边界、固定设备信息卡、手机初始构图。
- 浏览器记录出现重复 PCFSoftShadowMap 弃用警告和图表初始宽高 -1 警告；本轮正常流程未观察到致命浏览器异常。未用 GPU profiler 做定量性能评级。
- 独立最小复现：相同输入、不同时间步长比较；overload 与无电池基线比较；默认太阳曲线积分；暂停改价状态。
- 实时 npm audit：全部依赖 13 个受影响包条目（9 high、2 moderate、2 low、0 critical）；`--omit=dev` 为 1 moderate（fflate）、0 high。详见 security-summary.json。这里是依赖公告命中数，不是已确认可被本应用利用的漏洞数。
- [PR #3](https://github.com/crashchen/BESS-Storage-Simulator/pull/3) 已于 2026-07-18 19:34:51 UTC 合并；[同提交 CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/29658067351) 与 [Pages 部署](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/29658067341) 成功。部署成功是 Actions 证据；本轮界面复现针对本地当前源码。
- 未做浏览器 GLB 失败、图表分包失败和真实 WebGL context loss 故障注入；这些项以明确代码路径为证据，下面单独标注。
- 当前没有 e2e/视觉基线；135 个 jsdom/单元测试不覆盖真实布局、WebGL 或浏览器加载失败。

**功能与数值发现（编号沿用初审，执行顺序见计划）**

1. **P2 — SoC 边界的来源分配和结算存在步长依赖【压力及正常工况脚本复现；由P1下调】。**\
   [src/utils/tickEngine.ts:123](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/utils/tickEngine.ts:123>) 将整个 tick 的功率压成“刚好填满剩余容量的平均功率”，随后 [src/utils/tickEngine.ts:248](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/utils/tickEngine.ts:248>) 才划分 PV/Grid 来源并结算。先平均再划分与“按实际功率充到满电、剩余时间停充”不等价。现有拆步只考虑电价/峰段边界。

   输入：12:00、manual-charge、1440×、PV evacuation 5 MW、BESS 188 MW / 10 MWh、SoC 80%、dispatch 50%。可编辑参数都在 UI 允许范围内；80% SoC 为可达运行状态，并非 UI 可直接输入。总时间相同：0.1 真实秒 = 2.4 模拟分钟。

   | 分步数 | 最终 SoC | Project P&L | BESS Margin | Grid charge cost |
   |---|---:|---:|---:|---:|
   | 1（0.1秒，hook允许的最大帧间隔） | 100% | +€30.00 | €0.00 | €0.00 |
   | 6（每步1/60秒） | 100% | −€132.37 | −€162.37 | €152.37 |
   | 600 | 100% | −€156.37 | −€186.37 | €177.97 |
   | 6000 | 100% | −€156.37 | −€186.37 | €177.97 |

   **影响范围补充（采纳CC意见后独立复核）**：上述案例叠加188 MW/10 MWh、小PV送出、最大倍速及最大帧间隔，并只取撞满电的一个tick。它用于发现缺陷，不代表正常整日误差。新增脚本固定相同初态、相同结束时间，比较5种步长；细步长参考为0.0001真实秒，属于数值参考而非真实工程精度验证。

   | 工况（均1440×） | 0.1秒最大步长 P&L | 细步长参考 P&L | 绝对相对差 |
   |---|---:|---:|---:|
   | 默认188 MW/744 MWh，AUTO，00:00起24h | €68,678.33 | €68,679.01 | 0.000990% |
   | 10 MWh，AUTO，00:00起24h | €20,563.80 | €20,563.41 | 0.001902% |
   | 默认188 MW/744 MWh，AUTO，应用默认08:00起24h | €118,325.27 | €118,261.93 | 0.053556% |
   | 744 MWh，12:00起80% SoC手动充电，dispatch50%，PV送出102 MW，固定1h | −€12,720.06 | −€12,720.11 | 0.000444% |
   | 同上，PV送出5 MW，固定1h | −€12,942.20 | −€13,018.24 | 0.584089% |

   前两行复现CC给出的整日数值，其起始时刻对应00:00；应用默认初始时刻为08:00，因此另列第三行。手动工况未取得CC原始脚本，以上采用完整列明的固定1小时区间，不宣称与其“80%→100%”停止条件完全相同。低PV送出手动案例在1/60秒步长下偏差约€0.22（0.00168%）。全部初始状态、结束时间和中间步长保存在representative-results.json。

   “平均功率”本身不是缺陷；问题是dt改变会改变来源分配和结算。当前代码没有电压状态或独立于dt的充电降功率曲线，不能把这一数值限幅认作已实现恒压充电模型。基于上述影响范围及视觉demo定位，定为P2，排在第一批演示体验修复之后。

   改进：在 SoC 上下限及夜间目标/峰段reserve等策略事件处拆步，完成一段结算后重新求功率和来源去向。补相同模拟时间的步长收敛测试，并分别检查能量、购电成本、机会成本、出口收入；只检查最终 SoC 正确不够。

2. **P1 — “Retry 3D View”会重置整个模拟【代码确认】。**\
   [src/components/SimulationViewport.tsx:101](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/components/SimulationViewport.tsx:101>) 无条件发出 RESET_SIMULATION；App 确实传入 dispatch。用户因视图故障点击重试，会丢掉自定义参数、SoC、累计收益与历史。context-loss 文案又称模拟一直在继续。

   改进：默认只重建画布并保留状态；如确需处理损坏状态，另设含明确含义的“重置模拟”。验收必须模拟 context loss，比较重试前后完整业务状态及历史。

3. **P2 — 电价输入框能显示未生效的2000，实际仍按1000计价【浏览器复现】。**\
   [src/components/panels/EconomicsPanel.tsx:72](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/components/panels/EconomicsPanel.tsx:72>) 仅在 props value 变化时同步 draft。先提交1000、再输入2000并 Enter/失焦，[src/utils/gridReducer.ts:408](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/utils/gridReducer.ts:408>) 将值限制到1000，props不变，输入框仍显示2000且无错误。已在暂停的 mid-peak 实测，HUD与实际费率均保持1000。

   改进：复用 NumericField 的范围验证/反馈，确保提交后的显示值与实际状态一致；覆盖上下界、重复越界、空值及失焦。

4. **P2 — overload 下“避免进口成本”的解释不成立【脚本复现，需明确产品口径】。**\
   [src/utils/simulationModel.ts:152](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/utils/simulationModel.ts:152>) 截断实际进口并把剩余需求记为 overload；但 [src/utils/simulationModel.ts:177](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/utils/simulationModel.ts:177>) 把所有 BESS→Load 都按当前费率计为避免进口价值。

   例：PV=0、需求350 MW、PCC=288 MW、BESS放电30 MW、350 €/MWh、1小时。进口前后均288 MW，overload从62降到32 MW，仍记入€10,500放电价值。恢复供电可以有价值，但这部分没有减少实际进口。内置19:00/150%需求/AUTO案例也有差异：24模拟秒报告€220.82，而进口减少对应€107.90。

   改进：分开出口收入、避免进口成本和恢复未供负荷的价值；后者如保留需独立定义估值。或重新定义 overload 为真实超限进口，并使功率与经济账一致。不能继续声称全部BESS供负荷都逐MW抵扣进口。

5. **P2 — 1380年yield没有参与模型，UI却声称已按它建模【代码及积分复现】。**\
   [src/components/panels/MetricsPanel.tsx:78](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/components/panels/MetricsPanel.tsx:78>) 写“annual yield modelled … using Romania site data”，[src/utils/simulationModel.ts:63](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/utils/simulationModel.ts:63>) 实际只有每日固定余弦曲线、AC/DC裁切。默认曲线单日997.36 MWh；若按当前每天重复的曲线累计365日，等效3111.41 kWh/kWp/year，而1380假设对应161,460 MWh/year，重复曲线对应364,035.18 MWh/year。

   此处是模型声明与实现不符，不是对真实罗马尼亚发电量的预测或验证。演示范围内可直接改为“参考年yield，未用于当前演示日曲线”；如要做年度比较，再引入可校准年时序并校验能量预算。

6. **P2/P3 — 运行说明和设备状态与实际功率脱节【浏览器及脚本复现】。**\
   [src/components/panels/BessControl.tsx:17](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/components/panels/BessControl.tsx:17>) 只根据时段/余量生成AUTO说明，不检查满电、reserve或暂停状态。[src/utils/gridReducer.ts:75](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/utils/gridReducer.ts:75>) 暂停改价后有意静态重结算并把功率置零，但未同步 batteryMode；设备卡仍可显示CHARGING和0 MW。

   暂停编辑后的零功率本身是已有测试固定的设计，不作为回归。应把策略意图、实际动作、限制原因统一输出，显示“暂停”“已充满”“到达储备下限”等真实原因。

**视觉与交互**

| 优先级 | 发现、证据与影响 | 改进及验收 |
|---|---|---|
| P2 | [src/components/MicrogridScene.tsx:293](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/components/MicrogridScene.tsx:293>) 活性plane缺局部旋转，与XZ板框垂直；首屏实测呈黄色竖旗片 | 校正局部朝向及支撑；固定初始视角+俯视检查板面贴合 |
| P2 | [src/components/ControlPanel.tsx:24](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/components/ControlPanel.tsx:24>) 仅点击时判窄屏；桌面双开后缩到390×844，左右抽屉仍开并重叠 | 订阅断点变化，窄屏保留最近操作侧；加入resize回归 |
| P2 | [src/components/SimulationViewport.tsx:156](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/components/SimulationViewport.tsx:156>) 相机固定；390×844手机首屏左侧PV、右侧主变被裁掉 | 按场景包围盒与可用宽高fit相机，提供“恢复全景”；检查320/390/768/1280宽度 |
| P2 | [src/components/SceneAssetInfoCard.tsx:33](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/components/SceneAssetInfoCard.tsx:33>) 信息卡z-30，抽屉z-10且共占右侧；桌面实测卡覆盖Metrics内容 | 为设备详情和Metrics制定统一布局：侧边栏内tab或自动避让，保证关闭与关键指标可见 |
| P2/P3 | [src/components/panels/EconomicsPanel.tsx:298](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/components/panels/EconomicsPanel.tsx:298>) 色带按6/12/5/1小时，下面刻度等距；18在50%而应75%，23在75%而应95.83% | 色带和刻度共用hour/24坐标 |
| P2/P3 | [src/components/MicrogridScene.tsx:100](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/components/MicrogridScene.tsx:100>) 设备详情只有pointer/click入口，键盘无法选设备 | 提供DOM设备选择列表，复用卡片；验收Tab→选择→Esc完整路径 |

视觉打磨建议：降低黄色太阳表面的大片自发光，保留能流颜色强调；提高场景标签可读性；统一精细GLB与LOCAL LOAD蓝色方块的表现；把白色原生滚动条改为适配深色面板的样式；补能流图例和功率方向说明。上述审美建议与表中的可复现缺陷分开处理。单个代表设备显示站级容量已明确写在信息卡中，不把“744 MWh只画一个柜”当作bug。

**加载、性能、发布与依赖**

- **P2，代码确认：DPR降级未接通。** [src/components/SimulationViewport.tsx:166](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/components/SimulationViewport.tsx:166>) 的PerformanceMonitor没有onChange/onDecline/onFallback；AdaptiveDpr读取R3F performance.current，项目未触发regress，OrbitControls也未配置regress。已核对本地安装的Drei实现，二者没有自动联动。可显式连接DPR/质量档位，或删除当前未接通的监控配置。删除只能称为清理无效配置，不能声称已实现性能降级；如接通，应在受限GPU上记录帧率和实际DPR。
- **P2，实现层确认、未做浏览器故障注入：GLB失败缓存不会随画布重挂载清除。** [src/components/MicrogridScene.tsx:125](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/components/MicrogridScene.tsx:125>) 的useGLTF/useLoader失败会缓存在suspend-react；仅remount不清理失败URL。为失败资产清缓存后重试，并做单模型错误隔离。PCS/主变目前fallback=null；补占位与加载提示。本地字体可减少首屏对外部字体CDN的依赖，离线表现仍需专项验证。
- **P2，代码确认、未故障注入：图表分包失败可使应用根卸载。** [src/components/ControlPanel.tsx:19](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/components/ControlPanel.tsx:19>) 懒加载图表，[src/components/ControlPanel.tsx:241](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/src/components/ControlPanel.tsx:241>) 只有Suspense，没有ErrorBoundary；App根也没有兜底。给图表增加局部失败状态和重试，保留运行控制与业务状态。仅在App外加根ErrorBoundary仍会在fallback时卸载持有useGridSimulation的App，不能替代局部隔离；同一React.lazy也会缓存拒绝结果，重试不能只改boundary的key。
- **P2，流程确认：部署不受lint/test门控。** [.github/workflows/deploy.yml:30](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/.github/workflows/deploy.yml:30>) 和CI独立监听main；deploy只依赖自己的build，CI红仍可能发布。改成quality→同提交build→deploy，并对实际BASE_URL产物做浏览器smoke。needs只能引用同一workflow的job，不能直接引用另一ci.yml中的任务；应合并流程或在部署workflow内新增/调用quality，再建立依赖，并限制仅合适的main事件部署。当前已核实的那次CI是绿的，不把流程隐患误写为一次失败发布。
- **依赖修复优先级：开发服务暴露网络时P1，其余按可达性排期。** [package-lock.json:6096](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/package-lock.json:6096>) 锁定Vite7.3.1，命中维护者公布的dev-server文件读取/deny绕过公告；[Vite官方WebSocket公告](https://github.com/vitejs/vite/security/advisories/GHSA-p9ff-h696-f583) 指明需dev server对网络开放等前提，[官方deny绕过公告](https://github.com/vitejs/vite/security/advisories/GHSA-v2wj-q39q-566r) 也应一并核对。静态Pages不运行Vite dev server。生产依赖告警是fflate的畸形ZIP解析问题，当前产品没有用户ZIP导入路径，本轮未证明可利用。先做兼容范围内的定向更新和回归，复跑audit，避免直接force升级。
- **P3：运行时不够可复现。** package.json无engines、无Node版本文件；README只写npm install。锁定Vite要求Node ^20.19.0或>=22.12.0。统一支持版本、CI与文档；复现安装使用npm ci。
- 不因Three chunk超500kB直接认定卡顿；先测首屏可操作时间、GLB加载和DPR，再考虑lazy viewport、资产优化。当前没有证据支持立即引入Zustand或整体换状态架构。

**README与vault housekeeping核对**

结论：仓库快照大体最新，vault存在明确收尾遗漏，不能继续标“无已知drift”。

| 位置 | 当前情况 | 下一步 |
|---|---|---|
| 仓库README / CLAUDE / public/models README | 基线、7路能流、隐藏preset、AUTO规则树、三GLB与固定代表机柜口径总体匹配PR #3 | 保留；随本轮模型口径修复同步 |
| [vault 操作指南.md:130](</Users/fangchen/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fang_Vault/Gotion/平台开发/BESS Storage Simulator/操作指南.md:130>) | 仍写容量变化使pad/container宽度缩放；代码已固定scale/承台 | 改为固定代表设备，容量变化由站级指标与≈N×5MWh表达 |
| [vault 迭代记录.md:17](</Users/fangchen/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fang_Vault/Gotion/平台开发/BESS Storage Simulator/迭代记录.md:17>) | Headline仍写PR #3待合并、合并后部署 | 改为已合并main033cedd，CI/Pages成功，附run链接；历史开发SHA可保留 |
| [vault README.md:45](</Users/fangchen/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fang_Vault/Gotion/平台开发/BESS Storage Simulator/README.md:45>) | 声称代码/仓库/vault三方一致、无drift | 记录本次已发现drift与真实verified_commit，修完后再标同步 |
| [vault 操作指南.md:106](</Users/fangchen/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fang_Vault/Gotion/平台开发/BESS Storage Simulator/操作指南.md:106>) | 声称峰段末尾自动爬向transfer limit，不是该公式一般性质 | 改成按剩余能量/时长配速；说明限幅和horizon floor |
| [vault 路线图.md:29](</Users/fangchen/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fang_Vault/Gotion/平台开发/BESS Storage Simulator/路线图.md:29>) | 原有累计放电价值拆分、GLB占位、lazy3D仍未完成；优先级没有本次新发现 | 将SoC边界、恢复状态、电价错配、口径澄清排到扩功能之前 |
| [README.md:116](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/README.md:116>) | “Every UI command … flips dispatchMode”范围过宽 | 改为所有写入走BESSCommand，只有调度命令改变模式 |
| [CLAUDE.md:77](</Users/fangchen/Documents/Playground/Antigravity_Project/BESS-Storage-Simulator/CLAUDE.md:77>) | troika仍括在drei块中；实际已单独chunk | 小修快照文字 |
| 五篇vault frontmatter | date均为2026-07-01；可以是创建日期，不能据此断言整篇过时 | 保留date，新增updated/verified_commit/verified_checks |

vault中的2026-07-17“9条audit全在dev”是历史记录，可以保留；当前状态应另加本轮13条、生产1条的时间戳结果。135测试/13文件的记录仍准确。已有P1 cleanup完成史也应保留，不因新发现而抹掉历史完成状态。

**下一步优化计划**

结合用户提供的CC复核调整为以下批次。时间仅为包含实现与验证的粗估，不把“一行修改”或已有tariff拆步当作全批次耗时保证。严重程度和执行次序分开：修复成本低、演示影响大的P2也可以先做。

| 顺序 | 交付范围 | 粗估 | 验收条件 |
|---|---|---|---|
| 1：演示体验与状态保持（已发布） | 太阳面向；Retry保留状态；抽屉resize与信息卡遮挡；电价时间刻度、输入回显；已确认vault事实纠正 | 原估0.5–1天 | 验收结果见 [第一批交付记录](batch-1.md)；PR #4 / `053c82c` 已合并，CI/Pages 成功 |
| 2：模型口径与解释（已发布） | yield从modelled改为未入模的reference；overload价值加明确限定或拆项；说明反映实际动作/限制原因 | 0.5–1.5天，拆累计字段需额外回归 | 见 [第二批记录](../2026-09-19/batch-2.md)：175/16、lint/build 通过；采用常显估值限定，未拆累计字段；0MW/满电/reserve/暂停解释回归通过 |
| 3：数值收敛（P2，已发布） | SoC及策略事件拆步；压力案例和正常工况回归 | 0.5–1天 | 见 [第三批记录](../2026-09-19/batch-3.md)：192/17、lint/build 通过；固定时段、多步长、逐来源能量和四项成本核对；保留午夜/08:00对照及中点近似误差 |
| 4：加载与发布（已发布） | 图表局部错误边界及可用重试、根兜底；GLB失败清缓存；DPR接通或删除；兼容依赖升级、Node固定、同workflow质量门禁 | 1–2天，可并行 | 资产/图表暂时失败可恢复且不丢模拟；质量检查红时不发布；Pages子路径smoke通过；依赖告警按可达性记录 |
| 5：场景访问（PR #7，已合并发布） | 手机/平板全景与恢复按钮；键盘设备选择、卡片焦点返回；卡片避让与深色滚动条；PCS等设备统一尺度及布局联动 | 本轮完成 | 214/21、lint/build通过；Close避让与交互/真实GLB及最大PV边界守卫补齐，见第五批记录 |
| 6：resize视角保持（PR #8，已合并发布） | 手动视角跨尺寸变化保留；Full site恢复自动构图；无移动点击不关闭自动构图 | 本轮完成 | 221/21、lint/build；真实鼠标拖动/滚轮与响应式预览、CC复审及阻尼回漂补测见第六批记录；main CI/Pages通过 |
| 7：场景辨识与加载反馈（PR #10，已发布） | 固定屏幕字号的设备标签、能流图例、三GLB轮廓占位及图表加载骨架；修复CC发现的标签点击、HUD层级、竖屏/矮横屏重叠及Grid过载颜色 | 本轮完成 | 223/21、lint/build；PCS标签点击、过载红色、竖横屏宽度及慢速资产加载见第七批记录；main CI/Pages通过 |
| 8：累计价值拆分（PR #12，已发布） | BESS出口、实际避免进口和恢复未供负荷的假设价值逐子步累计；旧总额不改；两张主卡明确为演示价值 | 收尾完成 | 230/21、lint/Pages build；独立拆分不变式和72h过载回归；CC另核8场景及浏览器金额；`20dadaf`同提交main CI/Pages成功，线上明细点检通过，详见[第八批记录](../2026-09-23/batch-8.md) |
| 持续：housekeeping及剩余体验 | 各批次同步仓库/vault；第八批PR #12已发布；横屏图例、Grid标签点击及NumericField Reset列为独立待办；多日AUTO策略单独决策 | 随批次同步 | 文档记录核对日期、commit、检查与部署run；历史drift清单不等于当前全部未修；未完成项保留清单 |

第七批后续待办独立于本次合并：640/667px矮横屏图例遮挡SOLAR ARRAY（P3）、Grid标签横移后点标签不能选中设备（P3）、`NumericField`容量草稿在Reset后可回填并于失焦重新提交旧值（P2）。复现、影响与验收入口见[第七批记录](../2026-09-22/batch-7.md)；最后一项是既有功能缺陷，应在独立改动中配“改值→Reset→失焦”测试。

修复后再考虑：配置保存/导出、对比两个运行场景、累计出口/进口价值图表、可解释的演示preset。年度真实电价/发电量、交易优化或FCR是新的产品范围，不把它们缺失算作本次缺陷。

**复现附件**

- reproduce.mjs：从项目目录运行 `node docs/audits/2026-09-08/reproduce.mjs`。使用当前项目esbuild只读转译核心模块至OS临时目录，含已知缺陷断言；修复后断言失败是预期，需要将其转为正式回归测试。
- simulation-results.json：本轮基线输出，已由主审核者独立重跑核对。
- security-summary.json：2026-09-08 npm audit全量/生产分类摘要及公告链接。版本随时间变化，应复跑而非长期把此快照当作当前状态。


- representative-scenarios.mjs / representative-results.json：修订版的8组固定区间、5种步长对照。从项目目录运行 `node docs/audits/2026-09-08/representative-scenarios.mjs`；显式记录初始状态，保留午夜/默认08:00、恰好充满/跨过充满两类区间。
