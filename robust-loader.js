// 强壮加载器：为移动端/慢环境提供超时、重试、cache-bust、全局对象自检
// 用法：
//   const loader = window.XiaoxinRobustLoader;
//   loader.loadScript({ src, name, retries, timeoutMs, test: () => !!window.SomeGlobal })
//   loader.loadCss({ href, name })
//   loader.loadSequence([{...}, {...}])

(function () {
  if (window.XiaoxinRobustLoader) return;

  function now() {
    return Date.now ? Date.now() : new Date().getTime();
  }

  function withCacheBust(url) {
    if (!url || typeof url !== "string") return url;
    // data: / blob: 不处理；否则追加 _t
    if (url.indexOf("data:") === 0 || url.indexOf("blob:") === 0) return url;
    var sep = url.indexOf("?") === -1 ? "?" : "&";
    return url + sep + "_t=" + now();
  }

  function defaultLog(level, msg, obj) {
    try {
      var fn = console[level] || console.log;
      if (obj !== undefined) fn.call(console, msg, obj);
      else fn.call(console, msg);
    } catch (e) {}
  }

  function loadScriptOnce(src, timeoutMs) {
    return new Promise(function (resolve, reject) {
      try {
        var script = document.createElement("script");
        script.async = true;
        script.src = src;

        var done = false;
        var timer = setTimeout(function () {
          if (done) return;
          done = true;
          try { script.remove(); } catch (e) {}
          reject(new Error("timeout"));
        }, timeoutMs || 15000);

        script.onload = function () {
          if (done) return;
          done = true;
          try { clearTimeout(timer); } catch (e) {}
          resolve(true);
        };
        script.onerror = function () {
          if (done) return;
          done = true;
          try { clearTimeout(timer); } catch (e) {}
          try { script.remove(); } catch (e) {}
          reject(new Error("error"));
        };

        document.head.appendChild(script);
      } catch (e) {
        reject(e);
      }
    });
  }

  function loadCssOnce(href, timeoutMs) {
    return new Promise(function (resolve, reject) {
      try {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;

        var done = false;
        var timer = setTimeout(function () {
          if (done) return;
          done = true;
          // CSS 超时不算致命，仍 resolve
          resolve(false);
        }, timeoutMs || 8000);

        link.onload = function () {
          if (done) return;
          done = true;
          try { clearTimeout(timer); } catch (e) {}
          resolve(true);
        };
        link.onerror = function () {
          if (done) return;
          done = true;
          try { clearTimeout(timer); } catch (e) {}
          // CSS 失败也不致命
          resolve(false);
        };

        document.head.appendChild(link);
      } catch (e) {
        resolve(false);
      }
    });
  }

  // 加载状态追踪
  var loadStatus = {
    modules: {},
    startTime: now(),
  };

  function recordModuleStatus(name, success, error, isCore) {
    loadStatus.modules[name] = {
      name: name,
      success: success,
      error: error || null,
      isCore: isCore !== false,
      timestamp: now(),
    };
  }

  async function loadScript(opts) {
    opts = opts || {};
    var name = opts.name || opts.src || "script";
    var retries = typeof opts.retries === "number" ? opts.retries : 2;
    var timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 15000;
    var test = typeof opts.test === "function" ? opts.test : null;
    var cacheBust = opts.cacheBust !== false;
    var isCore = opts.isCore !== false;

    for (var attempt = 0; attempt <= retries; attempt++) {
      var finalSrc = attempt > 0 && cacheBust ? withCacheBust(opts.src) : opts.src;
      defaultLog("info", "[小馨手机][Loader] 加载脚本: " + name + " (attempt " + (attempt + 1) + "/" + (retries + 1) + ")");
      try {
        await loadScriptOnce(finalSrc, timeoutMs);
        if (test) {
          var ok = false;
          try { ok = !!test(); } catch (e) { ok = false; }
          if (!ok) throw new Error("test_failed: 全局对象不存在");
        }
        recordModuleStatus(name, true, null, isCore);
        return true;
      } catch (e2) {
        var errMsg = e2 && e2.message ? e2.message : String(e2);
        defaultLog("warn", "[小馨手机][Loader] 脚本加载失败: " + name + " -> " + errMsg);
        // 轻微退避
        await new Promise(function (r) { setTimeout(r, 300 + attempt * 500); });
        // 最后一次尝试失败时记录错误
        if (attempt === retries) {
          recordModuleStatus(name, false, errMsg, isCore);
        }
      }
    }
    defaultLog("error", "[小馨手机][Loader] 脚本最终加载失败: " + name);
    return false;
  }

  async function loadCss(opts) {
    opts = opts || {};
    var name = opts.name || opts.href || "css";
    var href = opts.href;
    var isCore = opts.isCore === true;
    defaultLog("info", "[小馨手机][Loader] 加载样式: " + name);
    try {
      await loadCssOnce(href, opts.timeoutMs || 8000);
      recordModuleStatus(name, true, null, isCore);
      return true;
    } catch (e) {
      var errMsg = e && e.message ? e.message : String(e);
      recordModuleStatus(name, false, errMsg, isCore);
      return false;
    }
  }

  async function loadSequence(items) {
    items = items || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      if (it.type === "css") await loadCss(it);
      else await loadScript(it);
    }
  }

  // 获取加载状态报告
  function getLoadStatus() {
    var coreModules = [];
    var uiModules = [];
    var failedCore = [];
    var failedUI = [];

    for (var name in loadStatus.modules) {
      var mod = loadStatus.modules[name];
      if (mod.isCore) {
        coreModules.push(mod);
        if (!mod.success) failedCore.push(mod);
      } else {
        uiModules.push(mod);
        if (!mod.success) failedUI.push(mod);
      }
    }

    return {
      coreModules: coreModules,
      uiModules: uiModules,
      failedCore: failedCore,
      failedUI: failedUI,
      allCoreSuccess: failedCore.length === 0,
      totalTime: now() - loadStatus.startTime,
    };
  }

  window.XiaoxinRobustLoader = {
    loadScript: loadScript,
    loadCss: loadCss,
    loadSequence: loadSequence,
    withCacheBust: withCacheBust,
    getLoadStatus: getLoadStatus,
    recordModuleStatus: recordModuleStatus,
  };
})();


