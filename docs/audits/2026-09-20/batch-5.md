# 第五批：全景构图、设备比例与键盘访问

日期：2026-09-20（Europe/Berlin）。分支 `codex/audit-batch-5-scene-access`，基线 `be9eb1778638a8c24aa98252d716eaa9ab98ca4b`。本批于2026-09-22推送提交`e345c1f`，创建[PR #7](https://github.com/crashchen/BESS-Storage-Simulator/pull/7)，[CI 35699339050](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35699339050)通过；未合并/未部署。用户安排的CC复审覆盖208/20主体版本；以下最后的收尾验收为214/21。本代理未调用或调度CC。

> 下文描述第五批自身的实现和验收。resize保持手动视角由[第六批](../2026-09-22/batch-6.md)单独处理，未混入PR #7。

## 已完成的合并与发布

- 用户授权后，PR #5 以 merge commit 合并为 `622f1e6221ff336f7f6e19f5729d333a88ddbfdd`，保留其提交作为 PR #6 的祖先；#6 随后切换目标到 main，合并为 `be9eb1778638a8c24aa98252d716eaa9ab98ca4b`。没有重写已审核提交。
- 当前 main 的 [CI 35504681930](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35504681930) 与 [Pages 35504682035](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35504682035) 成功。Pages 的 `quality / lint-test-build`、`Download verified build`、上传及部署均完成，补上了第四批此前未实跑的同 run 产物交接证据；仍未故意制造远端红色 quality。
- 真实访问线上 Pages：三台设备正常显示；Start 后时钟、SoC、累计变化；Metrics 中 reference yield、累计估值限定和图表正常，未记录 console error。线上是第二至第四批的 197/18 版本，下面第五批不在其中。

## 本批变化

1. **完整站区构图。** `SCENE_3D.framing` 保存覆盖最大 6×5 PV 阵列、三种代表设备、标签和电杆的固定场景范围；排除装饰地面与移动粒子。`sceneOverview.ts` 将八角点投影到默认观察方向的基向量，按每个角点的深度求相机距离，保留横向 24px、上下 96px 空间。小于这些留白所需的极短尺寸会把可用比例保底到一半；正式验证尺寸见下。
2. **视图恢复不改模拟。** `SceneCameraControls` 在挂载、Canvas 尺寸变化或 `viewResetVersion` 改变时构图；普通模拟更新保持用户旋转/平移后的视角。Full site 清除设备检查并恢复默认观察方向，不重挂 Canvas，不 dispatch Reset。使用 `h-dvh` 跟随可用视口高度。
3. **纵向视口不会被旧距离限制截断。** fit 可以超过原 OrbitControls 50m 上限，控制器上限随 fit 增大；fog 起点同时推到站区之外。恢复前清掉残余 damping，避免旧拖动继续改变刚恢复的位置。未实现 FPS 自适应，也未进行 GPU 性能优化。
4. **键盘设备入口。** 底部原生按钮选择 BESS、PCS / MV、Grid，复用原信息卡与场景高亮。Tab 可到达，Enter/Space 打开后焦点到 Close，Escape/Close 返回对应按钮；再次按已选按钮可关闭。卡片被 Metrics 暂时隐藏后重新显示，不再次抢焦点。抽屉打开时隐藏工具栏，3D 失败时禁用工具按钮。
5. **卡片与工具栏避让。** 小于 1024px 时卡片居中；所有宽度均保留工具栏底部空间，长卡片内部滚动。region 滚动条使用深色细样式，替代刺眼的白色原生滚动条。

6. **设备比例与布局。** 用户在已发布 demo 中指出 PCS 过小；这是原审核漏掉的既有问题。原三个 GLB 分别缩放为 BESS 0.9、PCS 0.3、主变0.64，现在移除各模型独立 scale，统一使用 `SCENE_3D.equipmentScale = 0.9`。PCS 接近 BESS 的等高等宽体量，主变按其模型尺寸保持更高。PCS 基座扩大到6.1×0.16×3.4，中心移动到[5.65,0.08,-1.65]；主变移到[12.4,0,0.25]，Local Load移到[8.6,0.1,2.65]。这是代表设备的视觉布局，不是电气安装间距设计。
7. **比例调整的配套。** 三设备标签字号统一0.34；PCS标签偏离中心立线，避免被贯穿。PCS连接点按基座顶面+缩放后高度+0.85推导，主变流线端口及后方电杆随模型尺寸/位置推导。BESS和Local Load各补高位转接点，让曲线路径在离开PCS后再下降。默认观察方向更正面（camera配置[6,12,24]），framing最大角扩至[15.7,5.6,3.5]，保持手机全景与设备间距。

没有改动 reducer、tick engine、结算公式或多日 AUTO 策略。场景范围是手工维护的布局契约，不是运行时对任意新模型的自动测量；后续移动或新增设备必须更新它。

## CC复审前的阶段验收（208/20）

Node **24.21.0**：lint、**208 测试 / 20 文件**、`BASE_URL=/BESS-Storage-Simulator/ npm run build`、`git diff --check` 均通过。新增 11 项：

- `sceneOverview.test.ts`：320×640、390×844、768×1024、1280×720、844×390 的真实 Three 透视投影检查，八角点均在留白以内；未测量/非有限尺寸不构图。
- `SceneCameraControls.test.tsx`：用真实 Three camera / OrbitControls 检查挂载、纵向 resize、距离与 fog，以及普通更新不重置、显式请求才恢复；R3F store 和挂载层是测试替身，没有真实 GPU。
- `App.test.tsx`：Tab/Enter/Space/Escape/Close 焦点链、抽屉遮挡与重新显示不抢焦点、Full site 保留完整模拟 state/history 和同一 Canvas。

CC复审前尺寸修正构建：应用入口 97.09 kB，图表 352.94 kB，Three **724.91 kB**（gzip 187.62 kB），体积提示仍在。没有更新依赖；audit 零条快照保留 2026-09-19 归属。

### 首轮真实浏览器（设备比例修正前）

- 本轮 IAB 的 CSS 视口设置成功，实际读取 `innerWidth/innerHeight` 和 Canvas DOM 尺寸；不以请求 resize 成功代替实际尺寸。开发构建检查 320×640、390×844、768×1024、1024×720、1280×720。
- 320/390 手机与 768 平板全景包含太阳阵列、BESS、PCS/MV 与 Grid。最大 750 MWp（6×5）阵列在 1280 和 390 宽度仍完整可见。
- 键盘从初始 Tab 打开 BESS；Escape 返回 BESS；Tab/Space 打开 PCS；再通过键盘打开 Grid、Close 返回 Grid。原生 DOM 焦点与实际卡片内容均核对。
- 600 MWh、750 MWp 的暂停运行：拖动相机改变视角，Full site 恢复观察方向；HUD 保持 **08:52 / PAUSE / 69% / €9851**。App 集成测试另核对完整 state/history，不把舍入 HUD 数值当成完整状态证明。
- 长 PCS 卡片与工具栏：768×1024 下卡底 928px、工具栏顶 938px；1024×720 下为 624/634px。最终生产构建 320×640 下卡底 544、工具栏顶 554px；卡片 clientWidth/scrollWidth 均 **275px**，无内部横向溢出。
- 最终 Pages 子路径生产构建 `http://127.0.0.1:5180/BESS-Storage-Simulator/` 在 390×844 检查实际画布、全景、BESS 键盘焦点返回与 Full site；320×640 检查长 PCS 卡片和深色滚动条。开发/生产检查未记录 console error。首次 resize 截图可能早于图像缓冲更新，已在后续真实操作后重新取图确认。
- 这是浏览器响应式验证，不是真手机硬件/触摸手势验收；未注入新 GPU 故障。图表和 GLB 的 503 恢复沿用第四批证据，本轮未重复故障注入。

### 用户指出 PCS 偏小后的补充验收

- 最终代码重新跑 Node24 lint、208测试/20文件、Pages子路径build，通过；没有为配置值新增镜像单测。现有相机投影/控制器/信息卡测试继续通过。
- 用 Node + Three GLTFLoader 实际解析三份GLB（包含节点变换和细部网格），加上最终共享缩放与位置后测量如下；三设备互不相交、均在framing内，BESS/PCS完整XZ投影都在各自基座内。名义模型尺寸不包含所有小饰件，不能仅用配置size当作实测值。

| GLB | 场景中实际宽×高×深 | 实际X范围 | 实际顶面Y |
|---|---|---|---|
| BESS | 5.4954 × 2.61225 × 2.2239 | -3.5504 … 1.9450 | 2.64225 |
| PCS/MV | 5.4900 × 2.7000 × 2.8026 | 2.9050 … 8.3950 | 2.8600 |
| 主变 | 5.4000 × 4.5000 × 4.5000 | 9.7000 … 15.1000 | 4.5000 |

- 对源文件中的七条实际CatmullRom曲线各取2001点，与PCS/主变实测包围盒再外扩0.15比较，无采样点进入。第一次检查发现Solar→BESS曲线在PCS左上角有一个采样点进入约0.0024；补BESS高位转接点后复验通过。此为路径采样检查，不是连续曲线与所有设备网格的碰撞证明，也不覆盖全部粒子尺寸/任意相机下的遮挡。
- 开发构建实际检查1280×720、768×1024、390×844、320×640；最大750MWp（6×5）阵列与三设备完整入镜。PCS键盘按钮打开正确卡片，Escape返回其按钮。
- 尺寸修正阶段Pages子路径生产构建在1280×720验证三模型、PCS标签偏离立线、直接点击柜体打开PCS/MV卡片；拖动检查俯视与接近平视比例，Full site恢复默认构图。在390×844再次设置750MWp，实读Canvas390×844，阵列和设备完整。未记录console error。
- README、模型资产README、CLAUDE、审计状态与vault五篇同步本次追加修正；当时未提交/发布；目前已本地提交，线上`be9eb17`仍保留旧比例。更系统的标签屏幕尺寸/遮挡管理仍是后续项，手机全景下世界坐标文字仍较小。

## CC复审后的最终收尾（214/21，本地提交）

- 用户提供的CC复审结论是第五批可提交，PCS实测尺寸、透视构图、20001点流线采样及桌面交互均通过；审阅附件有重复和尾部截断。CC使用Node26.8.2，未能改变实际2320px CSS视口。其小尺寸Three投影检查与本代理的真实CSS布局证据分别记录，详见[复审收尾记录](cc-review.md)。
- 桌面信息卡由top96移到top160，最大高度改为`100dvh - 16rem`，仍留底部96px。沿用z-30，避免反过来遮挡Metrics把手；窄屏布局保留。统一props接口中两行缩进。
- App新增一项测试，遍历三设备按钮重复点击，核对卡片关闭、aria-pressed清除、焦点返回及完整模拟状态不变；在原真实hook/context-loss重试测试中断言四个工具按钮故障时disabled、重试后enabled。
- 从MicrogridScene提取原共享`EquipmentModel`到独立组件，渲染逻辑不变，方便直接验证Clone收到的scale。新增4项检查：三种真实GLB各自按实际渲染scale缩放，及配置位置下的基座容纳/设备无相交/framing包含。GLB根节点单位变换和缓存未被修改也有断言。
- 最大PV阵列新增1项framing检查，frame尺寸、倾角与高度从组件常量移入共享config，数值未变。此组守卫覆盖真实设备、三基座与最大PV框体；尚未自动覆盖标签、电杆、透明高亮壳和粒子。手工framing契约仍存在，不能把部分包含测试说成完整场景自动测量。
- 反向检查：临时把PCS渲染scale改为0.3，GLB比例测试断言失败；临时把PV baseStartX改为-40，最大阵列包含测试断言失败。文件随后按原字节还原。两类守卫分开，避免把“缩小后仍在画面内”误判为正确尺度。
- 最终Node24.21.0：lint、**214测试/21文件**、Pages子路径build、diff check通过。入口97.23kB（gzip26.17），图表352.94kB，Three724.91kB（gzip187.62），既有体积提示保留。未改工作流/依赖/模拟公式。

生产预览的真实CSS与DOM命中检查：

| 视口 | 卡片top/bottom | 工具栏top | Close与Metrics重叠面积 | Close五点命中 |
|---|---|---|---|---|
| 2320×1359 | 160 / 1120 | 1273 | 0 | 全部命中Close |
| 1280×720 | 160 / 624 | 634 | 0 | 全部命中Close |
| 1024×720 | 160 / 624 | 634 | 0 | 全部命中Close |
| 390×844 | 96 / 748 | 758 | 0 | 全部命中Close |
| 320×640 | 96 / 544 | 554 | 0 | 全部命中Close |

核对按钮中心及四边内侧的elementFromPoint；桌面实际点击Close右边缘成功关卡、焦点回PCS按钮，未打开Metrics。各尺寸卡片clientWidth等于scrollWidth，无横向溢出；浏览器console error为空。这是生产预览的响应式验证，非真手机硬件验证。

明确保留：任何Canvas resize仍回到全景，h-dvh高度变化可能打断手动视角；后续再区分自动构图与用户视角。手机全景文字、能流图例、加载占位、多日AUTO和累计价值拆项仍按原范围开放。

## CC 复审入口

```bash
# 使用 README 的方式激活 Node 24.21.0；不要求安装 nvm
node --version
npm run lint
npm test
BASE_URL=/BESS-Storage-Simulator/ npm run build
git diff be9eb1778638a8c24aa98252d716eaa9ab98ca4b
git ls-files --others --exclude-standard
```

重点看：共享设备尺度、真实GLB包围盒与基座/间距是否匹配；转接曲线是否避开PCS；透视 fit 与真实站区范围是否匹配；resize 与模拟 tick 的职责是否隔离；Full site 是否仅修改视图；键盘焦点在抽屉、卡片隐藏/重显时是否正确；768/1024 临界布局是否遮挡工具栏。新增文件需要一起审，不能只看 tracked diff。

README、CLAUDE、原审计实施状态、各批次发布指针及 vault 五篇随本轮同步。vault 的 verified/deployed commit 为 `be9eb17`，工作树状态与已发布commit分别记录。多日 AUTO 的留电目标、累计价值拆分、加载占位、标签和能流图例仍保留后续计划。
