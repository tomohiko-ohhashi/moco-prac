'use strict';

/*
 * UI 共通: pub/sub、タブルーター、DOM ヘルパー、トースト、共有状態。
 */

var UI = (function () {
  // --- pub/sub ---
  var handlers = {};
  var bus = {
    on: function (ev, fn) {
      (handlers[ev] = handlers[ev] || []).push(fn);
    },
    emit: function (ev, data) {
      (handlers[ev] || []).forEach(function (fn) { fn(data); });
    }
  };

  // --- DOM ヘルパー ---
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined) { e.textContent = text; }
    return e;
  }

  // --- トースト ---
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    if (!t) { return; }
    t.textContent = msg;
    t.hidden = false;
    t.classList.add('show');
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
      t.hidden = true;
    }, 2200);
  }

  // --- タブルーター ---
  var TABS = ['rx', 'tx', 'ref', 'settings'];
  var currentTab = null;

  function showTab(name, skipHash) {
    if (TABS.indexOf(name) < 0) { name = 'rx'; }
    if (name === currentTab) { return; }
    currentTab = name;
    TABS.forEach(function (t) {
      var panel = $('#tab-' + t);
      var btn = $('.tab-bar [data-tab="' + t + '"]');
      var active = t === name;
      if (panel) { panel.hidden = !active; }
      if (btn) {
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      }
    });
    if (!skipHash && location.hash !== '#' + name) {
      try { history.replaceState(null, '', '#' + name); } catch (e) { /* file:// 等 */ }
    }
    bus.emit('tabchange', name);
  }

  function initTabs(initial) {
    $all('.tab-bar [data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showTab(btn.getAttribute('data-tab'));
      });
    });
    window.addEventListener('hashchange', function () {
      var h = location.hash.replace('#', '');
      if (TABS.indexOf(h) >= 0) { showTab(h, true); }
    });
    var fromHash = location.hash.replace('#', '');
    showTab(TABS.indexOf(fromHash) >= 0 ? fromHash : (initial || 'rx'));
  }

  // --- モード(欧文/和文)共有状態 ---
  var mode = 'intl';
  function setMode(m) {
    if (m !== 'intl' && m !== 'wabun') { return; }
    if (m === mode) { return; }
    mode = m;
    var bi = $('#mode-intl');
    var bw = $('#mode-wabun');
    if (bi) { bi.classList.toggle('active', m === 'intl'); }
    if (bw) { bw.classList.toggle('active', m === 'wabun'); }
    bus.emit('modechange', m);
  }
  function getMode() { return mode; }

  // ステッパー部品: [−] 値 [＋]
  function bindStepper(downSel, upSel, get, set, render) {
    var down = $(downSel);
    var up = $(upSel);
    if (down) { down.addEventListener('click', function () { set(get() - 1); render(); }); }
    if (up) { up.addEventListener('click', function () { set(get() + 1); render(); }); }
    render();
  }

  // ダブルタップ拡大の抑止(CSS touch-action と viewport に加えた保険)。
  // 2 回目のタップの既定動作(ズーム)を止め、ボタン等には自前で click を送る。
  var lastTapAt = 0;
  var touchStart = null; // { x, y } スクロール(移動あり)はタップ扱いしない
  document.addEventListener('touchstart', function (e) {
    var t = e.changedTouches && e.changedTouches[0];
    touchStart = t ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    var t = e.changedTouches && e.changedTouches[0];
    var moved = !touchStart || !t ||
      Math.abs(t.clientX - touchStart.x) > 10 || Math.abs(t.clientY - touchStart.y) > 10;
    if (moved || e.touches.length > 0) { lastTapAt = 0; return; }
    var now = Date.now();
    var target = e.target;
    var quick = now - lastTapAt < 350;
    lastTapAt = now;
    if (!quick || !target) { return; }
    if (target.closest && target.closest('input, textarea, select, label, a')) { return; }
    e.preventDefault();
    var clickable = target.closest ? target.closest('button, [role="button"], .tree-node, .ref-cell') : null;
    if (clickable) { clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }
  }, { passive: false });

  // 長押しのコンテキストメニュー抑止(入力欄は除く)
  document.addEventListener('contextmenu', function (e) {
    if (e.target && e.target.closest && e.target.closest('input, textarea')) { return; }
    e.preventDefault();
  });

  return {
    bus: bus,
    $: $,
    $all: $all,
    el: el,
    toast: toast,
    showTab: showTab,
    initTabs: initTabs,
    setMode: setMode,
    getMode: getMode,
    bindStepper: bindStepper,
    getTab: function () { return currentTab; }
  };
})();

window.UI = UI;
