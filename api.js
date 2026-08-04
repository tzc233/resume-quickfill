/* ============================================================================
 * 浏览器 API 适配层 —— Chrome / Edge 与 Firefox 共用一套代码
 *
 * 差异只有两处,都在这里抹平:
 *   1) 命名空间:Firefox 的 browser.* 返回 Promise;Chrome MV3 的 chrome.* 也返回
 *      Promise,但 Firefox 的 chrome.* 是回调风格。统一取 browser 优先。
 *   2) 主机权限:Chrome 安装时即授予 host_permissions;Firefox MV3 把它当作
 *      「可选权限」,用户不点同意就调不了 scripting.executeScript。
 *
 * content.js(识别与填充引擎)不依赖任何浏览器 API,天然两边通用。
 * ========================================================================== */
(() => {
  const api = (typeof browser !== 'undefined' && browser.runtime) ? browser
    : (typeof chrome !== 'undefined' ? chrome : null);
  window.rqfApi = api;

  // getBrowserInfo 是 Firefox 独有的 API,比嗅探 UA 可靠
  window.rqfIsFirefox = !!(api && api.runtime && typeof api.runtime.getBrowserInfo === 'function');

  /**
   * 确保拿到 <all_urls> 主机权限。
   * Chrome 恒为 true(安装即授予);Firefox 首次会弹出授权面板。
   * @returns {Promise<boolean>} 是否已获授权
   */
  window.rqfEnsureHost = async () => {
    if (!api || !api.permissions) return true;   // 拿不到就交给后续调用自己报错
    try {
      if (await api.permissions.contains({ origins: ['<all_urls>'] })) return true;
    } catch { return true; }
    try {
      // 必须由用户手势触发 —— 调用点都在按钮的 click 处理器里
      return await api.permissions.request({ origins: ['<all_urls>'] });
    } catch { return false; }
  };

  /** 缺权限时的统一提示,两个浏览器文案不同 */
  window.rqfNoHostMessage = () => (window.rqfIsFirefox
    ? '需要「访问所有网站」权限才能填充。请到 about:addons → 本插件 → 权限,把「访问所有网站的数据」打开。'
    : '缺少页面访问权限,请到扩展管理页检查本插件的网站访问设置。');
})();
