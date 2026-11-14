// render.js — 14종 고정 섹션 렌더러 (결정적 캔버스, "프리뷰=출력물")
// 설계 원칙 (cardnews-studio layouts.js 계승):
//  - 레이아웃은 코드가 고정한다. 좌표를 외부에서 넣지 않는다.
//  - 텍스트가 넘칠 경우 블록 폰트를 축소(하한 62%)하고, 그래도 넘치면 QA 경고 대상(_overflow)이 된다.
//  - 섹션 폭은 프로젝트 규격(860/1000/자유)을 따르며, 모든 내부 수치는 s = W/1000 비율로 스케일된다.
//  - 그리기 순서는 "높이 선계산(measure) → 배경 → 내용"이다. 배경이 내용을 덮지 않게.
import { font } from './fonts.js';
import { clamp, rgba, mixHex, lumDist } from './util.js';
import { AUTO_TONE } from './sections.js';

export const BASE_W = 1000;
const MIN_SCALE = 0.62; // 폰트 최소 축소 한계 (이하로는 말줄임 + QA 경고)

// 섹션별 항목 상한 (QA·에디터 공용)
export const LIMITS = {
  problem: 4, features: 6, gallery: 4, howto: 5, spec: 12, packages: 3,
  comparison: 4, review: 3, faq: 6, certification: 4, notice: 6, disclaimer: 8,
};

// ---------- 이미지 캐시 ----------
const imgCache = new Map();
const imgWaiting = new Set();

export function collectSrcs(P) {
  const srcs = [];
  const add = (m) => { if (m && m.src) srcs.push(m.src); };
  add(P.brand && P.brand.logo);
  for (const sec of P.sections) {
    add(sec.media);
    add(sec.bg);
    if (Array.isArray(sec.images)) sec.images.forEach(add);
  }
  return srcs;
}

export async function ensureImages(P) {
  const jobs = [];
  for (const src of collectSrcs(P)) {
    if (imgCache.has(src) || imgWaiting.has(src)) continue;
    imgWaiting.add(src);
    jobs.push(
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { imgCache.set(src, img); resolve(); };
        img.onerror = () => resolve();
        img.src = src;
      }).finally(() => imgWaiting.delete(src))
    );
  }
  if (jobs.length) await Promise.all(jobs);
}

// ---------- 그리기 프리미티브 ----------
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

// 줄 배열 블록 폭 맞춤: 블록 전체 폰트를 축소한다. returns { size, overflow }
export function fitBlock(ctx, F, lines, weight, size, maxW, minScale = MIN_SCALE) {
  ctx.font = font(F, weight, size);
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, ctx.measureText(l).width);
  if (widest <= maxW || !lines.length) return { size, overflow: false };
  const scale = maxW / widest;
  if (scale < minScale) return { size: size * minScale, overflow: true };
  return { size: size * scale, overflow: false };
}

function clipLine(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

// 줄 배열 그리기. opts: { x, y, weight, size, color, lh, maxW, align, maxLines, W }
// returns { bottom, overflow }
function drawLines(ctx, F, lines, opts) {
  const {
    x, y, weight = 500, size, color, lh = 1.42,
    maxW, align = 'left', maxLines = 99, W: CW = 0,
  } = opts;
  const shown = (lines || []).slice(0, maxLines);
  if (!shown.length) return { bottom: y, overflow: false };
  const fit = fitBlock(ctx, F, shown, weight, size, maxW);
  ctx.font = font(F, weight, fit.size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const step = fit.size * lh;
  const cx = align === 'center' ? CW / 2 : x;
  shown.forEach((l, i) => {
    const text = fit.overflow ? clipLine(ctx, l, maxW) : l;
    ctx.fillText(text, cx, y + i * step + (step - fit.size) / 2);
  });
  ctx.textAlign = 'left';
  return { bottom: y + shown.length * step, overflow: fit.overflow };
}

// 자간 넓은 텍스트 (kicker). returns 오른쪽 끝 x
function drawSpaced(ctx, F, text, x, y, spacing, weight, size, color) {
  ctx.font = font(F, weight, size);
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return cx - spacing;
}

function spacedWidth(ctx, F, text, spacing, weight, size) {
  ctx.font = font(F, weight, size);
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + spacing;
  return total - spacing;
}

// 알약 배지. opt: { x | center, y, size, h, fill, outline, color } → { bottom, w, h }
function drawPill(ctx, F, text, opt = {}) {
  if (!text) return { bottom: opt.y || 0, w: 0, h: 0 };
  const size = opt.size || 26;
  ctx.font = font(F, 700, size);
  const tw = ctx.measureText(text).width;
  const padX = opt.padX || 24;
  const h = opt.h || 52;
  const w = tw + padX * 2;
  const x = opt.center ? opt.center - w / 2 : opt.x;
  roundRect(ctx, x, opt.y, w, h, h / 2);
  if (opt.outline) {
    ctx.strokeStyle = opt.fill;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  } else {
    ctx.fillStyle = opt.fill;
    ctx.fill();
  }
  ctx.fillStyle = opt.color || (opt.outline ? opt.fill : '#FFFFFF');
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + padX, opt.y + (h - size) / 2 + 1);
  return { bottom: opt.y + h, w, h };
}

function drawCheckCircle(ctx, x, y, r, accent) {
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = r * 0.22;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.42, y + r * 0.02);
  ctx.lineTo(x - r * 0.1, y + r * 0.36);
  ctx.lineTo(x + r * 0.46, y - r * 0.3);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawCross(ctx, x, y, r, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r);
  ctx.lineTo(x - r, y + r);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawStar(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// 이미지 없을 때 플레이스홀더 (사선 + 카메라 글리프)
function drawPlaceholder(env, x, y, w, h, small = false) {
  const { ctx, accent, F, s } = env;
  ctx.save();
  ctx.fillStyle = '#E8E8EA';
  roundRect(ctx, x, y, w, h, 24 * s);
  ctx.fill();
  ctx.save();
  roundRect(ctx, x, y, w, h, 24 * s);
  ctx.clip();
  ctx.strokeStyle = rgba(accent, 0.14);
  ctx.lineWidth = 3 * s;
  for (let d = -h; d < w; d += 44 * s) {
    ctx.beginPath();
    ctx.moveTo(x + d, y + h);
    ctx.lineTo(x + d + h, y);
    ctx.stroke();
  }
  ctx.restore();
  const cx = x + w / 2;
  const cy = y + h / 2;
  const u = small ? 0.7 : 1;
  ctx.strokeStyle = 'rgba(26,27,30,0.35)';
  ctx.fillStyle = 'rgba(26,27,30,0.35)';
  ctx.lineWidth = 5 * s;
  const gw = 108 * u * s;
  const gh = 76 * u * s;
  roundRect(ctx, cx - gw / 2, cy - gh / 2, gw, gh, 14 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + 3 * u * s, 22 * u * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + 3 * u * s, 8 * u * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = font(F, 500, 24 * s);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillText('이미지를 추가하세요', cx, cy + gh / 2 + 14 * s);
  ctx.textAlign = 'left';
  ctx.restore();
}

// ---------- 환경(톤·색 팔레트) ----------
function toneColors(accent, tone) {
  switch (tone) {
    case 'gray':
      return { bg: '#F5F5F7', ink: '#1D1D1F', sub: '#6E6E73', faint: 'rgba(60,60,67,0.45)', hair: 'rgba(29,29,31,0.09)', panel: '#FFFFFF', onDark: false };
    case 'dark':
      return { bg: '#101013', ink: '#F5F5F7', sub: 'rgba(245,245,247,0.66)', faint: 'rgba(245,245,247,0.42)', hair: 'rgba(245,245,247,0.15)', panel: 'rgba(245,245,247,0.07)', onDark: true };
    case 'wash': {
      const bg = mixHex('#FFFFFF', accent, 0.06);
      return { bg, ink: '#1D1D1F', sub: '#6E6E73', faint: 'rgba(60,60,67,0.45)', hair: 'rgba(29,29,31,0.09)', panel: '#FFFFFF', onDark: false };
    }
    case 'onimage':
      // 배경 이미지 위 — 스크림 위 흰 텍스트 팔레트
      return { bg: '#101013', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.82)', faint: 'rgba(255,255,255,0.55)', hair: 'rgba(255,255,255,0.24)', panel: 'rgba(255,255,255,0.14)', onDark: true };
    default: // white
      return { bg: '#FFFFFF', ink: '#1D1D1F', sub: '#6E6E73', faint: 'rgba(60,60,67,0.45)', hair: 'rgba(29,29,31,0.10)', panel: '#F5F5F7', onDark: false };
  }
}

function makeEnv(ctx, P, sec, index) {
  const W = P.width;
  const s = W / BASE_W;
  const accent = P.theme.accent || '#0071e3';
  const F = P.theme.font || 'gmarket';
  const tone = sec.tone && sec.tone !== 'auto' ? sec.tone : (AUTO_TONE[sec.type] || 'white');
  // 배경 (옵트인) — 히어로는 media가 곧 배경이므로 제외
  const bgOn = sec.type !== 'hero' && !!sec.bgOn;
  const hasBgImage = bgOn && sec.bgKind === 'image' && !!(sec.bg && sec.bg.src && imgCache.get(sec.bg.src));
  const hasBgShape = bgOn && sec.bgKind === 'shape';
  const DIMS = { d1: 0.38, d2: 0.5, d3: 0.62, d4: 0.74, d5: 0.85 };
  const DECOS = { d1: 0.05, d2: 0.08, d3: 0.12, d4: 0.16, d5: 0.22 };
  const dimLevel = DIMS[sec.bgDim] ?? DIMS.d3;
  const decoLevel = DECOS[sec.bgDim] ?? DECOS.d3;
  const bgGrad = sec.bgGrad !== false;
  const bgShape = ['rings', 'dots', 'stripes'].includes(sec.bgShape) ? sec.bgShape : 'rings';
  const T = toneColors(accent, hasBgImage ? 'onimage' : tone);
  // 어두운 지면(사진 배경·다크 톤)에서 액센트가 검정 계열이면 텍스트용으로 흰색으로 대체
  const accentText = (hasBgImage || tone === 'dark') && lumDist(accent, '#101013') < 0.22 ? '#FFFFFF' : accent;
  sec._overflow = false;
  sec._h = 0;
  return {
    ctx, P, sec, index, W, s, F, accent, accentText, T, tone,
    hasBg: hasBgImage || hasBgShape, hasBgImage, hasBgShape,
    bgGrad, bgShape, dimLevel, decoLevel,
    mx: 60 * s, padTop: 84 * s, padBot: 90 * s,
  };
}

// 섹션 배경 채우기 — 배경 사용 중(사진·모형)이면 스킵(renderSectionInto의 2패스가 그린다)
function fillBg(env, H) {
  if (env.hasBg) return;
  env.ctx.fillStyle = env.T.bg;
  env.ctx.fillRect(0, 0, env.W, H);
}

// 배경 사진 + 스크림 (콘텐츠 아래). 그라데이션 on이면 위→아래로 어두워지는 스크림
function drawBackground(env, H) {
  const { ctx, sec, W } = env;
  const img = imgCache.get(sec.bg.src);
  if (img) drawCover(ctx, img, 0, 0, W, H);
  if (env.bgGrad) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(10,12,16,${env.dimLevel * 0.4})`);
    g.addColorStop(0.55, `rgba(10,12,16,${env.dimLevel * 0.85})`);
    g.addColorStop(1, `rgba(10,12,16,${env.dimLevel})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = `rgba(10,12,16,${env.dimLevel})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// 모형배경 — 장식 도형 (톤 배경 위에 은은하게). bgGrad on이면 액센트 그라데이션 채움
function drawShapeBg(env, H) {
  const { ctx, W, s, accent, accentText, decoLevel, bgGrad, bgShape } = env;
  const paint = (alpha) => {
    if (!bgGrad) return rgba(accent, alpha);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, rgba(accent, alpha));
    g.addColorStop(1, rgba(mixHex(accentText === '#FFFFFF' ? '#5e5ce6' : accent, '#ffffff', 0.45), alpha));
    return g;
  };
  ctx.save();
  roundRect(ctx, 0, 0, W, H, 0);
  ctx.clip();
  if (bgShape === 'dots') {
    ctx.fillStyle = paint(decoLevel * 1.4);
    const step = 34 * s;
    for (let row = 0; row * step < H + step; row++) {
      for (let col = 0; col * step < W + step; col++) {
        const cx = col * step + (row % 2 ? step / 2 : 0);
        ctx.beginPath();
        ctx.arc(cx, row * step, 2.4 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (bgShape === 'stripes') {
    ctx.fillStyle = paint(decoLevel * 0.9);
    const band = 30 * s;
    const gap = 78 * s;
    for (let d = -H; d < W + H; d += band + gap) {
      ctx.beginPath();
      ctx.moveTo(d, H);
      ctx.lineTo(d + H, 0);
      ctx.lineTo(d + H + band, 0);
      ctx.lineTo(d + band, H);
      ctx.closePath();
      ctx.fill();
    }
  } else { // rings — 장식 링 + 원 블롭
    ctx.strokeStyle = paint(decoLevel * 1.6);
    ctx.lineWidth = 3.5 * s;
    ctx.beginPath();
    ctx.arc(W - 120 * s, 150 * s, 190 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(110 * s, H - 140 * s, 130 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = paint(decoLevel);
    ctx.beginPath();
    ctx.arc(W - 200 * s, H - 100 * s, 210 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(60 * s, 190 * s, 90 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 헤더(kicker + 제목) 높이 선계산 — 배경을 먼저 칠하기 위한 1단계
function measureHeader(env, { kicker, title }) {
  const { ctx, F, W, s, mx } = env;
  let y = env.padTop;
  let overflow = false;
  if (kicker) y += 30 * s + 14 * s;
  if (title) {
    const lines = (Array.isArray(title) ? title : [title]).slice(0, 2);
    const r = fitBlock(ctx, F, lines, 700, 46 * s, W - 2 * mx);
    overflow = overflow || r.overflow;
    y = y + lines.length * r.size * 1.26 + 40 * s;
  }
  return { y, overflow };
}

// 헤더 실제 그리기 — measureHeader와 같은 수식으로 y를 돌려준다(2단계)
function drawHeader(env, { kicker, title, align = 'left' }) {
  const { ctx, F, W, s, mx, accent, T } = env;
  let y = env.padTop;
  let overflow = false;
  if (kicker) {
    const sp = 5 * s;
    const tw = spacedWidth(ctx, F, kicker.toUpperCase(), sp, 700, 24 * s);
    const kx = align === 'center' ? W / 2 - tw / 2 : mx;
    if (kicker) drawSpaced(ctx, F, kicker.toUpperCase(), kx, y, sp, 700, 24 * s, env.accentText);
    y += 30 * s + 14 * s;
  }
  if (title) {
    const lines = (Array.isArray(title) ? title : [title]).slice(0, 2);
    const r = drawLines(ctx, F, lines, {
      x: mx, y, W, weight: 700, size: 46 * s, color: T.ink, lh: 1.26,
      maxW: W - 2 * mx, align, maxLines: 2,
    });
    overflow = overflow || r.overflow;
    y = r.bottom + 40 * s;
  }
  return { y, overflow };
}

// 브랜드 칩 (상단 좌측: 액센트 점 + 브랜드명)
function drawBrandChip(env, onDark) {
  const { ctx, P, F, s, accent } = env;
  const name = P.brand && P.brand.name;
  if (!name) return;
  const y = 40 * s;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(env.mx + 8 * s, y + 15 * s, 8 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = font(F, 700, 28 * s);
  ctx.fillStyle = onDark ? 'rgba(255,255,255,0.95)' : '#1D1D1F';
  ctx.textBaseline = 'top';
  ctx.fillText(name, env.mx + 28 * s, y);
}

// ---------- 개별 섹션 렌더러 (각자 높이 H를 계산하고 반환한다) ----------
function rHero(env) {
  const { ctx, sec, W, s, mx, F, accent } = env;
  const img = sec.media && sec.media.src ? imgCache.get(sec.media.src) : null;
  if (img) {
    const ratio = clamp((img.naturalHeight || 1) / (img.naturalWidth || 1), 0.75, 1.3);
    const H = Math.round(W * ratio);
    drawCover(ctx, img, 0, 0, W, H);
    const g = ctx.createLinearGradient(0, H * 0.3, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.82)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    drawBrandChip(env, true);

    // 하단 좌측 스택: 카테고리 배지 → 제품명 → 태그라인
    const blocks = [];
    if (sec.badge) blocks.push({ kind: 'badge', h: 50 * s, gap: 26 * s });
    const titleN = Math.min(sec.title.filter((l) => l.trim()).length || 1, 3);
    blocks.push({ kind: 'title', h: titleN * 68 * s * 1.18, gap: 22 * s });
    if (sec.body.length) blocks.push({ kind: 'body', h: sec.body.length * 30 * s * 1.5, gap: 0 });
    const totalH = blocks.reduce((acc, b) => acc + b.h + b.gap, 0);
    let y = H - 76 * s - totalH;
    for (const b of blocks) {
      if (b.kind === 'badge') {
        drawPill(ctx, F, sec.badge, { x: mx, y, size: 25 * s, h: 50 * s, fill: accent });
        y += b.h + b.gap;
      } else if (b.kind === 'title') {
        const r = drawLines(ctx, F, sec.title, { x: mx, y, W, weight: 700, size: 60 * s, color: '#FFFFFF', lh: 1.18, maxW: W - 2 * mx, maxLines: 3 });
        sec._overflow = sec._overflow || r.overflow;
        y += b.h + b.gap;
      } else {
        const r = drawLines(ctx, F, sec.body, { x: mx, y, W, weight: 500, size: 30 * s, color: 'rgba(255,255,255,0.88)', lh: 1.5, maxW: W - 2 * mx, maxLines: 2 });
        sec._overflow = sec._overflow || r.overflow;
      }
    }
    sec._h = H;
    return H;
  }

  // 이미지 없음 — 액센트 워시 배경 + 중앙 정렬 (배경 이미지가 있으면 그 위에 렌더)
  const H = Math.round(680 * s);
  fillBg(env, H);
  ctx.strokeStyle = rgba(accent, 0.28);
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.arc(W - 130 * s, 170 * s, 150 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(accent, 0.14);
  ctx.beginPath();
  ctx.arc(90 * s, H - 120 * s, 110 * s, 0, Math.PI * 2);
  ctx.stroke();
  drawBrandChip(env, false);

  let y = H * 0.36;
  if (sec.badge) {
    const r = drawPill(ctx, F, sec.badge, { center: W / 2, y, size: 25 * s, h: 50 * s, fill: accent, outline: true });
    y = r.bottom + 34 * s;
  }
  const r = drawLines(ctx, F, sec.title, { x: mx, y, W, weight: 700, size: 56 * s, color: env.T.ink, lh: 1.2, maxW: W - 2 * mx, align: 'center', maxLines: 3 });
  sec._overflow = sec._overflow || r.overflow;
  y = r.bottom + 24 * s;
  if (sec.body.length) {
    const r2 = drawLines(ctx, F, sec.body, { x: mx, y, W, weight: 500, size: 30 * s, color: env.T.sub, lh: 1.5, maxW: W - 2 * mx, align: 'center', maxLines: 2 });
    sec._overflow = sec._overflow || r2.overflow;
  }
  sec._h = H;
  return H;
}

function rProblem(env) {
  const { ctx, sec, W, s, mx, F, T, accentText } = env;
  const items = sec.items.slice(0, LIMITS.problem);
  const titleLines = sec.title.filter((l) => l.trim());
  const H = Math.round(env.padTop + 30 * s + 20 * s
    + Math.max(titleLines.length, 1) * 62 * s + 48 * s
    + items.length * 96 * s + Math.max(items.length - 1, 0) * 20 * s + env.padBot);
  fillBg(env, H);

  let y = env.padTop;
  const sp = 5 * s;
  const tw = spacedWidth(ctx, F, sec.kicker.toUpperCase(), sp, 700, 26 * s);
  drawSpaced(ctx, F, sec.kicker.toUpperCase(), W / 2 - tw / 2, y, sp, 700, 26 * s, accentText);
  y += 30 * s + 20 * s;

  const r = drawLines(ctx, F, titleLines.length ? titleLines : [' '], {
    x: mx, y, W, weight: 700, size: 50 * s, color: T.ink, lh: 1.26, maxW: W - 2 * mx, align: 'center', maxLines: 2,
  });
  sec._overflow = sec._overflow || r.overflow;
  y = r.bottom + 48 * s;

  const innerW = W - 2 * mx - 84 * s - 20 * s;
  for (const it of items) {
    roundRect(ctx, mx, y, W - 2 * mx, 96 * s, 20 * s);
    ctx.fillStyle = T.panel;
    ctx.fill();
    drawCross(ctx, mx + 52 * s, y + 48 * s, 12 * s, T.faint);
    ctx.font = font(F, 500, 30 * s);
    ctx.fillStyle = T.ink;
    ctx.textBaseline = 'top';
    const text = ctx.measureText(it).width > innerW ? clipLine(ctx, it, innerW) : it;
    if (text !== it) sec._overflow = true;
    ctx.fillText(text, mx + 84 * s, y + (96 * s - 30 * s) / 2);
    y += 96 * s + 20 * s;
  }
  sec._h = H;
  return H;
}

function rSolution(env) {
  const { ctx, sec, W, s, mx, F, T, accent } = env;
  const img = sec.media && sec.media.src ? imgCache.get(sec.media.src) : null;
  let imgH = 0;
  if (img) {
    const ratio = clamp((img.naturalHeight || 1) / (img.naturalWidth || 1), 0.6, 1.0);
    imgH = Math.round(460 * s * ratio);
  }
  const titleN = Math.min(sec.title.filter((l) => l.trim()).length || 1, 2);
  const bodyN = Math.min(sec.body.length, 3);
  const H = Math.round(env.padTop + 52 * s + 40 * s
    + titleN * 62 * s + 26 * s + bodyN * 46 * s
    + (img ? 56 * s + imgH : 0) + env.padBot);
  fillBg(env, H);

  let y = env.padTop;
  if (sec.badge) {
    const r = drawPill(ctx, F, sec.badge, { center: W / 2, y, size: 25 * s, h: 52 * s, fill: accent });
    y = r.bottom + 40 * s;
  }
  const r = drawLines(ctx, F, sec.title, { x: mx, y, W, weight: 700, size: 52 * s, color: T.ink, lh: 1.24, maxW: W - 2 * mx, align: 'center', maxLines: 2 });
  sec._overflow = sec._overflow || r.overflow;
  y = r.bottom + 26 * s;
  if (bodyN) {
    const r2 = drawLines(ctx, F, sec.body, { x: mx, y, W, weight: 500, size: 30 * s, color: T.sub, lh: 1.55, maxW: W - 2 * mx, align: 'center', maxLines: 3 });
    sec._overflow = sec._overflow || r2.overflow;
    y = r2.bottom;
  }
  if (img) {
    y += 56 * s;
    const iw = 460 * s;
    const ix = W / 2 - iw / 2;
    ctx.save();
    roundRect(ctx, ix, y, iw, imgH, 28 * s);
    ctx.clip();
    drawCover(ctx, img, ix, y, iw, imgH);
    ctx.restore();
  }
  sec._h = H;
  return H;
}

function rFeatures(env) {
  const { ctx, sec, W, s, mx, F, T, accent } = env;
  const items = sec.items.slice(0, LIMITS.features);
  const mh = measureHeader(env, { kicker: sec.kicker, title: sec.title });
  const colGap = 26 * s;
  const colW = (W - 2 * mx - colGap) / 2;
  const cardH = 216 * s;
  const rows = Math.max(Math.ceil(items.length / 2), 1);
  const H = Math.round(mh.y + rows * cardH + (rows - 1) * 26 * s + env.padBot);
  fillBg(env, H);
  const head = drawHeader(env, { kicker: sec.kicker, title: sec.title });
  sec._overflow = sec._overflow || head.overflow;

  items.forEach((it, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const x = mx + col * (colW + colGap);
    const y = head.y + row * (cardH + 26 * s);
    roundRect(ctx, x, y, colW, cardH, 24 * s);
    ctx.fillStyle = T.panel;
    ctx.fill();
    const chip = 48 * s;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x + 24 * s + chip / 2, y + 24 * s + chip / 2, chip / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = font(F, 700, 25 * s);
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'top';
    const num = String(i + 1);
    ctx.fillText(num, x + 24 * s + (chip - ctx.measureText(num).width) / 2, y + 24 * s + (chip - 25 * s) / 2 + 1);
    const tMaxW = colW - 48 * s - chip - 16 * s;
    const tFit = fitBlock(ctx, F, [it.title || ' '], 700, 31 * s, tMaxW);
    if (tFit.overflow) sec._overflow = true;
    ctx.font = font(F, 700, tFit.size);
    ctx.fillStyle = T.ink;
    ctx.fillText(clipLine(ctx, it.title || '', tMaxW), x + 24 * s + chip + 16 * s, y + 24 * s + (chip - tFit.size) / 2);
    if (it.desc) {
      ctx.font = font(F, 500, 26 * s);
      const maxW = colW - 48 * s;
      const line = ctx.measureText(it.desc).width > maxW ? clipLine(ctx, it.desc, maxW) : it.desc;
      if (line !== it.desc) sec._overflow = true;
      ctx.fillStyle = T.sub;
      ctx.fillText(line, x + 24 * s, y + 108 * s);
    }
  });
  sec._h = H;
  return H;
}

function rGallery(env) {
  const { ctx, sec, W, s, mx, T } = env;
  const mh = measureHeader(env, { kicker: sec.kicker, title: sec.title });
  const gap = 24 * s;
  const cell = (W - 2 * mx - gap) / 2;
  const cellH = Math.round(cell * 0.72);
  const H = Math.round(mh.y + cellH * 2 + gap + env.padBot);
  fillBg(env, H);
  const head = drawHeader(env, { kicker: sec.kicker, title: sec.title });
  sec._overflow = sec._overflow || head.overflow;

  for (let i = 0; i < 4; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const x = mx + col * (cell + gap);
    const y = head.y + row * (cellH + gap);
    const m = (sec.images || [])[i];
    const img = m && m.src ? imgCache.get(m.src) : null;
    if (img) {
      ctx.save();
      roundRect(ctx, x, y, cell, cellH, 24 * s);
      ctx.clip();
      drawCover(ctx, img, x, y, cell, cellH);
      ctx.restore();
    } else {
      drawPlaceholder(env, x, y, cell, cellH, true);
    }
  }
  sec._h = H;
  return H;
}

function rHowto(env) {
  const { ctx, sec, W, s, mx, F, T, accent } = env;
  const items = sec.items.slice(0, LIMITS.howto);
  const mh = measureHeader(env, { kicker: sec.kicker, title: sec.title });
  const rowH = 118 * s;
  const gap = 18 * s;
  const H = Math.round(mh.y + items.length * rowH + Math.max(items.length - 1, 0) * gap + env.padBot);
  fillBg(env, H);
  const head = drawHeader(env, { kicker: sec.kicker, title: sec.title });
  sec._overflow = sec._overflow || head.overflow;

  const chip = 58 * s;
  const chipCx = mx + chip / 2;
  items.forEach((it, i) => {
    const y = head.y + i * (rowH + gap);
    if (i > 0) {
      ctx.strokeStyle = rgba(accent, 0.3);
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.moveTo(chipCx, y - gap);
      ctx.lineTo(chipCx, y + (rowH - chip) / 2);
      ctx.stroke();
    }
    roundRect(ctx, mx, y + (rowH - chip) / 2, chip, chip, 18 * s);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.font = font(F, 700, 26 * s);
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'top';
    const num = String(i + 1);
    ctx.fillText(num, mx + (chip - ctx.measureText(num).width) / 2, y + (rowH - chip) / 2 + (chip - 26 * s) / 2 + 1);

    const tx = mx + chip + 30 * s;
    const maxW = W - mx - tx;
    ctx.font = font(F, 700, 32 * s);
    ctx.fillStyle = T.ink;
    const title = ctx.measureText(it.text || '').width > maxW ? clipLine(ctx, it.text || '', maxW) : (it.text || '');
    if (title !== it.text) sec._overflow = true;
    ctx.fillText(title, tx, y + (rowH - chip) / 2 - (it.sub ? 2 : 5) * s);
    if (it.sub) {
      ctx.font = font(F, 500, 26 * s);
      const sub = ctx.measureText(it.sub).width > maxW ? clipLine(ctx, it.sub, maxW) : it.sub;
      if (sub !== it.sub) sec._overflow = true;
      ctx.fillStyle = T.sub;
      ctx.fillText(sub, tx, y + (rowH - chip) / 2 + 42 * s);
    }
  });
  sec._h = H;
  return H;
}

function rSpec(env) {  const { ctx, sec, W, s, mx, F, T } = env;
  const rows = sec.rows.slice(0, LIMITS.spec);
  const mh = measureHeader(env, { kicker: sec.kicker, title: sec.title });
  const rowH = 66 * s;
  const H = Math.round(mh.y + rows.length * rowH + env.padBot * 0.7);
  fillBg(env, H);
  const head = drawHeader(env, { kicker: sec.kicker, title: sec.title });
  sec._overflow = sec._overflow || head.overflow;

  const kColW = 220 * s;
  const vMaxW = W - 2 * mx - kColW - 30 * s;
  rows.forEach((r, i) => {
    const y = head.y + i * rowH;
    ctx.font = font(F, 700, 28 * s);
    ctx.fillStyle = T.ink;
    ctx.textBaseline = 'top';
    ctx.fillText(clipLine(ctx, r.k || '', kColW), mx, y + (rowH - 28 * s) / 2);
    const fit = fitBlock(ctx, F, [r.v || ' '], 500, 28 * s, vMaxW);
    if (fit.overflow) sec._overflow = true;
    ctx.font = font(F, 500, fit.size);
    ctx.fillStyle = T.sub;
    ctx.fillText(clipLine(ctx, r.v || '', vMaxW), mx + kColW + 30 * s, y + (rowH - fit.size) / 2);
    if (i < rows.length - 1) {
      ctx.strokeStyle = T.hair;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx, y + rowH + 0.5);
      ctx.lineTo(W - mx, y + rowH + 0.5);
      ctx.stroke();
    }
  });
  sec._h = H;
  return H;
}

// 패키지 · 가격표 (크몽 관습: 기본/표준/프리미엄 3열, 표준 강조)
function rPackages(env) {
  const { ctx, sec, W, s, mx, F, T, accent } = env;
  const items = sec.items.slice(0, LIMITS.packages);
  const n = Math.max(items.length, 1);
  const mh = measureHeader(env, { kicker: sec.kicker, title: sec.title });
  sec._overflow = sec._overflow || mh.overflow;
  const gap = 24 * s;
  let colW = (W - 2 * mx - gap * (n - 1)) / n;
  if (n === 1) colW = Math.min(colW, 560 * s);
  const startX = mx + (W - 2 * mx - (colW * n + gap * (n - 1))) / 2;
  // 카드 높이 선계산 (배지 68 + 이름 38 + 가격 48 + 설명 32 + 구분선/여백 74 + 특징 rows)
  const cardHs = items.map((it) => Math.round(260 * s + Math.min((it.features || []).length, 5) * 50 * s));
  const cardH = Math.max(...cardHs, 420 * s);
  const H = Math.round(mh.y + cardH + env.padBot);
  fillBg(env, H);
  const head = drawHeader(env, { kicker: sec.kicker, title: sec.title });
  sec._overflow = sec._overflow || head.overflow;

  items.forEach((it, i) => {
    const x = startX + i * (colW + gap);
    const y = head.y;
    const hl = n === 3 && i === 1; // 3단일 때 표준 강조
    roundRect(ctx, x, y, colW, cardH, 24 * s);
    ctx.fillStyle = hl ? rgba(accent, 0.06) : T.panel;
    ctx.fill();
    if (hl) {
      ctx.strokeStyle = rgba(accent, 0.6);
      ctx.lineWidth = 3 * s;
      ctx.stroke();
      // '가장 인기' 배지 (카드 상단 중앙)
      ctx.font = font(F, 700, 22 * s);
      const bw = ctx.measureText('가장 인기').width + 36 * s;
      roundRect(ctx, x + colW / 2 - bw / 2, y + 20 * s, bw, 44 * s, 22 * s);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'top';
      ctx.fillText('가장 인기', x + colW / 2 - ctx.measureText('가장 인기').width / 2, y + 20 * s + (44 * s - 22 * s) / 2 + 1);
    }
    // 이름 · 가격 · 설명 (중앙 정렬)
    const cardCx = (x + colW / 2) * 2; // drawLines center 정렬은 CW/2에 그리므로 카드 중심을 넘겨준다
    // 배지 행(68s)은 강조 여부와 무관하게 모든 카드가 예약해 열이 정렬되게 한다
    const r1 = drawLines(ctx, F, [it.name || ''], { x, y: y + 84 * s, W: cardCx, weight: 700, size: 30 * s, color: T.ink, maxW: colW - 40 * s, align: 'center' });
    if (r1.overflow) sec._overflow = true;
    const priceFit = fitBlock(ctx, F, [it.price || ''], 700, 40 * s, colW - 36 * s);
    if (priceFit.overflow) sec._overflow = true;
    ctx.font = font(F, 700, priceFit.size);
    ctx.fillStyle = hl ? accent : T.ink;
    ctx.textAlign = 'center';
    ctx.fillText(priceFit.overflow ? clipLine(ctx, it.price || '', colW - 36 * s) : (it.price || ''), x + colW / 2, r1.bottom + 12 * s);
    ctx.textAlign = 'left';
    let cy = r1.bottom + 12 * s + priceFit.size + 14 * s;
    if (it.desc) {
      const dFit = fitBlock(ctx, F, [it.desc], 500, 26 * s, colW - 40 * s);
      if (dFit.overflow) sec._overflow = true;
      ctx.font = font(F, 500, dFit.size);
      ctx.fillStyle = T.sub;
      ctx.textAlign = 'center';
      ctx.fillText(clipLine(ctx, it.desc, colW - 40 * s), x + colW / 2, cy);
      ctx.textAlign = 'left';
      cy += dFit.size + 22 * s;
    } else {
      cy += 22 * s;
    }
    ctx.strokeStyle = T.hair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 24 * s, cy + 0.5);
    ctx.lineTo(x + colW - 24 * s, cy + 0.5);
    ctx.stroke();
    cy += 26 * s;
    // 포함 항목
    for (const f of (it.features || []).slice(0, 5)) {
      drawCheckCircle(ctx, x + 42 * s, cy + 14 * s, 14 * s, accent);
      const fFit = fitBlock(ctx, F, [f], 500, 26 * s, colW - 84 * s);
      if (fFit.overflow) sec._overflow = true;
      ctx.font = font(F, 500, fFit.size);
      ctx.fillStyle = T.ink;
      ctx.fillText(clipLine(ctx, f, colW - 84 * s), x + 66 * s, cy + (28 * s - fFit.size) / 2);
      cy += 50 * s;
    }
  });
  sec._h = H;
  return H;
}

function rComparison(env) {
  const { ctx, sec, W, s, mx, F, T, accent } = env;
  const n = Math.min(Math.max(sec.itemsA.length, sec.itemsB.length, 1), LIMITS.comparison);
  const mh = measureHeader(env, { kicker: sec.kicker, title: sec.title });
  const ph = Math.round(100 * s + n * 72 * s + 30 * s);
  const gap = 24 * s;
  const pw = (W - 2 * mx - gap) / 2;
  const H = Math.round(mh.y + ph + env.padBot);
  fillBg(env, H);
  const head = drawHeader(env, { kicker: sec.kicker, title: sec.title });
  sec._overflow = sec._overflow || head.overflow;

  const panels = [
    { x: mx, label: sec.labelA || 'BEFORE', items: sec.itemsA.slice(0, LIMITS.comparison), isA: true },
    { x: mx + pw + gap, label: sec.labelB || 'AFTER', items: sec.itemsB.slice(0, LIMITS.comparison), isA: false },
  ];
  for (const p of panels) {
    roundRect(ctx, p.x, head.y, pw, ph, 24 * s);
    ctx.fillStyle = p.isA ? T.panel : rgba(accent, 0.08);
    ctx.fill();
    if (!p.isA) {
      ctx.strokeStyle = rgba(accent, 0.55);
      ctx.lineWidth = 2.5 * s;
      ctx.stroke();
    }
    const label = (p.label || '').toUpperCase() || (p.isA ? 'BEFORE' : 'AFTER');
    ctx.font = font(F, 700, 23 * s);
    const lw = ctx.measureText(label).width + 40 * s;
    ctx.fillStyle = p.isA ? (T.onDark ? 'rgba(245,245,247,0.16)' : 'rgba(29,29,31,0.10)') : accent;
    roundRect(ctx, p.x + 24 * s, head.y + 24 * s, lw, 46 * s, 23 * s);
    ctx.fill();
    ctx.fillStyle = p.isA ? T.sub : '#FFFFFF';
    ctx.textBaseline = 'top';
    ctx.fillText(label, p.x + 44 * s, head.y + 24 * s + (46 * s - 23 * s) / 2);

    const innerW = pw - 48 * s - 66 * s;
    p.items.forEach((it, i) => {
      const iy = head.y + 100 * s + i * 72 * s;
      const cy = iy + 17 * s;
      if (p.isA) {
        drawCross(ctx, p.x + 40 * s, cy, 11 * s, T.faint);
      } else {
        drawCheckCircle(ctx, p.x + 40 * s, cy, 17 * s, accent);
      }
      const fit = fitBlock(ctx, F, [it || ' '], 500, 28 * s, innerW);
      if (fit.overflow) sec._overflow = true;
      ctx.font = font(F, 500, fit.size);
      ctx.fillStyle = T.ink;
      ctx.fillText(fit.overflow ? clipLine(ctx, it || '', innerW) : (it || ''), p.x + 72 * s, iy + (34 * s - fit.size) / 2);
    });
  }
  sec._h = H;
  return H;
}

function rReview(env) {
  const { ctx, sec, W, s, mx, F, T, accentText } = env;
  const items = sec.items.slice(0, LIMITS.review);
  const mh = measureHeader(env, { kicker: sec.kicker, title: sec.title });
  const cardH = 160 * s;
  const gap = 20 * s;
  const H = Math.round(mh.y + items.length * cardH + Math.max(items.length - 1, 0) * gap + env.padBot);
  fillBg(env, H);
  const head = drawHeader(env, { kicker: sec.kicker, title: sec.title });
  sec._overflow = sec._overflow || head.overflow;

  items.forEach((it, i) => {
    const y = head.y + i * (cardH + gap);
    roundRect(ctx, mx, y, W - 2 * mx, cardH, 22 * s);
    ctx.fillStyle = T.panel;
    ctx.fill();
    const maxW = W - 2 * mx - 60 * s;
    const tFit = fitBlock(ctx, F, [it.text || ' '], 500, 27 * s, maxW);
    if (tFit.overflow) sec._overflow = true;
    for (let st = 0; st < 5; st++) {
      drawStar(ctx, mx + 30 * s + st * 36 * s, y + 42 * s, 14 * s, st < (it.rating || 0) ? accentText : (T.onDark ? 'rgba(245,245,247,0.2)' : 'rgba(29,29,31,0.14)'));
    }
    ctx.font = font(F, 500, tFit.size);
    ctx.fillStyle = T.ink;
    ctx.fillText(tFit.overflow ? clipLine(ctx, it.text || '', maxW) : (it.text || ''), mx + 30 * s, y + 74 * s);
    ctx.font = font(F, 500, 24 * s);
    ctx.fillStyle = T.faint;
    const name = it.name ? `${it.name} 님` : '';
    const nw = ctx.measureText(name).width;
    ctx.fillText(name, mx + W - 2 * mx - 30 * s - nw, y + 30 * s);
  });
  sec._h = H;
  return H;
}

// 문단형 자동 줄바꿈 (FAQ 답변 등)
function wrapText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return [text];
  const out = [];
  let cur = '';
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxW && cur) {
      out.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function rFaq(env) {
  const { ctx, sec, W, s, mx, F, T, accent } = env;
  const items = sec.items.slice(0, LIMITS.faq);
  const mh = measureHeader(env, { kicker: sec.kicker, title: sec.title });
  const chip = 44 * s;
  const aSize = 27 * s;
  const aMaxW = W - 2 * mx - chip - 20 * s;
  // 답변 줄수 선계산
  ctx.font = font(F, 500, aSize);
  const aLinesArr = items.map((it) => Math.min(2, Math.max(1, Math.ceil(ctx.measureText(it.a || ' ').width / aMaxW))));
  const blocksH = items.reduce((acc, _it, i) => acc + chip + 14 * s + aLinesArr[i] * aSize * 1.5 + 40 * s, 0);
  const H = Math.round(mh.y + blocksH + env.padBot * 0.6);
  fillBg(env, H);
  const head = drawHeader(env, { kicker: sec.kicker, title: sec.title });
  sec._overflow = sec._overflow || head.overflow;

  const qSize = 30 * s;
  const qMaxW = aMaxW;
  let y = head.y;
  items.forEach((it, i) => {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(mx + chip / 2, y + chip / 2, chip / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = font(F, 700, 24 * s);
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'top';
    ctx.fillText('Q', mx + chip / 2 - ctx.measureText('Q').width / 2, y + (chip - 24 * s) / 2 + 1);
    const qFit = fitBlock(ctx, F, [it.q || ' '], 700, qSize, qMaxW);
    if (qFit.overflow) sec._overflow = true;
    ctx.font = font(F, 700, qFit.size);
    ctx.fillStyle = T.ink;
    ctx.fillText(qFit.overflow ? clipLine(ctx, it.q || '', qMaxW) : (it.q || ''), mx + chip + 20 * s, y + (chip - qFit.size) / 2);
    y += chip + 14 * s;
    const r = drawLines(ctx, F, wrapText(ctx, it.a || ' ', aMaxW).slice(0, 2), {
      x: mx + chip + 20 * s, y, W, weight: 500, size: aSize, color: T.sub, lh: 1.5, maxW: aMaxW, maxLines: 2,
    });
    sec._overflow = sec._overflow || r.overflow;
    y = r.bottom + 40 * s;
  });
  sec._h = H;
  return H;
}

function rCertification(env) {
  const { ctx, sec, W, s, mx, F, T, accent } = env;
  const items = sec.items.slice(0, LIMITS.certification);
  const mh = measureHeader(env, { kicker: sec.kicker, title: sec.title });
  const rowH = 106 * s;
  const gap = 18 * s;
  const H = Math.round(mh.y + items.length * rowH + Math.max(items.length - 1, 0) * gap + env.padBot);
  fillBg(env, H);
  const head = drawHeader(env, { kicker: sec.kicker, title: sec.title });
  sec._overflow = sec._overflow || head.overflow;

  items.forEach((it, i) => {
    const y = head.y + i * (rowH + gap);
    drawCheckCircle(ctx, mx + 26 * s, y + rowH / 2, 26 * s, accent);
    const maxW = W - 2 * mx - 80 * s;
    const tFit = fitBlock(ctx, F, [it.title || ' '], 700, 30 * s, maxW);
    if (tFit.overflow) sec._overflow = true;
    ctx.font = font(F, 700, tFit.size);
    ctx.fillStyle = T.ink;
    ctx.fillText(clipLine(ctx, it.title || '', maxW), mx + 80 * s, y + (it.desc ? 20 : 38) * s);
    if (it.desc) {
      ctx.font = font(F, 500, 26 * s);
      const d = ctx.measureText(it.desc).width > maxW ? clipLine(ctx, it.desc, maxW) : it.desc;
      if (d !== it.desc) sec._overflow = true;
      ctx.fillStyle = T.sub;
      ctx.fillText(d, mx + 80 * s, y + 58 * s);
    }
  });
  sec._h = H;
  return H;
}

function rNotice(env) {
  const { ctx, sec, W, s, mx, F, T, accentText } = env;
  const items = sec.items.slice(0, LIMITS.notice);
  const mh = measureHeader(env, { kicker: sec.kicker, title: sec.title });
  const rowH = 84 * s;
  const gap = 14 * s;
  const H = Math.round(mh.y + items.length * rowH + Math.max(items.length - 1, 0) * gap + env.padBot * 0.7);
  fillBg(env, H);
  const head = drawHeader(env, { kicker: sec.kicker, title: sec.title });
  sec._overflow = sec._overflow || head.overflow;

  const maxW = W - 2 * mx - 34 * s;
  items.forEach((it, i) => {
    const y = head.y + i * (rowH + gap);
    ctx.fillStyle = accentText;
    roundRect(ctx, mx + 2 * s, y + 14 * s, 11 * s, 11 * s, 3 * s);
    ctx.fill();
    const tFit = fitBlock(ctx, F, [it.title || ' '], 700, 28 * s, maxW);
    if (tFit.overflow) sec._overflow = true;
    ctx.font = font(F, 700, tFit.size);
    ctx.fillStyle = T.ink;
    ctx.fillText(clipLine(ctx, it.title || '', maxW), mx + 34 * s, y + 4 * s);
    if (it.desc) {
      ctx.font = font(F, 500, 26 * s);
      const d = ctx.measureText(it.desc).width > maxW ? clipLine(ctx, it.desc, maxW) : it.desc;
      if (d !== it.desc) sec._overflow = true;
      ctx.fillStyle = T.sub;
      ctx.fillText(d, mx + 34 * s, y + 40 * s);
    }
  });
  sec._h = H;
  return H;
}

function rCta(env) {
  const { ctx, sec, W, s, mx, F, accent } = env;
  const titleN = Math.min(sec.title.filter((l) => l.trim()).length || 1, 2);
  const bodyN = Math.min(sec.body.length, 2);
  const subN = Math.min(sec.sub.length, 1);
  const stackH = titleN * 60 * s * 1.22 + 24 * s + bodyN * 30 * s * 1.5 + 48 * s + 92 * s + (subN ? 34 * s + 24 * s : 0);
  const H = Math.round(Math.max(560 * s, stackH + 180 * s));
  // 다크 캔버스 (배경 이미지가 있으면 이미지+스크림으로 대체)
  fillBg(env, H);
  ctx.strokeStyle = rgba(accent, 0.45);
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.arc(W - 70 * s, 140 * s, 180 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(accent, 0.2);
  ctx.beginPath();
  ctx.arc(80 * s, H - 120 * s, 120 * s, 0, Math.PI * 2);
  ctx.stroke();

  let y = (H - stackH) / 2 - 30 * s;
  const r = drawLines(ctx, F, sec.title, { x: mx, y, W, weight: 700, size: 50 * s, color: '#FFFFFF', lh: 1.22, maxW: W - 2 * mx, align: 'center', maxLines: 2 });
  sec._overflow = sec._overflow || r.overflow;
  y = r.bottom + 24 * s;
  if (bodyN) {
    const r2 = drawLines(ctx, F, sec.body, { x: mx, y, W, weight: 500, size: 30 * s, color: 'rgba(255,255,255,0.85)', lh: 1.5, maxW: W - 2 * mx, align: 'center', maxLines: 2 });
    sec._overflow = sec._overflow || r2.overflow;
    y = r2.bottom + 48 * s;
  } else {
    y += 48 * s;
  }
  if (sec.action) {
    ctx.font = font(F, 700, 34 * s);
    const tw = ctx.measureText(sec.action).width;
    const bw = tw + 110 * s;
    const bh = 92 * s;
    roundRect(ctx, W / 2 - bw / 2, y, bw, bh, bh / 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'top';
    ctx.fillText(sec.action, W / 2 - tw / 2, y + (bh - 34 * s) / 2 + 1);
    y += bh + 34 * s;
  }
  if (subN) {
    drawLines(ctx, F, sec.sub, { x: mx, y, W, weight: 500, size: 24 * s, color: 'rgba(255,255,255,0.55)', lh: 1.5, maxW: W - 2 * mx, align: 'center', maxLines: 1 });
  }
  sec._h = H;
  return H;
}

function rDisclaimer(env) {
  const { ctx, P, sec, W, s, mx, F, T } = env;
  const items = sec.items.slice(0, LIMITS.disclaimer).map((t) => '· ' + t);
  const brand = ((P.brand && P.brand.name) || '').trim();
  const H = Math.round(64 * s + 30 * s + 18 * s + items.length * 40 * s + 40 * s + 1 + 22 * s + 30 * s + 48 * s);
  fillBg(env, H);

  let y = 64 * s;
  ctx.font = font(F, 700, 24 * s);
  ctx.fillStyle = T.sub;
  ctx.textBaseline = 'top';
  ctx.fillText('유의사항', mx, y);
  y += 30 * s + 18 * s;
  for (const it of items) {
    const fit = fitBlock(ctx, F, [it], 300, 24 * s, W - 2 * mx);
    if (fit.overflow) sec._overflow = true;
    ctx.font = font(F, 300, fit.size);
    ctx.fillStyle = T.faint;
    ctx.fillText(clipLine(ctx, it, W - 2 * mx), mx, y);
    y += 40 * s;
  }
  y += 40 * s;
  ctx.strokeStyle = T.hair;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mx, y + 0.5);
  ctx.lineTo(W - mx, y + 0.5);
  ctx.stroke();
  y += 22 * s;
  ctx.font = font(F, 500, 22 * s);
  ctx.fillStyle = T.faint;
  ctx.fillText(brand || '상세페이지 스튜디오', mx, y);
  const right = '문의: 판매자 페이지 확인';
  const rw = ctx.measureText(right).width;
  ctx.fillText(right, W - mx - rw, y);
  sec._h = H;
  return H;
}

// ---------- 메인 진입점 ----------
const RENDERERS = {
  hero: rHero,
  problem: rProblem,
  solution: rSolution,
  features: rFeatures,
  gallery: rGallery,
  howto: rHowto,
  spec: rSpec,
  packages: rPackages,
  comparison: rComparison,
  review: rReview,
  faq: rFaq,
  certification: rCertification,
  notice: rNotice,
  cta: rCta,
  disclaimer: rDisclaimer,
};

/**
 * 섹션 1개를 캔버스 (0,0)에 렌더링. 미리 ensureImages(P)를 완료해야 한다.
 * 배경(사진·모형)이 있으면 1차 렌더로 높이를 얻은 뒤 지우고 "배경 → 내용" 순으로 다시 그린다.
 * @returns {number} 섹션 높이 px
 */
export function renderSectionInto(ctx, P, sec, index) {
  const env = makeEnv(ctx, P, sec, index);
  const fn = RENDERERS[sec.type] || RENDERERS.features;
  const H = Math.round(fn(env));
  if (env.hasBg) {
    ctx.clearRect(0, 0, env.W, Math.min(H, MAX_TMP_H));
    if (env.hasBgImage) {
      drawBackground(env, H);
    } else {
      env.ctx.fillStyle = env.T.bg;
      env.ctx.fillRect(0, 0, env.W, H);
      drawShapeBg(env, H);
    }
    fn(env); // 사진 배경일 때 fillBg가 스킵되어 내용만 배경 위에 다시 그려진다
  }
  sec._h = H;
  return H;
}

const MAX_TMP_H = 12000;
/**
 * 섹션 1개를 독립 캔버스로 렌더링 (프리뷰·분할 내보내기용)
 * @returns {{canvas: HTMLCanvasElement, h: number, overflow: boolean}}
 */
export function renderSectionCanvas(P, sec, index) {
  const W = P.width;
  const tmp = document.createElement('canvas');
  tmp.width = W;
  tmp.height = Math.min(Math.round(W * 10), MAX_TMP_H);
  const ctx = tmp.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const H = renderSectionInto(ctx, P, sec, index);
  const h = clamp(Math.round(H), 1, tmp.height);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = h;
  out.getContext('2d').drawImage(tmp, 0, 0);
  return { canvas: out, h, overflow: !!sec._overflow };
}
