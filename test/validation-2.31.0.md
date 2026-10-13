# 2.31.0 本地验证记录

验证日期：2026-10-13。环境：macOS、Chrome 稳定版（Playwright `channel: 'chrome'`，headless）。

## 触发这一版的现场报告

千寻智能（`jobs.feishu.cn`，飞书招聘 atsx 组件），引擎 2.30.1。该页**没有**任何字段被重写：
63 个字段里 7 个判为「已是正确值」、3 个「已有显示内容/已有选择」、1 个「已有内容，未覆盖」，
`filled` 为空数组。但该填的几乎都没填上，报告暴露四处字段归属错误：

1. **作品集被当成工作经历**。`fieldAudit` 里「描述 works[0].desc」解析成 `work.0.desc` ——
   机器路径的根词表用 `(…|work|…)s?` 统一加复数，`works`（作品）因此落进 `work`（工作经历）。
   档案里工作经历的描述会被写进「作品描述」框。
2. **块内没有机器路径的字段整列指向第一条**。六个奖项块的名称各自带路径（`award[6..11].title`），
   块里的「获奖时间」没有路径；`resolveAll` 遇到机器路径直接返回、不进段号簿，
   六个时间全部解析成 `awards.0.date`。真写进去就是六行同一个日期、而旁边的奖项名还是空的
   （本次只因为 antd 年份选择器拒收文本写入才没落地，报告记为「native-text 写入后校验失败」）。
3. **「实习经历」按工作经历去取**。三个实习块的字段路径是 `internship[n]`（映射到 work 域），
   1.x 的 `explicitIndex` 分支直接用路径里的域、绕过 `retarget`，区块标题「实习经历」被忽略；
   该档案全职 0 段，于是三块实习九个字段全部报「档案只有 0 段工作经历」。
4. **atsx 的已选值读不出来**。多选的已选项挂在 `atsx-select-selection__choice__content`、
   combobox 的值就在 `atsx-select-search__field` 里，两者都不在 `readControlValue` 的
   选择器表内，且 `.atsx-select` 不是 `selectionOwner` 认得的组件根 ——
   已填的「意向城市（杭州）」「学校名称」被读成空的，引擎准备重写它们。

## 修改与对应的回归夹具

| 修改 | 夹具 | 改动前 |
| --- | --- | --- |
| 机器路径根词表逐个列复数，`work` 不吃 `works` | `test/feishu-ats-v2.html` | `works[0].desc` → `work.0.desc` |
| 机器路径把段号登记进 `resolveAll` 的段号簿 | 同上 | 两块的「获奖时间」都 → `awards.0.date` |
| `.atsx-select` 纳入组件根；读 `selection__choice__content` / `select-item-label`；combobox 的输入框按已选值读 | 同上 | 多选与 combobox 的已选值都读成空 |
| 1.x `explicitIndex` 分支仍走 `retarget`，域听区块标题 | `test/feishu-internship.html` | 九个字段全报「档案只有 0 段工作经历」 |

两张夹具都先在改动前的 `content.js` / `engine-v2/discovery.js` 上确认为红：
`feishu-ats-v2.html` 7 项中 4 项失败，`feishu-internship.html` 5 项中 4 项失败，
跳过原因与现场报告一字不差。

## 结果

- `node test/browser-runner.cjs <test/ 下全部夹具>`：**64 张夹具、846 项断言全部通过**
  （2.30.1 为 62 张 / 834 项，本版新增两张共 12 项）。
- `node test/manual-learning.cjs`（真实键盘与点击事件）：16 组全部通过。

## 未处理：机器路径的下标该不该压成 0 基连续

千寻那页把六个**全空**的奖项块编号成 `award[6]`…`award[11]`，三个实习块编号成
`internship[1..3]`。引擎把路径里的下标直接当档案段号用，于是六个奖项块全部越界
（档案 6 段，在 0–5），一栏都填不上。

压缩（按出现顺序重排成 0,1,2…）能让这六块填满，但会改变另一条现有约定：
`test/generic-rules-v2.html` 断言 `recruitEducationList_1_school` 要解析成
`education.1.school`，即「路径里的下标就是档案段号」—— 那条约定服务的是
已被 ATS 解析过、块号与解析结果一一对应的页面（米哈游、飞书的部分表单）。

两种语义不能同时成立，判据只能靠「页面块号是否与已有内容对应」这类启发式，
而这条路径上多叠一层启发式正是上一轮荣耀奖项填错的成因。**本版不改**，
留待确认千寻页面的块号含义后再定。
