/* ============================================================================
 * 简历版本:事实共享,措辞分版本
 *
 * 投互联网和投央国企,两份简历差在措辞 —— 项目/实习描述、技能、研究方向、
 * 校园经历、为什么选择我们,以及附件 PDF。日期、名称、获奖级别、成绩这些事实
 * 必须在所有版本里一致:两份简历写出两套事实,背调时就是硬伤。
 * 所以不做「整份档案复制 N 份」(复制出来的事实迟早各改各的),而是:
 *
 *   档案本身 = 默认版本;任何对象(档案根、basic、每一段经历)都可以带
 *   _v: { <版本 id>: { 栏目: 措辞 } },只有 VERSIONED 列出的栏目会被采用,
 *   空值等于沿用默认。覆盖挂在经历条目自己身上,条目挪顺序时跟着走。
 *
 * 弹窗、档案页、注入到页面的填充脚本共用这一份;引擎拿到的是合并后、
 * 去掉 _v / versions 的普通档案,对版本一无所知。
 * ========================================================================== */
(() => {
  const g = typeof window !== 'undefined' ? window : self;
  const VERSIONED = {
    root: ['intro', 'skills', 'campusWork'],
    basic: ['expectedCity', 'expectedCityPath', 'expectedCity2', 'expectedSalary', 'availableDate'],
    education: ['research'],
    work: ['desc', 'skills'],
    projects: ['role', 'desc', 'duty'],
    papers: ['desc'],
    competitions: ['desc'],
    awards: ['desc'],
  };
  const LISTS = Object.keys(VERSIONED).filter((k) => k !== 'root' && k !== 'basic');
  const filled = (v) => v != null && String(v).trim() !== '';

  const overlay = (obj, keys, id) => {
    if (!obj || typeof obj !== 'object') return obj;
    const v = obj._v && obj._v[id];
    if (v) for (const k of keys) if (filled(v[k])) obj[k] = v[k];
    delete obj._v;
    return obj;
  };

  /** 合并出某个版本的档案。id 为 'default' 或不存在的版本时就是默认版本。 */
  const apply = (profile, id) => {
    const p = JSON.parse(JSON.stringify(profile || {}));
    const known = (p.versions || []).some((x) => x.id === id);
    const vid = known ? id : null;
    // 自定义问答:版本的答案排在前面(引擎先匹配者胜),默认的仍可兜底
    const own = vid && p._v && p._v[vid] && Array.isArray(p._v[vid].custom) ? p._v[vid].custom : [];
    overlay(p, VERSIONED.root, vid);
    if (own.length) p.custom = [...own, ...(p.custom || [])];
    overlay(p.basic, VERSIONED.basic, vid);
    for (const k of LISTS) if (Array.isArray(p[k])) p[k].forEach((e) => overlay(e, VERSIONED[k], vid));
    delete p.versions;
    delete p.defaultVersionName;
    return p;
  };

  /** 版本有自己的附件就用它,没有就用默认附件 */
  const resume = (id, resumeFile, resumeFiles) =>
    (id && id !== 'default' && resumeFiles && resumeFiles[id]) || resumeFile || null;

  /** 全部版本(默认版本在最前) */
  const list = (profile) => [{ id: 'default', name: (profile && profile.defaultVersionName) || '默认' },
    ...((profile && profile.versions) || [])];

  g.rqfVersions = { VERSIONED, LISTS, apply, resume, list };
})();
