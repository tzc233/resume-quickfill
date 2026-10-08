/* ============================================================================
 * 本机模型自测集 —— 每一组都来自这段时间真实踩过的页面,只含标签与结构,不含任何个人信息。
 * expect 是人工标注的正确答案;'none' 表示这一栏档案里没有、或者根本不该填(陷阱题)。
 * record 是列表栏的段号(从 0 开始)。
 * ========================================================================== */
(() => {
  const g = typeof window !== 'undefined' ? window : self;
  let id = 0;
  const F = (label, section, group, expect, record, options) =>
    ({ id: ++id, label, section, group, expect, ...(record !== undefined ? { record } : {}), ...(options ? { options } : {}) });

  g.rqfAIEval = [
    { form: '建设银行(模块名对不上旧别名)', cases: [
      F('学校', '教育经历', '教育经历 1', 'education.school', 0),
      F('院系', '教育经历', '教育经历 1', 'education.college', 0),
      F('专业', '教育经历', '教育经历 1', 'education.major', 0),
      F('学校', '教育经历', '教育经历 2', 'education.school', 1),
      F('单位名称', '实习实践', '实习实践 1', 'work.company', 0),
      F('部门及岗位', '实习实践', '实习实践 1', 'work.title', 0),
      F('工作描述', '实习实践', '实习实践 1', 'work.desc', 0),
      F('单位名称', '实习实践', '实习实践 2', 'work.company', 1),
      F('所在单位', '项目实践', '项目实践 1', 'none'),
      F('项目名称', '项目实践', '项目实践 1', 'projects.name', 0),
      F('经历描述', '项目实践', '项目实践 1', 'projects.desc', 0),
      F('奖励名称', '奖励荣誉', '奖励荣誉 1', 'awards.name', 0),
      F('奖励级别', '奖励荣誉', '奖励荣誉 1', 'awards.type', 0, ['国家级', '省部级', '市级', '院系级', '其他']),
      F('奖励名称', '奖励荣誉', '奖励荣誉 2', 'awards.name', 1),
    ] },
    { form: '工商银行(家庭成员一组一组)', cases: [
      F('姓名', '基本信息', '', 'basic.fullName'),
      F('父亲', '家庭信息', '父亲', 'family.father.name'),
      F('是否为工商银行员工', '家庭信息', '父亲', 'none', undefined, ['是', '否']),
      F('工作单位', '家庭信息', '父亲', 'family.father.company'),
      F('工作职务', '家庭信息', '父亲', 'family.father.title'),
      F('母亲', '家庭信息', '母亲', 'family.mother.name'),
      F('工作单位', '家庭信息', '母亲', 'family.mother.company'),
      F('工作职务', '家庭信息', '母亲', 'family.mother.title'),
    ] },
    { form: '优必选(汇总栏与段号)', cases: [
      F('最高学历', '教育经历', '', 'education.degree', 0, ['大专', '本科', '硕士', '博士']),
      F('学校名称', '教育经历', '教育经历 1', 'education.school', 0),
      F('学历', '教育经历', '教育经历 1', 'education.degree', 0),
      F('学习形式', '教育经历', '教育经历 1', 'education.studyForm', 0, ['全日制', '非全日制']),
      F('学校名称', '教育经历', '教育经历 2', 'education.school', 1),
      F('班级排名', '教育经历', '教育经历 2', 'education.rank', 1, ['前5%', '前10%', '前20%', '前30%', '前50%', '其他']),
      F('语言类型', '外语能力', '外语能力 1', 'languages.name', 0),
      F('语言等级', '外语能力', '外语能力 1', 'languages.cert', 0),
      F('获得荣誉', '其他信息', '', 'summary.awards'),
      F('参赛经历', '其他信息', '', 'summary.competitions'),
      F('专利成果', '其他信息', '', 'summary.patents'),
      F('论文/专著', '其他信息', '', 'summary.papers'),
    ] },
    { form: '通用基本信息与陷阱题', cases: [
      F('手机号码', '基本信息', '', 'basic.phone'),
      F('电子邮箱', '基本信息', '', 'basic.email'),
      F('微信号', '基本信息', '', 'basic.wechat'),
      F('出生日期', '基本信息', '', 'basic.birthday'),
      F('政治面貌', '基本信息', '', 'basic.politicalStatus', undefined, ['中共党员', '共青团员', '群众']),
      F('现居住地', '基本信息', '', 'basic.city'),
      F('期望工作地点', '求职意向', '', 'basic.expectedCity'),
      F('期望薪资', '求职意向', '', 'basic.expectedSalary'),
      F('籍贯', '基本信息', '', 'basic.hometown'),
      F('身份证号', '基本信息', '', 'basic.idNumber'),
      F('短信验证码', '基本信息', '', 'none'),
      F('我已阅读并同意《隐私政策》', '', '', 'none'),
      F('紧急联系人姓名', '紧急联系人', '', 'none'),
      F('紧急联系人电话', '紧急联系人', '', 'none'),
      F('内推人工号', '其他信息', '', 'none'),
      F('公司性质', '实习经历', '实习经历 1', 'none', undefined, ['国企', '民营', '外企']),
      F('自我评价', '自我评价', '', 'intro'),
      F('专业技能', '技能特长', '', 'skills'),
      F('学生工作经历', '校园经历', '', 'campusWork'),
    ] },
    { form: '奖项与竞赛分开列', cases: [
      F('获奖名称', '获奖经历', '获奖经历 1', 'awards.name', 0),
      F('获奖时间', '获奖经历', '获奖经历 1', 'awards.date', 0),
      F('获奖等级', '获奖经历', '获奖经历 1', 'awards.result', 0, ['特等', '一等', '二等', '三等']),
      F('获奖名称', '获奖经历', '获奖经历 2', 'awards.name', 1),
      F('竞赛名称', '竞赛经历', '竞赛经历 1', 'competitions.name', 0),
      F('竞赛成绩', '竞赛经历', '竞赛经历 1', 'competitions.result', 0),
    ] },
    { form: '论文拆字段(中兴式)', cases: [
      F('论文名称', '论文发表', '论文 1', 'papers.name', 0),
      F('发表期刊/会议', '论文发表', '论文 1', 'papers.type', 0),
      F('作者排序', '论文发表', '论文 1', 'papers.authorOrder', 0, ['第一作者', '第二作者', '第三作者', '其他']),
      F('发表时间', '论文发表', '论文 1', 'papers.date', 0),
      F('论文名称', '论文发表', '论文 2', 'papers.name', 1),
    ] },
    { form: '英文表单', cases: [
      F('First Name', 'Personal Information', '', 'basic.firstNameEn'),
      F('Last Name', 'Personal Information', '', 'basic.lastNameEn'),
      F('University', 'Education', 'Education 1', 'education.school', 0),
      F('Graduation Date', 'Education', 'Education 1', 'education.endTime', 0),
      F('Company', 'Work Experience', 'Work Experience 1', 'work.company', 0),
      F('Job Title', 'Work Experience', 'Work Experience 1', 'work.title', 0),
      F('How did you hear about us?', 'Additional Questions', '', 'none', undefined, ['LinkedIn', 'Referral', 'Campus Event']),
    ] },
  ];
})();
