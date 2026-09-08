'use strict';

/*
 * localStorage ラッパー。Safari プライベートモード等で例外が出る環境では
 * インメモリフォールバックに切り替える。load はデフォルト値と deep-merge。
 */

var Storage = (function () {
  var memory = {};
  var usable = (function () {
    try {
      var k = '__moco_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  })();

  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function deepMerge(defaults, saved) {
    if (!isObject(defaults)) { return saved === undefined ? defaults : saved; }
    var out = {};
    for (var k in defaults) {
      if (!Object.prototype.hasOwnProperty.call(defaults, k)) { continue; }
      if (saved && Object.prototype.hasOwnProperty.call(saved, k)) {
        out[k] = isObject(defaults[k]) ? deepMerge(defaults[k], saved[k]) : saved[k];
      } else {
        out[k] = isObject(defaults[k]) ? deepMerge(defaults[k], undefined) : defaults[k];
      }
    }
    // defaults に無い保存済みキー(chars 統計など)も保持する
    if (isObject(saved)) {
      for (var s in saved) {
        if (Object.prototype.hasOwnProperty.call(saved, s) &&
            !Object.prototype.hasOwnProperty.call(out, s)) {
          out[s] = saved[s];
        }
      }
    }
    return out;
  }

  function rawGet(key) {
    if (!usable) { return memory[key]; }
    try {
      var s = localStorage.getItem(key);
      return s === null ? undefined : JSON.parse(s);
    } catch (e) {
      return memory[key];
    }
  }

  function rawSet(key, value) {
    memory[key] = value;
    if (!usable) { return; }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* 容量超過等は黙って諦める(メモリには残る) */ }
  }

  var timers = {};

  return {
    load: function (key, defaults) {
      return deepMerge(defaults, rawGet(key));
    },
    save: rawSet,
    saveDebounced: function (key, value, delayMs) {
      if (timers[key]) { clearTimeout(timers[key]); }
      timers[key] = setTimeout(function () {
        delete timers[key];
        rawSet(key, value);
      }, delayMs || 300);
    },
    remove: function (key) {
      delete memory[key];
      if (!usable) { return; }
      try { localStorage.removeItem(key); } catch (e) { /* noop */ }
    },
    deepMerge: deepMerge
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Storage;
} else {
  window.Storage = Storage;
}
