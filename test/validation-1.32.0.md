# 1.32.0 验证记录

2026-09-08：独立无界面 Chrome，本地 28 页、577 项断言全部通过。
测试请求由本地文件提供，未访问真实招聘页。

## 第二份网易报告确认的改善

项目描述已归入项目#1并报告填写成功；学历、出生日期、获奖日期等标签比旧报告准确。
填写数量受页面已有值和动态字段变化影响，不将 23/98 当成真实覆盖率。

## 本次修复

- 同一表单项中的两个完整日期控件按位置识别起止，项目时间保留项目归属。
- 获得学位证时间单独识别，未提供专门日期时不自动套用毕业日期。
- 旧版 antd 月/年单元格及内部带 title 的链接参与识别，点击实际链接。
- 日期诊断区分面板未出现与面板出现但日期格未知，保存面板结构。
- 取消按重复标签冒领旧结果，复选框保留自身标签。页面重新创建元素时，历史结果可能缺失，但不报告成另一个字段的成功。
- 家庭所在地不自动使用现居城市。
- 诊断结构去重包含规则与失败原因，减少同一容器中不同失败被合并的情况。

## 现场验证边界

尚未取得真实网易页面上的 1.32.0 执行结果；月份面板支持来自通用组件结构与合成测试，不声称已确认真实页面日历故障全部消失。
学校所在地级联、语言能力、游戏经历等仍需进一步定位或档案支持。

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
- netease-report-v2.html：8 项通过
- netease-style.html：25 项通过
- oppo-short.html：24 项通过
- oppo-style.html：36 项通过
- oppo-widgets.html：16 项通过
- progress.html：13 项通过
- shopee-style.html：38 项通过
- testform.html：34 项通过
- zte-style.html：52 项通过
