(() => {
  const V2 = window.__RQF_V2_PARTS = window.__RQF_V2_PARTS || {};
  V2.VERSION = '2.10.0';
  V2.schema = [
    { key: 'basic.fullName', terms: ['姓名', '中文名', 'full name', 'candidate name'], exclude: ['导师', '联系人', '推荐人'] },
    { key: 'basic.phone', terms: ['手机', '手机号', '联系电话', 'mobile', 'phone'], exclude: ['紧急', '验证码'] },
    { key: 'basic.email', terms: ['邮箱', '电子邮件', 'email', 'e-mail'], exclude: ['验证码'] },
    { key: 'basic.ethnicity', terms: ['民族', 'ethnicity'] },
    { key: 'basic.birthday', terms: ['出生日期', '出生时间', 'birthday', 'date of birth'] },
    { key: 'basic.politicalStatus', terms: ['政治面貌', 'political status'] },
    { key: 'basic.idType', terms: ['证件类型', '证件类别', '证件', 'document type', 'id type'], enum: { 身份证: ['身份证', '居民身份证'] } },
    { key: 'basic.gender', terms: ['性别', 'gender', 'sex'], enum: { 男: ['男', 'male', 'm'], 女: ['女', 'female', 'f'] } },
    { key: 'basic.city', terms: ['现居城市', '所在地点', '当前城市', 'current city', 'current location'] },
    { key: 'basic.hometown', terms: ['家乡', '籍贯', '户口所在地', 'hometown', 'native place'] },
    { key: 'basic.expectedCity', terms: ['期望工作地点', '意向城市', '期望城市', 'preferred city', 'expected city'] },
    { domain: 'education', field: 'school', anchor: true, terms: ['学校名称', '毕业院校', '学校', '院校', 'school', 'university'] },
    { domain: 'education', field: 'degree', terms: ['学历', 'education level', 'degree'] },
    { domain: 'education', field: 'eduType', terms: ['学历类型', '培养方式', 'education type'] },
    /* 「专业排名」里有「专业」二字,会被 major 抢走 —— 讯飞那一栏因此想往
     * 排名下拉里写「计算机科学与技术」。档案里本来就有 rank,单列一条。 */
    { domain: 'education', field: 'rank', terms: ['专业排名', '成绩排名', '年级排名', '排名', 'rank'] },
    { domain: 'education', field: 'major', terms: ['专业名称', '专业', 'field of study', 'major'],
      exclude: ['排名', 'rank', '类别', '方向'] },
    { domain: 'education', field: 'college', terms: ['学院', '院系', 'department', 'faculty'] },
    { domain: 'education', field: 'startTime', terms: ['入学时间', '入学日期', '开始就读', 'enrollment date'] },
    { domain: 'education', field: 'endTime', terms: ['毕业时间', '毕业日期', '预计毕业', 'graduation date'] },
    { domain: 'work', field: 'company', anchor: true, terms: ['公司名称', '工作单位', '雇主', 'company', 'employer'] },
    { domain: 'work', field: 'title', terms: ['职位名称', '岗位名称', '职位', 'job title', 'position'] },
    { domain: 'work', field: 'desc', terms: ['工作描述', '实习描述', '工作内容', '经历描述', 'description'] },
    { domain: 'projects', field: 'name', anchor: true, terms: ['项目名称', 'project name'] },
    { domain: 'projects', field: 'role', terms: ['项目角色', '项目职务', 'role'] },
    { domain: 'projects', field: 'url', terms: ['项目链接', 'project link', 'project url'] },
    { domain: 'projects', field: 'desc', terms: ['项目描述', '项目内容', 'description'] },
    { domain: 'awards', field: 'name', anchor: true, terms: ['获奖名称', '奖项名称', '荣誉名称', 'award title'] },
    { domain: 'awards', field: 'date', terms: ['获奖时间', '获奖日期', 'award date'] },
    { domain: 'awards', field: 'desc', terms: ['获奖描述', '奖项描述', 'description'] },
    { domain: 'languages', field: 'name', anchor: true, terms: ['语言', '语种', 'language'] },
    { domain: 'languages', field: 'level', terms: ['精通程度', '熟练程度', 'proficiency', 'language level'] },
  ];
  V2.readPath = (obj, path) => path.split('.').reduce((v, k) => v == null ? undefined : v[k], obj);
  V2.valueFor = (profile, spec) => spec.key === 'basic.idType'
    ? (V2.readPath(profile, spec.key) || (V2.readPath(profile, 'basic.idNumber') ? '身份证' : ''))
    : V2.readPath(profile, spec.key);
  V2.pathAliases = {
    education: ['education', { school: 'school', degree: 'degree', 'education type': 'eduType', 'field of study': 'major', major: 'major' }],
    internship: ['work', { company: 'company', title: 'title', desc: 'desc', start: 'startTime', end: 'endTime' }],
    work: ['work', { company: 'company', title: 'title', desc: 'desc', start: 'startTime', end: 'endTime' }],
    project: ['projects', { name: 'name', role: 'role', link: 'url', desc: 'desc', start: 'startTime', end: 'endTime' }],
    award: ['awards', { title: 'name', name: 'name', desc: 'desc', date: 'date', 'get date': 'date', 'award date': 'date' }],
    language: ['languages', { language: 'name', proficiency: 'level', level: 'level', score: 'score' }],
  };
  V2.sectionAliases = [
    [/教育|学历|education|school/, 'education'], [/实习|工作|internship|work experience/, 'work'],
    [/项目|在校实践|project/, 'projects'], [/获奖|奖项|荣誉|award|honor/, 'awards'], [/语言|外语|language/, 'languages'], [/论文|专著/, 'papers'],
  ];
  V2.pathAliases.practice = ['work', { 'company name': 'company', 'job title': 'title', summary: 'desc' }];
  Object.assign(V2.pathAliases.project[1], { 'project name': 'name', 'project duty': 'role', description: 'desc', responsibility: 'duty' });
  Object.assign(V2.pathAliases.education[1], { 'school name': 'school', 'college name': 'college', 'major name': 'major' });
  for (const domain of ['education', 'work', 'projects']) {
    V2.schema.push({domain, field: 'startTime', terms: ['开始时间', '开始日期', 'start date']},
      {domain, field: 'endTime', terms: ['结束时间', '结束日期', 'end date']});
  }
  for (const [domain, field, terms] of [
    ['work','company',['单位名称']], ['work','desc',['实习内容']],
    ['projects','name',['实践名称']], ['projects','role',['担任角色']], ['projects','desc',['实践描述']],
    ['awards','name',['获奖项']], ['papers','name',['名称']], ['papers','date',['发布时间']], ['papers','desc',['成果描述']],
  ]) V2.schema.push({domain, field, terms});
})();
