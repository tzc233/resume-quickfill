# 2.20.0 本地验证记录

验证日期：2026-10-07。环境：macOS、Chrome 稳定版（Playwright `channel: 'chrome'`，headless）。

## 触发这一版的问题

用户反馈「最近一些网页很卡」。排查结论：插件确实会拖慢**与招聘无关的网页**。

`manifest.json` 的 `content_scripts` 把 `schema.js / discovery.js / learning.js` 注入
所有 http(s) 页面、所有 iframe。`learning.js` 加载即无条件挂上 `change / pointerdown /
focusin / input / click` 五个捕获阶段监听器：

- 每次打字停顿 400ms、每次失焦，都执行一次 `identify` = 全页 `discover()` + `resolveAll()`；
  未识别字段的 `semanticKey` 里还会**再扫一遍全页**。`discover` 对每个控件做标签上溯、
  `sectionOf` 最多 40 层上溯（每层对兄弟节点取 `textContent`）、`getComputedStyle`
  与 `getBoundingClientRect`，代价约为「控件数 × DOM 规模」。
- 点到任何像下拉的元素（`select`、`[role=combobox]`、Ant/Element 等）同样触发全页扫描。
- 副作用：任何网站的搜索框、评论框里打的字，只要标签不像验证码/密码，
  都被当作「手动填写」写进 `rqfV2LearnedSelections`，存储随使用时间增长，
  每次写入要整份读出再写回。
- 另有 `framework()`：每个页面加载时把整页 `innerHTML` 序列化（截前 250KB）猜组件库，
  结果 `platformScope` 从未被使用。

## 量化（合成重页面：30 个区块 × 15 层嵌套 × 120 段正文，300 个输入框）

| | 改动前 | 改动后 |
| --- | --- | --- |
| 未用过插件的站点，打字 3 次停顿 | 3 个长任务：189 / 170 / 184 ms | **0 个长任务** |
| 已启用的站点，同样操作 | — | 198 / 200 / 193 ms（与改动前同量级） |

已启用站点的代价只出现在招聘页上。在真实 ATS 的 DOM 快照夹具上，一次 `discover + resolveAll`：
`moka-live-snapshot` 45 个字段 10ms、`moka-real` 35 个 9ms、`zte-style` 98 个 9ms —— 无感，
本版不再优化 `discover` 本身。

## 修改

1. **按站点启用记忆监听**：`V2.armLearning(persist)`。`__RQF_V2.fill` 开头调用并记下
   `rqfV2LearnSites[hostname]`；之后该站点一加载就从存储读到标记并挂上监听。
   其余网站只有一次 `storage.local.get('rqfV2LearnSites')`，不挂任何监听。
2. 删除 `framework()` 与未使用的 `platformScope`。
3. `semanticKey` / `learnedFor` 接收调用方已有的全页扫描：填充时每个下拉不再各扫一遍全页
   （原来是 O(N²)）。字段被重渲染替换、不在原扫描里时仍自行扫描，行为不变。

已有记忆（`rqfV2LearnedSelections`）不迁移、不删除：升级后某站点在第一次点「一键填充」之前，
手动填写不会被记；填充时照常读取已有记忆。

## 回归

`test/manual-learning.cjs` 新增 3 组，`test/preserve-learning-v2.html` 增加 `?armed=1`
（模拟此前启用过的站点）：

- 未启用站点：真实键盘输入后存储里没有任何记忆 —— **改动前即失败**（`unarmed site must not learn`）；
- 点一次填充后 `rqfV2LearnSites` 记下本站；
- 已启用站点：页面加载后不点填充，手动输入即被记住。

结果：

- `node test/manual-learning.cjs`：**11 组全部通过**（原 8 组 + 新增 3 组）。
- `node test/browser-runner.cjs <test/ 下全部夹具>`：**55 张夹具、758 项断言全部通过**。
- `node test/options-page.cjs`：25 项全部通过。

## 已知未处理

- 2.20.0 之前记下的记忆里，可能混有在无关网站输入框里打的字（只存在本机）。
  弹窗的「清除本站记忆」只能逐站清；如需一键查看/清理全部站点，可在档案页加一个记忆管理区。
