# 第一批交付记录

日期：2026-09-08（Europe/Berlin）\
基线：main `033cedd7896696e4f6e8c09efcd8a9f0df7184b4`\
状态（2026-09-19 更新）：用户转交的 CC 最终复审未发现新问题。交付分支 `codex/audit-batch-1-demo-ux` 的提交 `01ae625` 已通过 [PR #4](https://github.com/crashchen/BESS-Storage-Simulator/pull/4) 合并至 main `053c82cd23298391f0a0e400c2324d051241988d`；[同提交 CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35449398794) 和 [Pages 发布](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35449398727) 均成功。范围来自用户批准的第一批演示体验修复及 housekeeping。

## 已完成

| 项目 | 最终行为 |
|---|---|
| 太阳板 | 活性面旋转到板框所在平面，并调整板组倾斜方向，使默认视角看到贴合的板面；支撑柱不随板面倾斜，竖直接地并嵌入板背 |
| Retry 3D View | 只重建视图，保留模拟配置、SoC、累计结果和历史；清理旧 Canvas 的事件监听 |
| 抽屉与设备卡 | App 共享响应式抽屉状态；桌面缩为窄屏只保留最近打开的一侧，并转移被隐藏抽屉中的键盘焦点；Metrics/窄屏抽屉隐藏设备卡，设备点击收起抽屉并显示固定卡；抽屉入口保持可点；隐藏期间仍跟踪 hover enter/leave，关闭后恢复当前预览；抽屉已全关时 close-all 不生成新状态 |
| 电价输入 | 空值、非有限值及超出 -500～1000 EUR/MWh 的草稿不会提交，显示错误及实际 Current 电价；外部实际电价更新后淘汰旧草稿，回到原电价也不会复活旧错误；每次 Reset 都清草稿，即使实际电价不变；手机标签和输入上下排 |
| 时间轴 | 色带与刻度共用 hour/24 比例；18、23 位置正确，23/24 分行避免重叠 |
| Housekeeping | 更新仓库 README/CLAUDE 和 vault 五篇笔记；纠正固定代表机柜、峰段配速、命令语义、PR #3 合并状态及分包说明；记录本地检查结果、历史部署基线和剩余任务 |

本批没有修改仿真结算、AUTO 策略或依赖版本。

## 验证

- 2026-09-19 发布后在真实浏览器打开 Pages 子路径，确认三台 GLB 与贴合的太阳板正常显示、Metrics 可用，以及峰段输入 2000 被拒绝并提示实际电价仍为 350；该次检查未记录 console error。此发布 smoke 不替代下述本地完整验收，也未做 GPU 故障注入。
- 最新 `npm run lint`、`npm test`、`npm run build` 全部通过：**146 个测试 / 15 个文件**（首轮交付为 145 / 15，随后新增同值 Reset 回归）。
- 真实浏览器检查本地 Vite 页面，覆盖 1280×720 桌面、390×844 手机及往返调整窗口尺寸：太阳板可见面、抽屉互斥与焦点、电价 1000→2000 的 Enter/失焦错误反馈、时间轴刻度，以及固定设备卡与 Metrics 的双向切换。
- Metrics 入口用实际坐标点击验证，且 DOM 命中检查确认未被设备卡遮挡。
- 新增 `App.test.tsx` 用真实 App、simulation hook 和 reducer，在 StrictMode 下配合模拟 Canvas 的 context-loss 事件验证故障期间继续运行、Retry 前后配置/SoC/P&L/history 保留，以及旧 Canvas/卸载时的监听清理。用基线 App/Viewport 还原旧 RESET 接线后，同一状态保留测试失败，能检出原回归。
- 补充电价边界、外部改价后回原价，以及抽屉断点/最近侧/焦点行为的回归测试。
- Vault 写入前核验源文件和预览 SHA256，仅替换授权的五篇笔记；写入后再次核验与预览一致。

上述 Retry 测试不等于真实 GPU 故障注入；本轮没有验证 GLB 下载失败或图表分包失败恢复。生产构建仍有既有 three-vendor 724.90 kB（gzip 186.40 kB）的体积提示，不能据此宣称性能优化已完成。

## CC 反馈收尾（2026-09-08）

用户转交的 CC 复审认可首轮交付与 145 / 15 验收，并提出五个非阻塞项。本地逐项复核后已收口：支撑柱几何、close-all 无效更新、hover 保留、同值 Reset 清草稿，以及集中 Props 契约。`DrawerSide` / `DrawerState` / `DrawerLayout` 和完整 `ControlPanelProps` 统一在 `types.ts`；测试 wrapper 继续提供真实 hook 状态，它的存在不由类型声明位置决定。

`useGridSimulation` 单独返回 `simulationResetVersion`，只在 `RESET_SIMULATION` 时递增，经必填 props 传至电价输入；不写入 `GridState` 或结算逻辑，也不通过重新挂载表单清草稿。普通 tick、Pause 和 Stop 保留编辑状态。

- 真实浏览器 1280×720 检查支撑柱与板面，并验证默认 350→无效 2000→Reset 恢复 350、错误消失且焦点留在 Reset。
- 支撑柱轴线从世界坐标 y=-0.01（地面）到 y=1.2（板框中心），高度 1.21；顶盖在倾斜板框坐标中的最大 |y|≈0.017145，小于板框半厚 0.03，不穿过活性面。
- 新集成测试使用真实 ControlPanel 与 simulation hook，在相同时间戳、相同默认电价下连续两次 Reset，验证错误清除、输入 DOM 节点不变及焦点保留。隔离副本仅还原旧 hook 后，同一测试失败于“期望 350，实际 2000”。
- 既有 App 测试补齐“抽屉打开时 hover→关闭后恢复”和“隐藏期间 leave→关闭后不复活”的事件序列；旧 hover 实现不能通过该测试。此项是集成事件测试，不宣称完成浏览器静止指针故障注入。

复审提及的 Escape 让位判断在基线 `033cedd` 已存在，属于保留行为，不计为本批新增修复。用户随后转交了 CC 对这五项收尾的最终复审：逐项确认实现，独立重跑 lint、146 个测试（15 文件）和构建通过，未发现新问题，并更正了 Escape 的归因。以上为用户提供的外部复审结论；本代理未调用或调度 CC。本地验证的范围与限制仍以上文为准。

## 后续批次

继续按 [审计与优化计划](README.md) 的顺序：

1. 模型措辞与解释：yield 的 reference 边界、overload 下放电价值、实际动作/限制原因。
2. 数值收敛（P2）：SoC/策略事件拆步及压力、正常工况对照。
3. 加载与发布：GLB 失败缓存、图表错误边界、DPR 配置、依赖与同 workflow 质量门禁。

手机相机 fit、键盘设备选择、标签/滚动条与能流图例仍在持续体验清单中。第一批完成不代表全部审计项关闭。
