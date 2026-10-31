(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var ARROW = 'M6.2 3.6C5 2.7 3.4 3.6 3.6 5.1L6 22.7C6.2 24.3 8.2 24.8 9.1 23.5L13 18.3C13.4 17.8 14 17.5 14.6 17.5L21.1 17.3C22.7 17.2 23.4 15.2 22.2 14.3Z';
  var SPARK = 'M6 1Q6.8 5.2 11 6Q6.8 6.8 6 11Q5.2 6.8 1 6Q5.2 5.2 6 1Z';
  var TRAIL = [[26, 7, .5], [34, 5, .3], [41, 3.5, .15]];
  var STARS = [[-.5, .5, 1.15], [10.5, -3.5, .8], [-4, 8.5, .7]];
  var EMBERS = [[22, 23], [27, 28], [31, 33], [35, 38]];
  var uid = 0;

  function node(name, attrs) {
    var el = document.createElementNS(NS, name);
    for (var key in attrs) el.setAttribute(key, attrs[key]);
    return el;
  }

  function gradient(id, stops) {
    var g = node('linearGradient', { id, x1: '0', y1: '0', x2: '1', y2: '0' });
    stops.forEach(function (s) {
      g.appendChild(node('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] }));
    });
    return g;
  }

  function mount(slot) {
    var config = {};
    try { config = JSON.parse(slot.getAttribute('data-cursor') || '{}'); } catch (err) { config = {}; }
    var size = config.size || 28;
    var style = config.style || 'solid';
    var shine = config.shine || 'none';
    var id = 'cur' + (++uid);

    var root = document.createElement('div');
    root.className = 'cur';
    root.setAttribute('data-style', style);
    root.setAttribute('data-shine', shine);
    root.style.setProperty('--s', size + 'px');
    if (config.labelSize) root.style.setProperty('--label-fs', config.labelSize + 'px');
    if (config.tight) root.setAttribute('data-tight', '');

    if (shine === 'halo') {
      var halo = document.createElement('span');
      halo.className = 'halo';
      halo.setAttribute('aria-hidden', 'true');
      root.appendChild(halo);
    }

    if (config.trail !== false) {
      var trail = document.createElement('span');
      trail.className = 'trail';
      trail.setAttribute('aria-hidden', 'true');
      TRAIL.forEach(function (dot) {
        var d = document.createElement('i');
        d.style.setProperty('--d', dot[0] + 'px');
        d.style.setProperty('--sz', dot[1] + 'px');
        d.style.setProperty('--o', dot[2]);
        trail.appendChild(d);
      });
      root.appendChild(trail);
    }

    var svg = node('svg', { viewBox: '0 0 28 28', class: 'arrow', 'aria-hidden': 'true' });
    var defs = node('defs', {});
    defs.appendChild((function () {
      var clip = node('clipPath', { id: id + '-clip' });
      clip.appendChild(node('path', { d: ARROW }));
      return clip;
    })());
    if (shine === 'sweep') {
      defs.appendChild(gradient(id + '-sheen', [[0, '#fff', 0], [.5, '#fff', .9], [1, '#fff', 0]]));
    }
    if (shine === 'irid') {
      defs.appendChild(gradient(id + '-irid', [[0, '#e3a23c', 0], [.3, '#e3a23c', .95], [.62, '#d2728f', .95], [1, '#d2728f', 0]]));
    }
    svg.appendChild(defs);

    svg.appendChild(node('path', { d: ARROW, class: 'outline' }));
    svg.appendChild(node('path', { d: ARROW, class: 'fill' }));

    if (shine === 'sweep' || shine === 'irid') {
      var clipGroup = node('g', { 'clip-path': 'url(#' + id + '-clip)' });
      if (shine === 'sweep') {
        var band = node('g', { class: 'sheen-band', transform: 'rotate(16 14 14)' });
        band.appendChild(node('rect', {
          x: '-20', y: '-10', width: '10', height: '46',
          fill: 'url(#' + id + '-sheen)',
        }));
        clipGroup.appendChild(band);
      } else {
        var flow = node('g', { class: 'irid-band' });
        flow.appendChild(node('rect', {
          x: '-30', y: '-8', width: '56', height: '44',
          fill: 'url(#' + id + '-irid)',
        }));
        clipGroup.appendChild(flow);
      }
      svg.appendChild(clipGroup);
    }

    svg.appendChild(node('path', { d: ARROW, class: 'edge' }));

    if (shine === 'sparkle') {
      var sparks = node('g', { class: 'sparks' });
      STARS.forEach(function (star) {
        sparks.appendChild(node('path', {
          d: SPARK,
          transform: 'translate(' + star[0] + ' ' + star[1] + ') scale(' + star[2] + ')',
          class: 'star',
          fill: 'var(--accent)',
          stroke: '#fff',
          'stroke-width': '1.2',
          'paint-order': 'stroke',
        }));
      });
      EMBERS.forEach(function (ember) {
        sparks.appendChild(node('circle', {
          cx: ember[0], cy: ember[1], r: '1.4', class: 'ember',
          fill: 'var(--accent)', stroke: '#fff', 'stroke-width': '.6',
        }));
      });
      svg.appendChild(sparks);
    }

    root.appendChild(svg);

    var label = document.createElement('span');
    label.className = 'label';
    var spark = node('svg', { viewBox: '0 0 12 12', class: 'spark', 'aria-hidden': 'true' });
    spark.appendChild(node('path', { d: 'M6 1Q6.8 5.2 11 6Q6.8 6.8 6 11Q5.2 6.8 1 6Q5.2 5.2 6 1Z' }));
    label.appendChild(spark);
    var name = document.createElement('span');
    name.className = 'name';
    name.textContent = config.label || 'Agent';
    label.appendChild(name);
    if (config.labelShine) {
      root.setAttribute('data-label-shine', config.labelShine);
      if (config.labelShine === 'sweep' || config.labelShine === 'ring') {
        var overlay = document.createElement('span');
        overlay.className = config.labelShine;
        overlay.setAttribute('aria-hidden', 'true');
        label.appendChild(overlay);
      }
    }
    root.appendChild(label);

    slot.appendChild(root);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-cursor]'), mount);
})();
