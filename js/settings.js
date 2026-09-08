'use strict';

/*
 * 設定タブ: 音 / 聞き取り / 打鍵 / 画面(Wake Lock) / 統計・リセット。
 * 変更は App.settings に反映して App.saveSettings()(settingschange 配信)。
 */

var Settings = (function () {
  var $ = function (s) { return UI.$(s); };
  var wakeLock = null;

  function render() {
    var s = App.settings;
    $('#set-freq').value = s.audio.freq;
    $('#set-freq-label').textContent = s.audio.freq + ' Hz';
    $('#set-volume').value = s.audio.volume;
    $('#set-volume-label').textContent = s.audio.volume + '%';
    $('#set-charwpm-label').textContent = s.rx.charWpm + ' wpm';
    $('#set-effwpm-label').textContent = s.rx.effWpm + ' wpm';
    $('#set-questions-label').textContent = s.rx.questions + ' 問';
    UI.$all('.set-group').forEach(function (b) {
      b.classList.toggle('active', Number(b.getAttribute('data-group')) === s.rx.groupSize);
    });
    $('#set-txwpm-label').textContent = s.tx.wpm + ' wpm';
    $('#set-input-straight').classList.toggle('active', s.tx.input === 'straight');
    $('#set-input-paddle').classList.toggle('active', s.tx.input === 'paddle');
    $('#set-slow').checked = !!s.tx.slow;
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
    ['', 'レベル', 'セッション', '文字正答率'].forEach(function (h) { head.appendChild(UI.el('th', null, h)); });
    table.appendChild(head);
    [['聞き取り・欧文', App.stats.rx.intl], ['聞き取り・和文', App.stats.rx.wabun],
     ['打鍵・欧文', App.stats.tx.intl], ['打鍵・和文', App.stats.tx.wabun]].forEach(function (row) {
      var tr = UI.el('tr');
      tr.appendChild(UI.el('td', null, row[0]));
      tr.appendChild(UI.el('td', null, String(row[1].level)));
      tr.appendChild(UI.el('td', null, String(row[1].sessions)));
      tr.appendChild(UI.el('td', null, rateOf(row[1].chars)));
      table.appendChild(tr);
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
      UI.toast('スリープ防止を有効にできませんでした');
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
    var s = App.settings;

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
      if (!window.confirm('学習統計(レベル・正答率)をリセットします。よろしいですか?')) { return; }
      App.resetStats();
      UI.toast('統計をリセットしました');
      UI.bus.emit('modechange', UI.getMode()); // 各画面を再描画
      render();
    });
    $('#set-reset-all').addEventListener('click', function () {
      if (!window.confirm('設定・統計をすべて削除して初期状態に戻します。よろしいですか?')) { return; }
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
