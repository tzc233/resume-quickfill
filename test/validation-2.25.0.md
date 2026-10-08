# 2.25.0 本地验证记录

验证日期：2026-10-08。环境：macOS、Chrome 稳定版（Playwright `channel: 'chrome'`，headless）。

## 需求

用户要求：页面不分荣誉和竞赛时，先填竞赛。

原行为：`mergeAwardEntries` 把获奖的竞赛**追加在奖项之后**；获奖汇总框 `awardsText` 也是奖项在前、竞赛在后。
页面的奖项块常常放不下全部条目（Shopee、Moka 都只有 2 块），排在后面的竞赛就被「页面只有 N 段」截掉。

## 修改

- `mergeAwardEntries`：获奖的竞赛在前、奖项在后；同一条既在奖项又在竞赛时保留竞赛那条（信息更全）。
  「没获奖的参赛不进获奖列表」「并入的竞赛只用获奖时间、不拿起止时间顶替」两条原规则不变。
- `awardsText`（不单列竞赛的汇总框）：竞赛在前。

## 回归

新增 `test/award-order.html`（5 项）：获奖列表竞赛在前、奖项随后、仅参赛不进列表、汇总框竞赛在前、汇总框不漏奖项。
改动前 5 项中 3 项失败。

7 张老夹具按「奖项在前」写死了位置，逐条核对后**只改顺序、保留每条要守的性质**：

| 夹具 | 调整 |
| --- | --- |
| `honor-awards.html` | 并入的竞赛从第 4 块移到第 1 块；「名称不是汇总 / 六栏同属一条 / 时间跟着段号走 / 无匹配留空 / 并入竞赛不编日期」全部保留，下标后移一格 |
| `award-routing-v2.html` | `entries` 改为第 1 块赛事乙、第 2 块荣誉甲；`noInventedDate` 改看赛事乙那一块（它只有起止时间） |
| `baidu-style` / `antd-datetime` / `moka-real` / `moka-sd` / `shopee-style`（断言在 `test/run.js`） | 共用档案的竞赛补 `awardDate: '2022-09'`（模板本有此字段），否则第 1 块日期留空、「月份粒度」「第二段日期是自己的」测不到东西；期望按新顺序改。月份框沿用这些页面原有的不补零写法（`9`） |

结果：

- `node test/browser-runner.cjs <test/ 下全部夹具>`：**58 张夹具、792 项断言全部通过**（原 57 / 787）。
- `node test/options-page.cjs` 57 项、`node test/popup-versions.cjs` 14 项、`node test/manual-learning.cjs` 11 组：全部通过。
