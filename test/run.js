/* ============================================================================
 * 回归测试:共享档案 + 每页断言 + 自动执行器
 *
 * 用法一(一键跑全部):浏览器打开 test/index.html
 * 用法二(单页):打开 test/<页面>.html?run=1,结果直接显示在页面顶部
 *
 * 档案一律使用合成数据 —— 本目录在同步网盘的 git 仓库内,不放任何真实个人信息。
 * 结构刻意保持多段,用来覆盖分段计数、时间区间配对与「不覆盖已有值」。
 * ========================================================================== */

window.RQF_TEST_PROFILE = {
  basic: {
    fullName: '李思远', firstNameEn: 'Siyuan', lastNameEn: 'Li', namePinyin: 'Li Siyuan',
    politicalStatus: '中共党员', phone: '13800138000', email: 'test@example.com',
    gender: '女', birthday: '2000-06-15',
    city: '上海', cityPath: '上海/上海市/徐汇区',
    expectedCity: '上海', expectedCityPath: '上海/上海市/浦东新区', expectedCity2: '深圳',
    nationality: '中国', ethnicity: '汉族', gradYear: '2027', highestSchoolCity: '上海',
    lastMajor: '计算机科学与技术',
  },
  education: [
    { school: '示例大学', college: '计算机科学与工程系', degree: '硕士', major: '计算机科学与技术',
      startTime: '2024-09', endTime: '2027-06', isHighest: '是', eduType: '统招', studyForm: '全日制',
      research: '大模型后训练与 AI for Science', city: '上海' },
    { school: '样例学院', college: '信息科学与工程学院', degree: '学士', major: '计算机科学与技术',
      startTime: '2020-09', endTime: '2024-06', isHighest: '否',
      rank: '2/30(实验班)', gpaScore: '3.63', gpaTotal: '4.00' },
  ],
  work: [
    { company: '甲公司', title: '大模型算法实习生', startTime: '2026-04', endTime: '至今',
      skills: 'GRPO / RL post-training / PyTorch', desc: '客服 Agent 基座 post-training,0.7019→0.7299。' },
    { company: '乙公司', title: '算法实习生', startTime: '2026-01', endTime: '2026-03',
      skills: 'RAG / ReAct / LLM', desc: '知识库智能问答系统 RAG 架构设计与 NPC Agent 原型。' },
  ],
  projects: [
    { name: '示例项目:物理约束强化学习预测框架', role: '第一作者 / 核心开发',
      startTime: '2024-09', endTime: '2025-12', desc: '将演化序列重构为 next-token 预测任务。',
      duty: '负责数据管线、训练与评测全流程。' },
  ],
  papers: [
    { name: 'Alpha: A Sample Paper Title for Regression Testing',
      type: '示例会议 2026(CCF A)', authorOrder: '第一作者', date: '2026-05', desc: '第一篇示例论文。' },
    { name: 'Beta: Another Sample Paper Title for Regression Testing',
      type: '示例期刊(SCI 一区)', authorOrder: '第二作者', date: '2024-01', desc: '第二篇示例论文。' },
    { name: 'Gamma: Third Sample Paper Title',
      type: '示例期刊(SCI 三区)', authorOrder: '第三作者', date: '2026-01', desc: '第三篇示例论文。' },
  ],
  competitions: [
    { name: '示例数学建模竞赛', type: '国家级', result: '省级二等奖',
      startTime: '2022-09', endTime: '2022-09', desc: '建模与算法实现。' },
  ],
  awards: [
    { name: '示例一等奖学金', type: '校级奖学金', result: '一等', date: '2022-10', desc: '综合成绩排名前列。' },
    { name: '示例二等奖学金', type: '校级奖学金', result: '二等', date: '2021-10' },
    { name: '示例优秀学生', type: '校级荣誉', result: '优秀学生' },
  ],
  languages: [{ name: '英语', cert: 'CET-6', score: '可用英语进行技术交流与论文写作' }],
  progLangs: [{ name: 'Python', level: '熟练' }],
  campusWork: '实验室科研助理,参与组会分享与新生指导。',
  skills: 'PyTorch、Hugging Face、TRL、Unsloth;GRPO、SFT、LoRA/PEFT',
  intro: '示例大学计算机硕士在读,方向为大模型后训练与 AI for Science。',
  links: { github: 'https://github.com/example' },
  custom: [{ q: '为什么, why join', a: '与我的研究方向高度契合。' }],
};

window.RQF_TEST_FILE = {
  name: '示例简历.pdf', type: 'application/pdf', size: 9, dataBase64: btoa('%PDF'),
};

/* ---------------- 各页断言 ----------------
 * 键 = 文件名。值 = (v, st) => 断言对象;v(id) 取值,st(id) 取下拉选中项文本。 */
const CHECKS = {
  'testform.html': (v, st) => ({
    姓名: v('q1') === '李思远',
    手机: v('q2') === '13800138000',
    邮箱: v('q3') === 'test@example.com',
    性别单选_女: document.getElementById('r-f').checked && !document.getElementById('r-m').checked,
    出生日期: v('q5') === '2000-06-15',
    现居城市: v('q6') === '上海',
    紧急联系人电话_不该填: v('q11') === '',
    已有内容_不覆盖: v('q30') === '请勿覆盖',
    英文名: v('q12') === 'Siyuan',
    英文姓: v('q13') === 'Li',
    英文性别下拉: v('q15') === 'female',
    毕业院校: v('q16') === '示例大学',
    学历下拉: st('q17') === '硕士',
    专业: v('q18') === '计算机科学与技术',
    毕业时间: v('q20') === '2027-06',
    当前公司: v('q21') === '甲公司',
    职位: v('q22') === '大模型算法实习生',
    应聘职位_不该填: v('q23') === '',
    工作职责: v('q24').includes('post-training'),
    自我评价: v('q25').includes('AI for Science'),
    自定义问答: v('q26').includes('高度契合'),
    GitHub: v('q27') === 'https://github.com/example',
    政治面貌: v('q31') === '中共党员',
    本科院校_按学历定位: v('q32') === '样例学院',
    论文_拼成整段: v('q33').includes('Alpha'),
    获奖_拼成整段: v('q34').includes('数学建模'),
    英语: v('q35').includes('CET-6'),
    简历已注入: document.getElementById('f-resume').files[0]?.name === '示例简历.pdf',
    头像_不该填: document.getElementById('f-avatar').files.length === 0,
    协议_不该勾: !document.getElementById('agree').checked,
  }),

  'moka-style.html': (v, st) => ({
    姓名: v('b-name') === '李思远',
    手机: v('b-phone') === '13800138000',
    政治面貌: v('b-pol') === '中共党员',
    性别单选_女: document.getElementById('b-f').checked,
    现居城市: v('b-city') === '上海',
    最高学历: st('b-degree') === '硕士',
    教育1_学校: v('e1-school') === '示例大学',
    教育1_起止: v('e1-start') === '2024-09' && v('e1-end') === '2027-06',
    教育2_学校: v('e2-school') === '样例学院',
    教育2_起止: v('e2-start') === '2020-09' && v('e2-end') === '2024-06',
    教育2_学历: st('e2-degree') === '学士',
    工作1_公司: v('w1-company') === '甲公司',
    工作1_起: v('w1-start') === '2026-04',
    工作1_至今_日期框跳过: v('w1-end') === '',
    工作1_描述: v('w1-desc').includes('post-training'),
    工作2_公司: v('w2-company') === '乙公司',
    工作2_止: v('w2-end') === '2026-03',
    项目_名称: v('p1-name').includes('示例项目'),
    项目_起止: v('p1-start') === '2024-09' && v('p1-end') === '2025-12',
    本科院校_按学历定位: v('x-bachelor') === '样例学院',
    论文_拼成整段: v('x-pub').includes('Alpha'),
    获奖_含竞赛与奖学金: v('x-award').includes('数学建模') && v('x-award').includes('奖学金'),
    自我评价: v('x-intro').includes('AI for Science'),
    简历已注入: document.getElementById('x-resume').files[0]?.name === '示例简历.pdf',
    协议_不该勾: !document.getElementById('x-agree').checked,
  }),

  'zte-style.html': (v, st) => ({
    姓名: v('p-name') === '李思远',
    姓名拼音: v('p-pinyin') === 'Li Siyuan',
    手机: v('p-phone') === '13800138000',
    性别下拉: st('p-gender') === '女',
    出生日期: v('p-birth') === '2000-06-15',
    民族: v('p-ethnic') === '汉族',
    国籍: v('p-nation') === '中国',
    毕业年份: v('p-gradyear') === '2027',
    最高学历: st('p-degree') === '硕士',
    院校所在城市: v('p-schoolcity') === '上海',
    意向工作地1: v('p-city1') === '上海',
    意向工作地2: v('p-city2') === '深圳',
    证件号_档案无值: v('p-id') === '',
    教育1_起止区间: v('e1-t1') === '2024-09' && v('e1-t2') === '2027-06',
    教育1_学校: v('e1-school') === '示例大学',
    教育1_学院: v('e1-college') === '计算机科学与工程系',
    教育1_是否最高学历: v('e1-highest') === '是',
    教育1_研究方向: v('e1-research').includes('AI for Science'),
    教育2_起止区间: v('e2-t1') === '2020-09' && v('e2-t2') === '2024-06',
    教育2_学校: v('e2-school') === '样例学院',
    教育2_排名: v('e2-rank') === '2/30(实验班)',
    教育2_GPA: v('e2-gpa') === '3.63' && v('e2-gpatotal') === '4.00',
    校园工作_独立字段: v('campus').includes('科研助理'),
    实习1_公司: v('w1-company') === '甲公司',
    实习1_起: v('w1-t1') === '2026-04',
    实习1_至今_日期框跳过: v('w1-t2') === '',
    实习1_技能: v('w1-skills').includes('GRPO'),
    实习1_描述: v('w1-desc').includes('0.7299'),
    实习2_公司: v('w2-company') === '乙公司',
    实习2_起止: v('w2-t1') === '2026-01' && v('w2-t2') === '2026-03',
    项目_名称: v('j1-name').includes('示例项目'),
    项目_起止: v('j1-t1') === '2024-09' && v('j1-t2') === '2025-12',
    项目中职责_用duty: v('j1-role').includes('数据管线'),
    项目_描述: v('j1-desc').includes('next-token'),
    论文1_名称: v('r1-name').startsWith('Alpha'),
    论文1_类型: v('r1-type').includes('CCF A'),
    论文1_作者顺序: v('r1-order') === '第一作者',
    论文1_发表时间: v('r1-date') === '2026-05',
    论文2_名称: v('r2-name').startsWith('Beta'),
    论文2_作者顺序: v('r2-order') === '第二作者',
    竞赛_名称: v('c1-name') === '示例数学建模竞赛',
    竞赛_成绩: v('c1-result') === '省级二等奖',
    奖项_名称: v('d1-name') === '示例一等奖学金',
    奖项_时间: v('d1-date') === '2022-10',
    编程语言: v('g1-name') === 'Python' && v('g1-level') === '熟练',
    外语: v('l1-name') === '英语' && v('l1-cert') === 'CET-6',
    技能证书: v('s-cert').includes('PyTorch'),
    自我评价: v('s-intro').includes('AI for Science'),
    简历已注入: document.getElementById('a-resume').files[0]?.name === '示例简历.pdf',
    照片_不该填: document.getElementById('a-photo').files.length === 0,
    承诺_不该勾: !document.getElementById('ack').checked,
    协议_不该勾: !document.getElementById('agree').checked,
  }),

  'moka-ym.html': (v) => ({
    教育1_年月: v('e1-sy') === '2024' && v('e1-sm') === '9' && v('e1-ey') === '2027' && v('e1-em') === '6',
    教育2_年月: v('e2-sy') === '2020' && v('e2-sm') === '9' && v('e2-ey') === '2024' && v('e2-em') === '6',
    教育1_学校: v('e1-school') === '示例大学',
    教育2_学校: v('e2-school') === '样例学院',
    实习1_起年月: v('w1-sy') === '2026' && v('w1-sm') === '4',
    实习1_至今_留空: v('w1-ey') === '' && v('w1-em') === '',
    实习1_公司: v('w1-company') === '甲公司',
    实习1_描述: v('w1-desc').includes('0.7299'),
    实习2_年月: v('w2-sy') === '2026' && v('w2-sm') === '1' && v('w2-ey') === '2026' && v('w2-em') === '3',
    实习2_公司: v('w2-company') === '乙公司',
    项目_年月: v('j1-sy') === '2024' && v('j1-sm') === '9' && v('j1-ey') === '2025' && v('j1-em') === '12',
    项目_描述: v('j1-desc').includes('next-token'),
    至今复选_不该勾: !document.getElementById('w1-now').checked,
  }),

  'moka-antd.html': (v) => ({
    职位搜索框_不该填: v('t-search') === '',
    校园经历_正确归属: v('t-campus').includes('科研助理'),
    导师姓名_不该填本人: v('t-advisor') === '',
    专利_档案无值应留空: v('t-patname') === '' && v('t-patno') === '' && v('t-patdesc') === '',
    软著_档案无值应留空: v('t-softname') === '' && v('t-softdesc') === '',
    对照_姓名: v('n-name') === '李思远',
    对照_公司: v('n-company') === '甲公司',
    对照_职位: v('n-title') === '大模型算法实习生',
    对照_论文: v('n-paper').startsWith('Alpha'),
  }),

  'baidu-style.html': (v) => ({
    姓名: v('b-name') === '李思远',
    手机: v('b-phone') === '13800138000',
    预计毕业时间: v('b-grad') === '2027-06',
    证件号_档案无值: v('b-id') === '',
    教育1_起止: v('e1-start') === '2024-09' && v('e1-end') === '2027-06',
    教育1_绩点_档案无值: v('e1-gpa') === '',
    教育2_起止: v('e2-start') === '2020-09' && v('e2-end') === '2024-06',
    教育2_绩点: v('e2-gpa') === '3.63',
    学校下拉_已有值不覆盖: document.querySelectorAll('.ant-select-selection-item')[1].textContent === '样例学院',
    论文1: v('r1-name').startsWith('Alpha') && v('r1-venue').includes('CCF A'),
    论文2: v('r2-name').startsWith('Beta') && v('r2-venue').includes('SCI 一区'),
    论文3: v('r3-name').startsWith('Gamma') && v('r3-venue').includes('SCI 三区'),
    实习1: v('w1-company') === '甲公司' && v('w1-desc').includes('0.7299'),
    实习2: v('w2-company') === '乙公司' && v('w2-desc').includes('NPC Agent'),
    项目职务_是角色: v('p1-role').includes('第一作者'),
    项目描述: v('p1-desc').includes('next-token'),
    项目职责_独立字段: v('p1-duty').includes('数据管线'),
    奖项1: v('a1') === '示例一等奖学金',
    奖项2_不同于奖项1: v('a2') === '示例二等奖学金',
    奖项3: v('a3') === '示例优秀学生',
    奖项456_超出档案应留空: v('a4') === '' && v('a5') === '' && v('a6') === '',
    作品描述_不该被项目描述污染: v('port-desc') === '',
    简历已注入: document.getElementById('b-resume').files.length === 1,
    照片_不该填: document.getElementById('b-photo').files.length === 0,
    三个勾选框_都不该勾: !document.getElementById('agree').checked
      && !document.getElementById('no-award').checked && !document.getElementById('no-paper').checked,
  }),

  'antd-live.html': () => {
    const val = (k) => {
      const n = document.querySelector(`[data-sel="${k}"] .ant-select-selection-item`);
      return n && !n.hidden ? n.textContent.trim() : '';
    };
    return {
      性别_点选成功: val('gender') === '女',
      政治面貌_点选成功: val('political') === '中共党员',
      最高学历_语义匹配研究生: val('degree') === '硕士研究生',
      教育学历_匹配硕士: val('degree2') === '硕士',
      学习形式: val('form') === '全日制',
      是否最高学历: val('highest') === '是',
      已有值_不覆盖: val('ethnic') === '汉族',
      选项无匹配_不乱选: val('hobby') === '',
      原生姓名: document.getElementById('n-name').value === '李思远',
      原生学校: document.getElementById('e1-school').value === '示例大学',
      浮层_全部关闭: [...document.querySelectorAll('.ant-select-dropdown')].every((d) => d.hidden),
    };
  },

  'antd-datetime.html': () => {
    const dv = (k) => document.querySelector(`[data-dp="${k}"] .ant-picker-selection-item`).textContent.trim();
    const cv = (k) => document.querySelector(`[data-cas="${k}"] .ant-cascader-selection-item`).textContent.trim();
    return {
      出生日期_精确到日: dv('birth') === '2000-06-15',
      毕业时间_月份粒度: dv('grad') === '2027-06',
      获奖时间_月份粒度: dv('award') === '2022-10',
      发表时间_已有值不覆盖: dv('pub') === '2020-01',
      级联_意向城市走到叶子: cv('city1') === '上海 / 上海市 / 浦东新区',
      级联_现居城市走到叶子: cv('city2') === '上海 / 上海市 / 徐汇区',
      浮层_全部关闭: [...document.querySelectorAll('.ant-picker-dropdown,.ant-cascader-dropdown')].every((d) => d.hidden),
    };
  },

  'expand-blocks.html': () => {
    const q = (c) => [...document.querySelectorAll('.' + c)].map((e) => e.value);
    const edu = q('edu-school'), work = q('work-company'), paper = q('paper-name'), comp = q('comp-name');
    return {
      教育_展开到2段: edu.length === 2,
      教育1: edu[0] === '示例大学',
      教育2: edu[1] === '样例学院',
      实习_展开到2段_按位置判断归属: work.length === 2,
      实习1: work[0] === '甲公司',
      实习2: work[1] === '乙公司',
      实习2描述: q('work-desc')[1].includes('NPC Agent'),
      论文_展开到3篇: paper.length === 3,
      论文1: paper[0].startsWith('Alpha'),
      论文3: paper[2].startsWith('Gamma'),
      论文作者顺序各不同: q('paper-order').join() === '第一作者,第二作者,第三作者',
      竞赛_档案只有1项_不该展开: comp.length === 1,
      提交删除上传搜索_一次都没被点: window.BAD_CLICKS.length === 0,
    };
  },

  'dji-style.html': (v) => ({
    姓名: v('p-name') === '李思远',
    当前所在国家: v('p-country') === '中国',
    当前所在地: v('p-city') === '上海',
    教育1_年月: v('e1-sy') === '2024' && v('e1-sm') === '9' && v('e1-ey') === '2027' && v('e1-em') === '6',
    教育1_学校: v('e1-school') === '示例大学',
    教育1_院系: v('e1-college') === '计算机科学与工程系',
    教育1_是否有实验室_不该填成实验室名: v('e1-haslab') === '',
    教育1_实验室名_档案无值: v('e1-lab') === '',
    教育1_实验室级别_档案无值: v('e1-lablevel') === '',
    教育1_负责老师_档案无值: v('e1-advisor') === '',
    教育2_年月: v('e2-sy') === '2020' && v('e2-em') === '6',
    教育2_学校: v('e2-school') === '样例学院',
    教育2_成绩排名: v('e2-rank') === '2/30(实验班)',
    实习1_公司: v('w1-company') === '甲公司',
    实习1_年月: v('w1-sy') === '2026' && v('w1-sm') === '4',
    实习1_至今留空: v('w1-ey') === '',
    实习1_工作职责: v('w1-desc').includes('0.7299'),
    实习2_公司: v('w2-company') === '乙公司',
    实习2_年月: v('w2-sy') === '2026' && v('w2-em') === '3',
    赛事_名称: v('c1-name') === '示例数学建模竞赛',
    赛事_描述: v('c1-desc').includes('建模'),
    赛事_年月: v('c1-sy') === '2022' && v('c1-sm') === '9',
    项目_名称: v('j1-name').includes('示例项目'),
    项目_描述: v('j1-desc').includes('next-token'),
    项目_年月: v('j1-sy') === '2024' && v('j1-em') === '12',
    获奖_描述用奖项而非项目: v('a1-desc').includes('综合成绩排名前列'),
    获奖_不是赛事内容: !v('a1-desc').includes('建模'),
    获奖_不是项目内容: !v('a1-desc').includes('next-token'),
    语言证书及成绩_合并两字段: v('l1-cs').includes('CET-6') && v('l1-cs').includes('技术交流'),
    自我描述: v('s-intro').includes('AI for Science'),
    论文1_名称_靠区块标题: v('r1-name').startsWith('Alpha'),
    论文1_描述: v('r1-desc').includes('第一篇'),
    论文1_成果映射到类型: v('r1-result').includes('CCF A'),
    论文2_名称: v('r2-name').startsWith('Beta'),
    论文2_成果: v('r2-result').includes('SCI 一区'),
    简历已注入: document.getElementById('f-resume').files[0]?.name === '示例简历.pdf',
    照片_不该填: document.getElementById('f-photo').files.length === 0,
  }),

  'oppo-style.html': (v) => ({
    姓名: v('b-name') === '李思远',
    联系电话: v('b-phone') === '13800138000',
    电子邮箱: v('b-email') === 'test@example.com',
    国籍: v('b-nation') === '中国',
    籍贯_档案无值: v('b-hometown') === '',
    证件号_档案无值: v('b-id') === '',
    意向面试地点: v('b-interview') === '上海',
    工作1_公司: v('w1-company') === '甲公司',
    工作1_岗位: v('w1-title') === '大模型算法实习生',
    工作1_职责: v('w1-desc').includes('0.7299'),
    工作1_部门_档案无值: v('w1-dept') === '',
    工作2_公司: v('w2-company') === '乙公司',
    工作2_职责: v('w2-desc').includes('NPC Agent'),
    项目_名称: v('j1-name').includes('示例项目'),
    项目_角色: v('j1-role').includes('第一作者'),
    项目_职责用duty: v('j1-duty').includes('数据管线'),
    语种: v('l1-name') === '英语',
    语言证书: v('l1-cert') === 'CET-6',
    等级分数: v('l1-score').includes('技术交流'),
    // 合并列表:竞赛在前、荣誉在后
    合并1_类型是竞赛: v('h1-kind') === '竞赛',
    合并1_名称是竞赛: v('h1-name') === '示例数学建模竞赛',
    合并1_级别抽出国家级: v('h1-level') === '国家级',
    合并1_等级: v('h1-grade') === '省级二等奖',
    合并2_类型是奖学金: v('h2-kind') === '奖学金',
    合并2_名称是奖学金: v('h2-name') === '示例一等奖学金',
    合并2_级别抽出校级: v('h2-level') === '校级',
    合并2_等级: v('h2-grade') === '一等',
    合并2_时间: v('h2-date') === '2022-10',
    合并3_继续排到第二个奖学金: v('h3-name') === '示例二等奖学金',
    合并3_类型: v('h3-kind') === '奖学金',
    论文_名称: v('r1-name').startsWith('Alpha'),
    论文_详情: v('r1-desc').includes('第一篇'),
    校内活动: v('s-campus').includes('科研助理'),
    // 紧急联系人:三个字段一个都不能填
    紧急联系人_姓名不填: v('ec-name') === '',
    紧急联系人_电话不填: v('ec-phone') === '',
    紧急联系人_邮箱不填: v('ec-email') === '',
  }),

  /* 按真实 OPPO 页面的控件构成:类别/级别/竞赛还是奖学金是下拉,时间是日期控件。
   * 档案第一条竞赛的 type 写的是「国家级」—— 那是级别不是类别,
   * 直接喂给类别下拉的话选项里没有,整栏落空。 */
  'oppo-widgets.html': (v) => {
    const wv = (id) => (document.getElementById(id).querySelector(
      '.ant-select-selection-item,.ant-picker-selection-item')?.textContent || '').trim();
    return {
      // 第 1 段 = 竞赛,档案里 type 只写了「国家级」——那是级别,不是类别
      段1_类型选中竞赛: wv('sel-kind') === '竞赛',
      段1_级别选中国家级: wv('sel-lvl') === '国家级',
      段1_类别不能被级别值污染: wv('sel-cat') !== '国家级',
      // type 里只有级别,类别从竞赛名称查表得出:数学建模属于学科竞赛
      段1_类别由竞赛名推出: wv('sel-cat') === '学科竞赛',
      段1_名称: v('w1-name') === '示例数学建模竞赛',
      段1_获奖时间_日期控件: wv('w1-date') === '2022-09',
      段1_等级是文本框: v('w1-grade') === '省级二等奖',

      // 第 2 段 = 奖学金,type 是「校级奖学金」——级别与类别都能拆出来
      段2_类型选中奖学金: wv('sel-kind2') === '奖学金',
      段2_类别拆出奖学金: wv('sel-cat2') === '奖学金',
      段2_级别拆出校级: wv('sel-lvl2') === '校级',
      段2_名称_已分段: v('w2-name') === '示例一等奖学金',
      段2_获奖时间: wv('w2-date') === '2022-10',
      段2_等级: v('w2-grade') === '一等',

      论文名称: v('r1-name').startsWith('Alpha'),
      发表时间_日期控件: wv('r1-date') === '2026-05',
      论文详情: v('r1-desc').includes('第一篇'),
    };
  },

  /* 合并区块 + 短标签:「名称」「类别」「级别」「等级」单看只能命中 award.* 规则,
   * 靠区块标题「竞赛/获奖经历」才能改判到合并流 honors。
   * 档案里 competitions 1 条 + awards 3 条 → honors 4 条,前两条是竞赛与一等奖学金。 */
  'oppo-short.html': (v) => ({
    合并1_类型是竞赛: v('s1-kind') === '竞赛',
    // type 只写了「国家级」(级别),类别由竞赛名称查表得出
    合并1_类别由竞赛名推出: v('s1-cat') === '学科竞赛',
    合并1_名称: v('s1-name') === '示例数学建模竞赛',
    合并1_时间_取自竞赛而非奖项: v('s1-date') === '2022-09',
    合并1_级别: v('s1-level') === '国家级',
    合并1_等级: v('s1-grade') === '省级二等奖',
    合并2_类型是奖学金: v('s2-kind') === '奖学金',
    // 「校级奖学金」拆成 级别=校级 + 类别=奖学金
    合并2_类别拆出奖学金: v('s2-cat') === '奖学金',
    合并2_名称: v('s2-name') === '示例一等奖学金',
    合并2_时间: v('s2-date') === '2022-10',
    合并2_级别: v('s2-level') === '校级',
    合并2_等级: v('s2-grade') === '一等',

    论文1_名称: v('p1-name').startsWith('Alpha'),
    论文1_类别用type: v('p1-type').includes('CCF A'),
    论文1_时间: v('p1-date') === '2026-05',
    论文1_详情: v('p1-desc').includes('第一篇'),
    论文2_名称_已分段: v('p2-name').startsWith('Beta'),
    论文2_类别: v('p2-type').includes('SCI 一区'),

    // 已填内容一律不许动
    已填_姓名不覆盖: v('k-name') === '张三',
    已填_手机不覆盖: v('k-phone') === '13900001111',
    已填_自我评价不覆盖: v('k-intro').includes('别动'),
    已选_单选组不改: document.getElementById('k-male').checked
      && !document.getElementById('k-female').checked,
    已选_下拉不改: document.getElementById('k-degree').value === '博士',
    已传_附件不替换: document.getElementById('k-resume').files[0].name === '我改过的简历-投OPPO.pdf',
  }),

  /* 这页自己驱动填充 —— 要观察的是「填充过程中」的提示条,跑完再看就晚了 */
  'progress.html': async () => {
    const ID = '__rqf_progress__';
    const box = () => document.getElementById(ID);
    const txtOf = () => box()?.querySelector('[data-t]')?.textContent || '';

    const texts = [], widths = [];
    /* 逐条读 MutationRecord 而不是在回调里读当前值:同一个任务里的多次更新会
     * 合并成一次回调,只读当前值就只能看到最后一条,中间过程全丢。 */
    const obs = new MutationObserver((recs) => {
      for (const r of recs) {
        const host = (r.target.nodeType === 3 ? r.target.parentElement : r.target);
        if (!host || !host.closest || !host.closest('#' + ID)) continue;
        if (r.type === 'childList') {
          for (const n of r.addedNodes) if (n.nodeType === 3) texts.push(String(n.data || ''));
        } else if (r.type === 'characterData') {
          texts.push(String(r.target.data || ''));
        } else if (r.type === 'attributes' && host.hasAttribute('data-b')) {
          widths.push(parseFloat(host.style.width) || 0);
        }
      }
    });
    obs.observe(document.body, {
      subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style'],
    });

    const fieldsBefore = document.querySelectorAll('input, textarea, select').length;
    const report = await window.__RQF.fill(window.RQF_TEST_PROFILE, window.RQF_TEST_FILE);
    obs.disconnect();

    const doneText = txtOf();
    /* getComputedStyle 返回的是活对象:下一次填充会把这个节点摘掉重建,
     * 到那时再读就全是空值了 —— 必须当场取成快照。 */
    const cs = box() ? getComputedStyle(box()) : null;
    const pointerEvents = cs && cs.pointerEvents;
    const zIndex = Number(cs && cs.zIndex);

    // 再跑一次:mount 前先 destroy,不能叠出第二条
    await window.__RQF.fill(window.RQF_TEST_PROFILE, window.RQF_TEST_FILE);
    const instances = document.querySelectorAll('#' + ID).length;

    /* 出错路径:normalize(null) 会抛。提示条必须换成告警,
     * 而不是永远挂着「正在填充…」—— 那比没有提示更像卡死。 */
    let threw = false;
    try { await window.__RQF.fill(null, null); } catch { threw = true; }
    const errText = txtOf();

    // 提示条本身不能被引擎当成页面内容:既不是字段,也不是区块标题
    const s = window.__RQF.scan(window.RQF_TEST_PROFILE);
    const fieldsAfter = document.querySelectorAll('input, textarea, select').length;

    return {
      填充中报告了进度: texts.some((t) => /正在填充/.test(t)),
      逐字段报告了标签: texts.some((t) => /正在填充 \d+\/\d+ · .+/.test(t)),
      慢路径_下拉单独提示: texts.some((t) => /正在选择「/.test(t)),
      进度条真的在推进: widths.length > 2 && widths.some((w, i) => i > 0 && w > widths[i - 1]),
      收尾显示已填数: doneText.includes(`已填 ${report.filled.length} 项`),
      收尾提醒自行核对: doneText.includes('核对'),
      不挡住页面点击: pointerEvents === 'none',
      浮在最上层: zIndex > 1000,
      重复填充不叠加: instances === 1,
      出错时抛出: threw,
      出错时换成告警: /⚠️/.test(errText) && !/正在填充/.test(errText),
      未被扫描成字段: !s.rows.some((r) => /正在填充|已填|正在选择/.test(r.label)),
      未新增表单控件: fieldsAfter === fieldsBefore,
    };
  },

  'custom-widgets.html': () => {
    // 这页只验证「诊断能不能看见自定义控件」,不做填充
    const s = window.__RQF.scan(window.RQF_TEST_PROFILE);
    const by = (kw) => s.rows.find((r) => r.label.includes(kw));
    return {
      探测到自定义控件: s.customWidgets >= 6,
      性别_识别为自定义下拉: (by('性别')?.ctrl || '').includes('自定义下拉'),
      性别_仍命中gender规则: by('性别')?.rule === 'gender',
      出生日期_识别为自定义日期: (by('出生日期')?.ctrl || '').includes('自定义日期'),
      意向城市_识别为自定义级联: (by('意向工作城市')?.ctrl || '').includes('自定义级联'),
      调剂_识别为自定义单选: (by('是否接受调剂')?.ctrl || '').includes('自定义单选'),
      自我评价_识别为富文本: (by('自我评价')?.ctrl || '').includes('富文本'),
      有值下拉_识别为已填: by('政治面貌')?.filled === true,
      单选组_不误报已填: by('是否接受调剂')?.filled === false,
      原生姓名仍在: by('姓名')?.ctrl === 'input:text',
    };
  },
};

/* ---------------- 执行器 ---------------- */
const loadEngine = async () => {
  const src = await (await fetch('../content.js?t=' + performance.now())).text();
  (0, eval)(src);
};

/* 这些页面自己决定怎么调引擎:custom-widgets 只扫描不填充,
 * progress 需要在填充过程中架观察器,跑完再看就晚了。 */
const SELF_DRIVEN = new Set(['custom-widgets.html', 'progress.html']);

/** 跑当前页面的断言 */
window.rqfRun = async () => {
  const page = location.pathname.split('/').pop();
  const checks = CHECKS[page];
  if (!checks) return { page, error: '没有为该页面登记断言' };
  await loadEngine();
  let report = { filled: [], skipped: [], unmatched: [] };
  if (!SELF_DRIVEN.has(page)) {
    report = await window.__RQF.fill(window.RQF_TEST_PROFILE, window.RQF_TEST_FILE);
  }
  const v = (id) => document.getElementById(id).value;
  const st = (id) => document.getElementById(id).selectedOptions[0]?.textContent || '';
  const result = await checks(v, st);
  const fails = Object.entries(result).filter(([, ok]) => !ok).map(([k]) => k);
  return {
    page,
    version: window.__RQF.version,
    pass: fails.length === 0,
    total: Object.keys(result).length,
    fails,
    filled: report.filled.length,
    unmatched: report.unmatched.map((u) => u.label),
    skipped: report.skipped.map((s) => `${s.label} → ${s.reason}`),
  };
};

/** 页面带 ?run=1 时自动执行,并把结果播报给 index.html */
window.rqfAuto = async () => {
  if (!/[?&]run=1/.test(location.search)) return;
  let r;
  try { r = await window.rqfRun(); }
  catch (e) { r = { page: location.pathname.split('/').pop(), pass: false, error: String(e && e.message || e) }; }
  const bar = document.createElement('div');
  bar.style.cssText = 'position:sticky;top:0;z-index:999;padding:8px 14px;font:13px/1.5 -apple-system,sans-serif;'
    + `color:#fff;background:${r.pass ? '#16a34a' : '#dc2626'}`;
  bar.textContent = r.pass
    ? `✅ ${r.page} — ${r.total} 项断言全部通过(引擎 ${r.version})`
    : `❌ ${r.page} — 失败:${(r.fails || []).join('、') || r.error}`;
  document.body.prepend(bar);
  try { parent.postMessage({ __rqf: true, ...r }, '*'); } catch { }
  return r;
};
