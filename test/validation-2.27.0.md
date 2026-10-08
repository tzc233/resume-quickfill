# 2.27.0 本地验证记录

验证日期：2026-10-08。环境：macOS、Chrome 稳定版（Playwright `channel: 'chrome'`，headless）。

## 目标

用户决定：用 Chrome 内置的 Gemini Nano（本机运行、零网络请求）兜底规则认不出的字段；**先量准确率，再接入填表**。
这一版只做测量，不改填表流程。

接口按 Chrome 当前文档核实：`LanguageModel.availability()` 四态（available / downloadable / downloading / unavailable）、
`LanguageModel.create({ initialPrompts, monitor, expectedInputs, expectedOutputs })`、
`session.prompt(text, { responseConstraint: JSONSchema })`。首次下载必须由用户手势触发。
官方声明支持的语言为 en / ja / es / de / fr，**不含中文** —— 系统提示用英文、中文标签作数据，
能否看懂中文标签正是这次要量的。

## 设计（`ai.js`）

- 模型只回答「对应档案哪一栏、第几段」：`key` 用 JSON Schema 的 enum 锁在 `KEYS`（档案路径）或 `none`，
  `record` 锁在 -1~9；回答再经 `validate` 当不可信输入处理（非本批 id 丢弃、未知键当 none、列表栏无段号当 none、坏 JSON 全 none）。
- 发给模型的只有 `label / section / group / options`（`buildPrompt` 白名单挑字段），页面值与档案内容一概不发。
- 每批 ≤ 8 个字段，从带系统提示的基础会话 `clone()`，互不串话。
- 系统提示写明：拿不准、问的是别人（紧急联系人 / 推荐人）、验证码 / 协议、「是否本行员工」这类题、项目所在单位，一律答 none；「宁可留空」。

## 评测集（`ai-eval.js`）

71 个字段，全部来自这段时间真实踩过的页面，只含标签与结构：建设银行（模块名对不上旧别名）、
工商银行（家庭成员一组一组）、优必选（汇总栏与段号）、通用基本信息与 9 道陷阱题、奖项与竞赛分列、
论文拆字段、英文表单。每个字段人工标注正确答案；健全性检查：标准答案全部是 `KEYS` 里的合法栏目、id 唯一。

计分：对（键与段号都对）/ **错填**（该答 none 却给了键，或给错键 / 错段 —— 对应真实填表的错填）/ 漏答。

## 自测页（`ai-lab.html`）

档案页「实验功能」进入。准备模型（首次下载，需点击）→ 运行自测 → 逐字段结果表 → 复制结果（只含评测集标签与模型答案）。

## 回归

`test/ai-lab.cjs`（20 项）注入假的 `LanguageModel`：照标准答案作答，但故意把「所在单位」答成 `work.company`（错填）、
「微信号」答成非法键（必须当 none）、「专利成果」答成 none —— 总数、对、错填、漏答因此可精确断言。
另验：需要下载时不点击不触发 create、create 发生在用户手势里、不可用时说明原因、分批 ≤ 8、每批克隆、
Schema 锁定、系统提示要求拿不准答 none、提示里不带页面值与档案值、`validate` 的四种不可信输入、复制结果内容。
页面文件不存在时该测试即失败。

- `node test/ai-lab.cjs`：**20 项全部通过**。
- `node test/browser-runner.cjs <test/ 下全部夹具>`：59 张夹具、800 项断言全部通过（填表流程未改）。
- `node test/options-page.cjs` 59 项、`node test/popup-versions.cjs` 14 项、`node test/manual-learning.cjs` 11 组：全部通过。
- 1100px 与 390px 截图：无横向滚动。

## 待用户在本机 Chrome 上跑

真实准确率只能在装了 Gemini Nano 的 Chrome 里量：档案页 → 实验功能 → 本机模型自测 → 准备模型 → 运行自测 → 复制结果。
接入填表的门槛建议：**错填 0**，准确率 ≥ 85%；达不到就只把它用于诊断建议，不自动填。
