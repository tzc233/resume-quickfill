/* ============================================================================
 * 多份简历:各自独立维护(例如「私企」一份、「央国企」一份)
 *
 * 存储:
 *   profile            默认简历(profile._name 是它的名字)
 *   altProfiles        { <id>: { name, profile } }  其余简历,每份都是完整档案
 *   resumeFile         默认简历的附件 PDF
 *   resumeFiles        { <id>: 附件 }                其余简历各自的附件
 *
 * 每份简历互不继承:事实、经历的增删、附件都可以不同。附件没传就不带 ——
 * 宁可这次不注入,也不拿私企版的 PDF 去投央国企。
 * 两份简历写出矛盾的事实(同一个奖一份写省级、一份写国家级)背调时是硬伤,
 * 但改不改由用户定:factDiffs 只负责找出来,档案页的体检里提醒。
 *
 * 弹窗、档案页、注入到页面的填充脚本共用这一份;引擎拿到的是普通档案。
 * ========================================================================== */
(() => {
  const g = typeof window !== 'undefined' ? window : self;
  const clone = (x) => JSON.parse(JSON.stringify(x == null ? null : x));
  const META = ['_name', '_v', 'versions', 'defaultVersionName'];
  const strip = (p) => { const o = clone(p || {}) || {}; for (const k of META) delete o[k]; return o; };

  /** 全部简历,默认简历在最前 */
  const list = (st) => [
    { id: 'default', name: (st && st.profile && st.profile._name) || '默认简历' },
    ...Object.entries((st && st.altProfiles) || {}).map(([id, x]) => ({ id, name: (x && x.name) || '未命名简历' })),
  ];

  /** 取出某份简历给引擎用:档案副本 + 它自己的附件。id 不存在时用默认简历。 */
  const pick = (st, id) => {
    const alt = id && id !== 'default' && st && st.altProfiles && st.altProfiles[id];
    if (alt) return { id, profile: strip(alt.profile), resumeFile: (st.resumeFiles || {})[id] || null };
    return { id: 'default', profile: st && st.profile ? strip(st.profile) : null, resumeFile: (st && st.resumeFile) || null };
  };

  /* ---- 事实矛盾 ----
   * 只比「同一段经历」(按名称对上)里的事实栏,且两边都有值才算 ——
   * 一份写了一份没写、某段只在一份里出现,都是取舍,不是矛盾。措辞栏不比。 */
  const BASIC_FACTS = ['fullName', 'gender', 'birthday', 'idNumber', 'phone', 'email',
    'politicalStatus', 'ethnicity', 'hometown', 'nationality', 'gradYear'];
  const LIST_FACTS = {
    family: ['relation', ['name', 'company', 'title', 'phone', 'politicalStatus']],
    education: ['school', ['degree', 'major', 'college', 'startTime', 'endTime', 'eduType', 'studyForm', 'rank', 'gpaScore', 'gpaTotal']],
    work: ['company', ['title', 'type', 'startTime', 'endTime']],
    projects: ['name', ['startTime', 'endTime']],
    papers: ['name', ['type', 'authorOrder', 'date', 'url']],
    competitions: ['name', ['type', 'result', 'awardDate', 'startTime', 'endTime']],
    awards: ['name', ['type', 'result', 'date']],
    languages: ['name', ['cert', 'score']],
    patents: ['name', ['type', 'no', 'date']],
    softwares: ['name', ['type', 'date']],
  };
  const val = (v) => String(v == null ? '' : v).trim();
  const factDiffs = (a, b) => {
    const out = [];
    const ab = (a && a.basic) || {}, bb = (b && b.basic) || {};
    for (const k of BASIC_FACTS) {
      if (val(ab[k]) && val(bb[k]) && val(ab[k]) !== val(bb[k])) out.push({ list: null, field: `basic.${k}`, a: val(ab[k]), b: val(bb[k]) });
    }
    for (const [list, [key, fields]] of Object.entries(LIST_FACTS)) {
      const bs = Array.isArray(b && b[list]) ? b[list] : [];
      (Array.isArray(a && a[list]) ? a[list] : []).forEach((ea, index) => {
        const name = val(ea && ea[key]);
        const eb = name && bs.find((x) => val(x && x[key]) === name);
        if (!eb) return;
        for (const f of fields) {
          if (val(ea[f]) && val(eb[f]) && val(ea[f]) !== val(eb[f])) out.push({ list, index, name, field: f, a: val(ea[f]), b: val(eb[f]) });
        }
      });
    }
    return out;
  };

  /* ---- 2.22.0 的「版本覆盖」结构 → 独立简历 ----
   * 2.22.0 让版本只覆盖措辞(_v 挂在各对象上)。改成独立简历后,把每个版本
   * 按当时的规则合并成一整份档案。只在发现旧结构时转换,且不丢任何内容。 */
  const legacyMerge = (profile, id) => {
    const p = clone(profile || {});
    const walk = (obj) => {
      if (Array.isArray(obj)) { obj.forEach(walk); return; }
      if (!obj || typeof obj !== 'object') return;
      const v = obj._v && obj._v[id];
      if (v) {
        for (const [k, x] of Object.entries(v)) {
          if (k === 'custom' && Array.isArray(x)) obj.custom = [...x, ...(obj.custom || [])];
          else if (val(x)) obj[k] = x;
        }
      }
      delete obj._v;
      for (const k of Object.keys(obj)) walk(obj[k]);
    };
    walk(p);
    return p;
  };
  const migrate = (st) => {
    const p = st && st.profile;
    if (!p || !Array.isArray(p.versions) || !p.versions.length) return { changed: false };
    const altProfiles = { ...((st && st.altProfiles) || {}) };
    for (const v of p.versions) altProfiles[v.id] = { name: v.name, profile: strip(legacyMerge(p, v.id)) };
    const profile = strip(legacyMerge(p, null));
    if (p.defaultVersionName) profile._name = p.defaultVersionName;
    return { changed: true, profile, altProfiles };
  };

  g.rqfVersions = { list, pick, factDiffs, migrate };
})();
