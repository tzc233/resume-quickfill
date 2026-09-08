# 1.33.0 验证记录

2026-09-08，独立无界面 Chrome：30 张测试页、604 项断言全部通过。
测试资源由本地文件提供，没有访问招聘网站。

## 根因与证据

用户提供的真实月份面板中，单元格 title 是“一月”至“十二月”，年份只出现在月份视图表头；表头外还有另一组日/年导航。
旧引擎要求单元格含四位年份才能识别日期，并以识别结果判断是否已打开。解析失败后再次点击输入，可能将已展开的日历关闭。

以提供的 DOM 层级、类名、中文标题、表头箭头 x、内外两组导航构造可交互复现页。1.32.0 在最初的17项检查中有9项失败；修复后扩展为23项检查并全部通过。
此复现保留真实结构，事件处理为本地模拟，不等同于运行网易页面的原始 React 代码。

## 改动

- 读取月份视图的独立年份表头，与中文月份组成年月。
- 只点击月份视图内部翻年按钮，每次确认年份改变，目标年份必须准确匹配。
- 面板已展开与格子可识别独立判断，避免重复点击关闭面板。
- 记录月份视图、年份、导航结果；禁用日期不点，回读不符不报成功。
- antd3 无输入框的空下拉不再把“点击选择”当作已有值。
- 外语区的泛化“掌握程度”不再匹配编程能力，缺少编程名称锚点时不自动新增编程条目。
- 对明确的名次/人数值计算百分比，选择最窄且覆盖该百分比的“前 N%”档位；例如2/30对应前10%，不选前5%。

## 新增/扩展验证

- netease-month-real.html：23项，过去年份、未来年份、当前月份提交、禁用项、错误回读、翻年无响应、内外导航隔离、单次打开、重复填充、结构化诊断。
- netease-safety.html：4项，空下拉、排名阈值、外语误填防护、重复填写不错误新增。

## 未验证边界

真实网易登录后的页面尚未由本轮工具直接操作，不宣称全部字段或服务端保存已验证。
学校所在地级联、游戏经历、外语数据对应、缺失学位日期等仍可能需要明确档案数据或控件适配。
不应使用总断言数量替代真实页面覆盖率。

## 各页结果

- antd-datetime.html：7 项通过
- antd-live.html：11 项通过
- backup-status.html：13 项通过
- baidu-style.html：25 项通过
- cross-browser.html：12 项通过
- custom-widgets.html：10 项通过
- diagnostic-export.html：4 项通过
- dji-style.html：37 项通过
- expand-blocks.html：20 项通过
- jd-empty.html：19 项通过
- jd-style.html：21 项通过
- moka-antd.html：9 项通过
- moka-live-snapshot.html：30 项通过
- moka-real.html：35 项通过
- moka-sd.html：21 项通过
- moka-style.html：25 项通过
- moka-ym.html：14 项通过
- netease-add.html：10 项通过
- netease-diagnostics.html：8 项通过
- netease-month-real.html：23 项通过
- netease-report-v2.html：8 项通过
- netease-safety.html：4 项通过
- netease-style.html：25 项通过
- oppo-short.html：24 项通过
- oppo-style.html：36 项通过
- oppo-widgets.html：16 项通过
- progress.html：13 项通过
- shopee-style.html：38 项通过
- testform.html：34 项通过
- zte-style.html：52 项通过
