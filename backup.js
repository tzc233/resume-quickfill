/* ============================================================================
 * 备份状态:档案只存在浏览器本地存储,清一次浏览数据就全没了
 * (包括几百 KB 的简历 PDF)。这里算出提醒等级,由弹窗与档案页共用。
 *
 * 判据不只看天数 —— 「改过但没备份」比「30 天没备份」更值得提醒:
 * 前者一旦丢失,丢的是你刚花时间填的内容。
 * ========================================================================== */
window.rqfBackupStatus = async () => {
  let st = {};
  try {
    st = await rqfApi.storage.local.get(['profile', 'resumeFile', 'lastBackupAt', 'profileUpdatedAt']);
  } catch { return null; }
  if (!st.profile) return null; // 还没建档案,没什么可备份的

  const DAY = 86400000;
  const now = Date.now();
  const last = st.lastBackupAt || 0;
  const updated = st.profileUpdatedAt || 0;
  const days = last ? Math.floor((now - last) / DAY) : null;
  const hasResume = !!(st.resumeFile && st.resumeFile.name);

  if (!last) {
    return {
      level: 'warn',
      text: `档案从未备份过。它只存在浏览器里${hasResume ? '(含简历 PDF)' : ''},清一次浏览数据就没了。`,
      action: '立即导出备份',
    };
  }
  if (updated > last) {
    return {
      level: 'warn',
      text: `档案在上次备份后改过(上次备份 ${days} 天前),改动尚未备份。`,
      action: '导出备份',
    };
  }
  if (days >= 30) {
    return {
      level: 'info',
      text: `距上次备份已 ${days} 天。`,
      action: '导出备份',
    };
  }
  return { level: 'ok', text: `上次备份 ${days} 天前。`, days };
};

/** 渲染到指定容器;onExport 为空时只显示文字不给按钮 */
window.rqfRenderBackup = async (host, onExport) => {
  if (!host) return;
  const s = await window.rqfBackupStatus();
  host.innerHTML = '';
  if (!s || s.level === 'ok') { host.hidden = true; return; }
  host.hidden = false;
  host.className = `backup-bar ${s.level}`;
  const span = document.createElement('span');
  span.textContent = (s.level === 'warn' ? '⚠️ ' : '🕒 ') + s.text;
  host.appendChild(span);
  if (onExport) {
    const b = document.createElement('button');
    b.className = 'backup-btn';
    b.textContent = s.action;
    b.addEventListener('click', onExport);
    host.appendChild(b);
  }
};
