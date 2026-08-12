/* ============================================================================
 * 简历快填 ResumeQuickFill — 表单识别与填充引擎
 * 本文件只定义 window.__RQF,由弹窗按需注入后调用;不自动运行、不发起网络请求。
 * 设计原则:
 *   1) 只填空白字段,绝不覆盖已有内容;
 *   2) 不点击提交按钮、不勾选任何协议复选框;
 *   3) 通过原生 value setter + input/change 事件兼容 React/Vue 受控组件;
 *   4) 支持多段教育 / 工作 / 项目经历(Moka、北森等 ATS 的可重复区块)。
 * ========================================================================== */
(() => {
  if (window.__RQF) return;

  const VERSION = '1.9.2';

  /* ---------- 文本规整:拆 camelCase、转小写、去标点与提示词 ---------- */
  const clean = (s) => String(s ?? '')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[*::()()\[\]【】{}<>_\-./\\|,,。;;''""??!!&#@~`+=^%$]+/g, ' ')
    .replace(/必填|选填|可选|请输入|请选择|请填写|required|optional|please enter|please select|please/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const isCJK = (s) => /[一-鿿]/.test(s);

  /* ============================ 字段识别规则 ============================
   * k   —— 字段键。含 "." 者为经历类字段,格式 域.字段
   *         域:edu(教育) / work(工作实习) / proj(项目) / *(跟随上下文)
   * a   —— 区块锚点。同一域内该字段第二次出现,即视为进入下一段经历
   * ex  —— 排除词:任一候选文本命中即整条规则作废
   * 顺序即优先级,具体规则必须排在笼统规则之前。
   * ==================================================================== */
  const RULES = [
    /* ---- 基本信息 ---- */
    { k: 'namePinyin', re: /姓名拼音|拼音|pinyin/i },
    { k: 'lastName',  re: /^姓$|last ?name|family ?name|surname/i },
    { k: 'firstName', re: /^名$|first ?name|given ?name/i },
    { k: 'fullName',  re: /姓名|中文名|^name$|full ?name|your ?name|candidate ?name|legal ?name/i,
      // 「导师姓名」曾被填成本人姓名 —— 凡是他人的姓名字段一律排除
      ex: /公司|学校|院校|银行|紧急|联系人姓名|家属|亲属|推荐人|监护人|导师|指导教师|项目名称|论文名称|奖项名称|竞赛名称|软件名称|专利名称|user ?name|company|school|university|bank|emergency|referr|advisor|supervisor/i },
    { k: 'idNumber',  re: /证件号码|身份证号|身份证件|证件号|id (number|card)/i },
    { k: 'email',     re: /邮箱|电子邮件|e ?mail/i, ex: /验证码|verif|otp|\bcode\b/i },
    { k: 'phone',     re: /手机|电话|联系号码|联系方式|phone|mobile|\bcell\b/i,
      ex: /紧急|亲属|家属|座机|区号|验证码|emergency|country ?code|area ?code|verif|otp/i },
    { k: 'wechat',    re: /微信|we ?chat|weixin/i },
    { k: 'gender',    re: /性别|gender|^sex$/i },
    { k: 'birthCountry', re: /出生国家|country of birth/i },
    { k: 'birthday',  re: /出生|生日|birth ?(date|day)|date of birth|\bdob\b/i },
    { k: 'politicalStatus', re: /政治面貌|党派|political (status|affiliation)/i },
    { k: 'ethnicity', re: /民族|ethnicity/i },
    { k: 'hometown',  re: /籍贯|户口所在地|native place|hometown/i },
    { k: 'prCountry', re: /永久居留权|永居|permanent residen/i },
    { k: 'otherNationality', re: /其他国籍/i },
    { k: 'nationality', re: /国籍|当前所在国家|所在国家|nationality/i, ex: /其他|出生|居留/i },
    { k: 'sourceChannel', re: /招聘信息来源|信息来源|获取来源|获知渠道|来源渠道/i },
    { k: 'hobbies',   re: /兴趣爱好|个人爱好|^爱好$|hobb/i },
    { k: 'gradYear',  re: /毕业年份|毕业届别|graduation year/i },
    { k: 'highestSchoolCity', re: /院校所在城市|学校所在城市|学校所在地/i },
    { k: 'lastMajor', re: /最近毕业专业|最后毕业专业/i },

    /* ---- 求职意向 ---- */
    { k: 'expectedCity2',  re: /意向工作地\s*2|期望工作地\s*2|意向城市\s*2/i },
    { k: 'expectedCity',   re: /意向工作城市|意向工作地|意向面试地点|期望(工作)?(城市|地点|地区)|意向城市|期望工作地|工作意向地|preferred (city|location)|desired (city|location)/i },
    { k: 'expectedSalary', re: /期望(薪资|月薪|年薪|薪酬)|薪资要求|expected salary|desired salary|salary expect/i, ex: /当前|现在|目前|current/i },
    { k: 'availableDate',  re: /到岗|入职时间|onboard|available (date|time)|start date|earliest start/i },
    { k: 'yearsExp',       re: /工作年限|工作经验年|years? of (work )?experience|experience years?/i },
    { k: 'city',      re: /现居|居住地|居住城市|所在城市|当前城市|所在地|current (city|location)|\bcity\b/i,
      ex: /期望|意向|preferred|desired|籍贯|户口|hometown|native|学校|院校|公司/i },

    /* ---- 校园工作(须早于 work.desc,否则被「经历描述」抢走) ---- */
    { k: 'campusWork', re: /校园工作经历|校园经历|校园组织|学生工作|学生干部|校内活动|社团经历/i },

    /* ---- 教育经历(锚点:学校) ---- */
    { k: 'edu.college', re: /学院.?系|院系|学院|系别|department|faculty/i },
    { k: 'edu.school', a: 1, re: /学校名称|毕业院校|毕业学校|院校名称|学校|院校|大学名称|university|college|school|alma mater/i,
      ex: /高中|初中|小学|middle school|high school|primary/i },
    { k: 'edu.major',  re: /专业名称|所学专业|专业|major|field of study|discipline/i, ex: /专业技能|专业证书|专业能力/i },
    { k: 'edu.isHighest', re: /是否最高学历|最高学历\s*[??]/i },
    { k: 'edu.eduType',   re: /学历类型|培养方式|统招/i },
    { k: 'edu.studyForm', re: /学习形式|培养形式|全日制/i },
    // 「最高学历」归入基本信息,恒指向第一段教育经历,不受经历区块顺序影响
    { k: 'degree',     re: /最高学历|最高学位|highest (education|degree)/i },
    { k: 'edu.degree', re: /学历|学位|degree|education level|qualification/i },
    // 顺序要紧:三条都含「实验室」,笼统的那条必须垫底
    { k: 'edu.hasLab',   re: /是否有?实验室|有无实验室/i },
    { k: 'edu.labLevel', re: /实验室级别|实验室层次/i },
    { k: 'edu.lab',      re: /实验室(全称|名称)?/i },
    { k: 'edu.advisor',  re: /导师|指导教师|指导老师|负责老师|supervisor|advisor/i },
    { k: 'edu.research', re: /研究方向|研究领域|research (interest|direction)/i },
    { k: 'edu.rank',     re: /成绩排名|专业排名|年级排名|排名|\brank\b/i },
    { k: 'edu.gpaTotal', re: /gpa\s*总分|总分|满分/i },
    { k: 'edu.gpaScore', re: /gpa\s*(分数|成绩)|绩点|gpa|平均分|均分/i },
    { k: 'edu.timeRange', r: 1, re: /就读时间|在校时间|教育时间|学习时间/i },
    { k: 'edu.startTime', re: /入学时间|入学年月|开始就读|enrollment/i },
    { k: 'edu.endTime',   re: /毕业时间|毕业年月|graduation (date|time)|graduate/i },

    /* ---- 工作 / 实习经历(锚点:公司) ---- */
    { k: 'work.company', a: 1, re: /公司名称|单位名称|任职公司|工作单位|所在公司|公司|单位|雇主|employer|company name|company/i,
      ex: /期望|意向|项目/i },
    { k: 'work.title', re: /职位名称|岗位名称|担任职位|所任职位|职务|职位|岗位|(job )?title|position/i,
      // 「输入职位关键字」是页面顶部的职位搜索框;「校园组织名称,职位,经历成果」是校园经历的占位文字
      ex: /期望|意向|应聘|申请|投递|搜索|关键字|关键词|筛选|校园|社团|学生工作|apply|applied|desired|search|称谓|mr\b|ms\b|项目/i },
    { k: 'work.dept',  re: /所在部门|部门|department/i },
    { k: 'work.skills', re: /实习使用技能|使用技能|所用技能|涉及技能/i },
    // 「校园工作经历描述及成果」含「经历描述」,必须排除,否则会被填成实习描述
    { k: 'work.desc',  re: /经历描述|工作(内容|描述|职责)|岗位职责|主要职责|实习(内容|描述)|job (description|duties)|responsibilit/i,
      ex: /校园|社团|学生工作|在校期间/i },

    /* ---- 项目经历(锚点:项目名称) ---- */
    { k: 'proj.name', a: 1, re: /项目名称|课题名称|project name/i },
    // 百度把「项目职务」(担任什么角色)和「项目职责」(做了什么)拆成两个字段,不能混为一谈
    { k: 'proj.role', re: /项目职务|项目角色|担任角色|角色|\brole\b/i },
    { k: 'proj.duty', re: /项目中职责|项目职责|岗位职责/i },
    { k: 'proj.desc', re: /项目(描述|内容|简介|说明)|课题描述|project description/i },

    /* ---- 论文(锚点:论文名称) ---- */
    { k: 'paper.name', a: 1, re: /论文名称|文章名称|paper title/i },
    { k: 'paper.type', re: /论文类型|会议.?期刊|期刊名称|会议名称|发表(期刊|会议)|journal|conference/i },
    { k: 'paper.authorOrder', re: /作者顺序|作者排序|署名顺序/i },
    { k: 'paper.url',  re: /论文链接|文章链接/i },
    { k: 'paper.date', re: /发表时间|发表日期|publish/i },
    { k: 'paper.desc', re: /论文描述|文章描述|论文详情/i },

    /* ---- 竞赛与奖学金合并列表(OPPO)----
     * 标签一律带「竞赛/奖学金」前缀,不会误伤中兴/大疆那种拆开的表单。
     * 注意「类别 / 级别 / 等级」是三个不同维度:类别=竞赛还是奖学金,
     * 级别=国家级还是校级,等级=一等还是二等。 */
    { k: 'honor.name', a: 1, re: /竞赛.{0,2}奖学金名称|竞赛.{0,2}获奖名称/i },
    { k: 'honor.category', re: /竞赛.{0,2}奖学金类别|获奖类别/i },
    { k: 'honor.level', re: /竞赛.{0,2}奖学金级别|获奖级别/i },
    { k: 'honor.grade', re: /竞赛.{0,2}奖学金等级|获奖等级/i },
    { k: 'honor.date', re: /竞赛.{0,2}获奖时间/i },
    // 这一栏排在名称之前,不当锚点的话第二段取不到自己的值;
    // 锚点按字段名去重,与 honor.name 两个锚点可以共存
    { k: 'honor.kind', a: 1, re: /^竞赛.{0,2}奖学金$/i },

    /* ---- 竞赛(锚点:竞赛名称) ---- */
    // 大疆用「赛事」而非「竞赛」——不收这个词,整个赛事区块都会落到通配规则上
    { k: 'comp.name', a: 1, re: /竞赛名称|比赛名称|赛事名称/i },
    { k: 'comp.type', re: /竞赛类型|比赛类型|赛事类型/i },
    { k: 'comp.result', re: /竞赛成绩|比赛成绩|竞赛结果|赛事成绩|获奖等级/i },
    { k: 'comp.desc', re: /竞赛描述|比赛描述|赛事描述/i },
    { k: 'comp.timeRange', r: 1, re: /参赛时间|比赛时间|竞赛时间|赛事时间/i },

    /* ---- 荣誉奖项(锚点:奖项名称) ---- */
    // 百度用「奖项说明」作为每条荣誉的唯一输入框;不认它就会掉进整段文本兜底,
    // 导致六个独立奖项框被同一段汇总文字灌满
    { k: 'award.name', a: 1, re: /奖项名称|荣誉名称|奖项说明|获奖说明|荣誉说明/i },
    { k: 'award.type', re: /奖项类型|荣誉类型/i },
    { k: 'award.result', re: /奖项成绩|获奖等级/i },
    { k: 'award.desc', re: /奖项描述|荣誉描述/i },
    { k: 'award.date', re: /获奖时间|获奖日期/i },

    /* ---- 专利(锚点:专利名称)----
     * 必须排在 publications 之前:否则「专利名称/编号/描述」会被整段论文文本填满。
     * 档案里没有 patents 时,这些字段会被明确跳过,而不是塞进不相关的内容。 */
    { k: 'patent.name', a: 1, re: /专利名称/i },
    { k: 'patent.type', re: /专利类型/i },
    { k: 'patent.no',   re: /专利编号|专利号/i },
    { k: 'patent.date', re: /专利.*(时间|日期)|发布时间/i },
    { k: 'patent.desc', re: /专利描述/i },

    /* ---- 软件著作权(锚点:软件名称) ---- */
    { k: 'soft.name', a: 1, re: /软件名称|著作权名称/i },
    { k: 'soft.type', re: /软件类型/i },
    { k: 'soft.date', re: /著作时间|登记时间/i },
    { k: 'soft.desc', re: /软件概述|软件描述/i },

    /* ---- 外语能力(锚点:语言种类) ---- */
    { k: 'lang.name', a: 1, re: /语言种类|语种|外语语言/i },
    { k: 'lang.certScore', re: /语言证书及成绩|证书及成绩|证书与成绩/i },
    { k: 'lang.cert', re: /认证类型|证书类型|考试类型|语言证书/i },
    { k: 'lang.score', re: /^成绩$|语言成绩|外语成绩|考试成绩|等级.{0,2}分数/i },

    /* ---- 编程语言能力(锚点:编程语言名称) ---- */
    { k: 'prog.name', a: 1, re: /编程语言名称|编程语言|programming language/i },
    { k: 'prog.level', re: /掌握程度|熟练程度|proficien/i },

    /* ---- 整段文本型成果(表单未拆结构时使用) ---- */
    // 专利/著作已由上面的结构化区块承接,这里只兜底整段文本型的论文字段
    { k: 'publications', re: /论文|科研成果|学术成果|发表情况|publication|paper/i },
    { k: 'awards',       re: /获奖|奖项|荣誉|奖学金|award|honor/i },
    { k: 'skills',       re: /技能证书|专业技能|技能|技术栈|掌握技术|擅长|skill/i },
    { k: 'languages',    re: /英语|语言能力|外语|english|language (level|ability)/i },

    /* ---- 链接 ---- */
    { k: 'homepage', re: /个人(主页|网站|博客)|portfolio|personal (web ?site|page)|blog|website|home ?page/i },
    { k: 'github',   re: /git ?hub/i },
    { k: 'linkedin', re: /linked ?in|领英/i },

    /* ---- 自我介绍 ---- */
    { k: 'intro', re: /自我(介绍|评价|描述)|个人(简介|介绍|优势|总结|陈述)|self ?(intro|evaluation|assessment|description)|about (you|yourself|me)|cover letter|求职信|personal statement|summary/i },

    /* ---- 跟随上下文的通用字段(必须排在最后) ----
     * Moka 把日期拆成「年」「月」两个独立文本框,标签就是单字「年」/「月」。
     * 这两条必须排在 timeRange 之前:它们更具体,且四个框按 年月年月 顺序出现,
     * 由 ymSeq 状态机依次映射到 起始年→起始月→结束年→结束月。 */
    { k: '*.ymYear',  ym: 'y', re: /^年$|^year$/i },
    { k: '*.ymMonth', ym: 'm', re: /^月$|^month$/i },
    { k: '*.timeRange', r: 1, re: /起止时间|起止日期|时间范围/i },
    { k: '*.startTime', re: /开始时间|起始时间|开始年月|start (date|time)|from/i },
    { k: '*.endTime',   re: /结束时间|截止时间|结束年月|end (date|time)|\bto\b/i },
    // 「作品描述」属于作品集,档案里没有对应项,不能让它顺着上下文捡到项目描述
    { k: '*.desc',      re: /描述|内容|简介|说明|description/i, ex: /作品|portfolio|简历解析|解析填充/i },
  ];

  /* ---------- 区块标题 → 经历域 ----------
   * 有些表单的区块整个只有一个泛化字段:大疆的「获奖经历」只有一栏「描述」,
   * 「语言能力」只有一栏「语言证书及成绩」。这类标签本身没有信息量,
   * 只有区块标题能区分它属于哪一类 —— 靠前后邻居猜必然出错。
   */
  const SECTION_DOMAIN = [
    [/教育背景|教育经历|学习经历|院校信息/, 'edu'],
    [/实习经历|工作经历|职业经历|实习与工作|工作信息/, 'work'],
    // OPPO 把竞赛与奖学金合并成一个列表,必须排在 comp 之前(否则「竞赛/获奖经历」被判成 comp)
    [/竞赛.{0,2}获奖|竞赛.{0,2}奖学金|获奖.{0,2}竞赛/, 'honor'],
    [/赛事|竞赛|比赛/, 'comp'],
    [/项目经验|项目经历|科研项目/, 'proj'],
    [/获奖经历|获奖情况|荣誉奖项|荣誉与奖项|奖励情况/, 'award'],
    [/论文|期刊|学术成果|发表情况/, 'paper'],

    // prog 必须排在 lang 之前:「编程语言能力」同时含「语言能力」
    [/编程语言/, 'prog'],
    [/语言能力|外语能力|语言水平/, 'lang'],
    [/自我描述|自我评价|个人描述|个人陈述/, 'self'],
    [/专利/, 'patent'],
    [/软件著作/, 'soft'],
  ];

  /* 这些区块里的字段一律不填 —— 它们要的是别人的信息,填成本人就是实打实的错误。
   * 排除词只能拦住标签里带「紧急」的字段;区块里若只写「姓名」「电话」就拦不住。 */
  const BLOCK_SECTION = /紧急联系人|亲属信息|担保人|监护人|推荐人信息|家庭成员/;

  /* 泛化标签 → 该域的规范字段。「描述」在获奖区块是 award.desc,在论文区块是 paper.desc。
   * 「类别 / 级别 / 等级」是三个不同维度:类别=竞赛还是奖学金,级别=国家级还是校级,
   * 等级=一等还是二等 —— 合并型表单(OPPO)三个都要,拆开型表单只用其中一两个。 */
  const GENERIC_ROLE = [
    [/^名称$|^标题$|^项目$/, 'name'],
    [/^描述$|^简介$|^说明$|^详情$|^内容$|^补充说明$/, 'desc'],
    [/^类别$|^类型$/, 'type'],
    [/^级别$/, 'level'],
    [/^成果$|^结果$|^等级$/, 'result'],
    [/^时间$|^日期$/, 'date'],
  ];
  // 各域对同一角色的实际字段名不同
  const ROLE_FIELD = {
    paper: { result: 'type' },
    edu: { result: 'rank' },
    honor: { type: 'category', result: 'grade' },
  };
  /* 表单把两个字段并成一栏时,由档案现有字段拼出来 */
  const COMPUTED = {
    'lang.certScore': (e) => [e.cert, e.score].filter(Boolean).join(' '),
  };

  const LIST_OF = {
    edu: 'education', work: 'work', proj: 'projects', paper: 'papers', comp: 'competitions',
    award: 'awards', lang: 'languages', prog: 'progLangs', patent: 'patents', soft: 'softwares',
    honor: 'honors',
  };
  // 表单只提供其中一栏时的互相兜底
  const FIELD_FALLBACK = { 'proj.duty': 'role', 'proj.role': 'duty' };
  const DOM_CN = {
    edu: '教育', work: '工作', proj: '项目', paper: '论文', comp: '竞赛',
    award: '奖项', lang: '外语', prog: '编程语言', patent: '专利', soft: '软件著作权',
    honor: '竞赛/获奖',
  };

  /* ---------- 采集标签候选文本(带权重,权重高者优先) ---------- */
  const ancestorText = (node) => {
    let t = '';
    try { t = clean(node.innerText || ''); } catch { /* 某些节点取 innerText 会抛错 */ }
    // 过长的祖先文本通常是整个经历区块(含多个字段标签),属于噪声
    return t.length > 40 ? '' : t;
  };

  /* 父容器的文字里,去掉「通往输入框的那一支」,剩下的通常就是标签。
   * <div>学校名称<div><span>某某大学</span><input/></div></div>
   * 往上第二层就能把「学校名称」摘出来;而整段 innerText 会把「值」一起裹进来,
   * 于是标签被读成了「某某大学」这种字段值。 */
  const siblingText = (parent, child) => {
    let t = '';
    for (const n of parent.childNodes) {
      if (n === child) continue;
      t += ' ' + (n.textContent || '');
      if (t.length > 200) break;
    }
    const c = clean(t);
    return c.length > 40 ? '' : c;
  };

  const labelCands = (el) => {
    const out = [];
    const push = (s, w) => { const t = clean(s); if (t && t.length <= 60) out.push({ t, w }); };
    try { if (el.labels) for (const l of el.labels) push(l.innerText, 5); } catch { }
    push(el.getAttribute('aria-label'), 5);
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const root = el.getRootNode();
      for (const id of lb.split(/\s+/)) {
        const n = root.getElementById ? root.getElementById(id) : document.getElementById(id);
        if (n) push(n.innerText, 5);
      }
    }
    push(el.placeholder, 4);
    /* 逐层向上找标签。每层取两种候选:
     *   ① 兄弟文本 = 父容器文字 减去「通往输入框的那一支」—— 这才是标签所在;
     *   ② 整个父容器文字 —— 兜底。
     * 只取整段祖先文字会踩坑:Moka 的下拉是 <span>某某大学</span><input 空/> 结构,
     * 拿到的是「值」而不是「标签」,真正的「学校名称」还在更上层。
     * 因此这里必须往上多走几层(antd 类组件通常嵌套 4~5 层)。 */
    let node = el;
    for (let d = 0; d < 6 && node; d++) {
      const parent = node.parentElement || (node.getRootNode && node.getRootNode().host) || null;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      const sib = siblingText(parent, node);
      if (sib) push(sib, 3.2 - d * 0.3);
      if (parent.tagName === 'FORM') break;
      const t = ancestorText(parent);
      if (t) push(t, 3 - d * 0.3);
      node = parent;
    }
    push(el.name, 2);
    push(el.id, 2);
    push(el.getAttribute('data-field') || el.getAttribute('data-name'), 2);
    return out.sort((a, b) => b.w - a.w);
  };

  /* ---------- 规则匹配 ----------
   * 自定义问答优先于内置规则:它是用户覆盖内置行为的唯一手段。
   * 内置规则内部按 RULES 顺序;任一候选文本命中排除词则整条规则作废。
   */
  const matchRules = (cands, customs) => {
    for (const c of cands) {
      for (const cu of customs || []) {
        const kws = String(cu.q || '').split(/[,,、;;]/).map((s) => clean(s)).filter(Boolean);
        if (kws.some((k) => c.t.includes(k))) return { custom: true, value: String(cu.a || '').trim(), label: c.t };
      }
    }
    // 排除词按全体候选文本判定:任一候选命中即整条规则作废
    const active = RULES.filter((r) => !(r.ex && cands.some((c) => r.ex.test(c.t))));
    // 候选权重优先于规则顺序 —— 字段自身的精确标签必须压过祖先容器的整块文本,
    // 否则区块内每个字段都会被块首的「学校名称/公司名称」锚点抢先命中。
    for (const c of cands) {
      for (const rule of active) {
        if (!rule.re.test(c.t)) continue;
        const [dom, field] = rule.k.includes('.') ? rule.k.split('.') : [null, rule.k];
        return { dom, field, anchor: !!rule.a, range: !!rule.r, ym: rule.ym || '', label: c.t };
      }
    }
    return null;
  };

  /* ---------- 档案取值 ---------- */
  const COMPOUND_SURNAMES = ['欧阳', '司马', '诸葛', '上官', '夏侯', '皇甫', '尉迟', '长孙', '慕容', '司徒', '宇文', '令狐', '轩辕', '东方', '独孤', '南宫', '西门', '第五', '端木', '闻人'];
  const cnSplit = (full) => {
    full = String(full || '').trim();
    if (!full) return { last: '', first: '' };
    if (!isCJK(full)) {
      const parts = full.split(/\s+/);
      return { last: parts.length > 1 ? parts[parts.length - 1] : '', first: parts[0] || '' };
    }
    for (const c of COMPOUND_SURNAMES) if (full.startsWith(c)) return { last: c, first: full.slice(c.length) };
    return { last: full.slice(0, 1), first: full.slice(1) };
  };

  /* 旧版单段档案 → 数组,保证历史备份可用 */
  const asList = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' && Object.keys(v).length ? [v] : []));

  /* 结构化数据可以渲染成整段文本喂给「论文发表情况」这类文本框,反之则不行。
   * 所以档案一律按结构化存储,遇到未拆结构的表单时再拼成文本。 */
  const join = (arr, fn) => (arr || []).map(fn).filter(Boolean).join('\n');
  const period = (x) => [x.startTime, x.endTime].filter(Boolean).join('–');

  const normalize = (P) => {
    const out = { ...P };
    out.education = asList(P.education).map((e) => ({ ...e, endTime: e.endTime || e.eduTime || '' }));
    out.work = asList(P.work).map((w) => ({ ...w, desc: w.desc || w.workDesc || '' }));
    out.projects = asList(P.projects);
    out.papers = asList(P.papers);
    out.competitions = asList(P.competitions);
    out.awards = asList(P.awards);
    /* OPPO 把竞赛与奖学金合并成一个列表,每条用「类别/级别/等级」三个维度描述。
     * 档案里这两类是分开存的,这里拼成一条流 —— 竞赛在前、荣誉在后,与表单顺序一致。
     *
     * 三个维度必须拆干净,不能把同一个值喂给两栏:
     *   类别 = 竞赛还是奖学金还是荣誉   (下拉选项:学科竞赛 / 奖学金 / 荣誉称号…)
     *   级别 = 国家级还是校级           (下拉选项:国家级 / 省级 / 校级…)
     *   等级 = 一等还是二等
     * 档案里的 type 常写成「校级奖学金」这种混合值 —— 级别词摘出来给「级别」,
     * 剩下的「奖学金」才是类别。type 只写了级别时才需要另想办法,见 pickCategory。 */
    const LEVEL_RE = /国家级|国际级|省部级|省级|市级|校级|院级/;
    const pickLevel = (e) => (String(e.type || '').match(LEVEL_RE)
      || String(e.result || '').match(LEVEL_RE) || [''])[0];

    /* 竞赛名称 → 类别。竞赛名本身就是强证据:「数学建模」确实属于学科竞赛,
     * 「互联网+」确实属于创业竞赛,这是知识不是猜测。只收录归属无争议的 ——
     * 像「挑战杯」那样大挑是课外学术科技、小挑是创业计划的,一律不收。 */
    const COMP_CATEGORY = [
      [/数学建模|数模|美赛|MCM|ICM/i, '学科竞赛'],
      [/ACM|ICPC|CCPC|程序设计|算法竞赛|编程竞赛|蓝桥|天池|kaggle/i, '学科竞赛'],
      [/数学竞赛|物理竞赛|化学竞赛|生物竞赛|力学竞赛|英语竞赛|翻译大赛/i, '学科竞赛'],
      [/电子设计|智能车|机器人|嵌入式|集成电路|芯片设计/i, '科技竞赛'],
      [/科技创新|发明创造|专利大赛/i, '科技竞赛'],
      [/互联网\+|创新创业|创业大赛|创业计划/i, '创业竞赛'],
      [/运动会|田径|篮球|足球|辩论|演讲|合唱|摄影|书法|文艺汇演/i, '文体竞赛'],
    ];

    /* 类别 = type 去掉级别词后剩下的部分。剩不下东西时分两种情况:
     *   奖学金 / 荣誉 —— 拿 kind 本身当类别,它就是选项表里的一项,精确命中;
     *   竞赛         —— 不能拿「竞赛」二字去撞。选项里「学科竞赛 / 科技竞赛 /
     *                   文体竞赛 / 创业竞赛」四个都含这两个字,子串匹配只会选中
     *                   排在最前面的那个,选中什么纯看页面怎么排 —— 那才是瞎猜。
     *                   改从竞赛名称查表;查不到就留空,报「档案中未填写」。 */
    const pickCategory = (e, kind) => {
      const rest = String(e.type || '')
        .replace(LEVEL_RE, '').replace(/^[\s/、·-]+|[\s/、·-]+$/g, '').trim();
      if (rest) return rest;
      if (kind !== '竞赛') return kind;
      const hit = COMP_CATEGORY.find(([re]) => re.test(String(e.name || '')));
      return hit ? hit[1] : '';
    };

    out.honors = [
      ...out.competitions.map((c) => ({
        kind: '竞赛', category: pickCategory(c, '竞赛'), name: c.name,
        date: c.date || c.startTime, level: pickLevel(c), grade: c.result, desc: c.desc,
      })),
      ...out.awards.map((a) => {
        const kind = /奖学金/.test(String(a.name) + String(a.type)) ? '奖学金' : '荣誉';
        return {
          kind, category: pickCategory(a, kind), name: a.name,
          date: a.date, level: pickLevel(a), grade: a.result, desc: a.desc,
        };
      }),
    ];
    out.languages = asList(P.languages);
    out.progLangs = asList(P.progLangs);
    out.patents = asList(P.patents);
    out.softwares = asList(P.softwares);

    // 文本兜底:老格式里这些字段本身就是字符串,直接沿用;新格式由结构化数据拼出
    out.publicationsText = typeof P.papers === 'string' ? P.papers
      : (typeof P.publications === 'string' ? P.publications
        : join(out.papers, (p) => [p.name, p.type, p.date, p.authorOrder].filter(Boolean).join(',')));
    out.awardsText = typeof P.awards === 'string' ? P.awards
      : join([...out.awards, ...out.competitions],
        (a) => [a.date || period(a), a.name, a.type, a.result].filter(Boolean).join(' '));
    out.languagesText = typeof P.languages === 'string' ? P.languages
      : join(out.languages, (l) => [l.name, l.cert, l.score].filter(Boolean).join(' '));
    return out;
  };

  /* 「本科院校」「硕士学位」这类带学历限定的标签,直接按学历定位到对应那段教育经历 */
  const DEG_LV = (t) => (/博士|phd|doctor/i.test(t) ? 4 : /硕士|研究生|master|msc/i.test(t) ? 3
    : /本科|学士|bachelor|bsc|第一学历|前置学历/i.test(t) ? 2 : /大专|专科|associate|diploma/i.test(t) ? 1 : 0);

  const scopedEduIdx = (list, labelText) => {
    const lv = DEG_LV(labelText);
    if (!lv) return -1;
    return list.findIndex((e) => DEG_LV(String(e.degree || '')) === lv);
  };

  const basicValue = (key, labelText, P) => {
    const b = P.basic || {}, L = P.links || {};
    const e0 = (P.education || [])[0] || {};
    const w0 = (P.work || [])[0] || {};
    const cjk = isCJK(labelText);
    const sp = cnSplit(b.fullName);
    const pinyin = b.namePinyin || [b.lastNameEn, b.firstNameEn].filter(Boolean).join(' ');
    const map = {
      fullName: b.fullName, namePinyin: pinyin,
      lastName: cjk ? sp.last : (b.lastNameEn || sp.last),
      firstName: cjk ? sp.first : (b.firstNameEn || sp.first),
      email: b.email, phone: b.phone, wechat: b.wechat, idNumber: b.idNumber,
      gender: b.gender, birthday: b.birthday, politicalStatus: b.politicalStatus,
      ethnicity: b.ethnicity, hometown: b.hometown, hobbies: b.hobbies,
      nationality: b.nationality, birthCountry: b.birthCountry,
      otherNationality: b.otherNationality, prCountry: b.prCountry,
      city: b.city, expectedCity: b.expectedCity, expectedCity2: b.expectedCity2,
      expectedSalary: b.expectedSalary, yearsExp: b.yearsExp, availableDate: b.availableDate,
      gradYear: b.gradYear || String(e0.endTime || '').slice(0, 4),
      highestSchoolCity: b.highestSchoolCity || e0.city,
      lastMajor: b.lastMajor || e0.major,
      publications: P.publicationsText, awards: P.awardsText, languages: P.languagesText,
      skills: P.skills, campusWork: P.campusWork,
      github: L.github, linkedin: L.linkedin, homepage: L.homepage,
      intro: P.intro,
      // 基本信息区出现的「学历 / 毕业时间 / 公司 / 职位」指向最高学历与最近一段经历
      degree: e0.degree, endTime: e0.endTime, company: w0.company, title: w0.title,
    };
    return String(map[key] ?? '').trim();
  };

  /* ---------- 写值:原生 setter + 事件,兼容受控组件 ---------- */
  const setNative = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const mark = (el) => {
    const old = el.style.boxShadow;
    el.style.boxShadow = '0 0 0 2px rgba(22,163,74,.55)';
    setTimeout(() => { el.style.boxShadow = old; }, 3000);
  };

  /* 日期适配:档案存 YYYY-MM(-DD),按控件类型补齐;无法解析(如「至今」)返回 null 由调用方跳过 */
  const adaptDate = (el, v) => {
    const m = String(v).match(/^(\d{4})[-/.年]?(\d{1,2})?[-/.月]?(\d{1,2})?/);
    if (!m) return null;
    const p2 = (x, f) => (x ? x.padStart(2, '0') : f);
    if (el.type === 'date') return `${m[1]}-${p2(m[2], '01')}-${p2(m[3], '01')}`;
    return `${m[1]}-${p2(m[2], '06')}`;
  };

  /* ---------- 下拉 / 单选:先按语义分类(性别、学历),再做文本模糊匹配 ---------- */
  const GENDER = (t) => (/女|female|^f$/i.test(t) ? 'F' : /男|male|^m$/i.test(t) ? 'M' : '');

  const fillSelect = (el, key, v) => {
    const opts = Array.from(el.options || []);
    let target = null;
    if (key === 'gender') {
      const g = GENDER(v);
      if (g) target = opts.find((o) => GENDER((o.textContent || '') + ' ' + o.value) === g);
    } else if (key === 'degree') {
      const dv = DEG_LV(v);
      if (dv) target = opts.find((o) => DEG_LV(o.textContent || '') === dv);
    }
    if (!target) {
      const nv = v.toLowerCase();
      target = opts.find((o) => (o.textContent || '').trim().toLowerCase() === nv)
        || opts.find((o) => {
          const t = (o.textContent || '').trim().toLowerCase();
          return t && o.value !== '' && (t.includes(nv) || nv.includes(t));
        });
    }
    if (!target) return null;
    setNative(el, target.value);
    return (target.textContent || target.value || '').trim();
  };

  const radioText = (r) => {
    let t = '';
    try { if (r.labels && r.labels[0]) t = r.labels[0].innerText; } catch { }
    if (!t && r.parentElement) t = (r.parentElement.innerText || '').slice(0, 20);
    if (!t) t = r.value || '';
    return clean(t);
  };

  const fillRadio = (el, key, v, doneGroups) => {
    const gid = (el.name || 'anon') + '|' + key;
    if (doneGroups.has(gid)) return 'dup';
    doneGroups.add(gid);
    const root = el.getRootNode();
    const group = el.name
      ? Array.from(root.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`))
      : [el];
    /* 这一组已经选过了就别动 —— 哪怕选的和档案不一致,那也是用户自己的选择,
     * 或是网站解析简历后预填的。和文本框「已有内容不覆盖」是同一条规矩。 */
    if (group.some((r) => r.checked)) return 'kept';
    let target = null;
    if (key === 'gender') {
      const g = GENDER(v);
      if (g) target = group.find((r) => GENDER(radioText(r)) === g);
    } else if (key === 'degree') {
      const dv = DEG_LV(v);
      if (dv) target = group.find((r) => DEG_LV(radioText(r)) === dv);
    }
    if (!target) {
      const nv = v.toLowerCase();
      target = group.find((r) => { const t = radioText(r); return t && (t === nv || t.includes(nv) || nv.includes(t)); });
    }
    if (!target) return false;
    if (!target.checked) target.click();
    mark(target);
    return true;
  };

  /* ---------- 简历附件:排除头像/图片类,择一注入 ---------- */
  const b64ToFile = (rf) => {
    const bin = atob(rf.dataBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], rf.name || 'resume.pdf', { type: rf.type || 'application/pdf' });
  };

  const pickFileTarget = (fileEls) => {
    const info = fileEls.map((el) => ({
      el,
      text: labelCands(el).map((c) => c.t).join(' '),
      accept: (el.accept || '').toLowerCase(),
    }));
    const bad = /头像|照片|证件照|头图|logo|avatar|photo|图片|picture/;
    const imgOnly = (a) => a && /image|png|jpe?g|gif/.test(a) && !/pdf|doc/.test(a);
    const ok = info.filter((i) => !bad.test(i.text) && !imgOnly(i.accept));
    const prefer = ok.find((i) => /简历|resume|\bcv\b|附件|attachment|上传文件|upload/.test(i.text));
    const chosen = prefer || (ok.length === 1 ? ok[0] : null);
    return chosen ? { el: chosen.el, label: chosen.text.slice(0, 30) || '文件上传' } : null;
  };

  const fillFile = (el, rf) => {
    try {
      const dt = new DataTransfer();
      dt.items.add(b64ToFile(rf));
      el.files = dt.files;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch { return false; }
  };

  /* ---------- 自动展开可重复经历区块 ----------
   * 你有 3 篇论文,表单默认只给 1 块,必须先点两次「+ 添加」才有框可填。
   * 这是插件唯一一处主动改变页面结构的操作,所以约束比别处都严:
   *   1) 只点文字明确是「添加/新增/+」的元素,任何含提交/保存/删除字样的一律排除;
   *   2) 每点一次都校验该域的区块数确实增加了,没增加就立刻停手,绝不连点;
   *   3) 每域最多补 6 段,且只在「页面上已存在该域字段」时才动 —— 页面没有论文区
   *      就不会凭空去找按钮。
   */
  const ADD_TEXT = /^[+＋]?\s*(添加|新增|增加|继续添加|add)/i;
  const ADD_BAD = /提交|保存|确认|删除|移除|清空|上传|下载|重置|submit|save|delete|remove|upload|reset/i;
  const ADD_DOMAIN = [
    [/教育|学历|学校|院校|education/i, 'edu'],
    [/工作|实习|职业|employment|work/i, 'work'],
    [/项目|project/i, 'proj'],
    [/论文|学术|著作|成果|paper|publication/i, 'paper'],
    [/竞赛|比赛|competition/i, 'comp'],
    [/奖项|荣誉|获奖|奖学金|award|honor/i, 'award'],
    [/专利|patent/i, 'patent'],
    [/软件著作|软著|software/i, 'soft'],
    [/外语|语言|language/i, 'lang'],
    [/编程语言|programming/i, 'prog'],
  ];

  const findAddButtons = () => {
    const sel = 'button, a, [role="button"], [class*="add" i], [class*="plus" i]';
    const cand = [];
    for (const el of document.querySelectorAll(sel)) {
      const t = clean(el.textContent || el.getAttribute('aria-label') || '');
      if (!t || t.length > 16) continue;      // 过长的多半是段落而非按钮
      if (ADD_BAD.test(t)) continue;
      if (!ADD_TEXT.test(t) && t !== '+' && t !== '＋') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      cand.push({ el, text: t });
    }
    // 嵌套时保留最内层 —— 那才是真正可点的那个
    return cand.filter((b) => !cand.some((o) => o !== b && b.el.contains(o.el)));
  };

  /** 页面上某个域现有几段:数锚点;没有锚点但有该域字段则算 1 段 */
  const countBlocks = (items, dom) => {
    let anchors = 0, any = false;
    for (const it of items) {
      const h = it.hit;
      if (!h || h.dom !== dom) continue;
      any = true;
      if (h.anchor) anchors++;
    }
    return anchors || (any ? 1 : 0);
  };

  /** 找该域对应的「+ 添加」:先看按钮文字,再退回「紧跟在该域最后一个字段之后」 */
  const pickAddButton = (buttons, items, dom) => {
    const named = buttons.find((b) => {
      const hit = ADD_DOMAIN.find(([re]) => re.test(b.text));
      return hit && hit[1] === dom;
    });
    if (named) return named;
    // 文字里没写明是哪一类(只写「添加」或「+」)—— 取该域最后一个字段之后最近的那个,
    // 且中间不能夹着别的域的字段,否则说明按钮属于另一个区块
    let lastEl = null;
    for (const it of items) if (it.hit && it.hit.dom === dom) lastEl = it.el;
    if (!lastEl) return null;
    const generic = buttons.filter((b) => !ADD_DOMAIN.some(([re]) => re.test(b.text)));
    let best = null, bestPos = Infinity;
    for (const b of generic) {
      const p = lastEl.compareDocumentPosition(b.el);
      if (!(p & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const between = items.filter((it) => it.hit && it.hit.dom && it.hit.dom !== dom && it.hit.dom !== '*'
        && (lastEl.compareDocumentPosition(it.el) & Node.DOCUMENT_POSITION_FOLLOWING)
        && (it.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING)).length;
      if (between > 0) continue;
      if (between < bestPos) { best = b; bestPos = between; }
    }
    return best;
  };

  const expandBlocks = async (P, items, collectItems, report) => {
    const expanded = [];
    for (const dom of Object.keys(LIST_OF)) {
      const need = (P[LIST_OF[dom]] || []).length;
      let have = countBlocks(items, dom);
      if (!have || need <= have) continue;   // 页面上没有这个域,或已经够用
      let added = 0;
      while (have < need && added < 6) {
        ui.step(`展开「${DOM_CN[dom] || dom}」区块 ${have + 1}/${need}…`, 0.05 + 0.08 * (added / 6));
        // 每轮重新找按钮:组件重渲染后旧引用可能已经失效
        const btn = pickAddButton(findAddButtons(), items, dom);
        if (!btn) break;
        realClick(btn.el);
        const grown = await waitUntil(() => {
          const next = collectItems(false);
          return countBlocks(next, dom) > have ? next : null;
        }, 900);
        if (!grown) break;                   // 点了没长出新区块 —— 立刻停手
        items = grown;
        have = countBlocks(items, dom);
        added++;
      }
      if (added) expanded.push(`${DOM_CN[dom]}+${added}`);
      else if (have < need) {
        report.skipped.push({
          label: `${DOM_CN[dom]}经历`,
          reason: `档案有 ${need} 段但页面只有 ${have} 段,未找到可用的「+ 添加」,请手动点开`,
        });
      }
    }
    if (expanded.length) report.expanded = expanded;
    return items;
  };

  /* ---------- 区块标题扫描 ----------
   * 收集页面上像「区块标题」的元素及其对应的经历域,按 DOM 顺序排好,
   * 之后任一字段都能查到「我落在哪个区块里」。
   */
  const HEADING_SEL = 'h1,h2,h3,h4,h5,h6,legend,'
    + '[class*="title" i],[class*="header" i],[class*="section" i],[class*="subtitle" i]';

  const scanSections = () => {
    const out = [];
    for (const el of document.querySelectorAll(HEADING_SEL)) {
      const t = clean(el.textContent || '');
      /* 长度上限按可信度分级:真正的标题标签(h1~h6/legend)语义明确,
       * 允许带括号说明(「实习经历(第一段在职…)」);仅靠 class 名匹配上的
       * 放宽了容易把整段说明文字误当标题。 */
      const isRealHeading = /^(H[1-6]|LEGEND)$/.test(el.tagName);
      if (!t || t.length > (isRealHeading ? 40 : 20)) continue;
      if (BLOCK_SECTION.test(t)) { out.push({ el, dom: 'blocked', text: t }); continue; }
      const hit = SECTION_DOMAIN.find(([re]) => re.test(t));
      if (!hit) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 && r.height < 2) continue;
      out.push({ el, dom: hit[1], text: t });
    }
    return out;
  };

  /** 某元素落在哪个区块下:取 DOM 顺序上最近的一个前置标题 */
  const sectionDomOf = (el, sections) => {
    let dom = null;
    for (const s of sections) {
      // 标题在该元素之前 → 候选;继续往后找更近的
      if (s.el.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) dom = s.dom;
      else break;
    }
    return dom;
  };

  /* ---------- 可见性与元素收集(穿透 open shadow DOM) ---------- */
  const visible = (el) => {
    if (el.disabled || el.readOnly) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };

  /* ---------- 页面内进度条 ----------
   * 进度显示在页面上而不是弹窗里:弹窗一点页面就关,而用户的视线本来就在表单上。
   * 纯 DOM 实现,不引入任何浏览器扩展 API —— 引擎的可移植性靠这一点。
   */
  const UI_ID = '__rqf_progress__';

  const ui = {
    box: null, bar: null, txt: null, timer: 0,

    mount() {
      this.destroy();
      const box = document.createElement('div');
      box.id = UI_ID;
      // pointer-events:none —— 绝不挡住用户点击页面
      box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;pointer-events:none;'
        + 'background:rgba(24,24,27,.94);color:#fff;border-radius:12px;padding:10px 14px;'
        + 'font:13px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;'
        + 'box-shadow:0 6px 24px rgba(0,0,0,.25);min-width:212px;max-width:320px';
      box.innerHTML = '<div data-t style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>'
        + '<div style="margin-top:7px;height:3px;border-radius:2px;background:rgba(255,255,255,.2)">'
        + '<div data-b style="height:100%;width:3%;border-radius:2px;background:#4ade80;transition:width .15s"></div></div>';
      document.body.appendChild(box);
      this.box = box;
      this.txt = box.querySelector('[data-t]');
      this.bar = box.querySelector('[data-b]');
    },

    /** frac 为 0~1 的整体进度;省略则只换文字 */
    step(text, frac) {
      if (!this.txt) return;
      this.txt.textContent = text;
      if (typeof frac === 'number') {
        this.bar.style.width = `${Math.max(3, Math.min(100, Math.round(frac * 100)))}%`;
      }
    },

    finish(text) {
      if (!this.box) return;
      clearTimeout(this.timer);   // 连续两次收尾时,别让上一次的定时器提前把条子撤掉
      this.bar.style.width = '100%';
      this.bar.style.background = '#60a5fa';
      this.txt.textContent = text;
      this.timer = setTimeout(() => this.destroy(), 5000);
    },

    destroy() {
      clearTimeout(this.timer);
      const old = document.getElementById(UI_ID);
      if (old) old.remove();
      this.box = this.bar = this.txt = null;
    },
  };

  /* 让浏览器有机会重绘 —— 同步循环里不 yield 的话进度条一格都不会动。
   *
   * 标签页不可见时直接跳过:那时既没人在看进度,rAF 也压根不触发,
   * 而 setTimeout 会被浏览器钳到 1 秒一次 —— 白等一轮反而真把填充拖慢了。
   * 进度文字仍会照常写进 DOM,只是不专门等重绘。 */
  const paint = () => {
    if (document.visibilityState !== 'visible') return Promise.resolve();
    return new Promise((r) => {
      let done = false;
      const fin = () => { if (!done) { done = true; r(); } };
      requestAnimationFrame(fin);
      setTimeout(fin, 60);   // rAF 偶尔不触发时的兜底
    });
  };

  const collect = (root, out) => {
    for (const el of root.querySelectorAll('input, textarea, select')) out.push(el);
    for (const n of root.querySelectorAll('*') ) if (n.shadowRoot) collect(n.shadowRoot, out);
    return out;
  };

  const TEXTLIKE = new Set(['text', 'email', 'tel', 'url', 'number', 'date', 'month', 'week', 'time', 'search']);

  /* ---------- 主流程 ----------
   * 异步:自定义下拉需要点开、等选项层渲染、再点中,无法同步完成。 */
  const runFill = async (rawProfile, resumeFile) => {
    const P = normalize(rawProfile);
    const report = { url: location.href, filled: [], skipped: [], unmatched: [], fileFilled: false, fileLabel: '' };
    const doneGroups = new Set();
    const fileEls = [];
    const customs = P.custom || [];

    /* 经历区块上下文:按 DOM 顺序推进。
     * 同一域内锚点字段(学校/公司/项目名称)重复出现 → 进入下一段经历。 */
    const ctx = { domain: null, idx: {}, used: {}, taken: new Set() };
    for (const d of Object.keys(LIST_OF)) { ctx.idx[d] = 0; ctx.used[d] = new Set(); }

    /* 第一趟:先算出每个字段的匹配结果 —— 通配字段(「起止时间」)需要看前后文才能定归属。
     * 抽成函数是因为「自动展开区块」每点一次 + 号都要重新扫一遍页面。 */
    const sections = scanSections();
    const collectItems = (collectFiles) => {
      const out = [];
      // 自定义组件(antd 等)优先:它内部的 input 只是搜索框,直接写值失焦即丢
      const ws = outerWidgets();
      for (const el of collect(document, [])) {
        const tag = el.tagName;
        const type = (el.type || '').toLowerCase();
        if (tag === 'INPUT' && ['submit', 'button', 'reset', 'image', 'password', 'hidden'].includes(type)) continue;
        if (type === 'file') { if (collectFiles) fileEls.push(el); continue; }
        if (type === 'checkbox') continue; // 协议勾选等一律留给用户
        if (!visible(el)) continue;
        // 被自定义组件包住的原生输入框交给组件本身处理,避免往搜索框里打字
        if (ws.some((w) => w.contains(el))) continue;
        const cands = labelCands(el);
        out.push({ el, tag, type, cands, hit: matchRules(cands, customs), sec: sectionDomOf(el, sections) });
      }
      for (const el of ws) {
        const cands = widgetCands(el);
        out.push({ el, tag: 'WIDGET', type: widgetKind(el), cands,
          hit: matchRules(cands, customs), sec: sectionDomOf(el, sections) });
      }
      // 两类元素混在一起,必须还原成页面上的先后顺序,否则区块计数会乱
      out.sort((a, b) => {
        const p = a.el.compareDocumentPosition(b.el);
        if (p & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (p & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });
      return out;
    };

    ui.mount();
    ui.step('正在识别页面字段…', 0.03);
    await paint();   // 让第一帧先画出来,否则同步扫描期间用户看不到任何反馈

    let items = collectItems(true);
    // 档案段数多于页面区块数时,先把「+ 添加」点出来
    items = await expandBlocks(P, items, collectItems, report);

    /* 通配字段(「起止时间」「描述」)的归属判定。
     * 两种真实布局需要同时成立:
     *   中兴 —— 「起止时间」在区块开头,排在「公司名称」之前,只看上文会误判成上一区块;
     *   Moka —— 「开始/结束时间」在区块末尾,紧跟着下一区块的「公司名称」。
     * 判据:上一区块的该字段若已经填过,说明它已经满了,当前字段属于下一区块;
     * 否则按前后距离就近归属(同为通配的配对字段不计距离)。 */
    const exhausted = (dom, hit) => {
      const used = ctx.used[dom];
      // 年/月 与 起止区间各自记在不同的状态位上,判「本段是否已满」要分别看
      if (hit.ym) return used.has('ymStart') && used.has('ymEnd');
      if (hit.range) return used.has('startTime') && used.has('endTime');
      return ctx.taken.has(`${dom}#${ctx.idx[dom]}#${hit.field}`);
    };

    const ambiguousDom = (i, hit) => {
      /* 区块标题是最可靠的信号 —— 大疆「获奖经历」整块只有一栏「描述」,
       * 邻居里根本没有 award 字段可依,只有标题能定性。 */
      if (items[i].sec) return items[i].sec;
      let prev = null, pd = Infinity, next = null, nd = Infinity;
      for (let j = i - 1, d = 0; j >= 0; j--) {
        const h = items[j].hit;
        if (h && h.dom === '*') continue;
        d++;
        if (h && h.dom) { prev = h.dom; pd = d; break; }
      }
      for (let j = i + 1, d = 0; j < items.length; j++) {
        const h = items[j].hit;
        if (h && h.dom === '*') continue;
        d++;
        if (h && h.dom) { next = h.dom; nd = d; break; }
      }
      if (!prev || !next) return next || prev || null;
      if (exhausted(prev, hit)) return next;
      return nd < pd ? next : prev;
    };

    /* 规则域与区块标题冲突时,信区块标题。
     *
     * OPPO 把竞赛和奖学金合并成一个区块,里面的字段叫「获奖时间」「获奖类别」——
     * 这些词单看会命中 award.* 规则,可它们明明落在「竞赛/获奖经历」区块里,
     * 该取合并流 honors 而不是 awards。取错列表,整块的段号和取值都会跟着错位:
     * 名称来自 honors 第 1 段,时间却来自 awards 第 1 段,凑成一条不存在的经历。
     *
     * 反过来在大疆那种拆开的表单上,「竞赛/获奖名称」落在「获奖经历」区块里,
     * 同样会被改判成 award —— 这正是想要的。
     *
     * 两道闸门防误伤:两边都得是经历列表域,且目标列表确实有这个字段。 */
    const retarget = (dom, field, sec) => {
      if (!sec || sec === dom || !LIST_OF[sec] || !LIST_OF[dom]) return dom;
      const sample = (P[LIST_OF[sec]] || [])[0];
      return (sample && field in sample) ? sec : dom;
    };

    /* 泛化标签兜底:标签只有「名称」「描述」「成果」这种词时,规则表认不出来,
     * 但只要知道它落在哪个区块,角色就确定了 —— 大疆的论文区就是这种写法。 */
    const genericHit = (it) => {
      if (!it.sec || !it.cands.length) return null;
      for (const c of it.cands) {
        // 泛化角色的前提是「标签只是一个孤零零的词」,整块文字不算
        if (c.t.length > 8) continue;
        const role = GENERIC_ROLE.find(([re]) => re.test(c.t));
        if (!role) continue;
        // 「自我描述」区块不是经历列表,它的描述位就是自我介绍
        if (it.sec === 'self') return role[1] === 'desc' ? { field: 'intro', label: c.t } : null;
        const field = (ROLE_FIELD[it.sec] || {})[role[1]] || role[1];
        // 该域确实有这个字段才认,免得凭空造出 lang.result 这种东西
        const sample = (P[LIST_OF[it.sec]] || [])[0];
        if (!sample || !(field in sample)) continue;
        // name 是各域的锚点,不标记的话第二块会重复填第一块的内容
        return { dom: it.sec, field, anchor: field === 'name', label: c.t };
      }
      return null;
    };

    /* 第二趟:按 DOM 顺序推进区块状态并写入 */
    const shortLabel = (s) => {
      const t = String(s || '').trim();
      return t.length > 14 ? `${t.slice(0, 14)}…` : t;
    };
    for (let idx = 0; idx < items.length; idx++) {
      const { el, tag, type, cands } = items[idx];
      /* 进度按 DOM 顺序推进(识别 3% → 展开 13% → 填充 93% → 附件 100%)。
       * 每隔几个字段 yield 一次:这段循环大部分是同步的,不交还控制权的话
       * 进度条到最后才一次性跳到头,和「卡住」看起来没区别。 */
      const frac = 0.15 + 0.78 * (idx / Math.max(1, items.length));
      if (idx % 8 === 0) { ui.step(`正在填充 ${idx + 1}/${items.length}…`, frac); await paint(); }
      /* 泛化角色来自「最近的那个标签」,比通配规则命中的整块文字可信 ——
       * 大疆论文区一块里有「名称/描述/成果」三行,祖先文本把三个词都裹进候选,
       * 于是「名称」也会被 *.desc 命中。 */
      const g = genericHit(items[idx]);
      const rh = items[idx].hit;
      /* 规则是在一段「整块摘要」文字里命中的,而泛化角色是短标签上的完全匹配 ——
       * 后者是强得多的证据。区块里每栏标签都很短时(OPPO 的「类别」「级别」「等级」),
       * 兄弟文本恰好退化成「本块其它所有标签」的拼接,里面随便一个词
       * (比如「获奖时间」)就能让整块六个字段全部命中同一条规则、全填成日期。 */
      const ruleOnBlob = rh && rh.label && rh.label.length > 8;
      const hit = (g && (!rh || rh.dom === '*' || ruleOnBlob)) ? g : (rh || g);
      if (!hit) {
        if (cands.length && cands[0].w >= 3 && (tag === 'TEXTAREA' || tag === 'SELECT' || TEXTLIKE.has(type) || type === 'radio')) {
          report.unmatched.push({ label: cands[0].t.slice(0, 30) });
        }
        continue;
      }

      ui.step(`正在填充 ${idx + 1}/${items.length} · ${shortLabel(hit.label)}`, frac);

      // 「紧急联系人」这类区块要的是别人的信息,整段不碰
      if (items[idx].sec === 'blocked') {
        report.skipped.push({ label: hit.label, reason: '属于紧急联系人/亲属区块,不自动填写' });
        continue;
      }

      /* --- 取值:自定义问答 / 经历类 / 基本信息 --- */
      let v, semKey = hit.field || '';
      if (hit.custom) {
        v = hit.value;
      } else if (hit.dom) {
        const dom = hit.dom === '*' ? (ambiguousDom(idx, hit) || ctx.domain)
          : retarget(hit.dom, hit.field, items[idx].sec);
        if (!dom) continue; // 通篇没有任何经历区块字段,无从判断归属
        // 「自我描述」是区块标题但不是经历列表 —— 它下面的描述位就是自我介绍
        if (!LIST_OF[dom]) {
          semKey = 'intro';
          v = basicValue('intro', hit.label, P);
        } else {
        const list = P[LIST_OF[dom]] || [];
        let field = hit.field;
        // 「本科院校」这类带学历限定的标签直接按学历定位,不参与区块计数
        let i = dom === 'edu' ? scopedEduIdx(list, hit.label) : -1;
        if (i < 0) {
          ctx.domain = dom;
          /* 分段判定:只有锚点(学校/公司/论文名称…)与时间区间参与计数 ——
           * 本段内已出现过的字段再次出现,即代表进入下一段。
           * 非锚点字段不参与,否则基本信息区的「学历」等重复标签会把段号带偏。
           * 计数必须同时认锚点和时间区间:中兴表单的「就读时间」排在「学校名称」之前,
           * 只认锚点会让第二段的起止时间取到第一段的值。 */
          const used = ctx.used[dom];
          if (hit.ym) {
            /* 「年」「月」四个框依次对应 起始年 → 起始月 → 结束年 → 结束月。
             * 见到「年」就推进一格,「月」跟随当前那一格;
             * 第三个「年」出现时说明已进入结束时间。 */
            if (hit.ym === 'y') {
              if (used.has('ymStart')) {
                if (used.has('ymEnd')) { ctx.idx[dom]++; used.clear(); used.add('ymStart'); }
                else used.add('ymEnd');
              } else used.add('ymStart');
            }
            field = used.has('ymEnd') ? 'endTime' : 'startTime';
          } else if (hit.range) {
            // 「就读时间 [___]-[___]」共用一个标签的两个输入框:先起后止
            if (!used.has('startTime')) field = 'startTime';
            else if (!used.has('endTime')) field = 'endTime';
            else { ctx.idx[dom]++; used.clear(); field = 'startTime'; }
            used.add(field);
          } else if (hit.anchor) {
            if (used.has(field)) { ctx.idx[dom]++; used.clear(); }
            used.add(field);
          }
          i = ctx.idx[dom];
        }
        const entry = list[i];
        if (!entry) {
          report.skipped.push({ label: hit.label, reason: `档案中没有第 ${i + 1} 段${DOM_CN[dom] || ''}经历` });
          continue;
        }
        semKey = field;
        ctx.taken.add(`${dom}#${i}#${field}`);
        v = String(entry[field] ?? '').trim();
        // 百度把「项目职务」和「项目职责」拆开,中兴只有一个「项目中职责」——
        // 表单只给一栏时,用另一个字段兜底,免得该栏空着
        if (!v && FIELD_FALLBACK[`${dom}.${field}`]) {
          v = String(entry[FIELD_FALLBACK[`${dom}.${field}`]] ?? '').trim();
        }
        if (!v && COMPUTED[`${dom}.${field}`]) v = String(COMPUTED[`${dom}.${field}`](entry) || '').trim();
        if (hit.ym && v) {
          // 档案存 YYYY-MM,拆给「年」「月」两个框;月份不补前导零(Moka 显示为 9 而非 09)
          const m = v.match(/^(\d{4})[-/.年]?(\d{1,2})?/);
          v = m ? (hit.ym === 'y' ? m[1] : String(Number(m[2] || 0) || '')) : '';
          if (!v) { report.skipped.push({ label: hit.label, reason: `「${entry[field]}」无法拆成年/月` }); continue; }
        }
        }
      } else {
        v = basicValue(hit.field, hit.label, P);
      }
      if (!v) { report.skipped.push({ label: hit.label, reason: '档案中未填写' }); continue; }

      /* --- 写入 --- */
      if (tag === 'WIDGET') {
        const kind = widgetKind(el);
        // 展开浮层 → 等渲染 → 点选,是整个流程里最慢的一步,单独报一下
        ui.step(`正在选择「${shortLabel(hit.label)}」…`, frac);
        await paint();
        /* 级联要走到叶子,而同名的普通文本框只需「上海」。
         * 所以档案里可另存一份 <字段>Path(如 cityPath = 上海/上海市),仅级联控件使用。 */
        const pathV = (kind === '自定义级联' && P.basic && P.basic[`${semKey}Path`]) || v;
        const r = kind === '自定义下拉' ? await fillWidget(el, semKey, v)
          : kind === '自定义日期' ? await fillDatePicker(el, v)
            : kind === '自定义级联' ? await fillCascader(el, pathV)
              : { ok: false, reason: `${kind}需要手动操作` };
        if (r.ok) { mark(el); report.filled.push({ label: hit.label, value: r.value }); }
        else report.skipped.push({ label: hit.label, reason: r.reason });
        continue;
      }
      if (type === 'radio') {
        const r = fillRadio(el, semKey, v, doneGroups);
        if (r === true) report.filled.push({ label: hit.label, value: v });
        else if (r === 'kept') report.skipped.push({ label: hit.label, reason: '已有选择,未覆盖' });
        else if (r === false) report.skipped.push({ label: hit.label, reason: '选项未匹配' });
        continue;
      }
      if (tag === 'SELECT') {
        if (el.value && el.selectedIndex > 0) { report.skipped.push({ label: hit.label, reason: '已有选择,未覆盖' }); continue; }
        const picked = fillSelect(el, semKey, v);
        if (picked !== null) { mark(el); report.filled.push({ label: hit.label, value: picked }); }
        else report.skipped.push({ label: hit.label, reason: '选项未匹配' });
        continue;
      }
      if (tag !== 'TEXTAREA' && !TEXTLIKE.has(type)) continue;

      if (el.value && el.value.trim()) {
        if (el.value.trim() === v) report.filled.push({ label: hit.label, value: v });
        else report.skipped.push({ label: hit.label, reason: '已有内容,未覆盖' });
        continue;
      }
      let out = v;
      if (type === 'date' || type === 'month') {
        out = adaptDate(el, v);
        // 「至今」这类非日期值写进日期框会被浏览器静默丢弃,不如显式跳过
        if (out === null) { report.skipped.push({ label: hit.label, reason: `「${v}」不是日期,日期框已跳过` }); continue; }
      }
      if (type === 'number') {
        const num = v.match(/[\d.]+/);
        if (!num) { report.skipped.push({ label: hit.label, reason: '值非数字,数字框已跳过' }); continue; }
        out = num[0];
      }
      if (el.maxLength && el.maxLength > 0 && out.length > el.maxLength) out = out.slice(0, el.maxLength);
      setNative(el, out);
      mark(el);
      report.filled.push({ label: hit.label, value: String(out).slice(0, 60) });
    }

    if (fileEls.length) {
      ui.step('正在注入简历附件…', 0.95);
      if (resumeFile && resumeFile.dataBase64) {
        const t = pickFileTarget(fileEls);
        /* 已经传过附件就不换 —— 用户很可能上传了针对这家公司改过的版本,
         * 或者网站解析过的那一份。悄悄替换成插件里存的旧简历是最坏的一种错。 */
        if (t && t.el.files && t.el.files.length) {
          report.skipped.push({ label: t.label, reason: `已上传「${t.el.files[0].name}」,未覆盖` });
        } else if (t && fillFile(t.el, resumeFile)) {
          report.fileFilled = true;
          report.fileLabel = t.label;
          mark(t.el);
        } else if (!t) {
          report.skipped.push({ label: '简历附件', reason: '存在多个上传入口,无法确定目标,请手动上传' });
        }
      } else {
        report.skipped.push({ label: '简历附件', reason: '插件中未保存简历文件' });
      }
    }
    report.unmatched = [...new Map(report.unmatched.map((x) => [x.label, x])).values()].slice(0, 30);

    const nf = report.filled.length + (report.fileFilled ? 1 : 0);
    const ns = report.skipped.length;
    ui.finish(nf
      ? `✅ 已填 ${nf} 项${ns ? ` · 跳过 ${ns} 项` : ''},请自行核对后提交`
      : '未填充任何字段 —— 点插件图标看原因');
    return report;
  };

  /* 出错时也要把进度条收掉:否则页面上会永远挂着一条「正在填充…」,
   * 那比没有进度条更让人以为卡死了。 */
  const fill = async (rawProfile, resumeFile) => {
    try {
      return await runFill(rawProfile, resumeFile);
    } catch (e) {
      ui.finish(`⚠️ 填充出错:${String((e && e.message) || e).slice(0, 40)}`);
      throw e;
    }
  };

  /* ---------- 自定义控件探测 ----------
   * Moka、北森等 ATS 的下拉框/日期选择/城市级联是 React 组件而非原生 <select>,
   * 内部往往只有一个 readonly input(会被 visible() 判掉)。
   * 填充引擎无法安全操作它们,但诊断时必须让它们现形 —— 否则「为什么没填上」无从查起。
   */
  const CUSTOM_WIDGET_SEL = [
    '[role="combobox"]', '[role="listbox"]', '[role="radiogroup"]', '[role="switch"]', '[role="spinbutton"]',
    '[contenteditable="true"]', '[contenteditable=""]',
    '.ant-select', '.ant-picker', '.ant-cascader', '.ant-radio-group', '.ant-checkbox-group',
    '.el-select', '.el-cascader', '.el-date-editor', '.el-radio-group',
    '.arco-select', '.arco-picker', '.semi-select', '.semi-datepicker',
  ].join(',');

  const widgetKind = (el) => {
    const cls = String(el.className || '');
    const role = el.getAttribute('role') || '';
    if (/picker|date/i.test(cls) || role === 'spinbutton') return '自定义日期';
    if (/cascader/i.test(cls)) return '自定义级联';
    if (/radio/i.test(cls) || role === 'radiogroup') return '自定义单选';
    if (/checkbox/i.test(cls)) return '自定义多选';
    if (el.isContentEditable) return '富文本';
    return '自定义下拉';
  };

  const collectCustom = (root, out) => {
    for (const el of root.querySelectorAll(CUSTOM_WIDGET_SEL)) out.push(el);
    for (const n of root.querySelectorAll('*')) if (n.shadowRoot) collectCustom(n.shadowRoot, out);
    return out;
  };

  /* ---------- 自定义下拉:点击展开 → 读选项 → 匹配 → 点中 ----------
   * 这类组件内部的 input 只是「搜索框」,直接写值在失焦后会被组件丢弃,
   * 必须模拟真实交互。日期选择器与级联选择需要多级导航,风险高,暂不自动操作。
   */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const waitUntil = async (fn, timeout = 1000, step = 50) => {
    const t0 = performance.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (performance.now() - t0 >= timeout) return null;
      await sleep(step);
    }
  };

  const realClick = (el) => {
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, view: window,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    // antd 在 mousedown 阶段展开,只发 click 打不开
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
      const Ctor = type.startsWith('pointer') && window.PointerEvent ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, init));
    }
  };

  const closePopup = () => {
    for (const type of ['keydown', 'keyup']) {
      document.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', keyCode: 27, bubbles: true }));
    }
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 1, clientY: 1 }));
  };

  const OPTION_SEL = [
    '.ant-select-item-option', '.ant-select-item',
    '[role="option"]',
    '.el-select-dropdown__item', '.arco-select-option', '.semi-select-option',
  ].join(',');

  const openOptions = () => Array.from(document.querySelectorAll(OPTION_SEL)).filter((o) => {
    if (o.getAttribute('aria-disabled') === 'true' || /disabled/.test(o.className)) return false;
    const r = o.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  });

  const pickOption = (opts, key, v) => {
    const txt = (o) => clean(o.textContent || '');
    if (key === 'gender') {
      const g = GENDER(v);
      const t = g && opts.find((o) => GENDER(txt(o)) === g);
      if (t) return t;
    }
    if (key === 'degree' || key === 'isHighest') {
      const d = DEG_LV(v);
      const t = d && opts.find((o) => DEG_LV(txt(o)) === d);
      if (t) return t;
    }
    const nv = clean(v);
    return opts.find((o) => txt(o) === nv)
      || opts.find((o) => { const t = txt(o); return t && (t.includes(nv) || nv.includes(t)); })
      || null;
  };

  /* ---------- 自定义日期选择器 ----------
   * 不去翻日历:antd 的日期格子带 title="2027-06-15" / "2027-06",可以精确命中。
   * 命中不了再退回「往输入框打字 + 回车」,由组件自己解析。 */
  const CELL_SEL = '.ant-picker-cell, .el-date-table td, [role="gridcell"]';

  const findCell = (title) => Array.from(document.querySelectorAll(CELL_SEL)).find((c) => {
    if ((c.getAttribute('title') || '') !== title) return false;
    if (/disabled/.test(c.className)) return false;
    const r = c.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  });

  const fillDatePicker = async (el, v) => {
    if (widgetValue(el)) return { ok: false, reason: '已有选择,未覆盖' };
    const m = String(v).match(/^(\d{4})[-/.年]?(\d{1,2})?[-/.月]?(\d{1,2})?/);
    if (!m) return { ok: false, reason: `「${v}」不是日期,请手动选` };
    const y = m[1];
    const mo = m[2] ? m[2].padStart(2, '0') : '';
    const d = m[3] ? m[3].padStart(2, '0') : '';

    const input = el.querySelector('input');
    realClick(input || el);
    const opened = await waitUntil(() => (findCell(y) || (mo && findCell(`${y}-${mo}`))
      || (mo && findCell(`${y}-${mo}-${d || '01'}`)) || null), 1000);

    // 日期面板可能停在年/月视图,按 日 → 月 → 年 的精度顺序逐个尝试
    const titles = [];
    if (mo && d) titles.push(`${y}-${mo}-${d}`);
    if (mo) titles.push(`${y}-${mo}`, `${y}-${mo}-01`);
    titles.push(y);
    for (const t of titles) {
      const cell = findCell(t);
      if (!cell) continue;
      realClick(cell);
      const got = await waitUntil(() => widgetValue(el) || null, 400);
      if (got) return { ok: true, value: got };
    }

    // 退路:直接把日期打进输入框并回车
    if (input && !input.readOnly) {
      const txt = d ? `${y}-${mo}-${d}` : (mo ? `${y}-${mo}` : y);
      setNative(input, txt);
      for (const type of ['keydown', 'keyup']) {
        input.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true }));
      }
      const got = await waitUntil(() => widgetValue(el) || null, 400);
      if (got) return { ok: true, value: got };
    }
    closePopup();
    return { ok: false, reason: opened ? '日历里没找到该日期,请手动选' : '日历未能展开,请手动选' };
  };

  /* ---------- 自定义级联选择(城市等) ----------
   * 档案里通常只有「上海」,而级联要求逐级选到底。
   * 只在「档案给了这一级的值」或「该级毫无歧义」时才推进 ——
   * 歧义时宁可停下报错,也不替用户随便挑一个区县。 */
  const CASCADER_MENU = '.ant-cascader-menu, .el-cascader-menu, .arco-cascader-list';
  const CASCADER_ITEM = '.ant-cascader-menu-item, .el-cascader-node, .arco-cascader-list-item';

  const cascaderColumns = () => Array.from(document.querySelectorAll(CASCADER_MENU))
    .filter((m) => m.getBoundingClientRect().width > 2);

  const fillCascader = async (el, v) => {
    if (widgetValue(el)) return { ok: false, reason: '已有选择,未覆盖' };
    const segs = String(v).split(/[/>·、,，\s]+/).filter(Boolean);
    realClick(el);

    let level = 0, lastMatched = '';
    for (let guard = 0; guard < 6; guard++) {
      const cols = await waitUntil(() => { const c = cascaderColumns(); return c.length > level ? c : null; }, 800);
      if (!cols) break;
      const opts = Array.from(cols[cols.length - 1].querySelectorAll(CASCADER_ITEM))
        .filter((o) => !/disabled/.test(o.className) && o.getBoundingClientRect().height > 2);
      if (!opts.length) break;

      const want = segs[level];
      let target = want ? pickOption(opts, '', want) : null;
      if (!target && !want) {
        // 档案没给这一级:唯一选项、或与上一级同名(上海 → 上海市)才算无歧义
        if (opts.length === 1) target = opts[0];
        else if (lastMatched) {
          target = opts.find((o) => {
            const t = clean(o.textContent || '');
            return t.includes(lastMatched) || lastMatched.includes(t);
          }) || null;
        }
      }
      if (!target) {
        closePopup();
        return {
          ok: false,
          reason: want ? `级联里没有「${want}」,请手动选`
            // 不替用户猜区县 —— 在求职表上编造具体地址比留空危害大
            : `级联还需下一级(${opts.slice(0, 3).map((o) => clean(o.textContent)).join('/')}…),请把档案值写成「上海/上海市/浦东新区」这样的完整路径,或手动选`,
        };
      }
      lastMatched = clean(target.textContent || '');
      realClick(target);
      level++;
      const got = await waitUntil(() => widgetValue(el) || null, 300);
      if (got) return { ok: true, value: got };
    }
    closePopup();
    return { ok: false, reason: '级联未能完成,请手动选' };
  };

  const isSelectLike = (el) => widgetKind(el) === '自定义下拉';

  const widgetValue = (el) => {
    const item = el.querySelector('.ant-select-selection-item, .el-select__tags-text, [class*="selection-item"]');
    if (item) return clean(item.textContent || '');
    return clean(el.innerText || '').replace(/请选择|请输入|select|choose/gi, '').trim();
  };

  const fillWidget = async (el, key, v) => {
    if (widgetValue(el)) return { ok: false, reason: '已有选择,未覆盖' };
    realClick(el);
    const opts = await waitUntil(() => { const o = openOptions(); return o.length ? o : null; }, 1000);
    if (!opts) { closePopup(); return { ok: false, reason: '下拉未能展开,请手动选' }; }
    const target = pickOption(opts, key, v);
    if (!target) { closePopup(); return { ok: false, reason: `选项里没有「${v}」,请手动选` }; }
    realClick(target);
    // 轮询到值出现就立刻返回,不用固定等待 —— 后台标签页的定时器会被浏览器节流到 ~1s/次
    const got = await waitUntil(() => widgetValue(el) || null, 600);
    if (!got) { closePopup(); return { ok: false, reason: '点选未生效,请手动选' }; }
    return { ok: true, value: got };
  };

  const SUPPORTED_WIDGETS = new Set(['自定义下拉', '自定义日期', '自定义级联']);

  /* 页面上可见的最外层自定义组件。fill 与 scan 共用,保证两份报告口径一致。 */
  const outerWidgets = () => {
    const found = collectCustom(document, []).filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    });
    // 组件常有多层嵌套(.ant-select 内还有 [role=combobox]),只保留最外层
    return found.filter((el) => !found.some((o) => o !== el && o.contains(el)));
  };

  /* 组件的标签候选:必须剔除它自己的当前值。
   * 例如学校下拉已选「样例学院」时,「样例学院」会混进候选并命中 edu.college(含「学院」),
   * 于是真正的标签「学校」被盖过,锚点失效、经历段号不再推进。 */
  const widgetCands = (el) => {
    const own = widgetValue(el);
    const cands = labelCands(el);
    if (!own) return cands;
    return cands.filter((c) => c.t !== own && !(c.t.length >= 2 && own.includes(c.t)));
  };

  const scanCustomWidgets = (customs, widgets) => {
    const rows = [];
    for (const el of widgets) {
      const cands = widgetCands(el);
      const label = String((cands[0] && cands[0].t) || '(无标签)').slice(0, 40).replace(/\|/g, '/');
      const hit = matchRules(cands, customs);
      const key = hit ? (hit.custom ? '自定义问答' : (hit.dom ? `${hit.dom}.${hit.field}` : hit.field)) : '';
      const kind = widgetKind(el);
      /* 单选/多选组的 innerText 就是所有选项文字,无从判断是否已选中。
       * 与其误报「已填」害你跳过必填项,不如一律报未填。 */
      const guessable = !/单选|多选/.test(kind);
      rows.push({
        label,
        ctrl: SUPPORTED_WIDGETS.has(kind) ? kind : `${kind}(需手动)`,
        rule: key,
        filled: guessable && !!String(el.innerText || '').replace(/请选择|请输入|\s/g, '').trim(),
      });
    }
    return rows;
  };

  /* ---------- 诊断:只扫描不填写,导出本页字段清单 ----------
   * 用于在陌生的招聘网站上排查「为什么某个字段没填上」:
   * 输出每个可见字段的标签、控件类型与命中的规则,便于针对性补规则。
   */
  const scan = (rawProfile) => {
    const P = normalize(rawProfile || {});
    const customs = P.custom || [];
    const rows = [];
    const widgets = outerWidgets();
    for (const el of collect(document, [])) {
      const tag = el.tagName;
      const type = (el.type || '').toLowerCase();
      if (tag === 'INPUT' && ['submit', 'button', 'reset', 'image', 'password', 'hidden'].includes(type)) continue;
      if (!visible(el) && type !== 'file') continue;
      // 与 fill 保持一致:组件内部的搜索框不单独列,改由组件本身呈现
      if (type !== 'file' && widgets.some((w) => w.contains(el))) continue;
      const cands = labelCands(el);
      if (!cands.length && type !== 'file') continue;
      const hit = matchRules(cands, customs);
      const key = hit ? (hit.custom ? '自定义问答' : (hit.dom ? `${hit.dom}.${hit.field}` : hit.field)) : '';
      // 勾选框的 value 恒为 "on",必须看 checked;文件框要看 files
      const filled = (type === 'checkbox' || type === 'radio') ? el.checked
        : type === 'file' ? !!(el.files && el.files.length)
          : tag === 'SELECT' ? (!!el.value && el.selectedIndex > 0)
            : !!String(el.value || '').trim();
      rows.push({
        // 显示真正命中的那条候选文本 —— 权重最高的那条可能是字段值而非标签,会误导排查
        // 竖线会撑破弹窗里拼的 Markdown 表格
        label: String((hit && hit.label) || (cands[0] && cands[0].t) || '(无标签)')
          .slice(0, 40).replace(/\|/g, '/'),
        ctrl: tag === 'INPUT' ? `input:${type || 'text'}` : tag.toLowerCase(),
        rule: hit && hit.range ? `${key}(起止区间)` : key,
        filled,
      });
    }
    const wRows = scanCustomWidgets(customs, widgets);
    rows.push(...wRows);
    // 带上引擎版本:扩展文件被 Chrome 缓存,不点「刷新扩展」就仍在跑旧代码,
    // 有版本号才能一眼看出这份清单是不是过期的
    return { url: location.href, title: document.title, version: VERSION, rows, customWidgets: wRows.length };
  };

  window.__RQF = { version: VERSION, fill, scan };
})();
