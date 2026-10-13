/* ============================================================================
 * 本机模型对号入座(实验)—— Chrome 内置 Gemini Nano(Prompt API)
 *
 * 规则表见一个补一个:建行的「奖励荣誉」、优必选的「最高学历」、工行的「父亲」一组……
 * 都是「看不懂这张表在问什么」。这里让本机模型只回答一件事:每个字段对应档案的哪一栏、
 * 第几段;拿不准就答 none。取值、写入、回读验证仍由插件用本地档案完成 —— 模型认错,
 * 最多是认错栏,编不出内容。
 *
 * 发给模型的只有:字段标签、所在模块标题、组标题(「奖励荣誉 1」「父亲」)、下拉选项。
 * 页面上已有的值、档案内容一概不发;而且模型在本机跑,零网络请求。
 * 输出用 JSON Schema 锁死:key 只能是 KEYS 里的一项或 none,record 只能是 -1~9。
 * ========================================================================== */
(() => {
  const g = typeof window !== 'undefined' ? window : self;

  /* 档案栏目。描述用中文 —— 模型要拿它和中文标签对照;键名就是档案路径。 */
  const KEYS = {
    'basic.fullName': '本人姓名', 'basic.firstNameEn': '英文名(First Name)', 'basic.lastNameEn': '英文姓(Last Name)',
    'basic.gender': '性别', 'basic.birthday': '出生日期', 'basic.phone': '本人手机号', 'basic.email': '本人邮箱',
    'basic.wechat': '微信号', 'basic.idType': '证件类型', 'basic.idNumber': '证件号码',
    'basic.politicalStatus': '本人政治面貌', 'basic.ethnicity': '民族', 'basic.hometown': '籍贯 / 户口所在地',
    'basic.nationality': '国籍', 'basic.city': '现居城市', 'basic.expectedCity': '期望工作城市',
    'basic.expectedSalary': '期望薪资', 'basic.availableDate': '到岗时间', 'basic.gradYear': '毕业年份',
    'education.school': '教育经历:学校', 'education.degree': '教育经历:学历', 'education.major': '教育经历:专业',
    'education.college': '教育经历:学院 / 院系', 'education.startTime': '教育经历:入学时间',
    'education.endTime': '教育经历:毕业时间', 'education.eduType': '教育经历:学历类型(统招等)',
    'education.studyForm': '教育经历:学习形式(全日制等)', 'education.rank': '教育经历:成绩 / 专业排名',
    'education.gpaScore': '教育经历:GPA', 'education.research': '教育经历:研究方向',
    'education.advisor': '教育经历:导师', 'education.lab': '教育经历:实验室',
    'work.company': '实习 / 工作经历:公司名称', 'work.title': '实习 / 工作经历:职位', 'work.dept': '实习 / 工作经历:部门',
    'work.startTime': '实习 / 工作经历:开始时间', 'work.endTime': '实习 / 工作经历:结束时间',
    'work.desc': '实习 / 工作经历:工作内容描述',
    'projects.name': '项目经历:项目名称', 'projects.role': '项目经历:担任角色', 'projects.duty': '项目经历:项目职责',
    'projects.startTime': '项目经历:开始时间', 'projects.endTime': '项目经历:结束时间', 'projects.desc': '项目经历:项目描述',
    'papers.name': '论文:题目', 'papers.type': '论文:期刊 / 会议', 'papers.authorOrder': '论文:作者排序',
    'papers.date': '论文:发表时间', 'papers.url': '论文:链接', 'papers.desc': '论文:描述',
    'competitions.name': '竞赛:名称', 'competitions.type': '竞赛:级别', 'competitions.result': '竞赛:名次 / 成绩',
    'competitions.awardDate': '竞赛:获奖时间', 'competitions.desc': '竞赛:描述',
    'awards.name': '获奖 / 荣誉 / 奖学金:名称', 'awards.type': '获奖:级别 / 类型', 'awards.result': '获奖:等级',
    'awards.date': '获奖:时间', 'awards.desc': '获奖:描述',
    'languages.name': '外语:语种', 'languages.cert': '外语:证书 / 等级', 'languages.score': '外语:成绩',
    'family.father.name': '父亲姓名', 'family.father.company': '父亲工作单位', 'family.father.title': '父亲职务',
    'family.father.phone': '父亲电话', 'family.mother.name': '母亲姓名', 'family.mother.company': '母亲工作单位',
    'family.mother.title': '母亲职务', 'family.mother.phone': '母亲电话',
    'intro': '自我介绍 / 自我评价', 'skills': '专业技能', 'campusWork': '校园经历 / 学生工作',
    'summary.awards': '整段:获奖情况汇总(一个大文本框)', 'summary.competitions': '整段:参赛经历汇总',
    'summary.papers': '整段:论文 / 科研成果汇总', 'summary.patents': '整段:专利成果汇总',
    'summary.languages': '整段:外语能力汇总',
  };
  const LIST = /^(education|work|projects|papers|competitions|awards|languages)\./;

  // 示范题:标签全部不在评测集里,不泄露答案;中英文提示共用
  const EXAMPLES = [
    '{"id":1,"label":"户口所在地","section":"基本信息","group":""} -> {"id":1,"key":"basic.hometown","record":-1}',
    '{"id":2,"label":"个人简介","section":"其他","group":""} -> {"id":2,"key":"intro","record":-1}',
    '{"id":3,"label":"公司","section":"实践经历","group":"实践经历 2"} -> {"id":3,"key":"work.company","record":1}',
    '{"id":4,"label":"就读院校","section":"学习经历","group":"学习经历 1"} -> {"id":4,"key":"education.school","record":0}',
    '{"id":5,"label":"所获荣誉","section":"荣誉","group":"荣誉 3"} -> {"id":5,"key":"awards.name","record":2}',
    '{"id":6,"label":"联系人与本人关系","section":"紧急联系人","group":""} -> {"id":6,"key":"none","record":-1}',
    '{"id":7,"label":"民族","section":"基本信息","group":""} -> {"id":7,"key":"basic.ethnicity","record":-1}',
  ];
  const SYSTEM = [
    'You map fields of a Chinese job-application form to keys of the applicant\'s profile.',
    'For each field you get: id, label, section (module heading), group (record header such as "奖励荣誉 1" or a relative such as "父亲"), and options for dropdowns.',
    'Answer key = exactly one profile key from the list below, or "none".',
    'Answer record = 0-based index of the entry for list keys (education/work/projects/papers/competitions/awards/languages), taken from the record number in group/section ("教育经历 2" -> 1); use -1 for non-list keys.',
    'Answer "none" when: unsure; the field asks about another person (emergency contact, referrer, relatives other than father/mother); it is a captcha, password, agreement or consent; it is a yes/no question about the applicant\'s relation to the employer; or no key fits.',
    'A field inside a project module that asks for the organization/company of the project has no key: answer "none".',
    'Never guess. A wrong key is worse than "none".',
    'Always return one answer for every field id you are given.',
    'Examples (field -> answer):',
    ...EXAMPLES,
    'Profile keys:',
    ...Object.entries(KEYS).map(([k, d]) => `${k}: ${d}`),
  ].join('\n');
  /* 中文提示。官方声明支持的语言里没有中文,但能不能用要直接量:
   * 自测页把中文提示和英文提示各跑一遍,并排给出结果。 */
  const SYSTEM_ZH = [
    '你要把一张中文招聘申请表的字段,对应到求职者档案的栏目。',
    '每个字段给你:id、label(标签)、section(所在模块标题)、group(记录头,如「奖励荣誉 1」,或家人称谓如「父亲」),下拉框还有 options(选项)。',
    'key 只能从下面的档案栏目里选一个,或者答 "none"。',
    'record:列表类栏目(education / work / projects / papers / competitions / awards / languages)填从 0 开始的段号,按 group 或 section 里的序号算(「教育经历 2」→ 1);其他栏目填 -1。',
    '以下情况一律答 "none":拿不准;问的是别人(紧急联系人、推荐人、父母以外的亲属);验证码、密码、协议、同意;问求职者和招聘单位关系的是/否题;没有合适的栏目。',
    '项目模块里问「所在单位 / 公司」的字段没有对应栏目,答 "none"。',
    '绝不要猜。答错栏比答 none 更糟。',
    '给你的每个 id 都必须作答。',
    '示例(字段 -> 回答):',
    ...EXAMPLES,
    '档案栏目:',
    ...Object.entries(KEYS).map(([k, d]) => `${k}: ${d}`),
  ].join('\n');

  // 只挑这几样发给模型 —— 值(value)、档案内容一律不发
  const pick = (f) => ({ id: f.id, label: String(f.label || '').slice(0, 60),
    section: String(f.section || '').slice(0, 30), group: String(f.group || '').slice(0, 30),
    ...(f.options && f.options.length ? { options: f.options.slice(0, 12).map((o) => String(o).slice(0, 20)) } : {}) });
  const buildPrompt = (fields) => 'Fields:\n' + fields.map((f) => JSON.stringify(pick(f))).join('\n');

  const schema = (fields) => ({
    type: 'object',
    properties: {
      answers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer', enum: fields.map((f) => f.id) },
            key: { type: 'string', enum: [...Object.keys(KEYS), 'none'] },
            record: { type: 'integer', minimum: -1, maximum: 9 },
          },
          required: ['id', 'key', 'record'],
        },
      },
    },
    required: ['answers'],
  });

  /* 模型的回答一律当不可信输入:id 必须是这一批的、key 必须在表里,
   * 列表栏必须带合法段号,否则按 none 处理(宁可留空)。 */
  const validate = (raw, fields) => {
    const out = new Map(fields.map((f) => [f.id, { key: 'none', record: -1 }]));
    let data = raw;
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw); } catch {
        /* 思考模型(deepseek-reasoner)和部分代理会在 JSON 外面裹一层推理文字或
         * ```json 围栏。把第一个到最后一个花括号之间的内容抠出来再试一次 ——
         * 键的白名单校验在下面照旧,抠取不放宽任何东西。 */
        const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
        if (a < 0 || b <= a) return out;
        try { data = JSON.parse(raw.slice(a, b + 1)); } catch { return out; }
      }
    }
    for (const a of (data && Array.isArray(data.answers)) ? data.answers : []) {
      if (!a || !out.has(a.id)) continue;
      const key = typeof a.key === 'string' && (a.key in KEYS) ? a.key : 'none';
      const record = Number.isInteger(a.record) ? a.record : -1;
      if (key !== 'none' && LIST.test(key) && (record < 0 || record > 9)) continue;
      out.set(a.id, { key, record: LIST.test(key) ? record : -1 });
    }
    return out;
  };

  /* ---- 云端 API 传输层(实验)----------------------------------------------
   * 本机 Nano 自测没过门槛(2026-10-08:错填 18~19,门槛是错填 0 且 ≥85%)。
   * 换更大的模型只需要换传输:提示词、档案栏白名单、validate、计分全部复用,
   * 发出去的仍然只有「标签 / 模块标题 / 组标题 / 下拉选项」——
   * 页面上已有的值和档案内容一概不发(见文件头)。
   *
   * 与本机模式的唯一区别是:这会产生网络请求,把你正在填的那张表的字段标签
   * 发给模型服务商。默认关闭,必须自己填 API Key 才会启用。
   *
   * Key 只存在 chrome.storage.local,不进 trace、不进可复制的结果、不进仓库。
   * 调用必须发生在扩展自己的页面里(实验页 / 弹窗),绝不能放进内容脚本 ——
   * 那等于把 Key 交到招聘页的 JS 手上。
   * ---------------------------------------------------------------------- */
  /* 端点必须由用户填 —— 第一版把 DeepSeek 官方和百炼的地址写死,而用户用的是
   * 自建 OpenAI 兼容网关(/api/v1/chat/completions),Key 在那两个域名上直接被拒,
   * 18 批全失败。预设只是省打字,真正起作用的是 endpoint 这一项。 */
  const API_PROVIDERS = {
    sjtu: { name: '上海交大模型网关', endpoint: 'https://models.sjtu.edu.cn/api/v1/chat/completions',
      model: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner', 'qwen', 'qwen3.8-27b'] },
    custom: { name: 'OpenAI 兼容端点(自填)', endpoint: '', model: 'deepseek-chat',
      models: ['deepseek-chat', 'deepseek-reasoner', 'qwen', 'qwen3.8-27b'] },
    deepseek: { name: 'DeepSeek 官方', endpoint: 'https://api.deepseek.com/chat/completions',
      model: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'] },
    qwen: { name: '阿里云百炼(兼容模式)', model: 'qwen-plus',
      endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      models: ['qwen-plus', 'qwen-max', 'qwen-turbo'] },
  };

  /* OpenAI 兼容端点收不了 Prompt API 的 responseConstraint,只能靠 json_object
   * 加提示里的格式约定。够不够严不重要 —— validate() 本来就把模型输出当不可信输入,
   * 键不在白名单、段号越界一律按 none 处理。 */
  const API_FORMAT = [
    '',
    'Return JSON only, shaped exactly like this:',
    '{"answers":[{"id":<integer>,"key":"<profile key or none>","record":<integer -1..9>}]}',
    'One entry per given id. No prose, no markdown fence.',
  ].join('\n');

  /* 节流闸是模块级的:整套对比每一轮都新建一次会话,配额却是整个 Key 共用的,
   * 闸门必须跨会话共享,否则换一轮就把限速忘了。 */
  const RATE = { lastAt: 0, gapMs: 0 };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const gate = async () => {
    const wait = RATE.lastAt + RATE.gapMs - Date.now();
    if (wait > 0) await sleep(wait);
    RATE.lastAt = Date.now();
  };
  /** 该等多久:优先用 Retry-After,其次用文案里的「Limit resets at」,都没有就退避。 */
  const waitHintMs = async (res) => {
    const after = Number(res.headers?.get?.('retry-after'));
    if (Number.isFinite(after) && after > 0) return Math.min(after * 1000 + 500, 90000);
    try {
      const body = await res.clone().text();
      const m = body.match(/resets? at[:\s]+([0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9:]+)\s*(UTC)?/i);
      if (m) {
        const t = Date.parse(m[1].replace(' ', 'T') + (m[2] ? 'Z' : ''));
        if (Number.isFinite(t)) return Math.min(Math.max(t - Date.now() + 1000, 1000), 90000);
      }
    } catch { /* 读不到就退避 */ }
    return 8000;
  };

  /** 造一个和 Prompt API 会话同形的对象:只需要 prompt(text)。 */
  const createApiSession = ({ provider = 'custom', endpoint, model, apiKey, lang = 'zh', onWait } = {}) => {
    const def = API_PROVIDERS[provider] || API_PROVIDERS.custom;
    const url = String(endpoint || def.endpoint || '').trim();
    if (!url) throw new Error('没有填端点 URL');
    if (!/^https?:\/\//.test(url)) throw new Error('端点要写完整 URL(以 http(s):// 开头)');
    if (!apiKey) throw new Error('没有填 API Key');
    const system = (lang === 'zh' ? SYSTEM_ZH : SYSTEM) + API_FORMAT;
    const name = def.name;
    /* 不是每个兼容端点都认 response_format。先带上(输出更稳),被 400 顶回来
     * 就去掉重试一次 —— 不然用户只会看到一句「返回 400」。 */
    let useJsonMode = true;
    const call = async (text, json) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || def.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: text }],
        temperature: 0,
        stream: false,
        /* 显式给上限:Nano 那一轮的漏答几乎都是长输出被截断,换成云端代理
         * 更不能让它用一个小默认值把 JSON 截一半(截断的 JSON 会被
         * validate 整批判成 none,看起来就像模型集体保守)。 */
        max_tokens: 4096,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    return {
      provider, endpoint: url, model: model || def.model,
      async prompt(text) {
        let res = null;
        /* 交大网关是 10 次请求的配额(429 文案里写明 Current limit: 10)。
         * 第一次整套对比里 4 轮有 3 轮整轮被限流、一个字都没问出去,
         * 报告却照样算出「13% 错填 0」。这里自己排队 + 撞上 429 就等它重置。 */
        for (let attempt = 0; attempt < 5; attempt++) {
          await gate();
          res = await call(text, useJsonMode);
          if (res.status === 429) {
            const ms = await waitHintMs(res);
            RATE.gapMs = Math.max(RATE.gapMs, 7000);   // 之后的请求自己放慢
            if (attempt === 4) break;
            onWait && onWait({ attempt: attempt + 1, ms });
            await sleep(ms);
            continue;
          }
          if (!res.ok && res.status === 400 && useJsonMode) { useJsonMode = false; continue; }
          break;
        }
        if (!res.ok) {
          /* 原来只抛状态码,结果 DeepSeek 那一轮 18 批全失败、报告却显示
           * 「错填 0 / 漏答 62」,看不出是调用没通 —— 服务商的 message 才是
           * 唯一能分辨 401(Key 错)/ 402(余额不足)/ 400(参数)的信息。
           * 只取 error.message 与 code,并把 Key 本身打码,不回显整个响应体。 */
          let detail = '';
          try {
            const body = await res.text();
            const j = (() => { try { return JSON.parse(body); } catch { return null; } })();
            detail = String(j?.error?.message || j?.message || body || '').slice(0, 200);
          } catch { /* 读不到正文就只报状态码 */ }
          /* 只按「和填进来的 Key 精确相同」打码是不够的:交大网关把密钥裸串回显在
           * 429 文案里(Rate limit exceeded for api_key: <64 位十六进制>),用户填的
           * 可能带前缀或空格,精确匹配就漏了 —— 那串密钥于是进了可复制的报告。
           * 改成:精确匹配之外,凡 24 位以上的十六进制 / sk- 开头的长串一律打码。 */
          if (apiKey) detail = detail.split(apiKey).join('***');
          detail = detail.replace(/\b[0-9a-f]{24,}\b/gi, '***')
            .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-***');
          throw new Error(`${name} 返回 ${res.status}${detail ? ':' + detail : ''}`);
        }
        const data = await res.json();
        return data?.choices?.[0]?.message?.content || '';
      },
    };
  };

  /** 连通性自检:只发一个最简单的字段,成功返回模型原话,失败把服务商的错误抛出来。
   * 跑整套评测之前先用它确认通不通 —— 省掉「18 批全失败还得到一份报告」那种事。 */
  const pingApi = async (cfg) => {
    const s = createApiSession(cfg);
    const t0 = Date.now();
    const raw = await s.prompt(buildPrompt([{ id: 1, label: '姓名', section: '基本信息', group: '' }]));
    const got = validate(raw, [{ id: 1 }]);
    return { ms: Date.now() - t0, raw: String(raw || '').slice(0, 300), key: got.get(1)?.key || 'none' };
  };

  /* Key 的存取。单独放一个键,导出备份时不带它(备份是要发给别人看的)。 */
  const API_STORE = 'rqfAiApiConfig';
  const loadApiConfig = async () => {
    try { return (await g.chrome?.storage?.local?.get(API_STORE))?.[API_STORE] || null; } catch { return null; }
  };
  const saveApiConfig = async (cfg) => {
    try { await g.chrome?.storage?.local?.set({ [API_STORE]: cfg }); return true; } catch { return false; }
  };
  const clearApiConfig = async () => {
    try { await g.chrome?.storage?.local?.remove(API_STORE); return true; } catch { return false; }
  };

  const api = () => g.LanguageModel || null;
  const OPTS = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

  /** 'unavailable' | 'downloadable' | 'downloading' | 'available' | 'no-api' */
  const availability = async () => {
    const LM = api();
    if (!LM) return 'no-api';
    try { return await LM.availability(OPTS); } catch { return 'unavailable'; }
  };

  /** 必须在用户点击里调用:首次会触发模型下载。onProgress(0~1) */
  const createSession = async (onProgress, lang = 'en') => {
    const LM = api();
    if (!LM) throw new Error('这个浏览器没有本机模型接口');
    return LM.create({
      ...OPTS,
      initialPrompts: [{ role: 'system', content: lang === 'zh' ? SYSTEM_ZH : SYSTEM }],
      monitor(m) { m.addEventListener('downloadprogress', (e) => onProgress && onProgress(e.loaded)); },
    });
  };

  /** 一批字段 → Map(id → {key, record})。每批从带系统提示的基础会话克隆,互不串话。 */
  /* 硬规则先拦,不交给模型:验证码 / 密码 / 协议 / 隐私 / 紧急联系人 / 推荐人,
   * 以及只有「是 / 否」的单选题。插件本来就保证不填这些 —— 接入填表时也不会问模型,
   * 自测里照样不问,量的才是真实会发生的情况。 */
  const GUARD = /验证码|校验码|captcha|密码|password|同意|协议|隐私|声明|承诺|紧急联系人|推荐人|内推/i;
  const YES_NO = /^(是|否|yes|no|有|无)$/i;
  const guarded = (f) => GUARD.test(String(f.label || '') + ' ' + String(f.section || ''))
    || (Array.isArray(f.options) && f.options.length > 0 && f.options.length <= 3 && f.options.every((o) => YES_NO.test(String(o).trim())));

  /* 每批 4 个:第一次实测(Chrome 154)里漏答几乎都落在「一整批 8 个列表栏」的批次上,
   * 后面的小批反而全对 —— 像是长输出被截断、剩下的默认成了 none。trace 收原始输出备查。 */
  const resolveFields = async (base, fields, { chunk = 4, trace = null } = {}) => {
    const all = new Map();
    const ask = [];
    for (const f of fields) {
      if (guarded(f)) all.set(f.id, { key: 'none', record: -1, guarded: true });
      else ask.push(f);
    }
    for (let i = 0; i < ask.length; i += chunk) {
      const part = ask.slice(i, i + chunk);
      const s = base.clone ? await base.clone() : base;
      let raw = '', err = null;
      try {
        raw = await s.prompt(buildPrompt(part), { responseConstraint: schema(part) });
      } catch (e) { raw = ''; err = (e && e.message) || String(e); }
      finally { if (s !== base && s.destroy) s.destroy(); }
      const got = validate(raw, part);
      /* 失败的批次要标出来。原来它和「模型答 none」长得一样,
       * 于是一轮全军覆没也能汇报出一份「错填 0」的漂亮成绩单。 */
      if (err) for (const [, ans] of got) ans.failed = err;
      if (trace) trace.push({ ids: part.map((f) => f.id), raw: String(raw || '').slice(0, 600), error: err });
      for (const [id, ans] of got) all.set(id, ans);
    }
    return all;
  };

  /* 计分:对 = 键对且(列表栏)段号对;错填 = 该答 none 却给了键,或给了别的键 / 别的段;
   * 漏答 = 该有键却答了 none。错填是最要紧的数 —— 它对应真实填表时的错填。 */
  /* ignoreRecord:段号交给引擎自己算(它本来就有 DOM 结构可依,这一个月还专门修过
   * 两轮),只量模型认栏位的本事。上次本机自测 19 个错填里约 10~13 个只是段号数错 ——
   * 两个数都给出来,才看得清模型到底弱在哪一环。 */
  const score = (cases, answers, { ignoreRecord = false } = {}) => {
    const rows = [];
    let right = 0, wrong = 0, missed = 0;
    for (const c of cases) {
      const got = answers.get(c.id) || { key: 'none', record: -1 };
      const recOk = ignoreRecord || !LIST.test(c.expect) || c.record === undefined || got.record === c.record;
      let verdict;
      if (got.key === c.expect && recOk) { verdict = 'right'; right++; }
      else if (got.key === 'none') { verdict = 'missed'; missed++; }
      else { verdict = 'wrong'; wrong++; }
      rows.push({ ...c, got, verdict });
    }
    return { rows, right, wrong, missed, total: cases.length };
  };

  g.rqfAI = { KEYS, SYSTEM, SYSTEM_ZH, buildPrompt, schema, validate, guarded, availability, createSession, resolveFields, score,
    API_PROVIDERS, createApiSession, pingApi, loadApiConfig, saveApiConfig, clearApiConfig };
})();
