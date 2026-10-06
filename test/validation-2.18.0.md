# 2.18.0 本地验证记录

验证日期：2026-10-06。环境：macOS、Chrome 稳定版（Playwright `channel: 'chrome'`，headless）。

## 触发这一版的问题

没有新的现场报告。这一版处理 `validation-2.17.0.md` 里「已知未处理」的两项：

1. **独立文本框的标签被 1.x 当成区块标题**（优必选 zhaopin.ubtrobot.com）。
   根因在区块标题扫描的选择器 `[class*="title" i]`：Phoenix 表单项把标签包成
   `<div class="form-item__title"><label class="form-item__text">专利成果</label></div>`，
   外壳类名带 title，文字又能对上 `SECTION_DOMAIN` 的「论文」「专利」。
   优必选那页没因此填错，但伪标题会喂给 `genericHit`：紧跟其后的泛化栏
   （夹具里的「补充说明」）被认成专利描述位，档案有专利时就会把专利说明写进去。
2. **一批「未识别字段」**，逐个判断：

| 字段 | 判断 | 处理 |
| --- | --- | --- |
| 学习形式 | 规则缺口：档案有 `education[].studyForm`，1.x 有规则，2.x 一条都没有 | 2.x 新增 `education.studyForm` |
| 专利成果 | 规则缺口：档案 `patents` 是结构化的，只缺整段汇总位 | 1.x 新增 `patents` 整段规则与 `patentsText` |
| 最高学位 | 学历→学位的换算并不总成立（同等学力、结业），2.17.0 已明确留空 | 不动 |
| 证书种类 / 证书名称 / 获得时间 | 档案没有证书列表；拿语言证书去顶要猜「种类」 | 不动 |
| 项目成果 | 档案的项目只有 `desc`，拿描述去顶会和「项目描述」重复 | 不动 |

## 补「学习形式」时发现的连带问题

只加 2.x 规则、不改段号逻辑时，`ubtrobot-v2.html` 立刻 5 项失败：汇总容器里的
「学习形式」被认成 education 域，占掉 0 号段位，两个学校块整体变成 `education.1.*` /
`education.2.*` —— 和 2.17.0 修「最高学历」时同一个坑。2.17.0 只把那一栏写成定点路径，
没有堵住容器本身。现在 `resolveAll` 要求：同域里别的 `.ux-standard-form` 认出了锚点
（学校名称），这个容器却没有，它就不是一段经历，其中的字段留空。
整页一个锚点都没认出时不启用。

## 修改与对应的回归夹具

| 修改 | 夹具 | 改动前 |
| --- | --- | --- |
| `scanSections` 跳过本身是、包着或落在 `<label>` 里的候选 | `test/field-label-heading.html`（新增） | 「获得荣誉」「补充说明」落在专利区块；「补充说明」被写入「示例专利说明」 |
| 1.x 新增 `patents` 整段汇总规则 | 同上 | 「专利成果」留空（未识别） |
| 2.x 新增 `education.studyForm` | `test/ubtrobot-v2.html`（新增 2 项） | 两个学校块的学习形式 key 为 null |
| `resolveAll` 无锚点容器不分段号 | 同上 | 只加规则时 5 项失败（整列教育错位一格） |

红→绿逐项确认：

- `field-label-heading.html`：在未改动的 `content.js` 上 8 项中 4 项失败
  （「获得荣誉不落在专利区块」「补充说明不落在专利或论文区块」「补充说明不被灌进专利说明」
  「专利成果装专利」）；只修区块标题后剩「专利成果装专利」1 项失败；
  加上 `patents` 规则后 8 项全绿。
- `ubtrobot-v2.html`：在未改动的 `engine-v2/` 上 10 项中 1 项失败（「学习形式按段落位」）；
  只加 schema 规则后 5 项失败（段号整体后移）；加上锚点闸门后 10 项全绿。

## 结果

- `node test/browser-runner.cjs <test/ 下全部夹具>`：**55 张夹具、758 项断言全部通过**
  （2.17.0 为 54 张 / 748 项；新增一张 8 项，`ubtrobot-v2.html` 增加 2 项）。
  `diagnostic-export.html` 运行时打印的一条 `addEventListener` 页面错误在 2.17.0 上同样存在，
  该夹具 6 项断言通过，与本版无关。
- `node test/manual-learning.cjs`（真实键盘与点击事件，`isTrusted === true`）：8 组全部通过。

## 已知未处理

- **2.x 的 `sectionOf` 也会把字段自己的标签当区块**：它在表单项那层看到的唯一短标题正是
  该字段的标签（「获得荣誉」→ awards，「项目成果」→ projects）。由于总是先找到自己的标签，
  不会串到相邻字段，目前没有错填；若以后给 projects 加「成果」类词条，需要先处理这一点。
- 班级排名、工作结束时间缺月份：同 2.17.0，等档案侧调整。
