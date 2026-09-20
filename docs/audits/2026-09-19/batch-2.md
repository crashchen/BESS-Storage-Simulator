# 第二批：模型口径与运行状态解释

日期：2026-09-19（Europe/Berlin）  
基线：main `053c82cd23298391f0a0e400c2324d051241988d`（PR #4）  
分支：`codex/audit-batch-2-model-clarity`  
状态：用户提供的 CC 组合复审通过，收尾已落实；已推送 [PR #5](https://github.com/crashchen/BESS-Storage-Simulator/pull/5) / `33ed745`，CI 已通过，未合并，未部署第二批。本代理未调用或调度 CC。见 [复审收尾](cc-review.md)。

> 后续状态：用户已要求第三批与本批一并复审。当前组合工作树的积分变更、192/17 验收及复审入口见 [第三批记录](batch-3.md)；下述“未改 tick/数学”和 175/16 指第二批单独完成时的范围。

## 第一批发布闭环

[PR #4](https://github.com/crashchen/BESS-Storage-Simulator/pull/4) 已合并；该提交的 [CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35449398794) 和 [Pages](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35449398727) 均成功。发布后真实浏览器访问 Pages 子路径，确认三台 GLB、贴合的太阳板面、Metrics 抽屉和峰段电价 2000→拒绝/Current 350，未记录 console error。这些发布证据属于第一批，不代表第二批已上线。

## 本批变更

| 项目 | 行为与边界 |
|---|---|
| Annual Yield Reference | 保留 1,380 kWh/kW/year 参考值；明确未用于演示日曲线、不能据此给出年度预测。未引入年度时序或校准模型。 |
| 累计收益解释 | Project P&L / BESS Margin 卡下常显限定；放电出口和全部本地供电仍按结算时电价计值。本地供电可以减少实际进口，也可以恢复受 PCC 限制而未获供电的负荷，后者是按电价的假设估值。负电价下可为负值。 |
| 限定的持续可见性 | 累计字段没有拆分历史供电去向，所以当前 overload 为零也不能移除限定；该说明位于折叠详情之外。保留原公式和累计字段，没有把所有本地供电重新称为进口节省。 |
| BESS 状态 | 新增共享 `selectBessDisplay`，控制面板、HUD、设备卡及 BESS 光色统一按采样功率显示动作，另外说明 run state 和 selected dispatch；不再把可能滞后的 `batteryMode` 当作实际动作。 |
| Pause 与限制说明 | 暂停保留冻结的非零功率采样，明确标为 snapshot；暂停改价/容量后的静态重算零功率显示 Idle。满电、空电、AUTO 峰段 reserve、夜间目标及零传输能力仅在当前状态能够证明时解释，其他零功率不猜测原因。 |
| 读数精度 | 小于 0.05 MW 在展示层归零，与既有设备卡/可见能流及一位小数读数口径一致；引擎的全精度功率和原 0.01 MW mode 阈值不变。撞到 SoC 边界的非零末次采样仍保留。 |

本批未修改 tick、reducer、SoC 积分、调度策略、PCC 结算公式或依赖版本。`simulationModel.ts` 和 `config.ts` 的改动仅为注释。`SceneAssetInfo` 增加可选 readingNote，将暂停/限制说明以全宽文本呈现，避免挤进双列读数。

## 验证

完整检查结果：`npm run lint`、`npm test`、`npm run build` 均 exit 0；**175 个测试 / 16 个文件**。构建保留既有 three-vendor 724.90 kB（gzip 186.40 kB）提示；本机 Node 还报告 `module.register()` 弃用提示，未改动依赖或运行时配置。

- 正/负电价结算回归：PV 0、需求 350 MW、PCC 288 MW、BESS 放电 30 MW、1 小时；进口始终 288 MW，未供需求从 62 降至 32 MW。350 €/MWh 下放电价值 €10,500，−25 €/MWh 下为 −€750。此回归锁定已声明的简化估值，并非验证其适合财务投决。
- UI 回归覆盖累计值保留、当前 overload 消失、结算详情关闭时限定仍可见。
- BESS 回归覆盖真实 reducer/tick 状态链、暂停非零快照、暂停改价后的陈旧 mode、运行中切换指令的零功率、SoC 边界和已知限制。
- 真实浏览器检查 1280×720、390×844 和 320×740：yield/累计限定可读、状态条无横向溢出；停止时选择 Charge 仍显示 Idle 0 MW，启动显示 Charging 186 MW，暂停标记 Charging snapshot，改价后显示 Idle snapshot 0 MW 且保留 Manual charge 选择。BESS 设备卡同步显示 Paused snapshot / Idle / 0 MW。
- 浏览器未记录 console error；仍有 Three Clock / PCFSoftShadowMap 弃用警告。新增说明后的设备卡可滚动查看底部容量等效信息。
- 仓库 README/CLAUDE、原审计实施状态和 vault 五篇项目笔记已同步；vault 保留原始审计 SHA，`verified_commit` 指已发布基线 `053c82c`，本地第二批状态和检查另行标明。固定五文件在写入前核验源/预览 SHA256，写入后核验与预览一致。
- 检查边界：本轮没有真实 GPU、GLB 或图表分包故障注入；满电/reserve 等原因主要由 reducer/tick 回归测试覆盖，不把它们全称为浏览器注入验证。未进行新的性能测量或 npm audit；9 月 8 日依赖快照仍带原日期。

## 给 CC 的复审入口

从上述 main 基线检查工作树，包括未跟踪的新文件：

```bash
git status --short
git diff 053c82cd23298391f0a0e400c2324d051241988d
npm run lint
npm test
npm run build
```

优先复核：

1. `simulationModel.ts` 无执行逻辑变化；经济说明不再声称所有 BESS→Load 都抵扣实际进口，且累计限定不随当前 overload 或 details 开合消失。
2. `bessDisplay.ts` 区分意图、运行状态和功率采样；Pause 的非零状态与 running 的边界末次采样没有被抹掉；无法从状态证明的限制没有被猜测。
3. HUD、Controls、设备卡、3D 光色消费同一展示规则；长状态在手机和可滚动设备卡内保持可读。
4. README、CLAUDE、审计状态和 vault 的五篇笔记分别标明第一批已发布、第二批仅本地；不把用户上一批 CC 验收结论套在本批。

## 后续

第二批完成时下一项为 SoC/策略事件拆步与步长收敛（P2），现已在同一工作树完成并见 [第三批记录](batch-3.md)。接下来处理图表/资产加载恢复、DPR、依赖/Node 和同 workflow 发布质量门禁。累计价值三项拆分、手机相机 fit、键盘设备选择等仍在路线图中；本批只闭合已选择的说明口径。
