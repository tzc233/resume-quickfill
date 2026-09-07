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

  const VERSION = '1.29.0';

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
    { k: 'idNumber',  re: /证件号码|身份证号|身份证件|证件号|id\s*(no|number|card)\b/i },
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
    { k: 'expectedCity',   re: /意向工作城市|意向工作地|意向面试地点|期望(工作)?(城市|地点|地区)|意向城市|期望工作地|工作意向地|preferred (city|location)|desired (city|location)/i,
      ex: /是否|调剂/ },   // 「意向工作城市是否可以调剂」是调剂意愿问句,填城市名进去是错的
    { k: 'expectedSalary', re: /期望(薪资|月薪|年薪|薪酬)|薪资要求|expected salary|desired salary|salary expect/i, ex: /当前|现在|目前|current/i },
    { k: 'availableDate',  re: /到岗|入职时间|onboard|available (date|time)|start date|earliest start/i },
    { k: 'yearsExp',       re: /工作年限|工作经验年|years? of (work )?experience|experience years?/i },
    { k: 'city',      re: /现居|居住地|居住城市|所在城市|当前城市|所在地|current (city|location)|\bcity\b/i,
      ex: /期望|意向|preferred|desired|籍贯|户口|hometown|native|学校|院校|公司/i },

    /* ---- 校园工作(须早于 work.desc,否则被「经历描述」抢走) ---- */
    { k: 'campusWork', re: /校园工作经历|校园经历|校园组织|学生工作|学生干部|校内活动|社团经历/i },

    /* ---- 教育经历(锚点:学校) ---- */
    /* 「最高学历毕业院校」出现在基本信息区,必须归成基本信息键:
     * edu.school 是锚点,让它命中的话会把教育区块计数器提前消耗一格,
     * 后面真正的教育经历整体错位一段(Shopee 就是这种布局)。 */
    { k: 'topSchool', re: /最高学历(毕业)?院校|最高学历学校/i },
    { k: 'edu.college', re: /学院.?系|院系|学院|系别|department|faculty/i },
    { k: 'edu.school', a: 1, re: /学校名称|毕业院校|毕业学校|院校名称|学校|院校|大学名称|university|college|school|alma mater/i,
      ex: /高中|初中|小学|middle school|high school|primary/i },
    // 「专业排名」含「专业」二字,排名必须排在专业之前,否则排名栏会被填成专业名
    { k: 'edu.rank',     re: /成绩排名|专业排名|年级排名|排名|\brank\b/i },
    { k: 'edu.major',  re: /专业名称|所学专业|专业|major|field of study|discipline/i,
      ex: /专业技能|专业证书|专业能力|专业类别|专业门类|学科门类/i },
    { k: 'edu.isHighest', re: /是否最高学历|最高学历\s*[??]/i },
    { k: 'edu.eduType',   re: /学历类型|培养方式|统招/i },
    { k: 'edu.studyForm', re: /学习形式|培养形式|全日制/i },
    /* 学历与学位是两套词,不能混:
     *   学历 = 读到哪一级 → 专科 / 本科 / 硕士研究生 / 博士研究生
     *   学位 = 拿到什么学位 → 学士 / 硕士 / 博士
     * 同一段本科经历,「学历」栏填「学士」是错的。所以分成两条规则,
     * 各自换算成本栏该用的说法(见 DEG_EDU / DEG_AWARD)。 */
    // 「最高学历」归入基本信息,恒指向第一段教育经历,不受经历区块顺序影响
    { k: 'degreeAward', re: /最高学位/i },
    { k: 'degree',      re: /最高学历|highest (education|degree)/i },
    /* 这条指的是【学位名】(学士/硕士),不是日期也不是是非题。
     * 网易的「获得学位证时间」、京东的「是否双学位」都带「学位」二字,
     * 被它抓走后往日期框里写「硕士」—— 写不进去还白占一个段位。 */
    { k: 'edu.degreeAward', re: /学位|academic degree/i,
      ex: /时间|日期|年月|编号|是否|双学位|dual/i },
    // 「请问你是否填写了本科学历」这类问句问的是"是/否",不是学历本身
    { k: 'edu.degree',      re: /学历|degree|education level|qualification/i, ex: /是否|请问/ },
    // 顺序要紧:三条都含「实验室」,笼统的那条必须垫底
    { k: 'edu.hasLab',   re: /是否有?实验室|有无实验室/i },
    { k: 'edu.labLevel', re: /实验室级别|实验室层次/i },
    { k: 'edu.lab',      re: /实验室(全称|名称)?/i },
    { k: 'edu.advisor',  re: /导师|指导教师|指导老师|负责老师|supervisor|advisor/i },
    { k: 'edu.research', re: /研究方向|研究领域|research (interest|direction)/i },
    // Shopee 把绩点和总分并成一栏「绩点/绩点总分」,拼成 3.63/4.00 整体填入
    { k: 'edu.gpaCombined', re: /绩点.{0,3}绩点总分|绩点\s*\/\s*总分/i },
    { k: 'edu.gpaTotal', re: /gpa\s*总分|总分|满分/i },
    { k: 'edu.gpaScore', re: /gpa\s*(分数|成绩)|绩点|gpa|平均分|均分/i },
    { k: 'edu.timeRange', r: 1, re: /就读时间|在校时间|教育时间|学习时间/i },
    { k: 'edu.startTime', re: /入学时间|入校时间|入学年月|入学日期|开始就读|enrollment/i },
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
    { k: 'paper.type', re: /论文类型|会议.?期刊|期刊名称|会议名称|发表(期刊|会议)|刊物|journal|conference/i },
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
    { k: 'lang.name', a: 1, re: /语言种类|语言类型|语种|外语语言/i },
    { k: 'lang.certScore', re: /语言证书及成绩|证书及成绩|证书与成绩/i },
    /* Shopee 的英语水平列表每段只有一栏「英语等级证书」:作为锚点分段后,
     * 档案只有一门语言时第二段会明确报「没有第 2 段」,而不是重复填同一本证书 */
    { k: 'lang.cert', a: 1, re: /认证类型|证书类型|考试类型|语言证书|等级证书/i },
    { k: 'lang.score', re: /^成绩$|语言成绩|外语成绩|考试成绩|等级.{0,2}分数/i },

    /* ---- 编程语言能力(锚点:编程语言名称) ---- */
    { k: 'prog.name', a: 1, re: /编程语言名称|编程语言|programming language/i },
    // 「职业技能&掌握程度」一栏并两问,拼成「Python 熟练」
    { k: 'prog.nameLevel', re: /(职业)?技能.{0,3}掌握程度/i },
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
    { k: '*.startTime', re: /开始时间|开始日期|起始时间|起始日期|开始年月|start (date|time)|from/i },
    /* 单独一个「至」就是结束时间。网易把起止拆成两个框、中间那个标签只写「至」,
     * 7 个结束时间字段因此全部漏掉。只认【完全等于】「至」/「到」,
     * 不能用子串 —— 「至今」「截至」「志愿」里都有这个字。 */
    { k: '*.endTime',   re: /^至$|^到$|^~$|^-$|结束时间|结束日期|截止时间|截止日期|结束年月|end (date|time)|\bto\b/i },
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
    /* 实习经历与工作经历是两个独立区块时,必须分开投放 —— 学生的实习被填进
     * 「工作经历」是实打实的错。合并型标题(「实习与工作经历」)仍归 work,
     * 所以它要排在最前面拦掉,免得被下面的「实习经历」误伤。 */
    /* 「校园工作经历」「学生工作」说的是社团/学生干部,是一段自述文字,
     * 不是工作经历列表 —— 映射成空域,既不归 work,也顺带结束上一个区块的作用域。
     * 不拦掉的话它会被下面的「工作经历」命中,凭空多出一个 work 区块,
     * 把「同时存在实习与工作区块」的分流条件误触发。 */
    [/校园工作|学生工作|社团经历|校内活动|校园经历|社会实践/, ''],
    [/实习与工作|工作与实习|工作.?实习经历/, 'work'],
    [/实习经历|实习信息|实习情况/, 'intern'],
    [/工作经历|职业经历|工作信息|从业经历/, 'work'],
    // OPPO 把竞赛与奖学金合并成一个列表,必须排在 comp 之前(否则「竞赛/获奖经历」被判成 comp)
    [/竞赛.{0,2}获奖|竞赛.{0,2}奖学金|获奖.{0,2}竞赛/, 'honor'],
    [/赛事|竞赛|比赛/, 'comp'],
    [/项目经验|项目经历|科研项目/, 'proj'],
    [/获奖经历|获奖情况|荣誉奖项|荣誉与奖项|荣誉奖励|奖励情况/, 'award'],
    [/论文|期刊|学术成果|发表情况/, 'paper'],

    // prog 必须排在 lang 之前:「编程语言能力」同时含「语言能力」
    [/编程语言/, 'prog'],
    [/语言能力|外语能力|语言水平|英语水平|外语水平/, 'lang'],
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
    [/^职责$/, 'role'],
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
    // 档案只存学历,学位由层级换算得出
    'edu.degreeAward': (e) => degWord(String(e.degree || ''), 'award'),
    'edu.gpaCombined': (e) => [e.gpaScore, e.gpaTotal].filter(Boolean).join('/'),
    'prog.nameLevel': (e) => [e.name, e.level].filter(Boolean).join(' '),
  };
  /* 取到值之后、写进控件之前的用词换算 —— 与 COMPUTED 不同,这个在有值时也要跑 */
  const TRANSFORM = {
    'edu.degree': (v) => degWord(v, 'edu'),
  };

  const LIST_OF = {
    edu: 'education', work: 'workList', intern: 'internList', proj: 'projects', paper: 'papers', comp: 'competitions',
    award: 'awards', lang: 'languages', prog: 'progLangs', patent: 'patents', soft: 'softwares',
    honor: 'honors',
  };
  // 表单只提供其中一栏时的互相兜底
  const FIELD_FALLBACK = { 'proj.duty': 'role', 'proj.role': 'duty' };
  const DOM_CN = {
    edu: '教育', work: '工作', intern: '实习', proj: '项目', paper: '论文', comp: '竞赛',
    award: '奖项', lang: '外语', prog: '编程语言', patent: '专利', soft: '软件著作权',
    honor: '竞赛/获奖',
  };

  /* ---------- 采集标签候选文本(带权重,权重高者优先) ---------- */
  /* 校验提示、字段说明、必填星号都不是标签。Moka 把「必填项未填写」放在
   * <label> 内部、紧挨着 input —— DOM 距离比真标题 <div class="title-">近,
   * 权重会压过真标签,于是整片字段的标签都变成了「必填项未填写」。
   * 只跳过「不包含目标元素」的噪声分支:sd-Input-error 这类 class 也戴在
   * 包着 input 的 label 上,不能一刀切。 */
  const NOISE_SEL = 'button,[role="button"],[class*="message" i],[class*="describe" i],'
    + '[class*="tips" i],[class*="asterisk" i],[class*="required" i],[class*="error-" i]';

  const textOf = (root, skip, keep) => {
    let out = '';
    const walk = (n) => {
      if (out.length > 220 || n === skip) return;
      if (n.nodeType === 3) { out += ' ' + n.data; return; }
      if (n.nodeType !== 1) return;
      if (keep && n !== keep && !n.contains(keep)) {
        try { if (n.matches(NOISE_SEL)) return; } catch { /* 选择器不支持则不跳过 */ }
      }
      for (const c of n.childNodes) walk(c);
    };
    for (const c of root.childNodes) walk(c);
    return out;
  };

  const ancestorText = (node, keep) => {
    const t = clean(textOf(node, null, keep));
    // 过长的祖先文本通常是整个经历区块(含多个字段标签),属于噪声
    return t.length > 40 ? '' : t;
  };

  /* 父容器的文字里,去掉「通往输入框的那一支」,剩下的通常就是标签。
   * <div>学校名称<div><span>某某大学</span><input/></div></div>
   * 往上第二层就能把「学校名称」摘出来;而整段 innerText 会把「值」一起裹进来,
   * 于是标签被读成了「某某大学」这种字段值。 */
  const siblingText = (parent, child, keep) => {
    const c = clean(textOf(parent, child, keep));
    return c.length > 40 ? '' : c;
  };

  /* 占位提示的可信度:短词(「姓名」「年」)基本就是字段名;
   * 一长串或带指令口吻的(请…/点击…/格式/or)是操作说明,压到兄弟文本之下。 */
  const PH_NOISE = /请|点击|格式|例如|如:|支持|填写|选择|输入|or\b/i;
  const phWeight = (raw) => {
    const t = clean(raw || '');
    if (!t) return 4;
    if (t.length > 8 || PH_NOISE.test(String(raw))) return 1.5;
    return 4;
  };

  const labelCands = (el) => {
    const out = [];
    /* o = 这条候选是不是「本字段自己的」标签:来自 label/aria/placeholder/name/id,
     * 或者来自只装了一个控件的容器。反之(容器里有多个控件)就是上下文文本,
     * 多半是几个字段的标签拼在一起。 */
    const push = (s, w, o = true) => { const t = clean(s); if (t && t.length <= 60) out.push({ t, w, o }); };
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
    /* 占位提示只有「短且不像一句话」时才当标签。网易的日期框写的是
     * 「点击选择 or 按"yyyy-mm-dd"格式输入」—— 这是操作说明,不是字段名,
     * 却因为 placeholder 权重最高,把真标签「出生日期」整个顶掉了。 */
    push(el.placeholder, phWeight(el.placeholder));
    /* 逐层向上找标签。每层取两种候选:
     *   ① 兄弟文本 = 父容器文字 减去「通往输入框的那一支」—— 这才是标签所在;
     *   ② 整个父容器文字 —— 兜底。
     * 只取整段祖先文字会踩坑:Moka 的下拉是 <span>某某大学</span><input 空/> 结构,
     * 拿到的是「值」而不是「标签」,真正的「学校名称」还在更上层。
     * 因此这里必须往上多走几层(antd 类组件通常嵌套 4~5 层)。 */
    let node = el;
    /* 上溯层数:antd 的「标签一列 / 控件一列」布局本来就深,再套一层单选组
     * (input → .ant-radio → label → .ant-radio-group → children → control →
     *  control-wrapper → 才到那一行)就是 7 层。6 层差一步,「性别」永远够不着。
     * 放深的风险由两道闸门兜着:容器控件数 > 4 就停,以及「有自己的标签就不看邻居」。 */
    for (let d = 0; d < 8 && node; d++) {
      const parent = node.parentElement || (node.getRootNode && node.getRootNode().host) || null;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      /* 容器里的表单控件超过 4 个,说明它装的是「一整块字段」,它的文字是多个
       * 标签拼起来的,不是本字段的标签 —— 到此为止,别再往上取。
       * 这类拼接文本反复冒充标签:姓名框拿到「…最高学历毕业院校」(含「院校」),
       * 空的年份框拿到「学历 学习形式 … 学院 …」(含「学院」)。
       * 阈值取 4:一个「起止时间」最多拆成 年/月/年/月 四个框共用一个标签。
       * 勾选框不计数 —— 「至今」是这个时间字段的修饰而非独立字段,把它算进去
       * 会让实习/项目的起止时间(4 格 + 至今 = 5)够不着自己的标题,
       * 已填的起始格不占位,空着的结束格就被当成起始格,入职年月被写进离职年月。 */
      const ctrls = parent.querySelectorAll('input, textarea, select');
      let n = 0;
      for (const c of ctrls) if (!/^(checkbox|radio|file|hidden|submit|button)$/.test(c.type || '')) n++;
      if (n > 4) break;
      const alone = n <= 1;
      const sib = siblingText(parent, node, el);
      if (sib) push(sib, 3.2 - d * 0.3, alone);
      if (parent.tagName === 'FORM') break;
      const t = ancestorText(parent, el);
      if (t) push(t, 3 - d * 0.3, alone);
      node = parent;
    }
    /* name / id 是最弱的兜底证据(常是 e1-t1 这种没有语义的串)。
     * 不能算「自己的标签」—— 否则共用一个标签的两个输入框(中兴的
     * 「就读时间 [__]-[__]」)会因为有 id 就不再去看那个共用标签。 */
    push(el.name, 2, false);
    push(el.id, 2, false);
    push(el.getAttribute('data-field') || el.getAttribute('data-name'), 2, false);
    return out.sort((a, b) => b.w - a.w);
  };

  /* ---------- 规则匹配 ----------
   * 自定义问答优先于内置规则:它是用户覆盖内置行为的唯一手段。
   * 内置规则内部按 RULES 顺序;任一候选文本命中排除词则整条规则作废。
   */
  /* 页面上的 AI 助手 / 在线客服 / 意见反馈输入框不是申请表字段,但它们常是
   * textarea,会被通配规则(*.desc)当成「描述」填掉 —— 内容还明晃晃显示在页面上。
   * 靠免责声明这类固定话术识别,比靠位置可靠。 */
  const SKIP_FIELD = /回答由.{0,6}ai.{0,6}生成|仅供参考.{0,10}甄别|智能(助手|客服|问答)|在线客服|意见反馈|问题反馈/i;

  const matchRules = (cands, customs) => {
    for (const c of cands) {
      for (const cu of customs || []) {
        const kws = String(cu.q || '').split(/[,,、;;]/).map((s) => clean(s)).filter(Boolean);
        if (kws.some((k) => c.t.includes(k))) return { custom: true, value: String(cu.a || '').trim(), label: c.t };
      }
    }
    // 放在自定义问答之后:用户真想填它,仍可用自定义问答显式指定
    if (cands.some((c) => SKIP_FIELD.test(c.t))) return null;
    /* 排除词只在「像标签」的短候选上判定。曾经按全体候选判定,结果:姓名框的
     * 兄弟文本是「性别 女 出生日期 年龄 最高学历毕业院校」—— 里面的「院校」
     * 把整条 fullName 规则作废(那条排除词本是为了防止姓名填成学校名),
     * 姓名于是掉进含「性别」的那段文本,被填成了「女」。
     * 区块摘要文本里出现的词跟本字段无关,不该连坐。 */

    /* 字段有自己的标签时,就不再看邻居的拼接文本。自己的标签匹配不上,
     * 答案就是「没匹配上」,而不是拿上下文瞎猜 —— 「请问你是否填写了本科学历」
     * 曾因此被区块文字「自我评价 请问你是否…」带着命中 intro,
     * 把整段自我介绍填进一个该答是/否的下拉。
     * 只有本字段压根没有自己的标签时(比如共用一个「就读时间」标签的两个输入框),
     * 才退回去用上下文。 */
    const own = cands.filter((c) => c.o && c.t.length >= 2);
    const pool = own.length ? own : cands;

    /* 排除词只在真正参与匹配的候选上判定。拿全部候选判会误伤:
     * 「期望薪资」旁边就是「当前薪资」,邻居拼接文本里出现「当前」,
     * 会把 expectedSalary 整条规则作废,期望薪资就永远填不上。 */
    const EX_MAX = 12;
    const active = RULES.filter((r) => !(r.ex
      && pool.some((c) => c.t.length <= EX_MAX && r.ex.test(c.t))));
    // 候选权重优先于规则顺序 —— 字段自身的精确标签必须压过祖先容器的整块文本,
    // 否则区块内每个字段都会被块首的「学校名称/公司名称」锚点抢先命中。
    for (const c of pool) {
      for (const rule of active) {
        // 这条候选自身含排除词就跳过它 —— 「意向工作城市是否可以调剂」既含
        // 「意向工作城市」也含「调剂」,不能只因为它太长就放行
        if (rule.ex && rule.ex.test(c.t)) continue;
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
    /* 页面只出现一种标题时,那一种收下全部经历 —— 只有「工作经历」的表单
     * 若因为条目都是实习就一条都不填,那是帮倒忙。真正分流发生在 fill() 里,
     * 只有页面同时存在两种标题时才拆。 */
    out.workList = out.work;
    out.internList = out.work;
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

  /* 某段经历是不是实习:优先看档案里显式写的性质(type / nature),
   * 没写就从职位名称推断 ——「算法实习生」这种一看就是实习。
   * 推断只在没有显式声明时兜底,用户写了什么就以什么为准。 */
  const INTERN_RE = /实习|intern/i;
  const FULLTIME_RE = /全职|正式|校招|社招|full.?time/i;
  const isIntern = (w) => {
    const t = String((w && (w.type || w.nature)) || '');
    if (INTERN_RE.test(t)) return true;
    if (FULLTIME_RE.test(t)) return false;
    return INTERN_RE.test(String((w && w.title) || ''));
  };

  /* 「本科院校」「硕士学位」这类带学历限定的标签,直接按学历定位到对应那段教育经历 */
  const DEG_LV = (t) => (/博士|phd|doctor/i.test(t) ? 4 : /硕士|研究生|master|msc/i.test(t) ? 3
    : /本科|学士|bachelor|bsc|第一学历|前置学历/i.test(t) ? 2 : /大专|专科|associate|diploma/i.test(t) ? 1 : 0);

  /* 同一段教育经历,「学历」栏和「学位」栏要填不同的词 —— 本科对应的学位是学士,
   * 反过来把「学士」填进学历栏是错的。按 DEG_LV 的层级换算成本栏该用的说法;
   * 认不出层级(比如「MBA」「中专」)时原样保留,不擅自改写用户填的内容。 */
  const DEG_EDU = ['', '专科', '本科', '硕士研究生', '博士研究生'];
  const DEG_AWARD = ['', '', '学士', '硕士', '博士'];   // 专科没有学位
  const degWord = (v, kind) => {
    const lv = DEG_LV(v);
    if (!lv) return v;   // 认不出层级(MBA、中专…)原样保留,不擅自改写
    return (kind === 'award' ? DEG_AWARD : DEG_EDU)[lv];   // 专科学位为空,那是事实
  };

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
      topSchool: e0.school,
      highestSchoolCity: b.highestSchoolCity || e0.city,
      lastMajor: b.lastMajor || e0.major,
      publications: P.publicationsText, awards: P.awardsText, languages: P.languagesText,
      skills: P.skills, campusWork: P.campusWork,
      github: L.github, linkedin: L.linkedin, homepage: L.homepage,
      intro: P.intro,
      // 基本信息区出现的「学历 / 毕业时间 / 公司 / 职位」指向最高学历与最近一段经历
      degree: degWord(String(e0.degree || ''), 'edu'),
      degreeAward: degWord(String(e0.degree || ''), 'award'),
      endTime: e0.endTime, company: w0.company, title: w0.title,
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
    } else if (key === 'degree' || key === 'degreeAward') {
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
    } else if (key === 'degree' || key === 'degreeAward') {
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
    /* 明确不是简历的上传口。京东那页并排放着 成绩单/证书/专利/作品集 五六个口子,
     * 原来只挡头像 —— 页面若恰好只剩一个「专利」口,简历就会被投进去。 */
    const bad = /头像|照片|证件照|头图|logo|avatar|photo|图片|picture/
      .source + '|' + /成绩单|证书|专利|软著|作品集|获奖证明|身份证|学生证|在读证明|offer|portfolio|transcript|certificate/.source;
    const imgOnly = (a) => a && /image|png|jpe?g|gif/.test(a) && !/pdf|doc/.test(a);
    const badRe = new RegExp(bad, 'i');
    const ok = info.filter((i) => !badRe.test(i.text) && !imgOnly(i.accept));
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
    [/实习|intern/i, 'intern'],
    [/工作|职业|employment|work/i, 'work'],
    [/项目|project/i, 'proj'],
    [/论文|学术|著作|成果|paper|publication/i, 'paper'],
    [/竞赛|比赛|competition/i, 'comp'],
    [/奖项|荣誉|获奖|奖学金|award|honor/i, 'award'],
    [/专利|patent/i, 'patent'],
    [/软件著作|软著|software/i, 'soft'],
    [/外语|语言|英语|language/i, 'lang'],
    [/编程语言|programming/i, 'prog'],
  ];

  /* 加号可以完全没有文字。网易互娱的「教育经历」加号是个纯图标:
   *   <i aria-label="图标: plus-circle" class="anticon anticon-plus-circle"><svg data-icon="plus-circle">
   * textContent 是空的,按文字判会被整个漏掉 —— 这正是教育/工作/外语都报
   * 「未找到可用的『+ 添加』」的原因。所以图标也算数,但判据要够窄:
   *   · 只认 plus 家族(plus / plus-circle / plus-square),
   *   · 明确排除紧挨着它的 close-circle(删除)以及 minus/trash 之类;
   *   · 排除上传口 —— 头像上传也是个 anticon-plus,点下去会弹文件选择框。 */
  const ICON_ADD = /(^|[^a-z])(plus|add)([^a-z]|$)/i;
  const ICON_BAD = /close|minus|delete|trash|remove|cross|times|clear|upload|camera|picture|photo|avatar|image/i;
  const clsOf = (el) => {
    const c = el.className;
    return typeof c === 'string' ? c : (c && c.baseVal) || '';
  };
  const iconSig = (el) => {
    const svg = el.querySelector('svg[data-icon]');
    return [el.getAttribute('aria-label') || '', el.getAttribute('data-icon') || '',
      clsOf(el), svg ? svg.getAttribute('data-icon') || '' : ''].join(' ');
  };
  const isPlusIcon = (el) => {
    if (el.closest('[class*="upload" i], [class*="avatar" i]')) return false;
    const sig = iconSig(el);
    return ICON_ADD.test(sig) && !ICON_BAD.test(sig);
  };

  const findAddButtons = () => {
    const sel = 'button, a, [role="button"], [class*="add" i], [class*="plus" i], '
      + 'i[aria-label], [data-icon], span[class*="icon" i]';
    const cand = [];
    for (const el of document.querySelectorAll(sel)) {
      const raw = clean(el.textContent || '');
      const t = raw || clean(el.getAttribute('aria-label') || '');
      let icon = false;
      if (raw && raw.length <= 16 && !ADD_BAD.test(raw)
        && (ADD_TEXT.test(raw) || raw === '+' || raw === '＋')) {
        // 文字明说了是「添加」
      } else if (!raw && isPlusIcon(el)) {
        icon = true;                          // 没文字,但是个加号图标
      } else continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      cand.push({ el, text: icon ? '' : t, icon });
    }
    /* 嵌套时保留最内层 —— 那才是真正可点的那个。唯一例外:
     * <span class="f-cp"><i data-icon="plus-circle"></i>添加IT技能</span>
     * 外层带文字、内层是图标,这时要留外层(文字才认得出是哪个域)。 */
    return cand.filter((b) => !cand.some((o) => o !== b && b.el.contains(o.el)
      && !(o.icon && !b.icon)));
  };

  /** 页面上某个域现有几段。一段里可能有多个锚点字段(honor 的 kind+name、
   * lang 的 name+cert),按锚点总数算会虚高一倍,须按同名锚点的出现次数取最大值 */
  /* 实习区块里的字段命中的是 work.* 规则(两者条目结构相同),分流只发生在填充阶段。
   * 数段数时必须同样按区块标题改判,否则「实习经历」永远数出 0 段,
   * 从零展开点一次就以为没长出东西而收手。 */
  const PAIR_DOM = { work: 'intern', intern: 'work' };
  const effDom = (it) => {
    const h = it.hit;
    if (!h || !h.dom) return null;
    return (it.sec && PAIR_DOM[it.sec] === h.dom) ? it.sec : h.dom;
  };

  const countBlocks = (items, dom) => {
    const anch = {}, inSec = {};
    let any = false;
    for (const it of items) {
      const h = it.hit;
      if (!h || effDom(it) !== dom) continue;
      any = true;
      if (h.anchor) anch[h.field] = (anch[h.field] || 0) + 1;
      /* 兜底计数只数落在该域区块标题下的字段 —— 基本信息区也有「学历」这类同名字段,
       * 一起数会把段数顶高。 */
      if (it.sec === dom) inSec[h.field] = (inSec[h.field] || 0) + 1;
    }
    const a = Object.values(anch);
    if (a.length) return Math.max(...a);
    /* 没有锚点字段的区块:京东的荣誉块是「奖项类型 / 获奖时间 / 获奖情况」,
     * 一个「名称」都没有。原来一律返回 1,于是点出第二块后数不出增长,
     * 判定成「点了没反应」立刻收手 —— 荣誉永远只有一段。 */
    const b = Object.values(inSec);
    if (b.length) return Math.max(...b);
    return any ? 1 : 0;
  };

  /** 找该域对应的「+ 添加」:先看按钮文字,再退回「紧跟在该域最后一个字段之后」 */
  const pickAddButton = (buttons, items, dom, sections) => {
    const named = buttons.find((b) => {
      const hit = ADD_DOMAIN.find(([re]) => re.test(b.text));
      return hit && hit[1] === dom;
    });
    if (named) return named;
    /* 按区块归属认领:Moka 把「添加」按钮放在区块标题栏里,位置在该区块所有
     * 字段之前 —— 下面那套「找最后一个字段之后最近的按钮」永远够不着它,
     * 结果就是教育背景只有一段时死活不会自动加第二段。
     * 标题元素本身包着按钮,compareDocumentPosition 对被包含元素同样置
     * FOLLOWING 位,所以 sectionDomOf 能正确认出按钮属于哪个区块。 */
    if (sections && sections.length) {
      const inSec = buttons.filter((b) => sectionDomOf(b.el, sections) === dom);
      if (inSec.length) return inSec[0];
    }
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

  const expandBlocks = async (P, items, collectItems, report, sections) => {
    const expanded = [];
    for (const dom of Object.keys(LIST_OF)) {
      const need = (P[LIST_OF[dom]] || []).length;
      let have = countBlocks(items, dom);
      if (need <= have) continue;            // 已经够用
      /* have === 0 也要展开:京东的表单初始是空的,每个经历区块里只有一个
       * 「+ 添加」。原来「页面上没有这个域就跳过」会让整张表一个字段都填不出来。
       * 但不能无条件点 —— 必须页面确实有这个域的区块标题,按钮才认领得到。 */
      if (!have && !(sections || []).some((x) => x.dom === dom)) continue;
      let added = 0;
      while (have < need && added < 6) {
        ui.step(`展开「${DOM_CN[dom] || dom}」区块 ${have + 1}/${need}…`, 0.05 + 0.08 * (added / 6));
        // 每轮重新找按钮:组件重渲染后旧引用可能已经失效
        const btn = pickAddButton(findAddButtons(), items, dom, sections);
        if (!btn) break;
        const beforeLen = items.length;
        realClick(btn.el);
        /* 「长出来了没有」用两个信号判,任一成立即可:
         *   ① 该域的段数变多了;
         *   ② 页面上的字段总数变多了 —— 有些区块数不出段数(没有锚点字段),
         *      但新块确实渲染出来了。只靠 ① 会误判成「点了没反应」而收手。
         * 等待时间给足:京东一段教育经历有十几个字段,React 渲染没那么快。 */
        const grown = await waitUntil(() => {
          const next = collectItems(false);
          return (countBlocks(next, dom) > have || next.length > beforeLen) ? next : null;
        }, 2500);
        if (!grown) break;                   // 点了确实没动静 —— 立刻停手
        items = grown;
        added++;
        const now = countBlocks(items, dom);
        // 数得出来就用真实段数,数不出来就按点击次数记账,免得原地打转
        have = now > have ? now : have + 1;
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

  /* 锚点导航(左侧目录 / 顶部标签)会把每个区块名再列一遍。这些目录项在 DOM 里
   * 往往排在整张表单【之前】,于是「最近的前置标题」对表单里每个字段都变成了
   * 目录的最后一项 —— 京东那页连「姓名」都被判进了「发明成果专利」区块。
   *
   * 判据:目录的容器里挤着好几个区块名,却一个表单控件都没有。
   * 逐层上溯,先撞见控件就说明这是真区块,先撞见「多个候选且无控件」就是目录。 */
  const isNavList = (el, all) => {
    let box = el;
    for (let d = 0; d < 4 && box.parentElement; d++) {
      box = box.parentElement;
      if (box === document.body || box === document.documentElement) break;
      if (box.querySelector('input, textarea, select')) return false;
      if (all.filter((o) => box.contains(o.el)).length >= 2) return true;
    }
    return false;
  };

  /* 标题容器里常挂着一段说明文字(京东的 titledesc:「从最高学历开始填写…」)。
   * 整段算进去就超了长度上限,整个区块标题被丢掉 —— 京东的「教育经历」「实习经历」
   * 正是因为带说明文字而没被识别,而没有说明文字的几个区块识别正常。 */
  const HEAD_NOISE = '[class*="desc" i],[class*="tip" i],[class*="hint" i],'
    + '[class*="note" i],[class*="count" i],[class*="extra" i]';

  const headingText = (el) => {
    const raw = clean(el.textContent || '');
    if (raw.length <= 20) return raw;
    try {
      const c = el.cloneNode(true);
      for (const n of c.querySelectorAll(HEAD_NOISE)) n.remove();
      const t = clean(c.textContent || '');
      if (t && t.length < raw.length) return t;
    } catch { /* 克隆失败就按原文走 */ }
    return raw;
  };

  const scanSections = () => {
    const out = [];
    for (const el of document.querySelectorAll(HEADING_SEL)) {
      const t = headingText(el);
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
    return out.filter((x) => !isNavList(x.el, out));
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

  /* 「至今」勾选框:结束时间写「至今」时,日期格填不了,得勾这个框。
   * 只认标签恰好是「至今 / 在读 / 在职 / present」的勾选框,且只在同一段经历的
   * 容器内找 —— 协议勾选框绝不会被误勾(它的标签是「我已阅读…」)。 */
  const TILL_RE = /^(至今|今|在读|在职|present|current|now|till now)$/i;

  const tickTillNow = (el) => {
    let box = el;
    for (let d = 0; d < 6 && box.parentElement; d++) {
      box = box.parentElement;
      for (const cb of box.querySelectorAll('input[type="checkbox"]')) {
        const lb = cb.closest('label');
        const t = clean((cb.labels && cb.labels[0] ? cb.labels[0].innerText : '')
          || (lb ? lb.innerText : ''));
        if (!TILL_RE.test(t)) continue;
        if (!cb.checked) { cb.click(); mark(cb); }
        return true;
      }
      // 爬出这一段经历就停手,免得勾到隔壁区块的
      if (box.querySelectorAll('input, textarea, select').length > 10) break;
    }
    return false;
  };

  const TEXTLIKE = new Set(['text', 'email', 'tel', 'url', 'number', 'date', 'month', 'week', 'time', 'search']);

  /* ---------- 主流程 ----------
   * 异步:自定义下拉需要点开、等选项层渲染、再点中,无法同步完成。 */
  const runFill = async (rawProfile, resumeFile) => {
    const P = normalize(rawProfile);
    const report = { url: location.href, filled: [], skipped: [], unmatched: [], fileFilled: false, fileLabel: '' };
    /* 文本写入先记账,循环结束后统一回读校验:Moka 这类站点的「年/月」框
     * 其实是下拉组件的输入口,React 受控状态若只接受点选,会在 onChange 后
     * 把写进去的值吐回来 —— 不校验的话,报告说「已填」,表单数据里却是空的。 */
    const textWrites = [];
    const doneGroups = new Set();
    const fileEls = [];
    const customs = P.custom || [];

    /* 经历区块上下文:按 DOM 顺序推进。
     * 同一域内锚点字段(学校/公司/项目名称)重复出现 → 进入下一段经历。 */
    /* taken 记录「哪个域第几段的哪个字段已填过」,供通配字段判断上一段是否已满;
     * takenSec 只记录发生在该域自己区块里的那部分 —— 分段推进只认它:
     * 基本信息区的「预计毕业时间」也占用 edu#0#endTime,但它不在教育区块里,
     * 不能因为它先出现,就把教育区块里第一个「结束时间」顶到下一段去。 */
    /* 年填上之后,组件常会把空着的月自动补成 1(Moka 就是这样)。等轮到月份格时
     * 它已经「有值」,「已有内容不覆盖」那条保护就把我们自己挡在了外面 ——
     * 结果是年份全对、月份全是 1。同一个日期的年和月是一个整体:年是我写的,
     * 月就必须由我写完。只在紧跟着的那一格生效,不波及任何别的字段。 */
    let ymYearJustFilled = false;

    const ctx = { domain: null, idx: {}, used: {}, usedIdx: {}, pinned: null,
      taken: new Set(), takenSec: new Set() };
    for (const d of Object.keys(LIST_OF)) {
      ctx.idx[d] = 0; ctx.used[d] = new Set(); ctx.usedIdx[d] = new Set();
    }

    /* 段号推进改成「取下一个还没被占用的段」,而不是简单 +1。
     * 页面上已有的块可能对应档案的任意一段(见下面 pinBlocks),剩下的块
     * 就该去认领剩下的段 —— 简单递增会漏掉没人认领的那一段。
     * 没有任何块被钉住时,行为与原来的 0,1,2… 完全一致。 */
    const nextFree = (dom) => {
      const n = (P[LIST_OF[dom]] || []).length;
      for (let k = 0; k < n; k++) if (!ctx.usedIdx[dom].has(k)) return k;
      return n;   // 全用完了 —— 后续块会明确报「档案里没有第 N 段」
    };
    const advance = (dom) => { ctx.idx[dom] = nextFree(dom); };

    /* 第一趟:先算出每个字段的匹配结果 —— 通配字段(「起止时间」)需要看前后文才能定归属。
     * 抽成函数是因为「自动展开区块」每点一次 + 号都要重新扫一遍页面。 */
    const sections = scanSections();
    /* 页面同时存在「实习经历」和「工作经历」两个区块时,按性质分流;
     * 只有其中一种时,那一种收下全部(见 normalize 里的默认值)。 */
    const secDoms = new Set(sections.map((x) => x.dom));
    if (secDoms.has('intern') && secDoms.has('work')) {
      P.internList = P.work.filter(isIntern);
      P.workList = P.work.filter((w) => !isIntern(w));
    }

    const collectItems = (collectFiles) => {
      const out = [];
      // 自定义组件(antd 等)优先:它内部的 input 只是搜索框,直接写值失焦即丢
      /* 单选组里若装的是真的 <input type="radio">(antd / element / arco 都是这样),
       * 就把这个组从「自定义控件」里摘掉,让里面的原生 radio 照常被收集 ——
       * 原生路径读得出选中态、点得动,比一律报「需要手动操作」强得多。
       * 多选组不做这件事:勾选框里混着协议同意,宁可不碰。 */
      const ws = outerWidgets().filter((w) => !(
        /radio/i.test(String(w.className)) || w.getAttribute('role') === 'radiogroup')
        || !w.querySelector('input[type="radio"]'));
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
        const kind = widgetKind(el);
        let hit = matchRules(cands, customs);
        /* 日期控件只接受日期类字段。网易的获奖区块里,日期框的上下文文字把
         * 「奖项说明 湖南大学二等奖学金」整段卷了进来,于是日期框命中 award.name,
         * 拿奖项名字去填日历 —— 写不进去还白占一个段位。
         * 只管这一个方向:反过来【不】成立 —— 年/月本来就常做成下拉,
         * Moka 的出生日期、起止年月全是 sd-Dropdown。 */
        if (hit && hit.field && /日期/.test(kind) && !DATE_FIELD.test(hit.field)) hit = null;
        out.push({ el, tag: 'WIDGET', type: kind, cands,
          hit, sec: sectionDomOf(el, sections) });
      }
      // 两类元素混在一起,必须还原成页面上的先后顺序,否则区块计数会乱
      out.sort((a, b) => {
        const p = a.el.compareDocumentPosition(b.el);
        if (p & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (p & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });
      /* Moka 的 month-range-select:一段起止拆成 起年/起月/止年/止月 四个下拉。
       * 标签全退化(已填的是值,空的是「必填项未填写」),只有容器 class 能定性;
       * 按「起止区间」处理会把四个框当两个用。组内按位置改写成 年/月/年/月。 */
      const ranges = new Map();
      for (const it of out) {
        if (it.tag !== 'WIDGET') continue;
        const box = it.el.closest('[class*="month-range"]');
        if (!box) continue;
        if (!ranges.has(box)) ranges.set(box, []);
        ranges.get(box).push(it);
      }
      for (const g of ranges.values()) {
        if (g.length < 2) continue;
        const gd = (g.find((x) => x.hit && x.hit.dom) || { hit: {} }).hit.dom || '*';
        g.forEach((it2, i2) => {
          it2.hit = { dom: gd, field: '', ym: i2 % 2 ? 'm' : 'y',
            label: (it2.hit && it2.hit.label) || '(起止年月)' };
        });
      }

      /* 一条日期拆成年、月两个下拉(预计毕业时间/获奖时间):相邻两个组件命中
       * 同一个日期字段 → 前者取年、后者取月;月那半不参与分段推进,否则第二段
       * 获奖经历的月份框会被「同区块重复字段」判定多推一段。 */
      for (let k = 0; k + 1 < out.length; k++) {
        const a = out[k], b = out[k + 1];
        if (a.tag !== 'WIDGET' || b.tag !== 'WIDGET') continue;
        const ha = a.hit, hb = b.hit;
        if (!ha || !hb || ha.ym || hb.ym || ha.range || hb.range || ha.custom || hb.custom) continue;
        if (ha.half || hb.half) continue;
        if (!ha.field || ha.field !== hb.field || ha.dom !== hb.dom) continue;
        if (!/date|time|birthday/i.test(ha.field)) continue;
        ha.half = 'y'; hb.half = 'm';
      }

      /* 已填过的年/月框,标签会退化成值本身(「2024」),规则认不出,
       * 于是不参与年月推进 —— 空着的「结束时间」对就被当成「开始时间」填,
       * 教育经历的结束年月会被写成入学年月。按「值长得像年份/月份」把它们
       * 补回序列:只推进状态,绝不写入,也不进报告。
       * 月份必须紧跟在年/月框之后才算,免得把无关的数字框(如「1」)卷进来。 */
      for (let k = 0; k < out.length; k++) {
        const it = out[k];
        if (it.hit || it.tag !== 'INPUT' || !TEXTLIKE.has(it.type)) continue;
        const val = String(it.el.value || '').trim();
        if (/^(19|20)\d{2}$/.test(val)) {
          it.hit = { dom: '*', field: '', ym: 'y', occupied: true, label: '(已填年份)' };
        } else if (/^(0?[1-9]|1[0-2])$/.test(val)) {
          const prev = out[k - 1];
          if (prev && prev.hit && prev.hit.ym) {
            it.hit = { dom: '*', field: '', ym: 'm', occupied: true, label: '(已填月份)' };
          }
        }
      }
      return out;
    };

    ui.mount();
    ui.step('正在识别页面字段…', 0.03);
    await paint();   // 让第一帧先画出来,否则同步扫描期间用户看不到任何反馈

    let items = collectItems(true);
    // 档案段数多于页面区块数时,先把「+ 添加」点出来
    items = await expandBlocks(P, items, collectItems, report, sections);

    /* 页面上已经有内容的经历块 —— 你自己填的,或网站解析简历填进去的 ——
     * 按锚点的现有值认回它对应档案里的哪一段,并把段号钉到【整块】的所有字段上。
     *
     * 必须在填充之前一次性做完:京东把「起止时间」排在「学校名称」之前,
     * 等轮到锚点才改判就晚了 —— 日期已经按位置填成了第一段的。
     * 症状是「学校填的是本科那所,日期却是硕士那段的」—— 学校对、日期错,
     * 比整栏空着更难发现。 */
    const pinBlocks = (list0) => {
      for (const it of list0) {
        const h = it.hit;
        if (!h || !h.anchor || !h.dom || h.dom === '*') continue;
        const dom = effDom(it);
        const entries = P[LIST_OF[dom]] || [];
        if (entries.length < 2) continue;   // 只有一段可选,认不认都一样
        const cur = clean(it.tag === 'WIDGET' ? widgetValue(it.el) : String(it.el.value || ''));
        if (!cur) continue;
        const j = entries.findIndex((e) => {
          const t = clean(String(e[h.field] || ''));
          return t && (t === cur || t.includes(cur) || cur.includes(t));
        });
        if (j < 0 || ctx.usedIdx[dom].has(j)) continue;
        /* 这一块的范围:从锚点往上走,走到再往上就会圈进同域另一个锚点为止 */
        let box = it.el;
        for (let d = 0; d < 8 && box.parentElement; d++) {
          const up = box.parentElement;
          if (up === document.body) break;
          const others = list0.some((o) => o !== it && o.hit && o.hit.anchor
            && effDom(o) === dom && up.contains(o.el));
          if (others) break;
          box = up;
        }
        const pin = { dom, idx: j };
        for (const o of list0) if (o.hit && box.contains(o.el)) o.pin = pin;
        ctx.usedIdx[dom].add(j);
      }
      /* 初始段号仍然是 0,不跳过被钉住的段 —— 经历区块【之外】引用该列表的字段
       * (基本信息区的「预计毕业时间」取第一段教育的结束时间)应当照常拿第一段。
       * 钉住只影响后面未钉块的推进目标。 */
    };
    pinBlocks(items);

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
      /* 实习与工作条目结构完全相同,区块标题说了算 —— 哪怕那一侧一条都没有,
       * 也该报「档案里没有第 N 段实习」,而不是拿全职经历去顶。 */
      const PAIR = { work: 'intern', intern: 'work' };
      if (PAIR[sec] === dom) return sec;
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
    /* 逐字段结果台账。诊断报告原来是两张对不上的表:字段清单来自一次全新扫描,
     * 填充结果只按标签分组 —— 页面上有两个「学院名称」时,根本分不清是哪一行没填上。
     * 这里给【每个】字段留一条记录,扫描时按元素本身取回,重复标签也不会串。
     *
     * 状态怎么来:每轮开头记下 skipped/filled 的长度,下一轮开头再比一次 ——
     * 中间新增的那几条就属于上一个字段。这样不用去改散落在十几处的 push。 */
    const fieldOut = new WeakMap();
    const fieldLog = [];
    let cur = null, markS = 0, markF = 0;
    const closeCur = () => {
      if (!cur) return;
      const sk = report.skipped.slice(markS);
      if (sk.length) { cur.st = '跳过'; cur.why = sk.map((x) => x.reason).join(' / '); }
      else if (report.filled.length > markF) cur.st = '已填';
      cur = null;
    };

    for (let idx = 0; idx < items.length; idx++) {
      const { el, tag, type, cands } = items[idx];
      closeCur();
      cur = { label: '', st: '未处理', why: '', slot: '' };
      markS = report.skipped.length; markF = report.filled.length;
      fieldLog.push(cur);
      try { fieldOut.set(el, cur); } catch { /* 极少数代理对象不能作 WeakMap 键 */ }
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

      cur.label = String(hit.label || '');
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
        /* 年/月对出现在任何已识别区块之外(预计毕业时间、出生日期这类独立日期)时,
         * 绝不能靠前后邻居猜它属于哪段经历 —— Shopee 的「预计毕业时间」曾因此
         * 差点被填成第一段教育的入学年月。猜错是脏数据,留空只是留空。 */
        if (hit.ym && hit.dom === '*' && !items[idx].sec) {
          if (!hit.occupied) report.skipped.push({ label: hit.label, reason: '这组年/月不在任何经历区块内,无法确定归属,请手动填' });
          continue;
        }
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
        // 进入一个「已按内容认回段号」的块:先把段号切过去,块内字段照常走原逻辑
        const pin = items[idx].pin;
        if (i < 0 && pin && pin.dom === dom && ctx.pinned !== pin) {
          ctx.pinned = pin;
          ctx.idx[dom] = pin.idx;
          ctx.used[dom].clear();
        }
        const scoped = i >= 0;
        if (i < 0) {
          ctx.domain = dom;
          /* 分段判定:只有锚点(学校/公司/论文名称…)与时间区间参与计数 ——
           * 本段内已出现过的字段再次出现,即代表进入下一段。
           * 非锚点字段不参与,否则基本信息区的「学历」等重复标签会把段号带偏。
           * 计数必须同时认锚点和时间区间:中兴表单的「就读时间」排在「学校名称」之前,
           * 只认锚点会让第二段的起止时间取到第一段的值。 */
          const used = ctx.used[dom];
          /* 获奖/论文这类域的条目只有一个 date,没有起止 —— 一段只配一对年/月,
           * 第二对年/月出现就是下一段,而不是本段的「结束时间」。 */
          const s0 = list[0] || {};
          const singleDate = ('date' in s0) && !('startTime' in s0);
          if (hit.ym && singleDate) {
            if (hit.ym === 'y') {
              if (used.has('ymStart')) { advance(dom); used.clear(); }
              used.add('ymStart');
            }
            field = 'date';
          } else if (hit.ym) {
            /* 「年」「月」四个框依次对应 起始年 → 起始月 → 结束年 → 结束月。
             * 见到「年」就推进一格,「月」跟随当前那一格;
             * 第三个「年」出现时说明已进入结束时间。 */
            if (hit.ym === 'y') {
              if (used.has('ymStart')) {
                if (used.has('ymEnd')) { advance(dom); used.clear(); used.add('ymStart'); }
                else used.add('ymEnd');
              } else used.add('ymStart');
            }
            field = used.has('ymEnd') ? 'endTime' : 'startTime';
          } else if (hit.range) {
            // 「就读时间 [___]-[___]」共用一个标签的两个输入框:先起后止
            if (!used.has('startTime')) field = 'startTime';
            else if (!used.has('endTime')) field = 'endTime';
            else { advance(dom); used.clear(); field = 'startTime'; }
            used.add(field);
          } else if (hit.anchor) {
            if (used.has(field)) { advance(dom); used.clear(); }
            used.add(field);
          } else if (hit.half !== 'm' && items[idx].sec === dom && ctx.takenSec.has(`${dom}#${ctx.idx[dom]}#${field}`)) {
            /* Shopee 把「学历/学习形式」排在锚点「学校名称」之前:第二段的这些字段
             * 出现时锚点还没轮到,按旧规则会取到第一段的值。放开「非锚点不参与分段」
             * 的限制,但必须以区块标题为闸门 —— 基本信息区的「学历」不在教育区块里,
             * 不会把段号带偏(当年正是为了它才禁止非锚点参与计数)。 */
            advance(dom); used.clear();
          }
          i = ctx.idx[dom];
        }
        cur.slot = `${DOM_CN[dom] || dom}#${i + 1}`;
        const entry = list[i];
        if (!entry) {
          if (!hit.occupied) {
            /* 光说「没有第 3 段」没法排查 —— 到底是页面真有 3 块,还是段号分配
             * 跑偏了?把已占用的段号一并写出来,报告里一眼能分辨。 */
            const taken = [...ctx.usedIdx[dom]].sort((a, b) => a - b).map((k) => k + 1);
            report.skipped.push({ label: hit.label,
              reason: `档案只有 ${list.length} 段${DOM_CN[dom] || ''}经历,这个字段被分到第 ${i + 1} 段`
                + (taken.length ? `(第 ${taken.join('、')} 段已被占用)` : '') });
          }
          continue;
        }
        // 占位条目的使命到此为止:序列已推进,值绝不该被写(框里本来就有值)
        if (hit.occupied) continue;
        semKey = field;
        if (!scoped) ctx.usedIdx[dom].add(i);
        ctx.taken.add(`${dom}#${i}#${field}`);
        if (!scoped && items[idx].sec === dom) ctx.takenSec.add(`${dom}#${i}#${field}`);
        v = String(entry[field] ?? '').trim();
        // 百度把「项目职务」和「项目职责」拆开,中兴只有一个「项目中职责」——
        // 表单只给一栏时,用另一个字段兜底,免得该栏空着
        if (!v && FIELD_FALLBACK[`${dom}.${field}`]) {
          v = String(entry[FIELD_FALLBACK[`${dom}.${field}`]] ?? '').trim();
        }
        if (!v && COMPUTED[`${dom}.${field}`]) v = String(COMPUTED[`${dom}.${field}`](entry) || '').trim();
        if (v && TRANSFORM[`${dom}.${field}`]) v = String(TRANSFORM[`${dom}.${field}`](v) || '').trim();
        const ymc = hit.ym || hit.half;   // half = 相邻年月对,取值拆法与 ym 完全相同
        if (ymc && v) {
          // 档案存 YYYY-MM,拆给「年」「月」两个框;月份不补前导零(Moka 显示为 9 而非 09)
          const m = v.match(/^(\d{4})[-/.年]?(\d{1,2})?/);
          v = m ? (ymc === 'y' ? m[1] : String(Number(m[2] || 0) || '')) : '';
          if (!v) {
            const raw = String(entry[field] || '');
            if (TILL_RE.test(clean(raw)) && tickTillNow(el)) {
              report.filled.push({ label: hit.label, value: '已勾选「至今」' });
            } else {
              report.skipped.push({ label: hit.label, reason: `「${raw}」无法拆成年/月` });
            }
            continue;
          }
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
        const ymRole = hit.ym || hit.half || '';
        const force = ymRole === 'm' && ymYearJustFilled;
        const r = kind === '自定义下拉' ? await fillWidget(el, semKey, v, force)
          : kind === '自定义日期' ? await fillDatePicker(el, v)
            : kind === '自定义级联' ? await fillCascader(el, pathV)
              : { ok: false, reason: `${kind}需要手动操作` };
        if (r.ok) { mark(el); report.filled.push({ label: hit.label, value: r.value }); }
        else report.skipped.push({ label: hit.label, reason: r.reason });
        ymYearJustFilled = ymRole === 'y' && r.ok;
        continue;
      }
      ymYearJustFilled = false;
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
      textWrites.push({ el, label: hit.label, out: String(out), rec: cur });
    }
    closeCur();   // 最后一个字段没有「下一轮」来替它结账

    /* 回读校验。稍等一拍再读:受控组件的吐回发生在它自己的渲染周期里 */
    if (textWrites.length) {
      ui.step('正在校验写入…', 0.94);
      await sleep(120);
      for (const w of textWrites) {
        const now = String(w.el.value || '').trim();
        /* 文本框的成败要等这一趟回读才知道,循环里那次结账只能记成「未处理」——
         * 记录本身还留着,这里补写回去。 */
        const put = (st, why) => { if (w.rec) { w.rec.st = st; w.rec.why = why || ''; } };
        if (now === w.out.trim()) {
          report.filled.push({ label: w.label, value: w.out.slice(0, 60) });
          put('已填');
        } else if (now) {
          const why = `写入后被页面改成「${now.slice(0, 20)}」,请核对`;
          report.skipped.push({ label: w.label, reason: why });
          put('跳过', why);
        } else {
          const why = '写入后被页面组件丢弃 —— 这个框可能要点选,请手动填';
          report.skipped.push({ label: w.label, reason: why });
          put('跳过', why);
        }
      }
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

    /* 把这次填充的结果留在页面上。跳过原因(「已有选择,未覆盖」「选项里没有 X」
     * 「下拉未能展开」)只写在弹窗的填充报告里,弹窗一关就没了 —— 而诊断报告
     * 是拿去排查的那一份。两者对不上时,排查等于瞎猜。 */
    try {
      window.__RQF_LAST = {
        url: location.href,
        filled: report.filled.map((x) => x.label),
        skipped: report.skipped.map((x) => ({ label: x.label, reason: x.reason })),
        expanded: report.expanded || [],
        /* 逐字段台账。只带状态/原因/段号,【不带值】—— 这份报告是要贴出去的。 */
        fields: fieldLog,
      };
      window.__RQF_FIELDOUT = fieldOut;
    } catch { /* 页面可能禁止写 window,报告本身不受影响 */ }

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
    '[class*="sd-Dropdown"]',   // Moka:年/月、性别、学历这些框全是它,打字会被吐回,必须点选
    '.ant-select', '.ant-picker', '.ant-radio-group', '.ant-checkbox-group',
    // antd 3 的类名是 ant-cascader-picker / ant-calendar-picker,精确类选择器够不着
    '[class*="ant-cascader" i]', '[class*="ant-calendar-picker" i]',
    '.el-select', '.el-cascader', '.el-date-editor', '.el-radio-group',
    '.arco-select', '.arco-picker', '.semi-select', '.semi-datepicker',
  ].join(',');

  /* 日期类字段名 —— 用来判断某个规则该不该落在日期控件上 */
  const DATE_FIELD = /time|date|^ym|birthday|graduat/i;

  const widgetKind = (el) => {
    const cls = String(el.className || '');
    const role = el.getAttribute('role') || '';
    /* 级联必须排在日期之前:antd 3 的类名是 ant-cascader-picker,含「picker」二字,
     * 按日期处理会去找日历格子,自然一无所获(籍贯栏就是这么废掉的)。 */
    if (/cascader/i.test(cls)) return '自定义级联';
    if (/picker|date|calendar/i.test(cls) || role === 'spinbutton') return '自定义日期';
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
    '[class*="sd-Menu-container"]',   // Moka:每行选项一个 container,文本在 sd-Select-keyword 里
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
    if (key === 'degree' || key === 'degreeAward' || key === 'isHighest') {
      const d = DEG_LV(v);
      const t = d && opts.find((o) => DEG_LV(txt(o)) === d);
      if (t) return t;
    }
    /* 值是 YYYY-MM 而选项是纯年份/纯月份列表 —— 兜底保护:整串「2027-06」拿去
     * 子串匹配会碰上「2」这类选项。取对应片段精确匹配,匹配不到就明确失败。 */
    const dm = String(v).match(/^(\d{4})[-/.年]\s*(\d{1,2})/);
    if (dm) {
      const yOpts = opts.filter((o) => /^(19|20)\d{2}$/.test(txt(o)));
      if (yOpts.length >= 3) return yOpts.find((o) => txt(o) === dm[1]) || null;
      const mOpts = opts.filter((o) => /^(0?[1-9]|1[0-2])\s*月?$/.test(txt(o)));
      if (mOpts.length >= 3) return mOpts.find((o) => Number(txt(o).replace('月', '')) === Number(dm[2])) || null;
    }
    const nv = clean(v);
    return opts.find((o) => txt(o) === nv)
      || opts.find((o) => { const t = txt(o); return t && (t.includes(nv) || nv.includes(t)); })
      || null;
  };

  /* ---------- 自定义日期选择器 ----------
   * 不去翻日历:antd 的日期格子带 title="2027-06-15" / "2027-06",可以精确命中。
   * 命中不了再退回「往输入框打字 + 回车」,由组件自己解析。 */
  const CELL_SEL = '.ant-picker-cell, .ant-calendar-cell, .el-date-table td, [role="gridcell"]';

  /* 日期格子的 title 各家写法完全不同:antd 4 是 ISO「2024-09-01」,
   * antd 3 中文 locale 是「2024年9月1日」,还有补零与不补零的差别。
   * 按字符串相等比对必然漏 —— 一律解析成数字再比。 */
  const cellYMD = (c) => {
    const t = String(c.getAttribute('title') || c.getAttribute('aria-label') || '').trim();
    const m = t.match(/(\d{4})\D{0,3}(\d{1,2})?\D{0,3}(\d{1,2})?/);
    if (!m) return null;
    return [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)];
  };

  const findCell = (y, mo, d) => Array.from(document.querySelectorAll(CELL_SEL)).find((c) => {
    if (/disabled/.test(c.className)) return false;
    const cd = cellYMD(c);
    if (!cd) return false;
    if (cd[0] !== Number(y) || cd[1] !== Number(mo || 0) || cd[2] !== Number(d || 0)) return false;
    const r = c.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  });

  /* 面板当前停在哪个年月:取可见日格里出现最多的那个 (年,月)。
   * 比读表头文字可靠 —— 表头的写法同样各家不一。 */
  const panelYM = () => {
    const n = new Map();
    for (const c of document.querySelectorAll(CELL_SEL)) {
      const cd = cellYMD(c);
      if (!cd || !cd[1] || !cd[2]) continue;
      if (c.getBoundingClientRect().width < 2) continue;
      const k = cd[0] * 12 + cd[1];
      n.set(k, (n.get(k) || 0) + 1);
    }
    let best = 0, bn = 0;
    for (const [k, v] of n) if (v > bn) { bn = v; best = k; }
    return best;
  };

  const NAV_PREV = '.ant-calendar-prev-month-btn, .ant-picker-header-prev-btn, [class*="prev-month"]';
  const NAV_NEXT = '.ant-calendar-next-month-btn, .ant-picker-header-next-btn, [class*="next-month"]';
  const NAV_PREV_Y = '.ant-calendar-prev-year-btn, .ant-picker-header-super-prev-btn, [class*="prev-year"], [class*="super-prev"]';
  const NAV_NEXT_Y = '.ant-calendar-next-year-btn, .ant-picker-header-super-next-btn, [class*="next-year"], [class*="super-next"]';
  const CAL_ROOT = '.ant-calendar, .ant-picker-panel-container, .ant-picker-dropdown, .el-picker-panel';

  /* 页面上往往挂着好几个日历面板(每个日期控件一个,用完只是隐藏)。
   * 翻月按钮若用 document.querySelector 取,拿到的永远是第一个面板的按钮 ——
   * 那个多半是隐藏的,于是除了第一个日期,后面全部翻不动、填不上。 */
  const visibleCal = () => Array.from(document.querySelectorAll(CAL_ROOT))
    .find((c) => c.getBoundingClientRect().width > 2 && c.querySelector(CELL_SEL));

  /* 日历打开时停在当月,目标年月往往不在面板里。按月份差点上一月/下一月翻过去 ——
   * 不翻的话,凡是不在当月的日期一律填不上(京东的入学时间差着两三年)。 */
  const navigateTo = async (y, mo) => {
    const want = Number(y) * 12 + Number(mo);
    /* 先按【年】跳,再按月微调。出生日期动辄差二十几年 —— 一月一月点要三百多下,
     * 早就撞上循环上限了。有年份按钮时一次跳 12 个月。 */
    for (const [step, prev, next] of [[12, NAV_PREV_Y, NAV_NEXT_Y], [1, NAV_PREV, NAV_NEXT]]) {
      for (let guard = 0; guard < 80; guard++) {
        const cur = panelYM();
        if (!cur) return false;
        const diff = want - cur;
        if (diff === 0) return true;
        if (step === 12 && Math.abs(diff) < 12) break;   // 不够一年,交给月步进
        const btn = (visibleCal() || document).querySelector(diff < 0 ? prev : next);
        if (!btn || btn.getBoundingClientRect().width < 2) break;
        realClick(btn);
        if (!await waitUntil(() => (panelYM() !== cur ? true : null), 700)) break;
      }
    }
    return panelYM() === want;
  };

  const fillDatePicker = async (el, v) => {
    if (widgetValue(el)) return { ok: false, reason: '已有选择,未覆盖' };
    const m = String(v).match(/^(\d{4})[-/.年]?(\d{1,2})?[-/.月]?(\d{1,2})?/);
    if (!m) return { ok: false, reason: `「${v}」不是日期,请手动选` };
    const y = m[1];
    const mo = m[2] ? m[2].padStart(2, '0') : '';
    const d = m[3] ? m[3].padStart(2, '0') : '';

    const input = el.querySelector('input');
    realClick(input || el);
    // 面板出来了没有:任何一个可解析的日期格子都算
    const opened = await waitUntil(() => (panelYM() || findCell(y, mo, 0) || findCell(y, 0, 0)
      ? true : null), 1200);

    // 目标不在当前面板时,按月份差翻过去
    if (opened && mo) await navigateTo(y, Number(mo));

    /* 面板可能停在年/月/日任一视图,按 日 → 月 → 年 的精度顺序逐个尝试。
     * 档案只精确到月时,也试一次当月 1 号 —— 日视图里没有「整月」这个格子。 */
    const tries = [];
    if (mo && d) tries.push([y, mo, d]);
    if (mo) tries.push([y, mo, 0], [y, mo, 1]);
    tries.push([y, 0, 0]);
    for (const [ty, tm, td] of tries) {
      const cell = findCell(ty, tm, td);
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
    /* Moka:选中值渲染在 <span class="sd-Input-display-value">,内部 input 的
     * value 恒为空(它只是搜索框)。读错位置有两个后果:已填的下拉被当成空的
     * 重新点选(会覆盖 ATS 解析好的内容),点选之后回读又永远拿不到值,
     * 于是成功的点选也被报成「点选未生效」。 */
    const disp = el.querySelector('[class*="display-value"]');
    if (disp) return clean(disp.textContent || '');
    const item = el.querySelector('.ant-select-selection-item, .el-select__tags-text, '
      + '[class*="selection-item"], [class*="picker-label"], [class*="selection-selected-value"]');
    if (item) return clean(item.textContent || '');
    /* 组件里有 input 时,它就是值的载体(前面两种显示位都没有的情况下):
     * 空的 input 就代表空值,绝不能再退到 innerText —— 那里只有「年」这类
     * addon 单位字,会把空的年份框判成「已有选择」而整片跳过。 */
    /* 单选/多选组例外:内部 input 的 value 是【选项的值】(male / 1),
     * 不是这个组件当前的值。拿它当值有两个后果:组件被误判成已填,
     * 而且下面剔除「组件自身内容」时对不上,选项文字「男 女」就成了标签。
     * 组的值 = 选中项的文字;一个都没选就是空。 */
    if (/radio|checkbox/i.test(String(el.className)) || /radiogroup|group/.test(el.getAttribute('role') || '')) {
      const on = el.querySelector('input:checked');
      if (!on) return '';
      const lb = on.closest('label');
      return clean((lb ? lb.innerText : '') || on.value || '');
    }
    const inp = el.querySelector('input');
    if (inp) return clean(inp.value || '');
    // 「必填项未填写」「暂无选项」是占位提示不是值 —— 当成值会把空组件误判成已填
    return clean(el.innerText || '')
      .replace(/请选择|请输入|请填写|(必填)?项?未填写|暂无选项|select|choose/gi, '').trim();
  };

  /* 这一页上次成功弹出菜单的触发目标(0=容器 1=内部输入框 2=父层 3=祖父层)。
   * Moka 的点击处理器不一定绑在组件容器上 —— 骨架显示外面还包着
   * sd-Tooltip-container 和 ctrl- 包装层。挨个试,试中的记住,后续组件直接用。 */
  const openHint = { idx: -1 };

  const fillWidget = async (el, key, v, force) => {
    const cur = widgetValue(el);
    if (cur && !force) return { ok: false, reason: '已有选择,未覆盖' };
    if (cur && String(cur).trim() === String(v).trim()) return { ok: true, value: cur };
    /* 快照差分:只认「点开之后才出现」的选项。Moka 的左侧锚点导航也用
     * sd-Menu-container,不差分的话「教育背景」这类导航项会混进选项列表 */
    const before = new Set(openOptions());
    const fresh = () => openOptions().filter((o) => !before.has(o));

    const inp0 = el.querySelector('input');
    const targets = [el, inp0, el.parentElement,
      el.parentElement && el.parentElement.parentElement].filter(Boolean);
    /* 已经摸清这一页该点哪一层之后,就只试那一层加一个兜底 —— 探路成本只付一次。
     * 组件确实打不开时(禁用的下拉),否则每个都要白等四轮。 */
    const order = openHint.idx >= 0 && targets[openHint.idx]
      ? [openHint.idx, ...[...targets.keys()].filter((i) => i !== openHint.idx).slice(0, 1)]
      : [...targets.keys()];
    let opts = null;
    for (const i of order) {
      const t = targets[i];
      if (!t) continue;
      if (t.tagName === 'INPUT') { try { t.focus(); } catch { } }
      realClick(t);
      opts = await waitUntil(() => { const o = fresh(); return o.length ? o : null; },
        i === order[0] ? 500 : 250);
      if (opts) { openHint.idx = i; break; }
    }
    /* 还是没开:学校/专业这类远程搜索下拉往往【不点开】,只在输入后才去拉选项。
     * 依次用完整值和它的前缀探一次 —— 远程搜索对前缀更友好。 */
    if (!opts && inp0) {
      const probes = [String(v), String(v).slice(0, 4), String(v).slice(0, 2)]
        .filter((x, i, a) => x && a.indexOf(x) === i);
      for (const probe of probes) {
        try { inp0.focus(); } catch { /* 组件可能拦截 focus,不影响后面写值 */ }
        setNative(inp0, probe);
        opts = await waitUntil(() => { const o = fresh(); return o.length ? o : null; }, 1500);
        if (opts) break;
      }
      // 探测失败要把搜索框擦干净,不能把半截关键词留在页面上
      if (!opts) setNative(inp0, '');
    }
    if (!opts) { closePopup(); return { ok: false, reason: '下拉点不开、打字也不出选项,请手动选' }; }
    let target = pickOption(opts, key, v);
    if (!target) {
      /* 年份列表常虚拟滚动,目标不在已渲染的选项里。这类输入框接受打字过滤
       * (选项行里有 keyword 高亮结构),打进去再从过滤结果里挑 */
      const inp = el.querySelector('input:not([readonly])');
      if (inp) {
        setNative(inp, v);
        // 学校/专业这类下拉是远程搜索,打完字要等接口回来,800ms 常常不够
        target = await waitUntil(() => pickOption(fresh(), key, v), 1800);
      }
    }
    if (!target) {
      if (inp0 && String(inp0.value || '').trim()) setNative(inp0, '');
      closePopup();
      return { ok: false, reason: `选项里没有「${v}」,请手动选` };
    }
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
    const inner = clean(el.innerText || '');

    /* Moka 年/月框的「年」字是组件内部的 addon —— labelCands 只往父级找,
     * 永远看不到它。补成候选;限两个字以内,免得把整串选项卷进来。 */
    const unit = inner.replace(/请选择|请输入/g, '').trim();
    const unitOk = !!unit && unit !== own && unit.length <= 2 && !/日期|时间/.test(unit);
    if (unitOk) cands.push({ t: unit, w: 3.5, o: true });

    /* 组件内部 input 的 placeholder 同样看不到(labelCands 只认元素自身的)。
     * 但整句操作说明不是标签:网易的日期框写「点击选择 or 按"yyyy-mm-dd"格式输入」,
     * 给它最高权重会把真标签「出生日期」顶掉 —— 交给 phWeight 判轻重。 */
    const rawPh = String((el.querySelector('input') || {}).placeholder || '').trim();
    const ph = /^请(选择|输入|填写)/.test(rawPh) ? '' : clean(rawPh);
    if (ph && ph !== own) cands.push({ t: ph, w: phWeight(rawPh), o: true });

    cands.sort((a, b) => b.w - a.w);

    /* 组件【内部】的文字一律不能当标签 —— 不只是当前选中值,还包括没选时
     * 平铺出来的整串选项(网易的单选组平铺「男 女」,学校下拉平铺所有校名)。
     * 它们看着像标签,其实是内容:「示例大学 样例学院」里有「学院」二字,
     * 会让学校栏命中 edu.college。
     *
     * 例外只有上面两条补进来的。注意 unit 在文本长时保存的是【整段内容】,
     * 必须用 unitOk 判断它是否真的作为候选被推入过 —— 直接写 c.t === unit
     * 会把要丢的那段原样放行(第一版就栽在这里)。 */
    return cands.filter((c) => {
      if ((unitOk && c.t === unit) || (ph && c.t === ph)) return true;
      if (own && (c.t === own || (c.t.length >= 2 && own.includes(c.t)))) return false;
      return !(inner && c.t.length >= 2 && inner.includes(c.t));
    });
  };

  const scanCustomWidgets = (customs, widgets, sections = [], outcomeOf = () => null) => {
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
      const oc = outcomeOf(el, String((hit && hit.label) || ''));
      rows.push({
        label,
        res: oc ? oc.st : '',
        why: oc ? String(oc.why || '').slice(0, 60).replace(/\|/g, '/') : '',
        slot: oc ? oc.slot : '',
        ctrl: SUPPORTED_WIDGETS.has(kind) ? kind : `${kind}(需手动)`,
        rule: key,
        sec: secName(sectionDomOf(el, sections)),
        note: labelWarn(label, el),
        snipEl: el,
        filled: guessable && !!String(el.innerText || '')
          .replace(/请选择|请输入|请填写|(必填)?项?未填写|暂无选项|\s/g, '').trim(),
      });
    }
    return rows;
  };

  /* ---------- 诊断:只扫描不填写,导出本页字段清单 ----------
   * 用于在陌生的招聘网站上排查「为什么某个字段没填上」:
   * 输出每个可见字段的标签、控件类型与命中的规则,便于针对性补规则。
   */
  /* 区块域名转成人话;secName('') = 不在任何已识别区块里 */
  const secName = (sec) => (sec === 'blocked' ? '禁填区'
    : sec === 'self' ? '自我描述' : (DOM_CN[sec] || sec || ''));

  /* 标签退化预警:诊断时最有价值的一列。
   * 标签是纯数字/日期 → 八成把已填的「值」当成了标签;
   * 标签是占位词 → 把「必填项未填写」这类提示当成了标签。
   * 两种都说明标签定位落错了 DOM 层级,顺手带上祖先 class 链帮忙定位。 */
  const labelWarn = (label, el) => {
    let why = '';
    if (/\d/.test(label) && /^[\d\s.\/年月-]+$/.test(label)) why = '标签疑似是已填的值';
    else if (/未填写|请选择|请输入|暂无选项/.test(label)) why = '标签疑似是占位提示';
    else if (el && String(el.value || '').trim() && label === String(el.value).trim()) why = '标签就是当前值';
    if (!why) return '';
    const chain = [];
    let n = el && el.parentElement;
    for (let d = 0; d < 3 && n; d++, n = n.parentElement) {
      const c = String(n.className || '').trim().split(/\s+/)[0];
      if (c) chain.push(c);
    }
    return why + (chain.length ? `(${chain.join('<').slice(0, 40)})` : '');
  };

  /* 可疑字段的 DOM 骨架:往上取两层祖先,序列化成脱敏 HTML ——
   * 只留标签名 / class / 结构性属性;value 一律替换成 [值],
   * 超过 4 字或含数字的文本节点替换成 [文],个人信息进不了报告。
   * 有它,「把这个字段的 HTML 复制给我」这一步就不用人肉去 DevTools 抠了。 */
  const domSnip = (el) => {
    let root = el;
    for (let d = 0; d < 2 && root.parentElement && root.parentElement !== document.body; d++) {
      root = root.parentElement;
    }
    const walk = (n, depth) => {
      if (depth > 5) return '…';
      if (n.nodeType === 3) {
        const t = clean(n.data || '');
        if (!t) return '';
        return (t.length <= 4 && !/\d/.test(t)) ? t : '[文]';
      }
      if (n.nodeType !== 1) return '';
      const tag = n.tagName.toLowerCase();
      if (/^(script|style|svg|img)$/.test(tag)) return '';
      const attrs = [];
      const cls = n.getAttribute('class');
      if (cls) attrs.push(`class="${cls}"`);
      for (const a of ['type', 'role', 'placeholder', 'readonly', 'hidden']) {
        if (n.hasAttribute(a)) attrs.push(a + (n.getAttribute(a) ? `="${n.getAttribute(a)}"` : ''));
      }
      if (tag === 'input' && String(n.value || '').trim()) attrs.push('value="[值]"');
      const kids = Array.from(n.childNodes).map((c) => walk(c, depth + 1)).join('');
      return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>${kids}</${tag}>`;
    };
    return walk(root, 0).slice(0, 420);
  };

  const scan = (rawProfile) => {
    const P = normalize(rawProfile || {});
    const customs = P.custom || [];
    const rows = [];
    /* 上次填充的逐字段台账。优先按【元素本身】取回,重复标签也不会串;
     * 组件被 React 重渲染过的,元素换了新的,退回按「标签+出现次序」对齐。 */
    const fo = (typeof window !== 'undefined' && window.__RQF_FIELDOUT) || null;
    const log = (typeof window !== 'undefined' && window.__RQF_LAST
      && window.__RQF_LAST.url === location.href && window.__RQF_LAST.fields) || [];
    const queues = new Map();
    for (const r of log) {
      if (!r.label) continue;
      if (!queues.has(r.label)) queues.set(r.label, []);
      queues.get(r.label).push(r);
    }
    const outcomeOf = (el, label) => {
      let r = null;
      try { r = fo && fo.get(el); } catch { r = null; }
      if (!r) { const q = queues.get(label); if (q && q.length) r = q.shift(); }
      return r || null;
    };
    const widgets = outerWidgets();
    const sections = scanSections();
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
      const lab = String((hit && hit.label) || (cands[0] && cands[0].t) || '(无标签)')
        .slice(0, 40).replace(/\|/g, '/');
      const oc = outcomeOf(el, String((hit && hit.label) || ''));
      rows.push({
        // 显示真正命中的那条候选文本 —— 权重最高的那条可能是字段值而非标签,会误导排查
        // 竖线会撑破弹窗里拼的 Markdown 表格
        label: lab,
        res: oc ? oc.st : '',
        why: oc ? String(oc.why || '').slice(0, 60).replace(/\|/g, '/') : '',
        slot: oc ? oc.slot : '',
        ctrl: tag === 'INPUT' ? `input:${type || 'text'}` : tag.toLowerCase(),
        rule: hit && hit.range ? `${key}(起止区间)` : key,
        sec: secName(sectionDomOf(el, sections)),
        note: labelWarn(String((hit && hit.label) || (cands[0] && cands[0].t) || ''), el),
        snipEl: el,
        filled,
      });
    }
    const wRows = scanCustomWidgets(customs, widgets, sections, outcomeOf);
    rows.push(...wRows);
    /* 采样配额:标签可疑的字段(有 note)最值钱 —— 它们多半是坏掉的组件;
     * 未命中的其次(常是导航/搜索这类本就不该填的)。相同骨架只留一份,
     * 免得三个「至今」勾选框占掉三个名额。 */
    const seen = new Set();
    let snips = 0;
    const sample = (r) => {
      if (snips >= 12 || !r.snipEl) return;
      const sn = domSnip(r.snipEl);
      if (seen.has(sn)) return;
      seen.add(sn);
      r.snip = sn;
      snips++;
    };
    for (const r of rows) if (r.note) sample(r);
    for (const r of rows) if (!r.rule && !r.note) sample(r);
    for (const r of rows) delete r.snipEl;   // DOM 引用无法跨 executeScript 序列化
    // 带上引擎版本:扩展文件被 Chrome 缓存,不点「刷新扩展」就仍在跑旧代码,
    // 有版本号才能一眼看出这份清单是不是过期的
    return {
      url: location.href, title: document.title, version: VERSION, rows,
      customWidgets: wRows.length,
      sections: sections.map((x) => ({ text: x.text.slice(0, 24), dom: secName(x.dom) })),
      lastFill: (typeof window !== 'undefined' && window.__RQF_LAST
        && window.__RQF_LAST.url === location.href) ? window.__RQF_LAST : null,
    };
  };

  /* 诊断/测试用:某个「添加」按钮被认领给哪个经历域。
   * 「不会自己加一段」这类问题,光看填充报告看不出是按钮没找到还是点了没反应。 */
  const addButtonDomain = (el) => (el ? sectionDomOf(el, scanSections()) : null);

  window.__RQF = { version: VERSION, fill, scan, addButtonDomain };
})();
