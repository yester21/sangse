// store.js — 프로젝트 상태 + 이벤트 버스 + localStorage 자동저장 (cardnews-studio Store 이식)
import { uid } from './util.js';
import { blankSection, SECTION_TYPES } from './sections.js';

const STORAGE_KEY = 'detail-studio-v1';

class Store {
  constructor() {
    this.listeners = new Map();
    this.project = null;
    this.selected = 0;
    this.lastDeleted = null; // { section, index } — 삭제 실행취소용
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event).delete(fn);
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (set) for (const fn of set) fn(payload);
  }

  load() {
    let restored = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && Array.isArray(p.sections) && p.sections.length) {
          this.project = normalizeProject(p);
          this.selected = 0;
          restored = true;
        }
      }
    } catch (e) {
      console.warn('[sangse] 저장본 복원 실패:', e);
    }
    return restored;
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
      this.emit('saved');
      return true;
    } catch (e) {
      this.emit('quota-exceeded');
      return false;
    }
  }

  setProject(p, { silent = false } = {}) {
    this.project = normalizeProject(p);
    this.selected = Math.min(this.selected, this.project.sections.length - 1);
    if (!silent) this.emit('project');
  }

  update(mutator) {
    mutator(this.project);
    this.save();
    this.emit('project');
  }

  updateSection(index, mutator) {
    if (!this.project.sections[index]) return;
    mutator(this.project.sections[index]);
    this.save();
    this.emit('project');
  }

  get current() {
    return this.project.sections[this.selected] || null;
  }

  select(i) {
    this.selected = Math.min(Math.max(i, 0), this.project.sections.length - 1);
    this.emit('selection');
  }

  addSection(type, afterSelected = true) {
    const sec = blankSection(type);
    sec.id = uid();
    const at = afterSelected ? this.selected + 1 : this.project.sections.length;
    this.project.sections.splice(at, 0, sec);
    this.selected = at;
    this.save();
    this.emit('project');
    this.emit('selection');
    return sec;
  }

  duplicateSection(index) {
    const src = this.project.sections[index];
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uid();
    this.project.sections.splice(index + 1, 0, copy);
    this.selected = index + 1;
    this.save();
    this.emit('project');
    this.emit('selection');
  }

  deleteSection(index) {
    const sec = this.project.sections[index];
    if (!sec || this.project.sections.length <= 1) return;
    this.lastDeleted = { section: sec, index };
    this.project.sections.splice(index, 1);
    this.selected = Math.min(index, this.project.sections.length - 1);
    this.save();
    this.emit('project');
    this.emit('selection');
  }

  restoreDeleted() {
    if (!this.lastDeleted) return;
    const { section, index } = this.lastDeleted;
    this.project.sections.splice(Math.min(index, this.project.sections.length), 0, section);
    this.selected = Math.min(index, this.project.sections.length - 1);
    this.lastDeleted = null;
    this.save();
    this.emit('project');
    this.emit('selection');
  }

  moveSection(index, dir) {
    const to = index + dir;
    const secs = this.project.sections;
    if (index < 0 || index >= secs.length || to < 0 || to >= secs.length) return;
    [secs[index], secs[to]] = [secs[to], secs[index]];
    this.selected = to;
    this.save();
    this.emit('project');
    this.emit('selection');
  }

  setType(index, type) {
    const cur = this.project.sections[index];
    if (!cur || cur.type === type) return;
    // 타입 전환은 내용을 새 빈 섹션으로 교체 (카피는 새 기본 문구로 채워짐)
    const { id, tone } = cur;
    this.updateSection(index, (s) => {
      Object.keys(s).forEach((k) => delete s[k]);
      Object.assign(s, blankSection(type));
      s.id = id;
      s.tone = tone || 'auto';
    });
    this.emit('selection');
  }
}

export const store = new Store();

// ---------- 프로젝트 정규화 (외부 JSON·저장본·AI 초안 공용) ----------
const KNOWN = new Set(SECTION_TYPES.map((t) => t.id));

export function normalizeProject(input) {
  const p = typeof input === 'string' ? JSON.parse(input) : input;
  const out = {
    version: 1,
    title: str(p.title, '제목 없는 상세페이지'),
    type: p.type === 'service' ? 'service' : 'product',
    brand: {
      name: str(p.brand && p.brand.name, ''),
      logo: media(p.brand && p.brand.logo),
    },
    product: normalizeProduct(p.product),
    theme: {
      accent: /^#[0-9a-fA-F]{6}$/.test((p.theme && p.theme.accent) || '') ? p.theme.accent : '#0071e3',
      font: (p.theme && p.theme.font) === 'system' ? 'system' : 'gmarket',
      copyTone: ['feature', 'empath', 'premium'].includes(p.theme && p.theme.copyTone) ? p.theme.copyTone : 'feature',
    },
    width: clampW(p.width),
    sections: [],
  };
  const secs = Array.isArray(p.sections) ? p.sections : [];
  for (const raw of secs) {
    let type = raw && KNOWN.has(raw.type) ? raw.type : 'features';
    const sec = blankSection(type);
    sec.id = str(raw.id, uid()) || uid();
    sec.tone = ['auto', 'white', 'gray', 'dark', 'wash'].includes(raw.tone) ? raw.tone : 'auto';
    // 타입별 필드 병합 (모르는 키는 무시, 빠진 키는 기본값 유지)
    for (const k of Object.keys(sec)) {
      if (k === 'id' || k === 'type' || k === 'tone') continue;
      if (raw[k] !== undefined) {
        if (sec[k] === null) sec[k] = media(raw[k]);
        else if (Array.isArray(sec[k])) sec[k] = arrNormalize(sec[k], raw[k]);
        else if (typeof sec[k] === 'string') sec[k] = str(raw[k], sec[k]);
        else if (typeof sec[k] === 'boolean') sec[k] = Boolean(raw[k]);
      }
    }
    // 배경 — 병합 후 화이트리스트·구버전(bgOn 없음·soft/normal/strong) 호환
    if (raw.bgOn === undefined && raw.bg && raw.bg.src) sec.bgOn = true;
    if (!['image', 'shape'].includes(sec.bgKind)) sec.bgKind = 'image';
    if (!['rings', 'dots', 'stripes'].includes(sec.bgShape)) sec.bgShape = 'rings';
    const LEGACY_DIM = { soft: 'd2', normal: 'd3', strong: 'd4' };
    if (!['d1', 'd2', 'd3', 'd4', 'd5'].includes(sec.bgDim)) sec.bgDim = LEGACY_DIM[sec.bgDim] || 'd3';
    if (typeof sec.bgGrad !== 'boolean') sec.bgGrad = true;
    // 항목 배열 내부 필드 정규화
    if (sec.type === 'features') sec.items = sec.items.map((it) => ({ title: str(it.title, ''), desc: str(it.desc, '') })).slice(0, 6);
    if (sec.type === 'gallery') sec.images = [0, 1, 2, 3].map((i) => media((raw.images || [])[i]));
    if (sec.type === 'howto') sec.items = sec.items.map((it) => ({ text: str(it.text, ''), sub: str(it.sub, '') })).slice(0, 5);
    if (sec.type === 'spec') sec.rows = sec.rows.map((r) => ({ k: str(r.k, ''), v: str(r.v, '') })).slice(0, 12);
    if (sec.type === 'review') sec.items = sec.items.map((it) => ({ name: str(it.name, ''), rating: clampInt(it.rating, 0, 5), text: str(it.text, '') })).slice(0, 3);
    if (sec.type === 'faq') sec.items = sec.items.map((it) => ({ q: str(it.q, ''), a: str(it.a, '') })).slice(0, 6);
    if (sec.type === 'certification' || sec.type === 'notice') sec.items = sec.items.map((it) => ({ title: str(it.title, ''), desc: str(it.desc, '') })).slice(0, 6);
    if (sec.type === 'packages') sec.items = sec.items.slice(0, 3).map((it) => ({
      name: str(it.name, ''),
      price: str(it.price, ''),
      desc: str(it.desc, ''),
      features: Array.isArray(it.features) ? it.features.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 5) : [],
    }));
    if (sec.type === 'cta') sec.sub = toLines(sec.sub);
    out.sections.push(sec);
  }
  if (!out.sections.length) out.sections = [blankSection('hero')];
  return out;
}

function normalizeProduct(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const L = (v) => (Array.isArray(v) ? v.map((x) => String(x ?? '')).filter((x) => x.trim()) : []);
  return {
    name: str(r.name, ''),
    category: str(r.category, ''),
    tagline: str(r.tagline, ''),
    features: L(r.features),
    steps: L(r.steps),
    specs: L(r.specs),
    packages: L(r.packages),
    certifications: L(r.certifications),
    reviews: L(r.reviews),
    faqs: L(r.faqs),
    notices: L(r.notices),
    warnings: L(r.warnings),
  };
}

function arrNormalize(defArr, rawArr) {
  // 문자열 배열과 객체 배열 모두 수용, 단일 문자열은 한 줄 배열로
  if (typeof rawArr === 'string') return [rawArr];
  if (!Array.isArray(rawArr)) return defArr;
  if (defArr.length && typeof defArr[0] === 'string') return rawArr.map((x) => String(x ?? ''));
  return rawArr.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
}

function media(v) {
  if (v && typeof v === 'object' && typeof v.src === 'string' && v.src) {
    return { src: v.src, w: clampInt(v.w, 0, 100000), h: clampInt(v.h, 0, 100000) };
  }
  return null;
}

function str(v, fallback) {
  return typeof v === 'string' ? v : fallback;
}

function toLines(v) {
  if (v === undefined || v === null) return [''];
  if (typeof v === 'string') return v.split('\n').filter((l, i, a) => l.trim() !== '' || a.length === 1);
  if (Array.isArray(v)) return v.map((l) => (typeof l === 'string' ? l : String(l ?? '')));
  return [''];
}

export function clampW(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(1400, Math.max(600, Math.round(n / 10) * 10)) : 1000;
}

function clampInt(v, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
