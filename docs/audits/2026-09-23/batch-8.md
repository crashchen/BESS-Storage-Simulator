# 第八批：累计放电价值拆分

日期：2026-09-23（Europe/Berlin）。分支`codex/audit-batch-8-value-breakdown`基于已发布main`a77bdda9b0c69d1d74e16538d75658f3d9507db8`。用户安排的CC复审首版并认可拆分算法；本代理没有调用CC。[PR #12](https://github.com/crashchen/BESS-Storage-Simulator/pull/12)收尾后合并为`20dadafcefbbdb5f264de98c67012625093801b9`，已发布。

## 结算契约

此前`bessDischargeRevenueDeltaEur`把所有BESS放电乘以结算时电价，既包含出口收入和实际减少进口，也包含因PCC进口上限而原本未供负荷的假设估值。现在每个结算子步计算并累计三项：

1. **BESS出口收入** = `batteryDischargeToExportMw × dtHours × tariff`。
2. **避免进口成本** = `max(0, 无BESS时受PCC限制的进口 − 实际进口) × dtHours × tariff`。无BESS基线使用同一子步的PV、需求和PCC限值，不另跑不同的调度策略。
3. **恢复未供负荷的假设价值** = `(BESS向负荷放电 − 实际避免进口) × dtHours × tariff`。这部分不是进口节省或出口收入。三项均按结算电价计值，负电价下都可为负。

历史合计字段仍按原顺序计算，即`(BESS向负荷 + BESS出口) × dtHours × tariff`。三项与它在浮点精度内核对，既有Project/BESS总额公式及AUTO调度保持不变。`cumulativeBessDischargeRevenueEur`是历史命名，包含假设估值；新字段分别为`cumulativeBessExportRevenueEur`、`cumulativeBessAvoidedImportCostEur`和`cumulativeBessRestoredLoadAssumedValueEur`。Stop/Reset/场景预设重新建立初态时均清零；纯编辑与暂停不回溯改写已结算子步。

界面把两个主卡改称“Project demo value”和“BESS demo margin”，常显累计假设价值，展开明细列出三项及旧合计。出口行是按电价估算的收入，避免进口行是按电价估算的成本节省，恢复未供负荷行只是演示估值。这些总额不包含完整项目成本、合同结算或负荷侧现金流，不是已实现现金流/财务预测。HUD金额加了同一口径的说明。

## 验收案例

| 一小时、PV为0、PCC 288 MW | 需求 | BESS放电 | 实际进口变化 | 避免进口 | 恢复未供负荷 | BESS出口 | 总放电价值 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 满额过载，350 €/MWh | 350 MW | 30 MW | 288→288 MW | €0 | €10,500 | €0 | €10,500 |
| 越过PCC上限，350 €/MWh | 300 MW | 30 MW | 288→270 MW | €6,300 | €4,200 | €0 | €10,500 |
| 满额过载，−25 €/MWh | 350 MW | 30 MW | 288→288 MW | €0 | −€750 | €0 | −€750 |
| 常规负荷加出口，100 €/MWh | 10 MW | 30 MW | 10→0 MW | €1,000 | €0 | €2,000 | €3,000 |

Node 24.21.0下`npm run lint`、**230测试/21文件**、`BASE_URL=/BESS-Storage-Simulator/ npm run build`通过。测试覆盖六个结算案例（含有PV的PCC紧张情况）、跨子步累计、旧总额对账、Stop/Reset清零，以及经济面板常显假设额和三项明细。收尾新增独立不变式：每个已结算子步的恢复未供负荷等于同PV/需求/PCC下无BESS的过载减实际过载；避免进口另从受限进口差重算，不读取模型新增的三项字段。72小时、150%负荷、手动20 MW放电回归覆盖多个日期的过载和纯恢复负荷子步，并核对新增累计值。真实本地浏览器在390×844 CSS视口打开明细，抽屉和明细格没有横向溢出；控制台error为空。Three vendor chunk仍为724.92 kB，构建体积提示未变。未测实体手机触摸或与财务系统对账。

发布验收：[同提交main CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35915896134)与[Pages](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35915896531)均在`20dadaf`上成功。线上只读点检打开Metrics明细，确认三项拆分、修正后的负电价说明和HUD演示价值提示均已显示；浏览器error为空。此点检只验证发布页面及文案，不等同于线上多日金额对账或故障注入。

CC首版复审在Node 26.8.2上另用未入仓的脚本按过载和进口差独立重算8个多日/负价/窄PCC等场景，与新增累计值在1e-9相对误差内一致；Pages构建的浏览器流程在20:05暂停时显示三项€0 + €108,811 + €28,124 = €136,935，HUD项目演示值€97,805，对账成立。CC也发现原文案只强调最后一项可能为负，已改为三项均可随负电价为负，并把界面的“avoided import cost”改为“avoided import value”。其浏览器运行曾临时替换帧调度，并未做线上第八批验收。第七批CSS规则的复审状态同步修正于[第七批记录](../2026-09-22/batch-7.md)。

## 后续边界

多日AUTO留电策略仍是另一项产品决策；本批没有调整SoC目标、峰段配速或时间曲线。CC观察到150%负荷下AUTO多日晚峰可在18:00前放空，这是后续策略设计的依据，不属于本批拆分算法。矮横屏图例遮挡、Grid标签点击落空和`NumericField` Reset草稿问题仍按第七批记录保留。三项之和不能称为真实项目现金流。
