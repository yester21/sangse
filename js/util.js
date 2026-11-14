// util.js — 공용 유틸 (cardnews-studio 이식, 로그 접두어만 변경)
export const log = {
  info: (...a) => console.info('[sangse]', ...a),
  warn: (...a) => console.warn('[sangse]', ...a),
  error: (...a) => console.error('[sangse]', ...a),
};

export function uid(prefix = 's') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function hexToRgb(hex) {
  let h = (hex || '#000000').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function mixHex(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const m = (x, y) => Math.round(x + (y - x) * t);
  const to2 = (n) => n.toString(16).padStart(2, '0');
  return `#${to2(m(a.r, b.r))}${to2(m(a.g, b.g))}${to2(m(a.b, b.b))}`;
}

// 색 대비(명도 휘도차) — 0(같음)~1(흑백)
export function lumDist(hexA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return (Math.abs(a.r - b.r) * 299 + Math.abs(a.g - b.g) * 587 + Math.abs(a.b - b.b) * 114) / 255000;
}

export function slugify(s) {
  return (s || 'detailpage')
    .trim()
    .replace(/[\s/\\]+/g, '-')
    .replace(/[^가-힣a-zA-Z0-9_-]/g, '')
    .slice(0, 40) || 'detailpage';
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// 업로드 이미지를 최대 edge 크기로 리샵플해 dataURL로 정규화 (저장 용량 관리)
export async function normalizeImage(file, maxEdge = 2160) {
  const src = await readFileAsDataURL(file);
  const img = await loadImg(src);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  cv.getContext('2d').drawImage(img, 0, 0, w, h);
  const type = /png$/i.test(file.type) && file.size < 1_500_000 ? 'image/png' : 'image/jpeg';
  return { src: cv.toDataURL(type, 0.9), w, h };
}

export function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = src;
  });
}

export const fmtNum = (n) => n.toLocaleString('ko-KR');
