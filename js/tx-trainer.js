'use strict';

/*
 * 打鍵練習(送信トレーナー)。
 * 大きなパッド1枚(ストレートキー)または二つボタン(・/−)で入力し、
 * keyer.js の判定結果をデコード表示する。課題モードでは出題文字と照合。
 */

var TxTrainer = (function () {
  var $ = function (s) { return UI.$(s); };

  var keyer = null;
  var pollTimer = null;
  var activePointer = null;   // 捕捉中の pointerId(2本目は無視)
  var spaceDown = false;
  var codes = [];             // 確定済み符号列('/'=語間)
  var submode = 'free';       // 'free' | 'drill' | 'tree'
  var drill = { target: '', asked: 0, correct: 0, judging: false };
  var playHandle = null;
  var treeView = null;        // ツリーモードの SVG ビュー
  var resizeTimer = null;

  function unitMs() { return 1200 / App.settings.tx.wpm; }
  function now() { return performance.now(); }

  // ---------- 表示 ----------

  function renderDecoded() {
    var box = $('#tx-decoded');
    box.textContent = '';
    var r = MorseCodec.decode(codes.join(' '), UI.getMode());
    // 合成済み表示は text を使い、未知符号には生符号のツールチップを付ける
    var text = r.text;
    var unknownCodes = r.tokens.filter(function (t) { return t.unknown; }).map(function (t) { return t.code; });
    var ui = 0;
    for (var i = 0; i < text.length; i++) {
      var span = UI.el('span', null, text[i]);
      if (text[i] === MorseCodec.UNKNOWN_CHAR && ui < unknownCodes.length) {
        span.title = MorseCodec.toDisplay(unknownCodes[ui++]);
        span.style.color = 'var(--warn)';
      }
      box.appendChild(span);
    }
    box.scrollLeft = box.scrollWidth;
  }

  function renderBuffer() {
    $('#tx-buffer').textContent = keyer ? MorseCodec.toDisplay(keyer.getBuffer()) : '';
  }

  function renderDrill() {
    var st = App.modeStats('tx');
    $('#tx-level-label').textContent = 'Lv ' + st.level + '/' + App.maxLevel();
    $('#tx-target-char').textContent = drill.target || '-';
    $('#tx-drill-score').textContent = drill.asked
      ? '正解 ' + drill.correct + ' / ' + drill.asked : '';
  }

  function applyInputMode() {
    var paddle = App.settings.tx.input === 'paddle';
    $('#tx-pad').hidden = paddle;
    $('#tx-paddle').hidden = !paddle;
  }

  // ---------- ツリーモード ----------

  function treeResultFor(code) {
    var r = MorseCodec.decode(code, UI.getMode());
    return r.text || '';
  }

  // ツリーの 1 行の高さ: 打鍵タブの残り高さから逆算し、パッドの最低高を確保する
  function treeRowHeight() {
    var tab = $('#tab-tx');
    var svgEl = $('#tx-tree svg');
    var tabH = tab.clientHeight;
    if (!tabH || !svgEl || !treeView) { return 46; }
    var rows = treeView.rows();               // 部分木の根を含む段数(5)
    var svgH = svgEl.getBoundingClientRect().height;
    // 横画面は左右 2 カラム(パッドは右)なので、左カラムの要素だけを差し引く
    var twoCol = getComputedStyle($('.tx-col-a')).display === 'flex';
    var cols = twoCol ? [$('.tx-col-a')] : [$('.tx-col-a'), $('.tx-col-b')];
    var fixed = 0;
    cols.forEach(function (col) {
      Array.prototype.forEach.call(col.children, function (el) {
        if (el.hidden || el.id === 'tx-pad' || el.id === 'tx-paddle') { return; }
        var cs = getComputedStyle(el);
        if (cs.display === 'none') { return; }
        fixed += el.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
      });
    });
    fixed -= svgH;
    var PAD_MIN = twoCol ? 0 : 120;
    var avail = tabH - fixed - PAD_MIN;           // SVG に使える高さ
    var rowH = Math.floor((avail - treeView.TOP_PAD - 16) / (rows - 1));
    return Math.max(twoCol ? 20 : 26, Math.min(46, rowH));
  }

  function renderHalfToggle(prefix) {
    var wabun = UI.getMode() === 'wabun';
    $('#tx-tree-half').hidden = !wabun;
    $('#tx-half-dit').classList.toggle('active', prefix === '.');
    $('#tx-half-dah').classList.toggle('active', prefix === '-');
  }

  function renderTree() {
    if (!treeView) {
      treeView = MorseTree.createTreeView($('#tx-tree'), {
        onTap: function (node) {
          if (!node.code) { return; }
          Audio2.ensureAudio();
          if (playHandle) { playHandle.stop(); }
          playHandle = Audio2.playMorse(node.code, {
            charWpm: App.settings.tx.wpm,
            freq: App.settings.audio.freq,
            onDone: function () { playHandle = null; }
          });
          treeView.flash(node.code);
          $('#tx-tree-result').textContent = node.char || treeResultFor(node.code);
        },
        onPrefixChange: renderHalfToggle
      });
    }
    var wabun = UI.getMode() === 'wabun';
    var prefix = wabun ? (treeView.getPrefix() || '.') : '';
    // 一度描いてから残り高さを測り、行の高さを決めて描き直す
    treeView.render(UI.getMode(), { prefix: prefix, rowH: 46 });
    var rowH = treeRowHeight();
    if (rowH !== 46) { treeView.render(UI.getMode(), { prefix: prefix, rowH: rowH }); }
    $('#tx-tree-result').textContent = '';
    $('#tx-tree-buffer').textContent = '';
  }

  function treeOnElement() {
    if (submode !== 'tree' || !treeView) { return; }
    treeView.setPath(keyer.getBuffer());
    $('#tx-tree-buffer').textContent = MorseCodec.toDisplay(keyer.getBuffer());
  }

  function treeOnChar(code) {
    if (submode !== 'tree' || !treeView) { return; }
    treeView.flash(code);
    var ch = treeResultFor(code);
    $('#tx-tree-result').textContent = ch;
    $('#tx-tree-buffer').textContent = '';
  }

  // ---------- キーヤー ----------

  function buildKeyer() {
    keyer = createKeyer({
      unitMs: unitMs(),
      slow: App.settings.tx.slow,
      onElement: function () { renderBuffer(); treeOnElement(); },
      onChar: function (code) {
        codes.push(code);
        renderBuffer();
        renderDecoded();
        treeOnChar(code);
      },
      onWord: function () {
        if (submode === 'drill') {
          judgeDrill();
          return;
        }
        if (codes.length && codes[codes.length - 1] !== '/') {
          codes.push('/');
          renderDecoded();
        }
      }
    });
  }

  function startPolling() {
    if (pollTimer) { return; }
    pollTimer = setInterval(function () {
      if (keyer) { keyer.poll(now()); }
    }, 30);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function keyDown() {
    if (!keyer) { return; }
    Audio2.ensureAudio();
    keyer.down(now());
    Audio2.sidetoneOn(App.settings.audio.freq);
    $('#tx-pad').classList.add('down');
  }

  function keyUp() {
    if (!keyer) { return; }
    keyer.up(now());
    Audio2.sidetoneOff();
    $('#tx-pad').classList.remove('down');
    renderBuffer();
  }

  function keyCancel() {
    if (!keyer || !keyer.isDown()) { return; }
    keyUp();
  }

  function tapElement(el) {
    if (!keyer) { return; }
    Audio2.ensureAudio();
    keyer.element(el, now());
    Audio2.sidetonePulse(el === '.' ? unitMs() : unitMs() * 3, App.settings.audio.freq);
    renderBuffer();
    if (navigator.vibrate && /Android/i.test(navigator.userAgent)) {
      try { navigator.vibrate(el === '.' ? 15 : 40); } catch (e) { /* noop */ }
    }
  }

  function clearAll() {
    codes = [];
    if (keyer) { keyer.reset(); }
    renderBuffer();
    renderDecoded();
    if (treeView) { treeView.clear(); }
    $('#tx-tree-result').textContent = '';
    $('#tx-tree-buffer').textContent = '';
  }

  // ---------- 課題モード ----------

  function nextTarget() {
    var chars = App.levelChars('tx');
    var t;
    for (var g = 0; g < 10; g++) {
      t = chars[Math.floor(Math.random() * chars.length)];
      if (t !== drill.target || chars.length < 2) { break; }
    }
    drill.target = t;
    drill.judging = false;
    clearAll();
    renderDrill();
  }

  function judgeDrill() {
    if (drill.judging || !codes.length) { return; }
    drill.judging = true;
    var decoded = MorseCodec.decode(codes.join(' '), UI.getMode()).text;
    var ok = decoded === drill.target;
    drill.asked++;
    if (ok) { drill.correct++; }
    App.recordChar('tx', drill.target, ok);
    App.saveStats();
    renderDrill();
    var box = $('#tx-decoded');
    box.style.borderColor = ok ? 'var(--ok)' : 'var(--ng)';
    UI.toast(ok ? '○ 正解' : '× 正解は ' + drill.target + ' ' +
      MorseCodec.toDisplay(MorseCodec.encodeChar(drill.target, UI.getMode()) || ''));
    setTimeout(function () {
      box.style.borderColor = '';
      if (submode === 'drill') { nextTarget(); }
    }, ok ? 700 : 1600);
  }

  function playTarget() {
    if (!drill.target) { return; }
    Audio2.ensureAudio();
    if (playHandle) { playHandle.stop(); }
    playHandle = Audio2.playMorse(MorseCodec.encode(drill.target, UI.getMode()), {
      charWpm: App.settings.tx.wpm,
      freq: App.settings.audio.freq,
      onDone: function () { playHandle = null; }
    });
  }

  function setSubmode(m) {
    submode = m;
    $('#tx-mode-free').classList.toggle('active', m === 'free');
    $('#tx-mode-drill').classList.toggle('active', m === 'drill');
    $('#tx-mode-tree').classList.toggle('active', m === 'tree');
    $('#tx-drill-row').hidden = m !== 'drill';
    $('#tx-tree-wrap').hidden = m !== 'tree';
    $('#tab-tx').classList.toggle('tx-tree-active', m === 'tree');
    clearAll();
    if (m === 'drill') { nextTarget(); }
    if (m === 'tree') { renderTree(); }
    App.ui.txSubmode = m;
    App.saveUi();
  }

  // ---------- 初期化 ----------

  function bindPad() {
    var pad = $('#tx-pad');
    pad.addEventListener('pointerdown', function (e) {
      if (activePointer !== null) { return; }
      activePointer = e.pointerId;
      try { pad.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      e.preventDefault();
      keyDown();
    });
    function release(e) {
      if (e.pointerId !== activePointer) { return; }
      activePointer = null;
      keyUp();
    }
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
    pad.addEventListener('lostpointercapture', function (e) {
      if (e.pointerId === activePointer) { activePointer = null; keyCancel(); }
    });
    pad.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // 二つボタン
    [['#tx-dit', '.'], ['#tx-dah', '-']].forEach(function (pair) {
      var b = $(pair[0]);
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        tapElement(pair[1]);
      });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });

    // Space キー(PC)。e.repeat の自動連打は無視
    document.addEventListener('keydown', function (e) {
      if (UI.getTab() !== 'tx' || e.code !== 'Space') { return; }
      if (e.target && /TEXTAREA|INPUT/.test(e.target.tagName)) { return; }
      e.preventDefault();
      if (e.repeat || spaceDown) { return; }
      spaceDown = true;
      if (App.settings.tx.input === 'paddle') { tapElement('.'); return; }
      keyDown();
    });
    document.addEventListener('keyup', function (e) {
      if (e.code !== 'Space' || !spaceDown) { return; }
      spaceDown = false;
      if (App.settings.tx.input === 'paddle') { return; }
      keyUp();
    });
    // 二つボタンモードでは矢印/ハイフンで長点も打てる
    document.addEventListener('keydown', function (e) {
      if (UI.getTab() !== 'tx' || App.settings.tx.input !== 'paddle') { return; }
      if (e.repeat || (e.key !== '-' && e.key !== 'ArrowRight')) { return; }
      tapElement('-');
    });

    // フォーカス喪失・非表示は押上げ扱い(鳴りっぱなし防止)
    window.addEventListener('blur', function () { activePointer = null; spaceDown = false; keyCancel(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { activePointer = null; spaceDown = false; keyCancel(); }
    });
  }

  function init() {
    buildKeyer();
    bindPad();
    applyInputMode();

    $('#tx-clear').addEventListener('click', clearAll);
    $('#tx-mode-free').addEventListener('click', function () { setSubmode('free'); });
    $('#tx-mode-drill').addEventListener('click', function () { setSubmode('drill'); });
    $('#tx-mode-tree').addEventListener('click', function () { setSubmode('tree'); });
    $('#tx-tree-clear').addEventListener('click', clearAll);
    $('#tx-half-dit').addEventListener('click', function () { if (treeView) { treeView.setPrefix('.'); } });
    $('#tx-half-dah').addEventListener('click', function () { if (treeView) { treeView.setPrefix('-'); } });
    window.addEventListener('resize', function () {
      if (submode !== 'tree' || UI.getTab() !== 'tx') { return; }
      if (resizeTimer) { clearTimeout(resizeTimer); }
      resizeTimer = setTimeout(renderTree, 150);
    });
    $('#tx-target-play').addEventListener('click', playTarget);
    $('#tx-target-skip').addEventListener('click', nextTarget);
    $('#tx-level-down').addEventListener('click', function () {
      var st = App.modeStats('tx');
      if (st.level > 1) { st.level--; App.saveStats(); nextTarget(); }
    });
    $('#tx-level-up').addEventListener('click', function () {
      var st = App.modeStats('tx');
      if (st.level < App.maxLevel()) { st.level++; App.saveStats(); nextTarget(); }
    });

    UI.bus.on('settingschange', function () {
      keyer.setOptions({ unitMs: unitMs(), slow: App.settings.tx.slow });
      applyInputMode();
      if (submode === 'tree' && UI.getTab() === 'tx') { renderTree(); }
    });
    UI.bus.on('modechange', function () {
      drill.asked = 0;
      drill.correct = 0;
      if (submode === 'drill') { nextTarget(); } else { clearAll(); }
      if (submode === 'tree') { renderTree(); }
    });
    UI.bus.on('tabchange', function (t) {
      // 打鍵タブは 3 モードとも画面内に収める(ページスクロールなし、パッドが残りを埋める)
      document.body.classList.toggle('fit-tx', t === 'tx');
      if (t === 'tx') {
        startPolling();
        // 非表示中は幅が 0 なので、表示されてからツリーを描く
        if (submode === 'tree') { renderTree(); }
      } else {
        stopPolling();
        keyCancel();
      }
    });

    renderDecoded();
    renderBuffer();
    // 前回のサブモードを復元(ツリーはタブ表示時に描画される)
    var saved = App.ui.txSubmode;
    if (saved === 'drill' || saved === 'tree') { setSubmode(saved); }
  }

  return { init: init };
})();

window.TxTrainer = TxTrainer;
