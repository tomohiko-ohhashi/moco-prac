'use strict';

/*
 * 打鍵判定ステートマシン(純ロジック・タイムスタンプ注入式)。
 * ブラウザでは performance.now()、テストでは偽クロックの値を渡す。
 *
 * ストレートキー: 押下時間 < 2×unitMs → 短点、以上 → 長点。
 * 無音 > 文字閾値(2×unitMs) → 文字確定(onChar(code))、
 * 無音 > 語閾値(5×unitMs) → onWord()。
 * 「ゆっくり確定」時は無音閾値を1.5倍(押下長判定は据え置き)。
 * 適応閾値(直近の打鍵速度に追従)は v1 では見送り。
 */

function createKeyer(opts) {
  opts = opts || {};
  var unitMs = opts.unitMs || 80;
  var slow = !!opts.slow;
  var onElement = opts.onElement || function () {};
  var onChar = opts.onChar || function () {};
  var onWord = opts.onWord || function () {};

  var buffer = '';        // 未確定の要素列 '.-'
  var downAt = null;      // 押下開始時刻(押下中のみ)
  var lastUpAt = null;    // 最後に要素が確定した時刻
  var wordFired = true;   // 語区切りを通知済みか

  function gapFactor() { return slow ? 1.5 : 1; }
  function charGapMs() { return 2 * unitMs * gapFactor(); }
  function wordGapMs() { return 5 * unitMs * gapFactor(); }

  function flushChar() {
    if (!buffer) { return; }
    var code = buffer;
    buffer = '';
    onChar(code);
  }

  return {
    down: function (t) {
      if (downAt !== null) { return; } // 多重押下は無視
      // 押下開始前に無音時間で確定処理
      this.poll(t);
      downAt = t;
    },
    up: function (t) {
      if (downAt === null) { return; }
      var dur = t - downAt;
      downAt = null;
      var el = dur < 2 * unitMs ? '.' : '-';
      buffer += el;
      lastUpAt = t;
      wordFired = false;
      onElement(el, dur);
    },
    // 二つボタン(・/−)モード: 要素を直接注入
    element: function (el, t) {
      this.poll(t);
      buffer += el;
      lastUpAt = t;
      wordFired = false;
      onElement(el, 0);
    },
    // 定期呼び出し(またはイベント前)で無音判定を進める
    poll: function (t) {
      if (downAt !== null || lastUpAt === null) { return; }
      var silence = t - lastUpAt;
      if (buffer && silence > charGapMs()) {
        flushChar();
      }
      if (!buffer && !wordFired && silence > wordGapMs()) {
        wordFired = true;
        onWord();
      }
    },
    // pointercancel / blur 時: 押しっぱなし扱いを解消
    cancel: function (t) {
      if (downAt !== null) { this.up(t); }
    },
    reset: function () {
      buffer = '';
      downAt = null;
      lastUpAt = null;
      wordFired = true;
    },
    setOptions: function (o) {
      o = o || {};
      if (o.unitMs) { unitMs = o.unitMs; }
      if (typeof o.slow === 'boolean') { slow = o.slow; }
    },
    getBuffer: function () { return buffer; },
    isDown: function () { return downAt !== null; }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = createKeyer;
} else {
  window.createKeyer = createKeyer;
}
