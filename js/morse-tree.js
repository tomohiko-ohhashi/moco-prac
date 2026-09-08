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

  function createTreeView(container, opts) {
    opts = opts || {};
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var ROW_H = 46;
    var MIN_CELL = 20;
    var tree = null;
    var elems = {};   // code → { g, shape }
    var svg = null;
    var curCode = '';
    var flashTimer = null;

    function svgEl(tag, attrs) {
      var e = document.createElementNS(SVG_NS, tag);
      for (var a in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, a)) { e.setAttribute(a, attrs[a]); }
      }
      return e;
    }

    function layout() {
      var cw = container.clientWidth || 360;
      var cell = Math.max(MIN_CELL, Math.floor((cw - 8) / tree.leaves));
      return {
        cell: cell,
        width: cell * tree.leaves + 8,
        height: ROW_H * (tree.depth + 1) + 12,
        r: Math.min(14, Math.floor(cell / 2) - 1)
      };
    }

    function px(node, L) { return 4 + node.x * (L.width - 8); }
    function py(node) { return 24 + node.depth * ROW_H; }

    function render(mode) {
      tree = build(mode);
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

      tree.nodes.forEach(function (node) {
        var x = px(node, L);
        var y = py(node);
        if (node.depth > 0) {
          var p = tree.byCode[parentCode(node.code)];
          var line = svgEl('line', {
            x1: px(p, L), y1: py(p) + L.r, x2: x, y2: y - L.r, 'class': 'tree-edge'
          });
          elems['edge:' + node.code] = line;
          edges.appendChild(line);
        }
        var g = svgEl('g', { 'class': 'tree-node' + (node.char ? '' : ' empty') + (node.depth === 0 ? ' root' : '') });
        g.setAttribute('data-code', node.code);
        var shape;
        if (node.depth === 0) {
          // ルート: アンテナ風の小さな三角
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
            'font-size': Math.max(10, Math.min(16, L.r + 2)), 'class': 'tree-label'
          });
          t.textContent = node.char;
          g.appendChild(t);
        }
        if (node.depth === 1) {
          // 1段目の枝の中間に「・」「−」の案内
          var rootX = px(tree.byCode[''], L);
          var rootY = py(tree.byCode['']);
          var hint = svgEl('text', {
            x: (rootX + x) / 2, y: (rootY + y) / 2 - 6,
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
    }

    function setClass(code, cls, on) {
      var e = elems[code];
      if (e) { e.g.classList.toggle(cls, on); }
      var edge = elems['edge:' + code];
      if (edge && cls === 'path') { edge.classList.toggle('path', on); }
    }

    function clearPath() {
      var c = curCode;
      while (c.length > 0) { setClass(c, 'path', false); setClass(c, 'cur', false); c = parentCode(c); }
      setClass('', 'cur', false);
      curCode = '';
    }

    // 打鍵中の符号列に合わせて経路を点灯。木の外(深すぎ)なら null を返す
    function setPath(code) {
      clearPath();
      curCode = code;
      var c = code;
      while (c.length > 0) { setClass(c, 'path', true); c = parentCode(c); }
      var node = tree.byCode[code];
      setClass(code, 'cur', !!node);
      scrollTo(node);
      return node || null;
    }

    // 文字確定: 一瞬強調して経路を消す
    function flash(code) {
      var node = tree.byCode[code];
      setPath(code);
      if (flashTimer) { clearTimeout(flashTimer); }
      if (node) { setClass(code, 'hit', true); }
      flashTimer = setTimeout(function () {
        if (node) { setClass(code, 'hit', false); }
        clearPath();
      }, 650);
      return node || null;
    }

    function scrollTo(node) {
      if (!node || !svg) { return; }
      var L = layout();
      var x = px(node, L);
      var target = x - container.clientWidth / 2;
      if (Math.abs(container.scrollLeft - target) < 10) { return; }
      try {
        container.scrollTo({ left: target, behavior: 'smooth' });
      } catch (e) {
        container.scrollLeft = target;
      }
    }

    return {
      render: render,
      setPath: setPath,
      flash: flash,
      clear: clearPath,
      getTree: function () { return tree; }
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
