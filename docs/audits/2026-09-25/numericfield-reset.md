# NumericField Reset 草稿回填修复

日期：2026-09-25。基线为 main `477293dd191a4f74339e2bd8eca5c28fae1c01f7`（第十批发布记录合并后）；改动位于独立分支 `claude/beautiful-brahmagupta-2r0qev`，先提交回归 `44ef460`，再提交修复 `34e3998`。本代理没有调用 CC。

## 问题与原因

即[第七批记录](../2026-09-22/batch-7.md)中的 P2：把 PV Evacuation Limit 从 102 改为 20 并失焦提交，点 Reset 后状态已回到 102，输入框却仍显示 20；随后失焦或按 Enter 会再派发 `SET_GRID_PV_EVACUATION 20`，把刚恢复的值改回 20。

`NumericField` 用 `sourceValue` 判断草稿是否仍对应当前值。成功提交时，草稿仍记在提交前的 102 下；值变为 20 后草稿只是暂时不匹配而被隐藏。Reset 恢复 102 后 `sourceValue` 再次匹配，旧草稿“20”复活，下一次提交便把它重新提交。

## 先写回归

`src/components/ui/PanelPrimitives.test.tsx` 新增三组用例：

- 真实 `useGridSimulation`、reducer、`ControlPanel` 与 Reset 按钮：用 userEvent 输入 20、Tab 提交，点击 Reset，再分别失焦和按 Enter。断言 Reset 后输入框为 102、之后不派发 payload 为 20 的命令，面板派生行保持 `102 + 186 MW`。
- 最小受控包装：失焦或 Enter 提交 20 后，在不移动焦点的情况下把值恢复为 102，断言草稿不复活、不再提交 20。
- 保护用例：值不变的重渲染（相当于模拟 tick）期间保留正在输入的草稿；无效草稿保留 `aria-invalid` 和范围提示。

在回归提交 `44ef460`（尚未修复）上运行该文件：4 个复现用例失败，均为 `expected 102, received 20`；保护用例通过。由于显示断言先失败，另用未提交的临时探针跑同一流程：Reset 后显示 20；失焦和 Enter 各派发一次 `SET_GRID_PV_EVACUATION 20`，派生行回到 `20 + 186 MW`。

## 修复与边界

成功提交时写入 `{ sourceValue: n, draft: String(n), invalid: false }`。提交后的值等于 n 时显示规范化的 n；Reset 等外部更新改变该值后，输入框显示当前值，失焦或 Enter 提交的也是这个值。无效提交和输入过程的代码路径未改。另一可见差异是：值不变的有效提交（例如在 102 时输入 `102.0` 后回车）现在也显示 `102`，与会改变值的提交一致。

没有修改 `GridState`、reducer、tick、dispatch、结算、配置或输入范围。`NumericField` 仍不读取 `simulationResetVersion`：若无效草稿对应的容量在 Reset 前后相同，该草稿和提示会保留，这与电价输入的显式 Reset 契约不同，是否统一需另行决定。聚焦后再离开字段仍会派发当前显示值（Reset 后为 102），这是既有行为。

## 检查

Node 24.21.0（nvm）下 `npm ci`、lint、**265 个测试 / 22 文件**、`BASE_URL=/BESS-Storage-Simulator/` 构建与 `git diff --check` 通过；Three vendor chunk 724.92 kB 的既有体积提示仍在。

浏览器：本地 `vite preview` 提供 Pages 子路径构建，headless Chromium 1280×720，使用真实鼠标点击和键盘 Tab/Enter。修复前的 main 构建在 Reset 后输入框为 20、派生行为 102，失焦后两者均为 20。修复后 Reset、失焦和 Enter 之后两者均为 102；输入 2000 并失焦后仍有 `aria-invalid` 和 “Enter 5-500 MW.”。

该容器只有 SwiftShader 软件 WebGL。3D 场景运行时，React 界面更新明显滞后：修复后的构建要到下一次事件才显示 Tab 提交的 20；main 构建在观察窗口内同样没有及时更新。因此上述对照在禁用 WebGL 下运行，3D 视口处于失败回退状态；控制面板和模拟 hook 不依赖 Canvas。除禁用 WebGL 产生的错误外，console error 只有外部字体证书（代理 CA）和浏览器自动请求 `/favicon.ico` 的 404；项目本身没有 favicon。没有在真实 GPU、实体手机或触摸设备上复测。
