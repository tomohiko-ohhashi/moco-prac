'use strict';

/*
 * Web Audio 管理。AudioContext はページで1個だけ(iOS対策)。
 * - ensureAudio(): 音を出し得るユーザージェスチャ内で必ず呼ぶ
 * - playTimeline(): computeTimeline の結果を GainNode エンベロープで再生
 * - サイドトーン: 常時走行オシレータのゲインをランプ(押下時ノード生成なし)
 */

var Audio2 = (function () {
  var ctx = null;
  var masterGain = null;    // 音量(設定)
  var sidetoneOsc = null;
  var sidetoneGain = null;
  var volume = 0.5;
  var RAMP = 0.005; // 5ms: クリック音防止
  var sidetoneWanted = false; // 押下中(resume 待ちの間も保持)
  var unlockArmed = false;

  function ensureAudio() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { return null; }
      try {
        ctx = new AC({ latencyHint: 'interactive' });
      } catch (e) {
        ctx = new AC();
      }
      masterGain = ctx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(ctx.destination);
      // サイドトーン用の常時走行オシレータ(ゲイン0で待機)
      sidetoneGain = ctx.createGain();
      sidetoneGain.gain.value = 0;
      sidetoneGain.connect(masterGain);
      sidetoneOsc = ctx.createOscillator();
      sidetoneOsc.type = 'sine';
      sidetoneOsc.frequency.value = 700;
      sidetoneOsc.connect(sidetoneGain);
      sidetoneOsc.start();
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) { resumeIfNeeded(); }
      });
      // 電話着信等で interrupted → 戻ったら再開。再開できなければ次のジェスチャで解除
      ctx.onstatechange = function () {
        if (ctx.state !== 'running') { armUnlock(); }
        resumeIfNeeded();
      };
    }
    resumeIfNeeded();
    return ctx;
  }

  function resumeIfNeeded() {
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed' || document.hidden) { return null; }
    var p;
    try { p = ctx.resume(); } catch (e) { return null; }
    if (p && p.catch) { p.catch(function () { /* 次のジェスチャで再試行 */ }); }
    return p;
  }

  /*
   * iOS Safari は pointerdown/touchstart 内の resume() を有効なユーザー操作と
   * 見なさないことがある(touchend / click なら確実)。そのため最初の
   * touchend / click / pointerup / keydown のいずれかで AudioContext を
   * 作成・resume し、running になったら監視を外す。
   */
  var UNLOCK_EVENTS = ['touchend', 'click', 'pointerup', 'keydown'];
  function onUnlockGesture() {
    var c = ensureAudio();
    if (!c) { disarmUnlock(); return; }
    if (c.state === 'running') { disarmUnlock(); return; }
    var p = resumeIfNeeded();
    if (p && p.then) {
      p.then(function () { if (ctx && ctx.state === 'running') { disarmUnlock(); } });
    }
  }
  function armUnlock() {
    if (unlockArmed) { return; }
    unlockArmed = true;
    UNLOCK_EVENTS.forEach(function (ev) {
      document.addEventListener(ev, onUnlockGesture, true);
    });
  }
  function disarmUnlock() {
    if (!unlockArmed) { return; }
    unlockArmed = false;
    UNLOCK_EVENTS.forEach(function (ev) {
      document.removeEventListener(ev, onUnlockGesture, true);
    });
  }
  armUnlock();

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (masterGain) {
      masterGain.gain.setTargetAtTime(volume, ctx.currentTime, 0.01);
    }
  }

  /*
   * タイムライン再生。1本のオシレータにゲインエンベロープをまとめて
   * スケジュールする。音の端に setTimeout は使わない。
   * UI 進行は 50ms interval で marks と比較し onProgress(charIndex)。
   */
  function playTimeline(timeline, opts) {
    opts = opts || {};
    var c = ensureAudio();
    if (!c || !timeline || timeline.totalMs <= 0) {
      if (opts.onDone) { opts.onDone(); }
      return { stop: function () {}, done: true };
    }
    var handle = { done: false, stop: function () { handle.done = true; } };

    function finish() {
      if (handle.done) { return; }
      handle.done = true;
      if (opts.onDone) { opts.onDone(); }
    }

    function start() {
      if (handle.done) { return; }
      var freq = opts.freq || 700;
      var osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      var g = c.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(masterGain);

      var t0 = c.currentTime + 0.1;
      timeline.tones.forEach(function (tone) {
        var s = t0 + tone.startMs / 1000;
        var e = s + tone.durMs / 1000;
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(1, s + RAMP);
        g.gain.setValueAtTime(1, Math.max(e - RAMP, s + RAMP));
        g.gain.linearRampToValueAtTime(0, e);
      });
      var endTime = t0 + timeline.totalMs / 1000;
      osc.start(t0);
      osc.stop(endTime + 0.05);

      var lastMark = -1;
      var iv = setInterval(function () {
        var elapsed = (c.currentTime - t0) * 1000;
        if (opts.onProgress) {
          var idx = -1;
          for (var i = 0; i < timeline.marks.length; i++) {
            if (timeline.marks[i].startMs <= elapsed) { idx = i; } else { break; }
          }
          if (idx !== lastMark && idx >= 0) {
            lastMark = idx;
            opts.onProgress(timeline.marks[idx].charIndex);
          }
        }
        if (elapsed >= timeline.totalMs) {
          cleanup();
          if (opts.onDone) { opts.onDone(); }
        }
      }, 50);

      function cleanup() {
        if (handle.done) { return; }
        handle.done = true;
        clearInterval(iv);
        try { osc.disconnect(); g.disconnect(); } catch (e) { /* noop */ }
      }

      handle.stop = function () {
        if (handle.done) { return; }
        var now = c.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0, now + RAMP);
        try { osc.stop(now + 0.02); } catch (e) { /* 既停止 */ }
        cleanup();
      };
    }

    if (c.state === 'running') {
      start();
    } else {
      // suspended 中は時刻が進まず予約が重なるため、resume 完了後に開始する。
      // ジェスチャ外で resume できない場合は 1.5 秒で諦めて完了扱い(UI を止めない)
      var started = false;
      var timer = setTimeout(function () { if (!started) { started = true; finish(); } }, 1500);
      var p = resumeIfNeeded();
      var go = function () {
        if (started) { return; }
        started = true;
        clearTimeout(timer);
        if (ctx.state === 'running') { start(); } else { finish(); }
      };
      if (p && p.then) { p.then(go, go); } else { go(); }
    }
    return handle;
  }

  // 単発文字/符号の再生ヘルパ
  function playMorse(morse, opts) {
    opts = opts || {};
    var tl = MorseCodec.computeTimeline(morse, {
      charWpm: opts.charWpm || 20,
      effWpm: opts.effWpm || opts.charWpm || 20
    });
    return playTimeline(tl, opts);
  }

  // --- サイドトーン(低遅延) ---
  function rampSidetone(on, freq) {
    var t = ctx.currentTime;
    if (freq) { sidetoneOsc.frequency.setValueAtTime(freq, t); }
    sidetoneGain.gain.cancelScheduledValues(t);
    sidetoneGain.gain.setTargetAtTime(on ? 1 : 0, t, 0.003);
  }

  function sidetoneOn(freq) {
    var c = ensureAudio();
    if (!c) { return; }
    sidetoneWanted = true;
    if (c.state !== 'running') {
      // suspended 中に予約しても時刻 0 で重なって無音になるため、resume 後に鳴らす
      var p = resumeIfNeeded();
      if (p && p.then) {
        p.then(function () { if (sidetoneWanted && ctx.state === 'running') { rampSidetone(true, freq); } });
      }
      return;
    }
    rampSidetone(true, freq);
  }

  function sidetoneOff() {
    sidetoneWanted = false;
    if (!ctx) { return; }
    rampSidetone(false);
  }

  // 固定長ビープ(二つボタンモードの要素音)
  function sidetonePulse(durMs, freq) {
    var c = ensureAudio();
    if (!c) { return; }
    if (c.state !== 'running') {
      var p = resumeIfNeeded();
      if (p && p.then) {
        p.then(function () { if (ctx.state === 'running') { sidetonePulse(durMs, freq); } });
      }
      return;
    }
    var t = c.currentTime;
    if (freq) { sidetoneOsc.frequency.setValueAtTime(freq, t); }
    var g = sidetoneGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(1, t + RAMP);
    g.setValueAtTime(1, t + Math.max(durMs / 1000 - RAMP, RAMP));
    g.linearRampToValueAtTime(0, t + durMs / 1000);
  }

  return {
    ensureAudio: ensureAudio,
    playTimeline: playTimeline,
    playMorse: playMorse,
    setVolume: setVolume,
    sidetoneOn: sidetoneOn,
    sidetoneOff: sidetoneOff,
    sidetonePulse: sidetonePulse,
    isReady: function () { return !!ctx; },
    getState: function () { return ctx ? ctx.state : 'none'; }
  };
})();

window.Audio2 = Audio2;
