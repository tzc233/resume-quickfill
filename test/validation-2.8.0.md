# 2.8.0 通用交互升级

本次增加：可编辑下拉搜索、最多八次弹层内部滚动、aria-owns 关联、aria-haspopup=listbox 触发器、标准 autocomplete 字段、contenteditable 写入，以及新流水线结束后的整页值复查。失败会继续处理其他字段；后续操作导致已填值丢失时撤销成功记录。

新增 portable-v2.html 检查搜索、滚动、富文本输入以及后续控件清空前序字段。既有 AUI、携程、上传优先、重渲染、学习、字段识别和华为报告结构用例一同运行。

测试入口已移入项目 test/browser-runner.cjs，避免依赖临时目录。使用 Node 和 Playwright：

    RQF_PLAYWRIGHT=/path/to/playwright node test/browser-runner.cjs portable-v2.html aui-select-v2.html ctrip-v2.html v2-core.html retention-v2.html generic-rules-v2.html huawei-evidence-v2.html upload-first-v2.html controlled-rerender-v2.html learning-v2.html

这些是本地结构与行为测试，不是招聘网站线上覆盖率。仍未承诺支持任意级联树、封闭 Shadow DOM、自绘控件和服务端保存验证。兼容层返回的历史成功记录也不属于本次新流水线整页复查的范围。

打包脚本现在包含 engine-v2 目录，避免安装包遗漏运行模块。
