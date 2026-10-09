# 2.30.1 本地验证记录

验证日期：2026-10-09。环境：macOS、Chrome 稳定版（Playwright `channel: 'chrome'`，headless）。

## 来源

用户：「还是会让网页变卡」。

## 定位

常驻每个网页的只有 2.x 的三个小脚本（schema / discovery / learning），没用过插件的站点只读一次本地存储、不挂监听。
卡顿出在**点过一键填充的招聘站**：填写记忆的监听在每次聚焦 / 点开下拉、点选、每段打字停顿时都整页识别一遍（`discover + resolveAll`）。

新增 `test/perf-armed.html` + `test/perf-armed.cjs`：照牛客结构铺 160 个控件、2392 个节点，模拟「本站已启用记忆」，
用可信键盘 / 点击操作，`PerformanceObserver('longtask')` 记录主线程长任务（> 50ms）。

改动前（`PERF_REPORT=1`）：

| 指标 | 改动前 | 改动后 |
| --- | --- | --- |
| 整页 `resolveAll` 一次 | 313 ms | 4 ms |
| 点开下拉并选一项 ×3 | 12 个长任务，累计 4914 ms，最长 661 ms | 0 |
| 在文本框里打字 ×3 栏 | 7 个，累计 2471 ms，最长 373 ms | 0 |
| Tab 走过 20 栏 | 6 个，累计 1992 ms，最长 356 ms | 0 |

拆分计时：`resolveAll` 的 313 ms 里 `familyOf` 占 326 ms（其余 2 ms）。它逐字段上溯 10 层祖先、每层 `querySelectorAll('*')` 再逐个判称谓；
牛客那种「关系」下拉的选项（父亲 / 母亲…）常驻 DOM，整页称谓检查恒为真，每个字段都走满。

## 修法（`content.js`）

`familyMarkers()`：整页称谓节点建一次索引（TreeWalker 只走文本节点、先用字符预筛、跳过下拉选项、按文档顺序排序），
逐字段只做 `node.contains(marker)` 过滤。判定逻辑（最近的前置称谓、越界一 / 越界二）不变。
索引在页面元素数变化、索引节点被移除或超过 2 秒时重建 —— 新加出来的家人块不会因为缓存被漏掉。

## 回归

- `node test/perf-armed.cjs`：门槛为每组操作单个长任务 ≤ 100 ms、累计 ≤ 200 ms，6 项通过（改动前全部超限）。
- `node test/browser-runner.cjs <test/ 下全部夹具>`：**62 张夹具、807 项断言全部通过**（perf-armed 页本身无断言）。
  家庭成员相关：`family-members.html` 14 项（工行分组 / 平铺两种布局）、`nowcoder-plugin.html` 27 项均通过。
- 更正：2.30.0 记录里写的「61 张、806 项」少算 1 项 —— 那次改 `ccb-sections.html` 时把一条断言拆成了两条，实为 807 项。
- `node test/manual-learning.cjs` 16 组、`options-page.cjs` 60 项、`popup-versions.cjs` 14 项、`ai-lab.cjs` 30 项：全部通过。
