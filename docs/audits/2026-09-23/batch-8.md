# 第八批：累计放电价值拆分

日期：2026-09-23（Europe/Berlin）。分支`codex/audit-batch-8-value-breakdown`基于已发布main`a77bdda9b0c69d1d74e16538d75658f3d9507db8`。本记录描述待复审工作树，不代表线上已发布。用户自行安排CC；本代理没有调用CC。

## 结算契约

此前`bessDischargeRevenueDeltaEur`把所有BESS放电乘以结算时电价，既包含出口收入和实际减少进口，也包含因PCC进口上限而原本未供负荷的假设估值。现在每个结算子步计算并累计三项：

1. **BESS出口收入** = `batteryDischargeToExportMw × dtHours × tariff`。
2. **避免进口成本** = `max(0, 无BESS时受PCC限制的进口 − 实际进口) × dtHours × tariff`。无BESS基线使用同一子步的PV、需求和PCC限值，不另跑不同的调度策略。
3. **恢复未供负荷的假设价值** = `(BESS向负荷放电 − 实际避免进口) × dtHours × tariff`。这部分不是进口节省或出口收入；负电价下也可为负。

历史合计字段仍按原顺序计算，即`(BESS向负荷 + BESS出口) × dtHours × tariff`。三项与它在浮点精度内核对，既有Project/BESS总额公式及AUTO调度保持不变。`cumulativeBessDischargeRevenueEur`是历史命名，包含假设估值；新字段分别为`cumulativeBessExportRevenueEur`、`cumulativeBessAvoidedImportCostEur`和`cumulativeBessRestoredLoadAssumedValueEur`。Stop/Reset/场景预设重新建立初态时均清零；纯编辑与暂停不回溯改写已结算子步。

界面把两个主卡改称“Project demo value”和“BESS demo margin”，常显累计假设价值，展开明细列出三项及旧合计。出口行是按电价估算的收入，避免进口行是按电价估算的成本节省，恢复未供负荷行只是演示估值。这些总额不包含完整项目成本、合同结算或负荷侧现金流，不是已实现现金流/财务预测。HUD金额加了同一口径的说明。

## 验收案例

| 一小时、PV为0、PCC 288 MW | 需求 | BESS放电 | 实际进口变化 | 避免进口 | 恢复未供负荷 | BESS出口 | 总放电价值 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 满额过载，350 €/MWh | 350 MW | 30 MW | 288→288 MW | €0 | €10,500 | €0 | €10,500 |
| 越过PCC上限，350 €/MWh | 300 MW | 30 MW | 288→270 MW | €6,300 | €4,200 | €0 | €10,500 |
| 满额过载，−25 €/MWh | 350 MW | 30 MW | 288→288 MW | €0 | −€750 | €0 | −€750 |
| 常规负荷加出口，100 €/MWh | 10 MW | 30 MW | 10→0 MW | €1,000 | €0 | €2,000 | €3,000 |

Node 24.21.0下`npm run lint`、**228测试/21文件**、`BASE_URL=/BESS-Storage-Simulator/ npm run build`通过。测试覆盖五个结算案例（含有PV的PCC紧张情况）、跨子步累计、旧总额对账、Stop/Reset清零，以及经济面板常显假设额和三项明细。真实本地浏览器在390×844 CSS视口打开明细，抽屉和明细格没有横向溢出；控制台error为空。Three vendor chunk仍为724.92 kB，构建体积提示未变。未做线上部署验收、实体手机触摸或财务系统对账。

## 后续边界

多日AUTO留电策略仍是另一项产品决策；本批没有调整SoC目标、峰段配速或时间曲线。矮横屏图例遮挡、Grid标签点击落空和`NumericField` Reset草稿问题仍按第七批记录保留。第八批复审需特别核对混合过载、负电价、跨日累计和主卡“demo value”口径，不能把三项之和误称为真实项目现金流。
