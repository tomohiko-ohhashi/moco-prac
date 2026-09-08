'use strict';

/*
 * 設定タブ: 音 / 聞き取り / 打鍵 / 画面(Wake Lock) / 統計・リセット。
 * 変更は App.settings に反映して App.saveSettings()(settingschange 配信)。
 */

var Settings = (function () {
  var $ = function (s) { return UI.$(s); };
  var tr = function (k, p) { return I18n.t(k, p); };
  var wakeLock = null;

  function render() {
    var s = App.settings;
    $('#set-lang-ja').classList.toggle('active', I18n.normalize(s.lang) === 'ja');
    $('#set-lang-en').classList.toggle('active', I18n.normalize(s.lang) === 'en');
    $('#set-freq').value = s.audio.freq;
    $('#set-freq-label').textContent = s.audio.freq + ' Hz';
    $('#set-volume').value = s.audio.volume;
    $('#set-volume-label').textContent = s.audio.volume + '%';
    $('#set-charwpm-label').textContent = s.rx.charWpm + ' wpm';
    $('#set-effwpm-label').textContent = s.rx.effWpm + ' wpm';
    $('#set-questions-label').textContent = tr('set.questionsUnit', { n: s.rx.questions });
    UI.$all('.set-group').forEach(function (b) {
      b.classList.toggle('active', Number(b.getAttribute('data-group')) === s.rx.groupSize);
    });
    $('#set-txwpm-label').textContent = s.tx.wpm + ' wpm';
    $('#set-input-straight').classList.toggle('active', s.tx.input === 'straight');
    $('#set-input-paddle').classList.toggle('active', s.tx.input === 'paddle');
    $('#set-slow').checked = !!s.tx.slow;
    $('#set-autoplay').checked = !!s.tx.autoPlay;
    $('#set-wakelock').checked = !!s.screen.wakeLock;
    renderStats();
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function stepper(id, get, set) {
    $('#' + id + '-down').addEventListener('click', function () { set(get() - 1); App.saveSettings(); render(); });
    $('#' + id + '-up').addEventListener('click', function () { set(get() + 1); App.saveSettings(); render(); });
  }

  // ---------- 統計表示 ----------

  function rateOf(chars) {
    var a = 0, c = 0;
    for (var k in chars) {
      if (Object.prototype.hasOwnProperty.call(chars, k)) { a += chars[k].a; c += chars[k].c; }
    }
    return a ? Math.round(100 * c / a) + '%(' + c + '/' + a + ')' : '-';
  }

  function renderStats() {
    var box = $('#set-stats');
    box.textContent = '';
    var table = UI.el('table');
    var head = UI.el('tr');
    ['', tr('set.statLevel'), tr('set.statSessions'), tr('set.statRate')].forEach(function (h) { head.appendChild(UI.el('th', null, h)); });
    table.appendChild(head);
    [[tr('set.statRxIntl'), App.stats.rx.intl], [tr('set.statRxWabun'), App.stats.rx.wabun],
     [tr('set.statTxIntl'), App.stats.tx.intl], [tr('set.statTxWabun'), App.stats.tx.wabun]].forEach(function (row) {
      var line = UI.el('tr');
      line.appendChild(UI.el('td', null, row[0]));
      line.appendChild(UI.el('td', null, String(row[1].level)));
      line.appendChild(UI.el('td', null, String(row[1].sessions)));
      line.appendChild(UI.el('td', null, rateOf(row[1].chars)));
      table.appendChild(line);
    });
    box.appendChild(table);
  }

  // ---------- Wake Lock ----------

  function wakeLockSupported() {
    return 'wakeLock' in navigator && typeof navigator.wakeLock.request === 'function';
  }

  function requestWakeLock() {
    if (!wakeLockSupported() || wakeLock) { return; }
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () {
      UI.toast(tr('set.wakeLockFail'));
    });
  }

  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
  }

  function applyWakeLock() {
    if (App.settings.screen.wakeLock) { requestWakeLock(); } else { releaseWakeLock(); }
  }

  // ---------- 初期化 ----------

  function init() {
    // 他画面(課題行の「自動」ボタン等)からの変更をスイッチに反映
    UI.bus.on('settingschange', render);
    var s = App.settings;

    $('#set-lang-ja').addEventListener('click', function () {
      s.lang = 'ja'; App.saveSettings(); render();
    });
    $('#set-lang-en').addEventListener('click', function () {
      s.lang = 'en'; App.saveSettings(); render();
    });

    $('#set-freq').addEventListener('input', function (e) {
      s.audio.freq = clamp(Number(e.target.value), 400, 1000);
      $('#set-freq-label').textContent = s.audio.freq + ' Hz';
      App.saveSettings();
    });
    $('#set-volume').addEventListener('input', function (e) {
      s.audio.volume = clamp(Number(e.target.value), 0, 100);
      $('#set-volume-label').textContent = s.audio.volume + '%';
      Audio2.setVolume(s.audio.volume / 100);
      App.saveSettings();
    });
    $('#set-test-sound').addEventListener('click', function () {
      Audio2.ensureAudio();
      Audio2.setVolume(s.audio.volume / 100);
      Audio2.playMorse(MorseCodec.encode('PARIS', 'intl'), {
        charWpm: s.rx.charWpm, effWpm: s.rx.effWpm, freq: s.audio.freq
      });
    });

    stepper('set-charwpm',
      function () { return s.rx.charWpm; },
      function (v) {
        s.rx.charWpm = clamp(v, 10, 40);
        if (s.rx.effWpm > s.rx.charWpm) { s.rx.effWpm = s.rx.charWpm; }
      });
    stepper('set-effwpm',
      function () { return s.rx.effWpm; },
      function (v) { s.rx.effWpm = clamp(v, 4, s.rx.charWpm); });
    stepper('set-questions',
      function () { return s.rx.questions; },
      function (v) { s.rx.questions = clamp(v, 5, 50); });
    UI.$all('.set-group').forEach(function (b) {
      b.addEventListener('click', function () {
        s.rx.groupSize = Number(b.getAttribute('data-group'));
        App.saveSettings();
        render();
      });
    });

    stepper('set-txwpm',
      function () { return s.tx.wpm; },
      function (v) { s.tx.wpm = clamp(v, 10, 25); });
    $('#set-input-straight').addEventListener('click', function () {
      s.tx.input = 'straight'; App.saveSettings(); render();
    });
    $('#set-input-paddle').addEventListener('click', function () {
      s.tx.input = 'paddle'; App.saveSettings(); render();
    });
    $('#set-autoplay').addEventListener('change', function (e) {
      s.tx.autoPlay = !!e.target.checked; App.saveSettings();
    });
    $('#set-slow').addEventListener('change', function (e) {
      s.tx.slow = !!e.target.checked; App.saveSettings();
    });

    if (wakeLockSupported()) {
      $('#set-wakelock').addEventListener('change', function (e) {
        s.screen.wakeLock = !!e.target.checked;
        App.saveSettings();
        applyWakeLock();
      });
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && s.screen.wakeLock) { requestWakeLock(); }
      });
      applyWakeLock();
    } else {
      $('#set-screen-card').hidden = true;
    }

    $('#set-reset-stats').addEventListener('click', function () {
      if (!window.confirm(tr('set.resetStatsConfirm'))) { return; }
      App.resetStats();
      UI.toast(tr('set.resetStatsDone'));
      UI.bus.emit('modechange', UI.getMode()); // 各画面を再描画
      render();
    });
    $('#set-reset-all').addEventListener('click', function () {
      if (!window.confirm(tr('set.resetAllConfirm'))) { return; }
      App.resetAll();
      location.reload();
    });

    UI.bus.on('tabchange', function (t) { if (t === 'settings') { renderStats(); } });
    Audio2.setVolume(s.audio.volume / 100);
    render();
  }

  return { init: init, render: render };
})();

window.Settings = Settings;
