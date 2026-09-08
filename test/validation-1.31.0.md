# 1.31.0 验证记录

本地独立无界面 Chrome：27 张测试页，569 项断言全部通过。
所有页面请求由本地文件提供，没有访问真实招聘网站。

## 本次改动

- 明确的项目等经历字段不再因相邻工作区块而跨类别改写；保留工作/实习、竞赛/奖项合并兼容。
- 优先读取同一表单项的标签，过滤选项和已选显示文本；操作说明占位符不再屏蔽标签。
- 含日历的网易复合日期整体处理，普通“至今”文本框保留原路径；日期写入后按目标年月日精度回读。
- 失败和冲突字段优先采样，附标签候选来源、权重和日期操作记录；结构片段限 24 份、每份 5000 字符。
- 导出整体替换档案值、输入值、已选文本和文件名，另做邮箱/手机号替换；自动脱敏仍需人工复核。
- 注入时允许替换旧版本引擎；引擎、清单、README 同步到 1.31.0。

## 新增测试

- netease-diagnostics.html：8 项，覆盖类别隔离、复合日期去重、填写、回读、错误日期不报成功、失败字段证据。
- diagnostic-export.html：4 项，覆盖表格、原因、文件名、候选证据的脱敏以及保留结构信息。

## 未完成的现场验证

真实网易登录后的申请页尚未验证。刷新扩展后，在原申请页重试并导出 1.31.0 报告。
本次不宣称修复了该页所有 98 个字段；游戏经历、语言能力等其他缺口需据新版报告继续定位。
只对 DOM 显示状态进行回读，不能据此证明招聘网站服务端已保存数据。

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
- netease-style.html：25 项通过
- oppo-short.html：24 项通过
- oppo-style.html：36 项通过
- oppo-widgets.html：16 项通过
- progress.html：13 项通过
- shopee-style.html：38 项通过
- testform.html：34 项通过
- zte-style.html：52 项通过
