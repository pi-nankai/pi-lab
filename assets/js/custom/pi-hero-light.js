(()=>{
'use strict';
const PI_LIGHT_GLYPH_SEGMENTS = [
  [
    [[-.51,-.25], [-.46,-.48], [-.18,-.48], [-.015,-.45]],
    [[-.015,-.45], [.17,-.42], [.36,-.45], [.51,-.49]]
  ],
  [
    [[-.22,-.45], [-.155,-.14], [-.225,.22], [-.345,.405]],
    [[-.345,.405], [-.393,.485], [-.310,.505], [-.275,.425]]
  ],
  [
    [[.245,-.445], [.173,-.145], [.205,.110], [.206,.330]],
    [[.206,.330], [.207,.505], [.355,.495], [.465,.345]]
  ]
];

function mountMountainPiLight(canvas, options = {}) {
  const ctx = canvas.getContext('2d', { alpha: true });
  const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (a, b, n) => {
    const p = clamp((n - a) / (b - a));
    return p * p * (3 - 2 * p);
  };
  let width = 0, height = 0, ratio = 1, piScale = 0, disposed = false;
  let approach = null, retreat = null, skyFold = null, split = [], pi = [];
  let layoutReference = null, layoutRevision = null;
  let photoFrame = null, skyFrame = null, glyphFrame = null, targetPoint = null;
  let compact = false;
  // Traced against homepage-placement-background.jpg (3202×1586 normalized).
  // Only this foreground shoulder can hide selected passing light beams.
  // The bottom stops above the first title line, never including its pixels.
  const foregroundRidge = [
    [.521,.265], [.522,.239], [.528,.208], [.535,.190],
    [.540,.172], [.548,.161], [.552,.144], [.558,.137],
    [.567,.134], [.572,.131], [.578,.126], [.582,.127],
    [.588,.117], [.594,.119], [.600,.113], [.606,.116],
    [.610,.112], [.617,.115], [.623,.122], [.627,.137],
    [.629,.153], [.636,.150], [.641,.166], [.649,.169],
    [.651,.188], [.658,.206], [.663,.230], [.670,.257],
    [.671,.265]
  ];
  // A separate, smaller snow/pale-ridge patch receives local light. It avoids
  // the large dark rock wall and excludes every original heading/paragraph.
  const snowSurface = [
    [.538,.221], [.545,.194], [.552,.165], [.560,.148],
    [.571,.141], [.583,.129], [.594,.121], [.601,.119],
    [.600,.133], [.590,.140], [.579,.151], [.568,.166],
    [.561,.185], [.555,.211], [.545,.236], [.538,.241]
  ];
  let seed = 62013;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const sparks = Array.from({ length: 24 }, () => ({
    u: random(), phase: random() * Math.PI * 2,
    offset: (random() - .5) * 4, size: .42 + random() * .58
  }));

  function curve(segments, transform) {
    const points = [];
    let last = null, length = 0;
    for (let k = 0; k < segments.length; k++) {
      const segment = segments[k].map(transform);
      for (let j = k ? 1 : 0; j <= 65; j++) {
        const t = j / 65, q = 1 - t;
        const x = q * q * q * segment[0][0] + 3 * q * q * t * segment[1][0] + 3 * q * t * t * segment[2][0] + t * t * t * segment[3][0];
        const y = q * q * q * segment[0][1] + 3 * q * q * t * segment[1][1] + 3 * q * t * t * segment[2][1] + t * t * t * segment[3][1];
        const dx = 3 * q * q * (segment[1][0] - segment[0][0]) + 6 * q * t * (segment[2][0] - segment[1][0]) + 3 * t * t * (segment[3][0] - segment[2][0]);
        const dy = 3 * q * q * (segment[1][1] - segment[0][1]) + 6 * q * t * (segment[2][1] - segment[1][1]) + 3 * t * t * (segment[3][1] - segment[2][1]);
        const d = Math.hypot(dx, dy) || 1;
        if (last) length += Math.hypot(x - last.x, y - last.y);
        const p = { x, y, nx: -dy / d, ny: dx / d, tx: dx / d, ty: dy / d, u: length };
        points.push(p);
        last = p;
      }
    }
    for (const p of points) p.u /= length || 1;
    return points;
  }

  function validRect(rect) {
    return rect && Number.isFinite(rect.x) && Number.isFinite(rect.y)
      && Number.isFinite(rect.width) && Number.isFinite(rect.height)
      && rect.width > 0 && rect.height > 0;
  }

  function photoPoint(p) {
    return photoFrame ? [photoFrame.x + p[0] * photoFrame.width, photoFrame.y + p[1] * photoFrame.height]
      : [p[0] * width, p[1] * height];
  }

  function skyPoint(p) {
    return skyFrame ? [skyFrame.left + (p[0] - .30) / .55 * (skyFrame.right - skyFrame.left),
      skyFrame.top + (p[1] - .055) / .195 * (skyFrame.bottom - skyFrame.top)] : photoPoint(p);
  }

  function glyphPoint(p) {
    if (glyphFrame) return [glyphFrame.x + p[0] * glyphFrame.width * piScale,
      glyphFrame.y + p[1] * glyphFrame.height * piScale];
    if (photoFrame) return [photoFrame.x + (.51 + p[0] * .115 * piScale) * photoFrame.width,
      photoFrame.y + (.152 + p[1] * .17 * piScale) * photoFrame.height];
    return [(.51 + p[0] * .115 * piScale) * width, (.152 + p[1] * .17 * piScale) * height];
  }

  function rebuild() {
    const box = canvas.getBoundingClientRect();
    const w = Math.max(1, box.width), h = Math.max(1, box.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const desiredPiScale = Number.isFinite(options.piScale) ? clamp(options.piScale, .85, 1.15) : 1;
    const nextLayout = options.layout || null;
    const nextRevision = nextLayout ? nextLayout.revision : null;
    if (w === width && h === height && ratio === dpr && piScale === desiredPiScale
      && layoutReference === nextLayout && layoutRevision === nextRevision && approach) {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      return;
    }
    width = w; height = h; ratio = dpr; piScale = desiredPiScale;
    layoutReference = nextLayout; layoutRevision = nextRevision;
    photoFrame = nextLayout && validRect(nextLayout.photo) ? { ...nextLayout.photo } : null;
    const s = nextLayout && nextLayout.sky;
    skyFrame = s && [s.left, s.top, s.right, s.bottom].every(Number.isFinite)
      && s.right > s.left && s.bottom > s.top ? { ...s } : null;
    glyphFrame = nextLayout && validRect(nextLayout.glyph) ? { ...nextLayout.glyph } : null;
    const target = nextLayout && nextLayout.target;
    targetPoint = target && Number.isFinite(target.x) && Number.isFinite(target.y) ? { ...target } : null;
    compact = !!(nextLayout && nextLayout.compact);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const screen = photoPoint;
    const glyph = glyphPoint;

    // Original text occupies the central lower frame. Approach hugs the left
    // valley, then travels entirely in the sky, above the two-line title.
    const approachSegments = [
      [[.118,.604], [.109,.570], [.124,.516], [.148,.456]],
      [[.148,.456], [.161,.414], [.178,.338], [.219,.277]],
      [[.219,.277], [.272,.213], [.374,.197], [.433,.175]],
      // This short pass dips behind the photographed shoulder, then clears
      // its highest crest. The rest of the accepted route is unchanged.
      [[.433,.175], [.484,.159], [.519,.167], [.548,.170]],
      [[.548,.170], [.568,.163], [.588,.133], [.604,.110]],
      [[.604,.110], [.621,.084], [.578,.054], [.514,.068]],
      [[.514,.068], [.481,.075], [.460,.089], [.451,.109]]
    ];
    approach = curve(approachSegments, screen);

    // An open, calligraphic π: a lifted cap, bowed left leg, and a curved
    // right leg ending in a fine, natural return. These are light strokes,
    // not a filled glyph, point cloud, icon, or closed rectangular doorway.
    pi = PI_LIGHT_GLYPH_SEGMENTS.map(segments => curve(segments, glyph));

    // A single folded optical ribbon, with its entire sweep confined to sky.
    // It unfurls once, then hands its energy to the three existing π strokes.
    skyFold = curve([
      [[.451,.109], [.501,.075], [.667,.061], [.759,.103]],
      [[.759,.103], [.845,.144], [.804,.214], [.710,.220]],
      [[.710,.220], [.629,.226], [.548,.168], [.463,.168]],
      [[.463,.168], [.361,.163], [.310,.217], [.390,.232]],
      [[.390,.232], [.477,.246], [.589,.195], [.622,.156]],
      [[.622,.156], [.652,.116], [.584,.093], [.529,.101]]
    ], skyPoint);
    const source = skyPoint([.529, .101]);
    const starts = pi.map(points => [points[0].x, points[0].y]);
    split = [
      curve([[source, skyPoint([.505, .070]), skyPoint([.465, .071]), starts[0]]], p => p),
      curve([[source, skyPoint([.552, .065]), skyPoint([.476, .057]), starts[1]]], p => p),
      curve([[source, skyPoint([.560, .106]), skyPoint([.555, .072]), starts[2]]], p => p)
    ];

    // The last beam approaches the original static π from its open left side.
    // It never crosses Photography, the second heading, or the paragraph.
    retreat = curve([
      [[.479,.190], [.417,.144], [.321,.129], [.248,.167]],
      [[.248,.167], [.210,.188], [.186,.246], [.198,.283]],
      [[.198,.283], [.205,.307], [.225,.310], [.2503,.310]]
    ], screen);

    if (skyFrame && !compact) {
      // Keep the physical valley/peak pass registered to the image, then
      // bridge into the independently measured space above the real title.
      const physical = approachSegments.slice(0, 5).map(segment => segment.map(screen));
      const peak = physical[physical.length - 1][3];
      const end = [skyFold[0].x, skyFold[0].y];
      const skyHeight = skyFrame.bottom - skyFrame.top;
      const liftY = Math.min(peak[1], skyFrame.top + skyHeight * .12);
      const bend = [lerp(peak[0], end[0], .64), liftY];
      physical.push([peak, [peak[0] + width * .012, liftY], [lerp(peak[0], end[0], .43), liftY], bend]);
      physical.push([bend, [lerp(bend[0], end[0], .46), liftY], [end[0], end[1] - skyHeight * .14], end]);
      approach = curve(physical, p => p);
    }

    if (compact) {
      const first = [pi[0][0].x, pi[0][0].y];
      const area = skyFrame || {
        left: Math.max(8, first[0] - width * .28), right: Math.min(width - 8, first[0] + width * .34),
        top: Math.max(0, first[1] - height * .10), bottom: first[1] + height * .10
      };
      const span = area.right - area.left, tall = area.bottom - area.top;
      const begin = [area.left + span * .04, area.top + tall * .68];
      approach = curve([
        [begin, [area.left + span * .13, area.top + tall * .20], [first[0] - span * .13, area.top + tall * .14], first]
      ], p => p);
    }

    if (targetPoint) {
      const from = glyphPoint([-.27, .22]);
      const area = skyFrame || {
        left: Math.max(0, from[0] - width * .24), right: from[0] + width * .18,
        top: Math.max(0, from[1] - height * .10), bottom: from[1] + height * .08
      };
      const span = area.right - area.left, tall = area.bottom - area.top;
      const glyphWidth = glyphFrame ? glyphFrame.width * piScale : width * .115 * piScale;
      const gap = Math.max(20, Math.min(46, glyphWidth * .30));
      const lane = Math.max(4, Math.min(targetPoint.x - gap, from[0] - gap));
      const elbowY = Math.min(targetPoint.y - gap, area.top + tall * .54);
      const elbow = [lane, elbowY], turn = [lane, targetPoint.y - Math.min(10, gap * .3)];
      retreat = curve([
        [from, [from[0] - span * .13, Math.min(from[1], area.top + tall * .25)], [lane + span * .05, area.top + tall * .26], elbow],
        [elbow, [lane - gap * .16, lerp(elbowY, targetPoint.y, .36)], [lane - gap * .16, targetPoint.y - gap * .40], turn],
        [turn, [lane + gap * .18, targetPoint.y], [targetPoint.x - gap * .22, targetPoint.y], [targetPoint.x, targetPoint.y]]
      ], p => p);
    }
  }

  function sample(points, u) {
    u = clamp(u);
    let lo = 0, hi = points.length - 1;
    while (lo < hi - 1) {
      const m = (lo + hi) >> 1;
      if (points[m].u < u) lo = m;
      else hi = m;
    }
    const a = points[lo], b = points[hi];
    const t = clamp((u - a.u) / (b.u - a.u || 1));
    return {
      x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t),
      nx: lerp(a.nx, b.nx, t), ny: lerp(a.ny, b.ny, t),
      tx: lerp(a.tx, b.tx, t), ty: lerp(a.ty, b.ty, t)
    };
  }

  function tracePolygon(polygon) {
    for (let k = 0; k < polygon.length; k++) {
      const p = polygon[k];
      const mapped = photoPoint(p);
      if (k === 0) ctx.moveTo(mapped[0], mapped[1]);
      else ctx.lineTo(mapped[0], mapped[1]);
    }
    ctx.closePath();
  }

  function clipForegroundOut() {
    // Inverse clipping affects the chosen light passes only. The photo is
    // untouched; π, the split, and the final title animation are never masked.
    if (options.terrain === false || compact) return;
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    tracePolygon(foregroundRidge);
    ctx.clip('evenodd');
  }

  function nearestRidge(point) {
    let best = { x: point.x, y: point.y, distance: Infinity };
    for (let k = 0; k < foregroundRidge.length - 1; k++) {
      const a = foregroundRidge[k], b = foregroundRidge[k + 1];
      const [ax, ay] = photoPoint(a), [bx, by] = photoPoint(b);
      const dx = bx - ax, dy = by - ay;
      const u = clamp(((point.x - ax) * dx + (point.y - ay) * dy) / (dx * dx + dy * dy || 1));
      const x = ax + dx * u, y = ay + dy * u;
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < best.distance) best = { x, y, distance };
    }
    return best;
  }

  function snowResponse(points, head, power) {
    if (options.terrain === false || compact || power <= .005 || head <= 0) return;
    const light = sample(points, head);
    if (photoFrame) {
      const x = (light.x - photoFrame.x) / photoFrame.width;
      const y = (light.y - photoFrame.y) / photoFrame.height;
      if (x < .51 || x > .66 || y > .268) return;
    } else if (light.x < width * .51 || light.x > width * .66 || light.y > height * .268) return;
    const contact = nearestRidge(light);
    const radius = (photoFrame ? photoFrame.width : width) * .030;
    if (contact.distance > radius * 1.15) return;
    const proximity = Math.exp(-Math.pow(contact.distance / (radius * .68), 2));
    const alpha = Math.min(.105, power * proximity * .095);
    if (alpha < .003) return;
    // The illumination sits just on the face side of the traced ridge and is
    // doubly bounded by real terrain plus the narrower snow/pale-rock patch.
    const x = contact.x, y = contact.y + (photoFrame ? photoFrame.height : height) * .004;
    ctx.save();
    ctx.beginPath(); tracePolygon(foregroundRidge); ctx.clip();
    ctx.beginPath(); tracePolygon(snowSurface); ctx.clip();
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(219,235,244,${alpha})`);
    glow.addColorStop(.28, `rgba(216,232,243,${alpha * .72})`);
    glow.addColorStop(.67, `rgba(210,228,241,${alpha * .24})`);
    glow.addColorStop(1, 'rgba(209,227,241,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  function stroke(points, from, to, offset, color, alpha, lineWidth, time = 0, loosen = 0) {
    if (alpha <= .001 || to <= from) return;
    from = clamp(from); to = clamp(to);
    const count = Math.max(3, Math.ceil((to - from) * Math.min(450, points.length * 1.15)));
    const px = Math.max(.55, width / 1024);
    ctx.beginPath();
    for (let i = 0; i <= count; i++) {
      const u = lerp(from, to, i / count);
      const p = sample(points, u);
      const widthEnvelope = .28 + .72 * Math.sin(u * Math.PI);
      const displacement = (offset * widthEnvelope + Math.sin(u * Math.PI * 2 + time * .23) * loosen) * px;
      const x = p.x + p.nx * displacement;
      const y = p.y + p.ny * displacement;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lineWidth * px;
    ctx.stroke();
  }

  const approachLayers = [
    { w: 24, a: .020 }, { w: 12, a: .040 },
    { w: 5.5, a: .115 }, { w: 2.15, a: .58 }, { w: .80, a: .92 }
  ];
  const piLayers = [
    { w: 10, a: .022 }, { w: 5.3, a: .065 },
    { w: 2.35, a: .24 }, { w: 1.05, a: .64 }, { w: .45, a: .62 }
  ];

  function depthProfile(points, u) {
    // Camera-space depth is attached to the existing light route, never to
    // the whole canvas. No filter, alternate geometry, or new mark is used.
    if (points === retreat) {
      // The return begins as an open ribbon and optically gathers toward
      // the title. Only the passing beam changes; its destination stays still.
      const focus = ease(.20, .98, u);
      return {
        coreWidth: lerp(.88, .58, focus),
        haloWidth: lerp(1.08, .24, focus),
        coreAlpha: lerp(.67, 1.15, focus),
        glowAlpha: lerp(.86, .36, focus),
        spacing: lerp(2.38, .16, focus)
      };
    }
    if (points === approach) {
      if (compact) return { coreWidth: .88, haloWidth: .92, coreAlpha: .86, glowAlpha: .90, spacing: .86 };
      const recession = ease(.22, .64, u);
      // The crest hides u≈.69–.77. Focus returns continuously just after
      // the head reappears rather than snapping to full brightness at a mask.
      const emergence = ease(.772, .865, u);
      const nearness = 1 - recession * (1 - emergence * .82);
      return {
        coreWidth: lerp(.49, 1.07, nearness),
        haloWidth: lerp(.69, 1.04, nearness),
        coreAlpha: lerp(.32, 1.01, nearness),
        glowAlpha: lerp(.78, .97, nearness),
        spacing: lerp(.43, 1.02, nearness)
      };
    }
    if (points === skyFold) {
      const p = sample(points, u);
      // The high arch recedes into the sky; the low returning fold comes
      // forward. Its narrow core and edge filaments remain separately drawn.
      const referenceY = skyFrame ? .055 + (p.y - skyFrame.top) / (skyFrame.bottom - skyFrame.top) * .195
        : photoFrame ? (p.y - photoFrame.y) / photoFrame.height : p.y / height;
      const nearness = .10 + .80 * ease(.095, .235, referenceY);
      return {
        coreWidth: lerp(.43, .99, nearness),
        haloWidth: lerp(.59, .99, nearness),
        coreAlpha: lerp(.29, .94, nearness),
        glowAlpha: lerp(.70, .96, nearness),
        spacing: lerp(.36, 1.05, nearness)
      };
    }
    return { coreWidth: 1, haloWidth: 1, coreAlpha: 1, glowAlpha: 1, spacing: 1 };
  }

  function depthBeam(points, head, tail, amount, time, warmOrigin) {
    if (amount <= .001 || head <= 0) return;
    stroke(points, 0, head, 0, '#cedce1', amount * .014, .80, time);
    // Local segments make focus vary smoothly along one exposure instead of
    // dimming or blurring an entire curve uniformly.
    for (let k = 0; k < 24; k++) {
      const from = lerp(tail, head, k / 24);
      const to = Math.min(head, lerp(tail, head, (k + 1.05) / 24));
      const u = (from + to) / 2;
      const spatial = depthProfile(points, u);
      const q = (k + .5) / 24;
      const cool = warmOrigin ? ease(.13, .44, u) : 1;
      const color = `rgb(${Math.round(lerp(255, 240, cool))},${Math.round(lerp(228, 246, cool))},${Math.round(lerp(190, 250, cool))})`;
      for (let j = 0; j < approachLayers.length; j++) {
        const layer = approachLayers[j];
        const inner = j >= 3;
        const middle = j === 2;
        const widthScale = inner ? spatial.coreWidth : middle
          ? lerp(spatial.haloWidth, spatial.coreWidth, .55) : spatial.haloWidth;
        const energy = inner ? spatial.coreAlpha : middle
          ? lerp(spatial.glowAlpha, spatial.coreAlpha, .55) : spatial.glowAlpha;
        stroke(points, from, to, 0, color, amount * q * layer.a * energy,
          layer.w * widthScale, time);
      }
    }
    const dispersions = [
      { offset: -3.0, color: '#ccdce5', a: .20 },
      { offset: -1.45, color: '#e1eaf0', a: .28 },
      { offset: 1.9, color: warmOrigin && head < .3 ? '#ead4ad' : '#e1e4db', a: .22 },
      { offset: 3.5, color: '#bed0dc', a: .12 }
    ];
    for (const strand of dispersions) {
      for (let k = 0; k < 10; k++) {
        const from = lerp(tail, head, k / 10);
        const to = Math.min(head, lerp(tail, head, (k + 1.025) / 10));
        const spatial = depthProfile(points, (from + to) / 2);
        const taper = Math.sin((k + .5) / 10 * Math.PI);
        stroke(points, from, to, strand.offset * spatial.spacing, strand.color,
          amount * strand.a * taper * spatial.coreAlpha * .88,
          .58 * Math.max(.57, spatial.coreWidth), time, .28 * spatial.spacing);
      }
    }
  }

  function beam(points, head, tail, amount, time, warmOrigin) {
    if (options.depth !== false) {
      depthBeam(points, head, tail, amount, time, warmOrigin);
      return;
    }
    if (amount <= .001 || head <= 0) return;
    // Only the moving head is brilliant; the exposed path does not remain lit.
    stroke(points, 0, head, 0, '#cedce1', amount * .024, 1.15, time);
    for (let k = 0; k < 12; k++) {
      const from = lerp(tail, head, k / 12);
      const to = Math.min(head, lerp(tail, head, (k + 1.05) / 12));
      const q = (k + .5) / 12;
      const power = Math.pow(q, 1.0);
      const cool = warmOrigin ? ease(.13, .44, (from + to) / 2) : 1;
      const r = Math.round(lerp(255, 240, cool));
      const g = Math.round(lerp(228, 246, cool));
      const b = Math.round(lerp(190, 250, cool));
      const color = `rgb(${r},${g},${b})`;
      for (const layer of approachLayers) {
        stroke(points, from, to, 0, color, amount * power * layer.a, layer.w, time);
      }
    }
    const dispersions = [
      { offset: -3.0, color: '#ccdce5', a: .20 },
      { offset: -1.45, color: '#e1eaf0', a: .28 },
      { offset: 1.9, color: warmOrigin && head < .3 ? '#ead4ad' : '#e1e4db', a: .22 },
      { offset: 3.5, color: '#bed0dc', a: .12 }
    ];
    for (const strand of dispersions) {
      for (let k = 0; k < 4; k++) {
        const from = lerp(tail, head, k / 4);
        const to = Math.min(head, lerp(tail, head, (k + 1.02) / 4));
        stroke(points, from, to, strand.offset, strand.color,
          amount * strand.a * Math.sin((k + .5) / 4 * Math.PI), .58, time, .28);
      }
    }
  }

  function foldedFilament(points, from, to, strand, amount, time) {
    if (amount < .001 || to <= from) return;
    const px = Math.max(.55, width / 1024);
    const count = Math.max(6, Math.ceil((to - from) * 360));
    ctx.beginPath();
    for (let j = 0; j <= count; j++) {
      const u = lerp(from, to, j / count);
      const p = sample(points, u);
      const opening = .25 + .75 * Math.sin(u * Math.PI);
      const twist = Math.sin(u * Math.PI * 5.2 - time * 1.02 + strand * .33);
      const spatialSpacing = options.depth === false ? 1 : depthProfile(points, u).spacing;
      const spread = (strand * .78 + twist * (1.2 + Math.abs(strand) * .30)) * opening * px * spatialSpacing;
      const x = p.x + p.nx * spread, y = p.y + p.ny * spread;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const spatial = options.depth === false ? null : depthProfile(points, (from + to) / 2);
    ctx.globalAlpha = amount * (spatial ? spatial.coreAlpha : 1);
    ctx.lineWidth = .48 * px * (spatial ? Math.max(.6, spatial.coreWidth) : 1);
    ctx.strokeStyle = strand < 0 ? '#cbdde8' : '#e7edf0';
    ctx.stroke();
  }

  function render(timeSeconds) {
    if (disposed) return;
    rebuild();
    ctx.clearRect(0, 0, width, height);
    const elapsed = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0;
    const duration = Number.isFinite(options.duration) ? clamp(options.duration, 12, 20) : 15;
    const t = elapsed * 15 / duration;
    // All duration settings end with at least one second of untouched photo.
    const silentFrom = Math.min(duration - 1, duration * 14 / 15);
    if (elapsed >= duration || elapsed >= silentFrom) return;
    const endFade = 1 - ease(silentFrom - .25, silentFrom, elapsed);
    const strength = (Number.isFinite(options.intensity) ? clamp(options.intensity, .2, 1.6) : 1) * endFade;
    const px = Math.max(.55, width / 1024);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';

    const approachHead = ease(.15, 3.0, t);
    const approachTail = Math.max(0, approachHead - .29);
    const approachPower = ease(.04, .38, t) * (1 - ease(3.00, 3.70, t)) * strength;

    // Warmth appears only where the real photograph already contains lamps.
    const ignite = compact ? 0 : Math.sin(clamp(t / .92) * Math.PI) * (1 - ease(.68, 1.1, t)) * strength;
    if (ignite > .001) {
      const p = sample(approach, 0);
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 27 * px);
      glow.addColorStop(0, `rgba(255,237,207,${.42 * ignite})`);
      glow.addColorStop(.25, `rgba(238,206,158,${.18 * ignite})`);
      glow.addColorStop(1, 'rgba(230,190,135,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - 27 * px, p.y - 27 * px, 54 * px, 54 * px);
    }
    ctx.save();
    clipForegroundOut();
    beam(approach, approachHead, approachTail, approachPower, t, !compact);

    // Sparse short photographic streaks accompany the moving approach only.
    if (t > .35 && t < 3.35) {
      for (const spark of sparks) {
        const u = lerp(approachTail, approachHead, spark.u);
        const p = sample(approach, u);
        const life = Math.pow(Math.max(0, Math.sin(t * 1.6 + spark.phase)), 3);
        const spatial = options.depth === false ? null : depthProfile(approach, u);
        const alpha = approachPower * life * (.08 + .26 * spark.u) * (spatial ? spatial.coreAlpha : 1);
        if (alpha < .008) continue;
        const o = (spark.offset + Math.sin(t + spark.phase) * 1.8) * px * (spatial ? spatial.spacing : 1);
        const x = p.x + p.nx * o, y = p.y + p.ny * o;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#e6edf0'; ctx.lineWidth = spark.size * px * (spatial ? Math.max(.6, spatial.coreWidth) : 1);
        ctx.beginPath();
        ctx.moveTo(x - p.tx * px, y - p.ty * px);
        ctx.lineTo(x + p.tx * 2.4 * px, y + p.ty * 2.4 * px);
        ctx.stroke();
      }
    }
    ctx.restore();
    snowResponse(approach, approachHead, approachPower);

    // One new spatial gesture: a broad silver ribbon folds back through open
    // sky, with fine twisting edges. It fades before π becomes the main focus.
    // Bound even the softest glow to sky when a narrow preview hits the
    // minimum stroke width; the title below is never part of this effect.
    ctx.save();
    ctx.beginPath();
    if (skyFrame) ctx.rect(skyFrame.left, skyFrame.top, skyFrame.right - skyFrame.left, skyFrame.bottom - skyFrame.top);
    else if (photoFrame) ctx.rect(photoFrame.x, photoFrame.y + photoFrame.height * .055, photoFrame.width, photoFrame.height * .195);
    else ctx.rect(0, height * .055, width, height * .195);
    ctx.clip();
    const skyHead = ease(2.58, 4.85, t);
    const skyTail = Math.max(0, skyHead - .35);
    const skyPower = ease(2.58, 2.98, t) * (1 - ease(4.35, 5.30, t)) * strength * .83;
    ctx.save();
    clipForegroundOut();
    beam(skyFold, skyHead, skyTail, skyPower, t, false);
    for (const s of [-4, -3, -2, 2, 3, 4]) {
      foldedFilament(skyFold, skyTail, skyHead, s,
        skyPower * (Math.abs(s) === 2 ? .21 : .13), t);
    }
    ctx.restore();
    snowResponse(skyFold, skyHead, skyPower * .72);

    // A restrained three-way handoff joins exactly the starts of the approved
    // cap and curved legs. Each branch yields to the corresponding pen stroke.
    const splitTimes = [[4.34, 4.95], [4.46, 5.40], [4.58, 5.98]];
    const splitEnds = [[4.90, 5.47], [5.38, 6.00], [5.97, 6.57]];
    for (let k = 0; k < 3; k++) {
      const head = ease(splitTimes[k][0], splitTimes[k][1], t);
      const amount = ease(splitTimes[k][0], splitTimes[k][0] + .20, t)
        * (1 - ease(splitEnds[k][0], splitEnds[k][1], t)) * strength;
      if (amount <= .001 || head <= 0) continue;
      stroke(split[k], 0, head, 0, '#dfebf1', amount * .09, 5.2, t);
      stroke(split[k], 0, head, 0, '#eff5f7', amount * .39, .92, t);
      stroke(split[k], 0, head, -1.12, '#c5d9e7', amount * .18, .44, t, .25);
      stroke(split[k], 0, head, 1.12, '#e8eced', amount * .15, .44, t, .25);
    }
    ctx.restore();

    const piFade = (1 - ease(10.95, 12.28, t)) * strength;
    const revealTimes = [[4.82, 5.52], [5.42, 6.08], [6.00, 6.70]];
    for (let k = 0; k < 3; k++) {
      const route = pi[k];
      const reveal = ease(revealTimes[k][0], revealTimes[k][1], t);
      if (reveal <= 0 || piFade <= .001) continue;
      const active = t >= revealTimes[k][0] && t <= revealTimes[k][1];
      // Completed marks are quiet while the next light stroke is being drawn.
      const hold = t >= 6.70 ? 1 : active ? .88 : .44;
      const alpha = piFade * hold;
      for (const layer of piLayers) {
        stroke(route, 0, reveal, 0, '#f0f5f7', alpha * layer.a, layer.w, t);
      }
      // A pair of adjacent optical filaments makes an open ribbon, not a solid
      // letter. Strands taper at both ends and separate slightly as they fade.
      const loosen = ease(10.95, 12.28, t);
      for (const s of [-2, -1, 1, 2]) {
        stroke(route, 0, reveal, s * (1 + loosen * .8), s < 0 ? '#cadde9' : '#e7e8df',
          alpha * (Math.abs(s) === 1 ? .25 : .10), .45 + loosen * .3, t, loosen * 1.1);
      }
      if (active && reveal < .995) {
        // Only this small traveling tip is the peak of the writing phase.
        const from = Math.max(0, reveal - .13);
        stroke(route, from, reveal, 0, '#ffffff', alpha * .85, 1.12, t);
      }

      // During the extended hold, a single slow highlight walks the three
      // approved strokes in turn. The π outline itself stays completely still.
      const flowTimes = [[6.98, 8.08], [8.28, 9.42], [9.62, 10.78]];
      const begin = flowTimes[k][0], end = flowTimes[k][1];
      if (t > begin && t < end) {
        const head = ease(begin, end, t);
        const tail = Math.max(0, head - .25);
        const pulse = Math.sin(clamp((t - begin) / (end - begin)) * Math.PI);
        stroke(route, tail, head, 0, '#e4eef4', alpha * pulse * .12, 5.0, t);
        stroke(route, tail, head, 0, '#ffffff', alpha * pulse * .66, 1.10, t);
        stroke(route, tail, head, -.88, '#d3e3ed', alpha * pulse * .25, .44, t);
      }
    }

    const returnHead = ease(11.05, 13.70, t);
    const returnTail = Math.max(0, returnHead - .29);
    const returnPower = ease(11.05, 11.42, t) * (1 - ease(13.10, 13.95, t)) * strength * .78;
    beam(retreat, returnHead, returnTail, returnPower, t, false);
    // No bloom, flash, scaling, or new mark is applied at the static title π.
    // The returning beam is already extinguished before its tip reaches it.
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  return {
    render,
    destroy() {
      disposed = true;
      approach = null; retreat = null; skyFold = null; split.length = 0; pi.length = 0; sparks.length = 0;
      ctx.clearRect(0, 0, width, height);
    }
  };
}

function initPiHome() {
  const hero=document.querySelector('[data-pi-hero]');
  if(!hero)return;
  const canvas=hero.querySelector('.pi-hero-light-canvas');
  const symbol=hero.querySelector('.pi-hero-symbol');
  const heading=hero.querySelector('.pi-hero-heading');
  const copy=hero.querySelector('.pi-hero-copy');
  const images=[...hero.querySelectorAll('.pi-hero-background img')];
  const dots=[...hero.querySelectorAll('.pi-backdrop-dot')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const DURATION=17;
  let layout={revision:0},protectedText=[],ready=false,visible=false,started=false,playing=false,finished=false;
  let time=0,last=0,raf=0,active=0,rotationTimer=0,replayTimer=0,disposed=false,measureFrame=0;
  const options={intensity:1,piScale:1,duration:15,terrain:true,depth:true,get layout(){return layout;}};
  const api=mountMountainPiLight(canvas,options);
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function pulse(){
    if(reduced.matches)return 0;
    const wave=(a,b,peak)=>time<=a||time>=b?0:peak*Math.sin(Math.PI*(time-a)/(b-a))**2;
    return wave(13.82,14.46,.8)+wave(14.5,15.24,.55);
  }
  function measure(){
    if(disposed||!hero.isConnected)return;
    const box=hero.getBoundingClientRect(),title=heading.getBoundingClientRect(),mark=symbol.getBoundingClientRect();
    if(!box.width||!box.height)return;
    const image=images[0],naturalWidth=image.naturalWidth||1920,naturalHeight=image.naturalHeight||1200;
    const scale=Math.max(box.width/naturalWidth,box.height/naturalHeight);
    const photoWidth=naturalWidth*scale,photoHeight=naturalHeight*scale;
    const photoLeft=(box.width-photoWidth)/2,photoTop=(box.height-photoHeight)/2;
    const headerHeight=document.querySelector('.header')?.getBoundingClientRect().height||70;
    const top=Math.max(70,headerHeight+10),bottom=Math.max(top+24,title.top-box.top-16);
    const skyHeight=bottom-top,fontSize=parseFloat(getComputedStyle(heading).fontSize)||64;
    const glyphHeight=Math.max(18,Math.min(128,fontSize*2.05,skyHeight*.77));
    layout={
      revision:layout.revision+1,
      photo:{x:photoLeft+photoWidth*100/3446,y:photoTop+photoHeight*296/2153.75,width:photoWidth*3202/3446,height:photoHeight*1586/2153.75},
      sky:{left:box.width*.22,top,right:box.width*.84,bottom},
      glyph:{x:box.width*.51,y:top+skyHeight*.51,width:glyphHeight*1.36565,height:glyphHeight},
      target:{x:mark.left-box.left+mark.width*.5,y:mark.top-box.top+mark.height*.5},
      compact:box.width<768||skyHeight<72
    };
    protectedText=[];
    const walker=document.createTreeWalker(copy,NodeFilter.SHOW_TEXT);
    for(let node=walker.nextNode();node;node=walker.nextNode()){
      if(!node.textContent.trim()||node.parentElement.closest('svg,.pi-hero-description'))continue;
      const range=document.createRange();range.selectNodeContents(node);
      for(const rect of range.getClientRects())if(rect.width&&rect.height)protectedText.push({x:rect.left-box.left-2,y:rect.top-box.top-2,width:rect.width+4,height:rect.height+4});
    }
    render();
  }
  function render(){
    if(!hero.isConnected||!layout.photo)return;
    const glow=pulse();symbol.style.setProperty('--pi-arrival',(glow*.65).toFixed(3));symbol.classList.toggle('is-arriving',glow>.001);
    api.render(reduced.matches?DURATION:time);
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const box=canvas.getBoundingClientRect(),dpr=canvas.width/Math.max(1,box.width);
    ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
    for(const rect of protectedText)ctx.clearRect(rect.x,rect.y,rect.width,rect.height);
    ctx.restore();
  }
  function requestMeasure(){if(!measureFrame)measureFrame=requestAnimationFrame(()=>{measureFrame=0;measure();});}
  function queue(){if(!raf&&!disposed&&playing&&ready&&visible&&!document.hidden)raf=requestAnimationFrame(frame);}
  function frame(now){
    raf=0;if(disposed||!hero.isConnected){cleanup();return;}
    if(!playing||!visible||document.hidden){last=0;return;}
    if(last)time+=Math.min(.05,(now-last)/1000);last=now;
    if(time>=DURATION){time=DURATION;playing=false;finished=true;}
    render();if(finished)scheduleBackground();else queue();
  }
  function startIfReady(){
    if(!ready||!visible||document.hidden||started)return;
    started=true;
    if(reduced.matches){time=DURATION;finished=true;playing=false;render();return;}
    playing=true;time=0;last=0;queue();
  }
  async function loadBackground(index){
    const image=images[index];if(!image)return false;
    if(!image.getAttribute('src'))image.src=image.dataset.src;
    try{await image.decode();}catch{return image.complete&&image.naturalWidth>0;}
    return true;
  }
  async function showBackground(index){
    if(!await loadBackground(index)||disposed)return;
    active=index;images.forEach((image,i)=>image.classList.toggle('is-active',i===index));
    dots.forEach((dot,i)=>{dot.classList.toggle('is-active',i===index);dot.setAttribute('aria-pressed',String(i===index));});
  }
  function scheduleBackground(){
    clearTimeout(rotationTimer);rotationTimer=0;
    if(!finished||!visible||document.hidden||reduced.matches||images.length<2)return;
    // The alternate image does not compete with the first-view hero download.
    loadBackground(1);
    rotationTimer=setTimeout(async()=>{rotationTimer=0;if(!visible||document.hidden||!finished)return;await showBackground((active+1)%images.length);scheduleBackground();},10000);
  }
  async function replay(){
    clearTimeout(rotationTimer);clearTimeout(replayTimer);rotationTimer=0;
    const switching=active!==0;
    playing=false;finished=false;started=true;time=0;last=0;
    await showBackground(0);if(disposed)return;measure();
    const begin=()=>{if(reduced.matches){time=DURATION;finished=true;render();return;}playing=true;queue();};
    if(switching)replayTimer=setTimeout(begin,900);else begin();
  }
  symbol.addEventListener('click',replay);
  dots.forEach((dot,index)=>dot.addEventListener('click',async()=>{
    clearTimeout(replayTimer);playing=false;started=true;finished=true;time=DURATION;render();
    await showBackground(index);scheduleBackground();
  }));
  const resize=new ResizeObserver(requestMeasure);resize.observe(hero);resize.observe(copy);
  const inView=new IntersectionObserver(entries=>{
    const entry=entries[entries.length-1];visible=entry.isIntersecting&&entry.intersectionRatio>.05;last=0;
    if(!visible){clearTimeout(rotationTimer);rotationTimer=0;}else{startIfReady();queue();if(finished)scheduleBackground();}
  },{threshold:[0,.05,.5]});inView.observe(hero);
  function visibility(){last=0;if(document.hidden){clearTimeout(rotationTimer);rotationTimer=0;}else{startIfReady();queue();if(finished)scheduleBackground();}}
  document.addEventListener('visibilitychange',visibility);
  function motion(){if(reduced.matches){playing=false;finished=true;started=true;time=DURATION;clearTimeout(rotationTimer);clearTimeout(replayTimer);render();}}
  reduced.addEventListener('change',motion);
  window.addEventListener('resize',requestMeasure);
  document.fonts?.addEventListener('loadingdone',requestMeasure);
  function cleanup(){
    if(disposed)return;disposed=true;cancelAnimationFrame(raf);cancelAnimationFrame(measureFrame);clearTimeout(rotationTimer);clearTimeout(replayTimer);
    resize.disconnect();inView.disconnect();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',motion);
    window.removeEventListener('resize',requestMeasure);document.fonts?.removeEventListener('loadingdone',requestMeasure);api.destroy();
  }
  window.addEventListener('pagehide',event=>{last=0;if(!event.persisted)cleanup();});
  window.addEventListener('pageshow',event=>{if(event.persisted){last=0;measure();queue();if(finished)scheduleBackground();}});
  measure();
  const fonts=document.fonts?Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1200))]):Promise.resolve();
  Promise.all([loadBackground(0),fonts]).then(([loaded])=>{if(disposed)return;ready=loaded;measure();startIfReady();});
}
initPiHome();

})();
