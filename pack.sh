#!/usr/bin/env bash
# 打包插件,产出可直接发给别人的 zip。
# 用法:./pack.sh [输出目录]   默认输出到 ~/Desktop
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
NAME="$(basename "$SRC")"
OUT_DIR="${1:-$HOME/Desktop}"
VERSION="$(python3 -c "import json;print(json.load(open('$SRC/manifest.json'))['version'])")"
ZIP="$OUT_DIR/简历快填-v$VERSION.zip"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/$NAME"

# 只带运行必需的文件:测试页、打包脚本本身都不发
for f in manifest.json content.js api.js backup.js \
         popup.html popup.js options.html options.js styles.css \
         profile-template.json README.md; do
  cp "$SRC/$f" "$STAGE/$NAME/$f"
done

# 给收件人的一页纸说明,免得翻 README
cat > "$STAGE/安装说明.txt" <<'TXT'
简历快填 ResumeQuickFill —— 招聘网站表单一键填充

【这是什么】
在各家企业招聘网站上,点一下自动填好申请表:姓名、学历、实习、论文……
还能自动上传简历附件。数据只存在你自己的浏览器里,不联网、不上传。
插件不会替你点提交,填完你自己核对再交。

【安装 · Chrome / Edge】
1. 地址栏输入 chrome://extensions  (Edge 用 edge://extensions)
2. 打开右上角的「开发者模式」
3. 点「加载已解压的扩展程序」,选择解压出来的 resume-quickfill 文件夹
   (要选到能看见 manifest.json 的那一层)
4. 把插件图标固定到工具栏

【安装 · Firefox】(需要 115 以上版本)
1. 地址栏输入 about:debugging#/runtime/this-firefox
2. 点「临时载入附加组件」,选择文件夹里的 manifest.json
3. 第一次点「一键填充」会弹权限请求,必须点允许
   注意:Firefox 的临时载入重启后会消失,数据也会清掉,记得先导出备份

【第一次使用】
点插件图标 →「⚙️ 档案」→ 填写个人信息 → 底部上传简历 PDF → 保存。

嫌填得多的话,有个更快的办法:
把文件夹里的 profile-template.json 和你的简历一起发给任意大模型
(Claude / ChatGPT / DeepSeek 都行),让它照模板填好输出 JSON,
再用「导入备份」导进来。具体提示词在 README.md 里。
导入后记得逐项核对一遍,模型可能读错日期。

【日常使用】
打开招聘页的申请表 → 点插件图标 →「⚡ 一键填充当前页面」→ 核对 → 自己提交。

填不上的字段,用弹窗里的两个诊断按钮排查:
  🩺 档案自检   —— 看插件里到底存了什么
  🔍 扫描字段清单 —— 看这个页面有哪些字段、各自认没认出来

【注意】
· 档案只存在浏览器本地,清理浏览数据会丢失,建议定期用「导出备份 JSON」
· 导出的备份里含简历和个人信息,当身份文件保管,别乱发
· 详细说明见 README.md
TXT

# 用 Python 打包而不是 zip 命令:macOS 的 zip 不设 UTF-8 文件名标志位(bit 11),
# 「安装说明.txt」在 Windows 上解压会变成乱码。Python 的 zipfile 默认会设。
python3 - "$STAGE" "$ZIP" <<'PY'
import os, sys, zipfile
stage, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(stage):
        dirs[:] = [d for d in dirs if d != '__MACOSX']
        for f in sorted(files):
            if f == '.DS_Store':
                continue
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, stage))

# 标志位要等写盘后重新打开才读得到 —— 写入过程中拿到的还是初始值
with zipfile.ZipFile(out) as z:
    bad = [i.filename for i in z.infolist()
           if not i.filename.isascii() and not i.flag_bits & 0x800]
    assert not bad, f'这些文件名缺少 UTF-8 标志,Windows 会乱码:{bad}'
PY
echo "✅ 已生成:$ZIP"
echo "   体积:$(du -h "$ZIP" | cut -f1)"
echo "   文件:$(python3 -c "import zipfile,sys;print(len(zipfile.ZipFile(sys.argv[1]).namelist()))" "$ZIP") 个"
