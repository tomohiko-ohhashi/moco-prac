'use strict';

/*
 * モールスツリー(二分木)。左が短点・右が長点。
 * build() は純関数(Node でテスト可)、createTreeView() は SVG 描画(ブラウザのみ)。
 */

var MorseTree = (function () {
  var Data = (typeof module !== 'undefined' && typeof require === 'function')
    ? require('./morse-data.js')
    : window.MorseData;

  // 表示する深さ: 欧文は A-Z(4要素)、和文はカナ+゛゜ー(5要素)。6要素の記号は対象外
  var DEPTH = { intl: 4, wabun: 5 };

  /*
   * 戻り値: { depth, leaves, nodes: [...], byCode: {code: node} }
   * node = { code, char|null, depth, index, x(0..1: 部分木中央の横位置), dah(bool) }
   * x は「同じ深さの index 番目のノード」の中央 = (index + 0.5) / 2^depth
   */
  function build(mode) {
    var table = mode === 'wabun' ? Data.WABUN_TABLE : Data.INTL_TABLE;
    var depth = DEPTH[mode === 'wabun' ? 'wabun' : 'intl'];
    var rev = {};
    for (var k in table) {
      if (Object.prototype.hasOwnProperty.call(table, k)) { rev[table[k]] = k; }
    }
    // 欧文は A-Z のみ表示(記号は除外)
    var allow = mode === 'wabun' ? null : /^[A-Z]$/;
    var nodes = [];
    var byCode = {};
    var root = { code: '', char: null, depth: 0, index: 0, x: 0.5, dah: false };
    nodes.push(root);
    byCode[''] = root;
    for (var d = 1; d <= depth; d++) {
      var count = Math.pow(2, d);
      for (var i = 0; i < count; i++) {
        // index のビット列(上位=浅い階層)が符号: 0='.' 1='-'
        var code = '';
        for (var b = d - 1; b >= 0; b--) {
          code += ((i >> b) & 1) ? '-' : '.';
        }
        var ch = rev[code] || null;
        if (ch && allow && !allow.test(ch)) { ch = null; }
        var node = { code: code, char: ch, depth: d, index: i, x: (i + 0.5) / count, dah: code[d - 1] === '-' };
        nodes.push(node);
        byCode[code] = node;
      }
    }
    return { depth: depth, leaves: Math.pow(2, depth), nodes: nodes, byCode: byCode };
  }

  function parentCode(code) {
    return code.slice(0, -1);
  }

  // ---------- SVG 描画(ブラウザ) ----------

  /*
   * createTreeView(container, { onTap(node), onPrefixChange(prefix) })
   * render(mode, { prefix, rowH }):
   *   prefix = 表示する部分木の根の符号('' = 全体、'.'/'-' = 半分)。
   *   和文は 5 要素で葉が 32 個あり画面に収まらないため、半分ずつ表示し
   *   打鍵の 1 要素目で自動的に切り替える。
   */
  function createTreeView(container, opts) {
    opts = opts || {};
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var TOP_PAD = 22;
    var tree = null;
    var mode = 'intl';
    var prefix = '';
    var rowH = 46;
    var elems = {};   // code → { g, shape }
    var svg = null;
    var curCode = '';
    var flashTimer = null;
    var flashCode = null;

    function svgEl(tag, attrs) {
      var e = document.createElementNS(SVG_NS, tag);
      for (var a in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, a)) { e.setAttribute(a, attrs[a]); }
      }
      return e;
    }

    function subDepth() { return tree.depth - prefix.length; }
    function inSubtree(code) { return code.indexOf(prefix) === 0; }

    function layout() {
      var cw = container.clientWidth || 360;
      var leaves = Math.pow(2, subDepth());
      var cell = Math.max(18, Math.floor((cw - 8) / leaves));
      return {
        cell: cell,
        width: cell * leaves + 8,
        height: TOP_PAD + rowH * subDepth() + Math.max(16, Math.floor(rowH * 0.45)),
        r: Math.min(14, Math.max(8, Math.floor(Math.min(cell / 2, rowH / 2.4)) - 1))
      };
    }

    // 部分木内での相対位置(0..1)
    function relX(node) {
      var rd = node.depth - prefix.length;
      var span = Math.pow(2, rd);
      var idxP = prefix ? tree.byCode[prefix].index : 0;
      return (node.index - idxP * span + 0.5) / span;
    }
    function px(node, L) { return 4 + relX(node) * (L.width - 8); }
    function py(node) { return TOP_PAD + (node.depth - prefix.length) * rowH; }

    function render(m, o) {
      o = o || {};
      mode = m;
      if (typeof o.prefix === 'string') { prefix = o.prefix; }
      if (o.rowH) { rowH = o.rowH; }
      tree = build(mode);
      if (prefix && !tree.byCode[prefix]) { prefix = ''; }
      elems = {};
      curCode = '';
      container.textContent = '';
      var L = layout();
      svg = svgEl('svg', {
        width: L.width, height: L.height,
        viewBox: '0 0 ' + L.width + ' ' + L.height,
        'class': 'tree-svg', role: 'img', 'aria-label': 'モールスツリー'
      });
      var edges = svgEl('g', { 'class': 'tree-edges' });
      var nodesG = svgEl('g', { 'class': 'tree-nodes' });
      svg.appendChild(edges);
      svg.appendChild(nodesG);
      var rootNode = tree.byCode[prefix];
      var fontSize = Math.max(10, Math.min(16, L.r + 2));

      tree.nodes.forEach(function (node) {
        if (!inSubtree(node.code)) { return; }
        var isRoot = node.code === prefix;
        var x = px(node, L);
        var y = py(node);
        if (!isRoot) {
          var p = tree.byCode[parentCode(node.code)];
          var line = svgEl('line', {
            x1: px(p, L), y1: py(p) + L.r, x2: x, y2: y - L.r, 'class': 'tree-edge'
          });
          elems['edge:' + node.code] = line;
          edges.appendChild(line);
        }
        var g = svgEl('g', { 'class': 'tree-node' + (node.char ? '' : ' empty') + (isRoot ? ' root' : '') });
        g.setAttribute('data-code', node.code);
        var shape;
        if (isRoot && !node.code) {
          // 全体表示の根: アンテナ風の小さな三角
          shape = svgEl('path', {
            d: 'M' + (x - 9) + ' ' + (y - 8) + ' L' + (x + 9) + ' ' + (y - 8) + ' L' + x + ' ' + (y + 6) + ' Z',
            'class': 'tree-shape'
          });
        } else if (node.dah) {
          shape = svgEl('rect', {
            x: x - L.r, y: y - L.r * 0.8, width: L.r * 2, height: L.r * 1.6, rx: 4, 'class': 'tree-shape'
          });
        } else {
          shape = svgEl('circle', { cx: x, cy: y, r: L.r, 'class': 'tree-shape' });
        }
        g.appendChild(shape);
        if (node.char) {
          var t = svgEl('text', {
            x: x, y: y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            'font-size': fontSize, 'class': 'tree-label'
          });
          t.textContent = node.char;
          g.appendChild(t);
        }
        if (node.depth === prefix.length + 1) {
          // 部分木の 1 段目の枝の中間に「・」「−」の案内
          var rx0 = px(rootNode, L);
          var ry0 = py(rootNode);
          var hint = svgEl('text', {
            x: (rx0 + x) / 2, y: (ry0 + y) / 2 - 4,
            'text-anchor': 'middle', 'font-size': 13, 'class': 'tree-hint'
          });
          hint.textContent = node.dah ? '−' : '・';
          nodesG.appendChild(hint);
        }
        elems[node.code] = { g: g, shape: shape, node: node };
        nodesG.appendChild(g);
      });

      nodesG.addEventListener('click', function (e) {
        var g = e.target.closest ? e.target.closest('.tree-node') : null;
        if (!g) { return; }
        var code = g.getAttribute('data-code');
        if (!code) { return; }
        if (opts.onTap) { opts.onTap(tree.byCode[code]); }
      });

      container.appendChild(svg);
      if (opts.onPrefixChange) { opts.onPrefixChange(prefix); }
    }

    // 部分木の切替(和文の ・側/−側)
    function setPrefix(p) {
      if (p === prefix) { return; }
      render(mode, { prefix: p });
    }

    // 符号が今の部分木の外なら、その符号側の部分木へ切り替える
    function ensureVisible(code) {
      if (!prefix || !code || inSubtree(code)) { return; }
      var np = code.slice(0, prefix.length);
      if (tree.byCode[np]) { render(mode, { prefix: np }); }
    }

    function setClass(code, cls, on) {
      var e = elems[code];
      if (e) { e.g.classList.toggle(cls, on); }
      var edge = elems['edge:' + code];
      if (edge && cls === 'path') { edge.classList.toggle('path', on); }
    }

    function clearPath() {
      endFlash();
      var c = curCode;
      while (c.length > 0) { setClass(c, 'path', false); setClass(c, 'cur', false); c = parentCode(c); }
      setClass('', 'cur', false);
      curCode = '';
    }

    function endFlash() {
      if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
      if (flashCode !== null) { setClass(flashCode, 'hit', false); flashCode = null; }
    }

    // 打鍵中の符号列に合わせて経路を点灯。木の外(深すぎ)なら null を返す
    function setPath(code) {
      endFlash();
      ensureVisible(code);
      clearPath();
      curCode = code;
      var c = code;
      while (c.length > 0) { setClass(c, 'path', true); c = parentCode(c); }
      var node = tree.byCode[code];
      setClass(code, 'cur', !!node);
      return node || null;
    }

    // 文字確定: 一瞬強調して経路を消す
    function flash(code) {
      setPath(code);
      var node = tree.byCode[code];
      if (node) { setClass(code, 'hit', true); flashCode = code; }
      flashTimer = setTimeout(function () {
        flashTimer = null;
        // 次の文字の打鍵が始まっていれば(curCode が変わっていれば)その経路は消さない
        if (curCode === code) { endFlash(); clearPath(); } else { endFlash(); }
      }, 650);
      return node || null;
    }

    return {
      render: render,
      setPrefix: setPrefix,
      getPrefix: function () { return prefix; },
      setPath: setPath,
      flash: flash,
      clear: clearPath,
      getTree: function () { return tree; },
      // 行数(部分木の根を含む)。高さ計算用
      rows: function () { return tree ? subDepth() + 1 : 0; },
      TOP_PAD: TOP_PAD
    };
  }

  return {
    DEPTH: DEPTH,
    build: build,
    parentCode: parentCode,
    createTreeView: createTreeView
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MorseTree;
} else {
  window.MorseTree = MorseTree;
}
