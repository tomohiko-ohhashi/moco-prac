'use strict';

/*
 * 起動処理: 保存データ読込 → 各画面初期化 → SW 登録。
 * 共有状態は window.App(設定・統計・UI状態と保存ヘルパ)。
 */

(function () {
  var KEYS = {
    settings: 'moco.settings.v1',
    stats: 'moco.stats.v1',
    ui: 'moco.ui.v1'
  };

  var DEFAULT_SETTINGS = {
    lang: 'ja', // 'ja' | 'en'
    audio: { freq: 700, volume: 70 },
    rx: { charWpm: 18, effWpm: 12, questions: 10, groupSize: 1 },
    tx: { wpm: 15, input: 'straight', slow: false, autoPlay: true },
    screen: { wakeLock: false }
  };

  function emptyModeStats() {
    return { level: 1, sessions: 0, chars: {} };
  }

  var DEFAULT_STATS = {
    rx: { intl: emptyModeStats(), wabun: emptyModeStats() },
    tx: { intl: emptyModeStats(), wabun: emptyModeStats() }
  };

  var DEFAULT_UI = { tab: 'rx', mode: 'intl' };

  var App = {
    settings: Storage.load(KEYS.settings, DEFAULT_SETTINGS),
    stats: Storage.load(KEYS.stats, DEFAULT_STATS),
    ui: Storage.load(KEYS.ui, DEFAULT_UI),

    saveSettings: function () {
      Storage.saveDebounced(KEYS.settings, App.settings);
      UI.bus.emit('settingschange', App.settings);
    },
    saveStats: function () {
      Storage.saveDebounced(KEYS.stats, App.stats);
    },
    saveUi: function () {
      Storage.saveDebounced(KEYS.ui, App.ui);
    },
    resetStats: function () {
      App.stats = Storage.deepMerge(DEFAULT_STATS, undefined);
      Storage.save(KEYS.stats, App.stats);
    },
    resetAll: function () {
      Storage.remove(KEYS.settings);
      Storage.remove(KEYS.stats);
      Storage.remove(KEYS.ui);
    },

    // 現在モードの練習統計(kind: 'rx' | 'tx')
    modeStats: function (kind) {
      return App.stats[kind][UI.getMode()];
    },

    // 現在モード・レベルの出題文字集合
    levelChars: function (kind) {
      var mode = UI.getMode();
      var level = App.stats[kind][mode].level;
      if (mode === 'intl') {
        return MorseData.KOCH_ORDER.slice(0, level + 1);
      }
      var chars = [];
      MorseData.WABUN_ORDER.slice(0, level).forEach(function (g) {
        chars = chars.concat(g.chars);
      });
      return chars;
    },

    maxLevel: function () {
      return UI.getMode() === 'intl'
        ? MorseData.KOCH_ORDER.length - 1
        : MorseData.WABUN_ORDER.length;
    },

    recordChar: function (kind, ch, correct) {
      var st = App.modeStats(kind);
      var c = st.chars[ch] || { a: 0, c: 0 };
      c.a++;
      if (correct) { c.c++; }
      st.chars[ch] = c;
    }
  };

  window.App = App;

  document.addEventListener('DOMContentLoaded', function () {
    // 表示言語(各画面の初期化より先に静的文字列を差し替える)。
    // 言語が変わったら再適用し langchange を配信(各画面が動的文字列を描き直す)。
    I18n.setLang(App.settings.lang);
    I18n.apply();
    UI.bus.on('settingschange', function (s) {
      var l = I18n.normalize(s.lang);
      if (l === I18n.getLang()) { return; }
      I18n.setLang(l);
      I18n.apply();
      UI.bus.emit('langchange', l);
    });

    // モードトグル
    UI.$('#mode-intl').addEventListener('click', function () { UI.setMode('intl'); });
    UI.$('#mode-wabun').addEventListener('click', function () { UI.setMode('wabun'); });
    UI.bus.on('modechange', function (m) {
      App.ui.mode = m;
      App.saveUi();
    });
    UI.bus.on('tabchange', function (t) {
      App.ui.tab = t;
      App.saveUi();
    });

    // 保存済みモード復元(setMode は同値なら no-op)
    UI.setMode(App.ui.mode);

    // 各画面初期化
    RxTrainer.init();
    TxTrainer.init();
    Reference.init();
    Settings.init();

    // タブ復元(hash があれば hash 優先)
    UI.initTabs(App.ui.tab);

    // Service Worker(file:// では動かないためガード)
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      try {
        navigator.serviceWorker.register('./sw.js').catch(function () {
          /* オフライン機能なしで続行 */
        });
      } catch (e) { /* noop */ }
    }
  });
})();
