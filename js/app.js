// app.js — 상세페이지 스튜디오 메인 애플리케이션
import { loadFonts, ensureProjectFonts, FAMILIES } from './fonts.js?v=f1';
import { store, clampW } from './store.js?v=f1';
import { SECTION_TYPES, TYPE_NAME, buildDraft } from './sections.js?v=f1';
import { ensureImages, renderSectionCanvas, LIMITS } from './render.js?v=f1';
import { runQA } from './qa.js?v=f1';
import { exportSectionPNG, exportZip, exportProjectJSON } from './export.js?v=f1';
import { sampleProject, sampleServiceProject, emptyProject } from './sample.js?v=f1';
import { loadAIConfig, saveAIConfig, aiConfigured, aiChat, AI_PROVIDERS, generateSection } from './ai.js';
import { normalizeImage, log } from './util.js';

// ---------- DOM 헬퍼 ----------
const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

// ---------- 토스트 ----------
function toast(message, { type = '', actionLabel = '', onAction = null, timeout = 3200 } = {}) {
  const area = $('#toast-area');
  const t = el('div', { class: `toast ${type}` },
    el('span', {}, message),
    actionLabel && onAction ? el('button', { onclick: () => { onAction(); t.remove(); } }, actionLabel) : null,
  );
  area.append(t);
  if (timeout > 0) setTimeout(() => t.remove(), timeout);
  return t;
}

// ---------- 모달 ----------
function openModal(title, desc, buildContent) {
  const root = $('#modal-root');
  root.innerHTML = '';
  const content = el('div', { class: 'modal-body' });
  const modal = el('div', { class: 'modal', role: 'dialog', 'aria-label': title },
    el('button', { class: 'modal-close', title: '닫기', 'aria-label': '닫기', onclick: () => close() }, '✕'),
    el('h2', {}, title),
    desc ? el('p', { class: 'modal-desc' }, desc) : null,
    content,
  );
  root.append(modal);
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  buildContent(content, close);
  return close;
}

// ---------- 상태 ----------
const heights = [];              // 섹션별 렌더 높이
let stageKey = '';
const stageFrames = new Map();   // secId -> { frame, canvas, sig }
let railKey = '';
const railThumbs = new Map();    // secId -> { item, sig }
let qaResult = { secWarnings: new Map(), global: [], totalH: 0 };

// ---------- 렌더 파이프라인 ----------
// 순서 중요: 렌더(높이 확정) → QA 계산 → 레일(경고점) → QA 표시
async function repaint({ editor = false } = {}) {
  const P = store.project;
  await ensureImages(P);
  renderStage();
  qaResult = runQA(P, heights);
  renderRail();
  renderQA();
  if (editor) renderEditor();
  updatePageInfo();
}

function sectionSig(P, sec) {
  return [
    P.width, P.theme.accent, JSON.stringify(P.theme.fonts || P.theme.font), P.brand && P.brand.name,
    sec.type, sec.tone, JSON.stringify(sec),
  ].join('§');
}

// 중앙 스테이지 — 세로로 이어 붙인 섹션 캔버스 (=출력물 그 자체)
function renderStage() {
  const P = store.project;
  const stack = $('#page-stack');
  heights.length = P.sections.length; // 섹션 수가 줄었을 때 stale 높이가 합산되지 않게
  const key = P.sections.map((s) => s.id).join(',') + '|' + P.width + '|' + P.theme.accent + '|' + JSON.stringify(P.theme.fonts || P.theme.font);
  if (key !== stageKey) {
    stageKey = key;
    stack.innerHTML = '';
    stageFrames.clear();
    P.sections.forEach((sec, i) => {
      const canvas = document.createElement('canvas');
      const frame = el('div', { class: 'sec-frame', dataset: { id: sec.id }, onclick: () => store.select(i) },
        canvas,
        el('span', { class: 'sec-label' }, `${i + 1}. ${TYPE_NAME[sec.type] || sec.type}`),
      );
      stack.append(frame);
      stageFrames.set(sec.id, { frame, canvas, sig: null });
    });
  }
  P.sections.forEach((sec, i) => {
    const f = stageFrames.get(sec.id);
    if (!f) return;
    const sig = sectionSig(P, sec);
    if (f.sig !== sig) {
      const { canvas, h } = renderSectionCanvas(P, sec, i);
      f.canvas.width = canvas.width;
      f.canvas.height = canvas.height;
      f.canvas.getContext('2d').drawImage(canvas, 0, 0);
      f.sig = sig;
    }
    heights[i] = f.canvas.height;
    f.frame.classList.toggle('active', i === store.selected);
    const label = f.frame.querySelector('.sec-label');
    const labelText = `${i + 1}. ${TYPE_NAME[sec.type] || sec.type}`;
    if (label.textContent !== labelText) label.textContent = labelText;
  });
}

function updatePageInfo() {
  const P = store.project;
  const totalH = heights.reduce((a, b) => a + b, 0);
  $('#page-info').textContent = `섹션 ${P.sections.length}개 · ${P.width} × ${totalH.toLocaleString('ko-KR')}px`;
}

// 좌측 레일 — 섹션 썸네일
function renderRail() {
  const P = store.project;
  const rail = $('#section-rail');
  const key = P.sections.map((s) => s.id).join(',') + '|' + P.width + '|' + P.theme.accent + '|' + JSON.stringify(P.theme.fonts || P.theme.font);
  if (key !== railKey) {
    railKey = key;
    rail.innerHTML = '';
    railThumbs.clear();
    P.sections.forEach((sec, i) => {
      const thumb = el('div', { class: 'thumb-holder' });
      const item = el('div', {
        class: `rail-item ${i === store.selected ? 'active' : ''}`,
        dataset: { id: sec.id },
        onclick: () => { store.select(i); scrollToSection(i); },
      },
        thumb,
        el('div', { class: 'rail-actions' },
          el('button', { title: '위로', onclick: (e) => { e.stopPropagation(); store.moveSection(i, -1); } }, '↑'),
          el('button', { title: '아래로', onclick: (e) => { e.stopPropagation(); store.moveSection(i, 1); } }, '↓'),
          el('button', { title: '복제', onclick: (e) => { e.stopPropagation(); store.duplicateSection(i); toast('섹션을 복제했습니다.'); } }, '⧉'),
          el('button', { title: '삭제', onclick: (e) => { e.stopPropagation(); deleteSection(i); } }, '✕'),
        ),
        el('div', { class: 'rail-item-meta' },
          el('span', { class: 'num' }, String(i + 1).padStart(2, '0')),
          el('span', { class: 'type-name' }, TYPE_NAME[sec.type] || sec.type),
        ),
      );
      rail.append(item);
      railThumbs.set(sec.id, { item, thumb, sig: null });
    });
    rail.append(el('button', {
      id: 'btn-add-section',
      class: 'btn',
      onclick: openAddSection,
    }, '+ 섹션 추가'));
  }

  P.sections.forEach((sec, i) => {
    const rt = railThumbs.get(sec.id);
    if (!rt) return;
    rt.item.dataset.index = String(i);
    rt.item.classList.toggle('active', i === store.selected);
    const num = rt.item.querySelector('.num');
    const numText = String(i + 1).padStart(2, '0');
    if (num.textContent !== numText) num.textContent = numText;
    const name = rt.item.querySelector('.type-name');
    const nameText = TYPE_NAME[sec.type] || sec.type;
    if (name.textContent !== nameText) name.textContent = nameText;

    const sig = sectionSig(P, sec);
    if (rt.sig !== sig) {
      rt.sig = sig;
      const { canvas } = renderSectionCanvas(P, sec, i);
      rt.thumb.innerHTML = '';
      rt.thumb.append(canvas);
    }
    const hasWarn = qaResult.secWarnings.has(sec.id) || sec._overflow;
    let dot = rt.item.querySelector('.warn-dot');
    if (hasWarn && !dot) rt.item.querySelector('.rail-item-meta').append(el('span', { class: 'warn-dot', title: 'QA 경고 있음' }));
    if (!hasWarn && dot) dot.remove();
    let aiDot = rt.item.querySelector('.ai-dot');
    if (sec.aiMade && !aiDot) rt.item.querySelector('.rail-item-meta').prepend(el('span', { class: 'ai-dot', title: 'AI 생성 문구' }, '✨'));
    if (!sec.aiMade && aiDot) aiDot.remove();
  });
}

function renderQA() {
  const P = store.project;
  const strip = $('#qa-strip');
  strip.innerHTML = '';
  const rows = [];
  const cur = P.sections[store.selected];
  if (cur) {
    if (cur._overflow) rows.push({ tag: '넘침', msg: '이 섹션에서 텍스트가 길어 축소·말줄임되었습니다. 문장을 줄여보세요.', cls: '' });
    for (const w of qaResult.secWarnings.get(cur.id) || []) rows.push({ tag: 'QA', msg: w, cls: '' });
  }
  for (const g of qaResult.global) rows.push({ tag: 'INFO', msg: g, cls: 'info' });
  if (!rows.length) {
    rows.push({ tag: 'OK', msg: '경고가 없습니다. 상세페이지 표준 흐름: 히어로 → 공감 → 해결 → 특징 → 사용법 → 스펙 → 비교 → 후기 → FAQ → 안내 → CTA', cls: 'ok' });
  }
  for (const r of rows.slice(0, 8)) {
    strip.append(el('div', { class: `qa-row ${r.cls}` }, el('span', { class: 'qa-tag' }, r.tag), el('span', {}, r.msg)));
  }
}

function scrollToSection(i) {
  const sec = store.project.sections[i];
  if (!sec) return;
  const f = stageFrames.get(sec.id);
  if (f) f.frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- 편집기 ----------
function renderEditor() {
  const P = store.project;
  const pane = $('#editor-pane');
  pane.innerHTML = '';
  const sec = P.sections[store.selected];
  if (!sec) {
    pane.append(el('p', { style: 'color:var(--ui-sub)' }, '섹션을 추가해 주세요.'));
    return;
  }
  const upd = (fn) => store.updateSection(store.selected, fn);

  // ── 섹션 타입
  const grid = el('div', { class: 'type-grid' });
  for (const t of SECTION_TYPES) {
    grid.append(el('button', {
      class: `type-btn ${sec.type === t.id ? 'active' : ''}`,
      title: t.desc,
      onclick: () => {
        if (sec.type === t.id) return;
        if (!confirm(`타입을 [${t.name}](으)로 바꾸면 이 섹션의 내용이 기본 문구로 새로 채워집니다. 계속할까요?`)) return;
        store.setType(store.selected, t.id);
        renderEditor();
      },
    }, typeIcon(t.id), el('span', { class: 'name' }, t.name)));
  }
  pane.append(section('섹션 타입', grid));

  // ── AI가 만들기 / 직접 만들기 (섹션 단위 선택)
  pane.append(section('작성 방식', buildAIPane(sec, upd)));

  // ── 배경 톤
  const toneSel = el('select', {},
    el('option', { value: 'auto' }, '자동 (타입 기본값)'),
    el('option', { value: 'white' }, '화이트'),
    el('option', { value: 'gray' }, '그레이'),
    el('option', { value: 'dark' }, '다크'),
    el('option', { value: 'wash' }, '브랜드 워시'),
  );
  toneSel.value = sec.tone || 'auto';
  toneSel.addEventListener('change', () => upd((s) => { s.tone = toneSel.value; }));
  pane.append(section('배경 톤', toneSel));

  // ── 타입별 내용
  const body = el('div', {});
  switch (sec.type) {
    case 'hero':
      body.append(
        mediaField('대표 이미지 (제품 컷 — 배경을 겸합니다)', sec.media, (m) => upd((s) => { s.media = m; })),
        textField('카테고리 배지', sec.badge, '예: 생활가전', (v) => upd((s) => { s.badge = v; })),
        linesField('제품명 — 줄을 나눠 크게 (권장 2줄)', sec.title, '제품명', (lines) => upd((s) => { s.title = lines; }), 3),
        linesField('태그라인', sec.body, '한 줄 캐치프레이즈', (lines) => upd((s) => { s.body = lines; }), 2),
      );
      break;
    case 'problem':
      body.append(
        textField('소제목(킥커)', sec.kicker, '예: 혹시 이런 경험 없으신가요?', (v) => upd((s) => { s.kicker = v; })),
        linesField('제목 (권장 2줄)', sec.title, '', (lines) => upd((s) => { s.title = lines; }), 2),
        linesField(`공감 항목 (최대 ${LIMITS.problem}개)`, sec.items, '고객의 불편 한 줄', (lines) => upd((s) => { s.items = lines; }), LIMITS.problem),
      );
      break;
    case 'solution':
      body.append(
        textField('배지 문구', sec.badge, '예: 그래서 만들었습니다', (v) => upd((s) => { s.badge = v; })),
        linesField('해결 선언 (권장 2줄)', sec.title, '', (lines) => upd((s) => { s.title = lines; }), 2),
        linesField('설명 (최대 3줄)', sec.body, '', (lines) => upd((s) => { s.body = lines; }), 3),
        mediaField('제품 이미지 (선택)', sec.media, (m) => upd((s) => { s.media = m; })),
      );
      break;
    case 'features':
      body.append(
        textField('킥커', sec.kicker, '예: KEY FEATURES', (v) => upd((s) => { s.kicker = v; })),
        textField('제목', sec.title, '예: 핵심 특징', (v) => upd((s) => { s.title = v; })),
        listField('특징 카드 (최대 6개)', sec, 'items', [
          { key: 'title', label: '제목', ph: '예: 3초 강력 흡입' },
          { key: 'desc', label: '설명', ph: '고객이 얻는 이점' },
        ], LIMITS.features, () => ({ title: '', desc: '' })),
      );
      break;
    case 'gallery':
      body.append(
        textField('킥커', sec.kicker, '예: GALLERY', (v) => upd((s) => { s.kicker = v; })),
        textField('제목', sec.title, '예: 상세 컷', (v) => upd((s) => { s.title = v; })),
        galleryField(sec),
      );
      break;
    case 'howto':
      body.append(
        textField('킥커', sec.kicker, '예: HOW TO USE', (v) => upd((s) => { s.kicker = v; })),
        textField('제목', sec.title, '예: 이렇게 사용하세요', (v) => upd((s) => { s.title = v; })),
        listField(`사용 단계 (최대 ${LIMITS.howto}개)`, sec, 'items', [
          { key: 'text', label: '단계명', ph: '예: 전원 켜기' },
          { key: 'sub', label: '설명', ph: '짧은 설명 (선택)' },
        ], LIMITS.howto, () => ({ text: '', sub: '' })),
      );
      break;
    case 'spec':
      body.append(
        textField('킥커', sec.kicker, '예: PRODUCT INFO', (v) => upd((s) => { s.kicker = v; })),
        textField('제목', sec.title, '예: 제품 구성 · 스펙', (v) => upd((s) => { s.title = v; })),
        listField(`스펙 항목 (최대 ${LIMITS.spec}개)`, sec, 'rows', [
          { key: 'k', label: '항목', ph: '예: 무게' },
          { key: 'v', label: '값', ph: '예: 160g' },
        ], LIMITS.spec, () => ({ k: '', v: '' })),
      );
      break;
    case 'packages':
      body.append(
        textField('킥커', sec.kicker, '예: PACKAGE', (v) => upd((s) => { s.kicker = v; })),
        textField('제목', sec.title, '예: 패키지 · 가격', (v) => upd((s) => { s.title = v; })),
        listField(`패키지 (최대 ${LIMITS.packages}개 — 3개면 가운데가 강조됩니다)`, sec, 'items', [
          { key: 'name', label: '이름', ph: '예: 기본 · 표준 · 프리미엄' },
          { key: 'price', label: '가격', ph: '예: 50,000원' },
          { key: 'desc', label: '한 줄 설명', ph: '예: 가장 많이 선택' },
          { key: 'features', label: '포함 항목 (쉼표 구분)', ph: '핵심 작업, 수정 3회, 원본 파일', get: (it) => (it.features || []).join(', '), set: (it, v) => { it.features = v.split(',').map((x) => x.trim()).filter(Boolean); } },
        ], LIMITS.packages, () => ({ name: '', price: '', desc: '', features: [] })),
      );
      break;
    case 'comparison':
      body.append(
        textField('킥커', sec.kicker, '예: BEFORE · AFTER', (v) => upd((s) => { s.kicker = v; })),
        textField('제목', sec.title, '예: 이렇게 달라집니다', (v) => upd((s) => { s.title = v; })),
        el('div', { class: 'form-grid' },
          textField('왼쪽 라벨', sec.labelA, '예: 기존 제품', (v) => upd((s) => { s.labelA = v; })),
          textField('오른쪽 라벨', sec.labelB, '예: 이 제품', (v) => upd((s) => { s.labelB = v; })),
        ),
        linesField(`왼쪽 항목 (최대 ${LIMITS.comparison}개)`, sec.itemsA, '', (lines) => upd((s) => { s.itemsA = lines; }), LIMITS.comparison),
        linesField(`오른쪽 항목 (최대 ${LIMITS.comparison}개)`, sec.itemsB, '', (lines) => upd((s) => { s.itemsB = lines; }), LIMITS.comparison),
      );
      break;
    case 'review':
      body.append(
        textField('킥커', sec.kicker, '예: REVIEW', (v) => upd((s) => { s.kicker = v; })),
        textField('제목', sec.title, '예: 고객 후기', (v) => upd((s) => { s.title = v; })),
        listField(`후기 카드 (최대 ${LIMITS.review}개)`, sec, 'items', [
          { key: 'name', label: '이름', ph: '예: 김OO', type: 'text' },
          { key: 'rating', label: '별점 (0~5)', ph: '5', type: 'number' },
          { key: 'text', label: '후기', ph: '후기 내용' },
        ], LIMITS.review, () => ({ name: '', rating: 5, text: '' })),
      );
      break;
    case 'faq':
      body.append(
        textField('킥커', sec.kicker, '예: FAQ', (v) => upd((s) => { s.kicker = v; })),
        textField('제목', sec.title, '예: 자주 묻는 질문', (v) => upd((s) => { s.title = v; })),
        listField(`질문 (최대 ${LIMITS.faq}개)`, sec, 'items', [
          { key: 'q', label: '질문', ph: '예: 배송은 얼마나 걸리나요?' },
          { key: 'a', label: '답변', ph: '답변 (2줄까지 표시)' },
        ], LIMITS.faq, () => ({ q: '', a: '' })),
      );
      break;
    case 'certification':
      body.append(
        textField('킥커', sec.kicker, '예: CERTIFIED', (v) => upd((s) => { s.kicker = v; })),
        textField('제목', sec.title, '예: 인증 · 품질 보증', (v) => upd((s) => { s.title = v; })),
        listField(`인증·보증 (최대 ${LIMITS.certification}개)`, sec, 'items', [
          { key: 'title', label: '제목', ph: '예: 안전 인증' },
          { key: 'desc', label: '설명', ph: '예: KC 인증 완료' },
        ], LIMITS.certification, () => ({ title: '', desc: '' })),
      );
      break;
    case 'notice':
      body.append(
        textField('킥커', sec.kicker, '예: NOTICE', (v) => upd((s) => { s.kicker = v; })),
        textField('제목', sec.title, '예: 배송 · 교환 안내', (v) => upd((s) => { s.title = v; })),
        listField(`안내 항목 (최대 ${LIMITS.notice}개)`, sec, 'items', [
          { key: 'title', label: '제목', ph: '예: 배송' },
          { key: 'desc', label: '설명', ph: '예: 영업일 1~3일 발송' },
        ], LIMITS.notice, () => ({ title: '', desc: '' })),
      );
      break;
    case 'cta':
      body.append(
        linesField('문구 (권장 1~2줄)', sec.title, '예: 지금, 바로 만나보세요', (lines) => upd((s) => { s.title = lines; }), 2),
        linesField('보조 문구', sec.body, '예: 오늘 주문하면 내일 도착', (lines) => upd((s) => { s.body = lines; }), 2),
        textField('버튼 문구', sec.action, '예: 지금 구매하기', (v) => upd((s) => { s.action = v; })),
        linesField('하단 안내 (최대 1줄)', sec.sub, '예: 무료배송 · 안전결제', (lines) => upd((s) => { s.sub = lines; }), 1),
      );
      break;
    case 'disclaimer':
      body.append(linesField(`유의사항 (최대 ${LIMITS.disclaimer}개)`, sec.items, '유의 문구 한 줄', (lines) => upd((s) => { s.items = lines; }), LIMITS.disclaimer));
      break;
  }
  if (body.childElementCount) pane.append(section('내용', body));

  // ── 배경 (옵트인 — 히어로는 대표 이미지가 배경을 겸함)
  if (sec.type !== 'hero') {
    const bgPane = el('div', { class: 'field' });
    const bgChk = el('input', { type: 'checkbox' });
    bgChk.checked = !!sec.bgOn;
    bgChk.addEventListener('change', () => {
      store.updateSection(store.selected, (s) => {
        s.bgOn = bgChk.checked;
        // 켜면 프리셋 기본값(이미지·보통·그라데이션 사용)이 이미 선택된 상태가 된다 (blankSection 기본값)
      });
      renderEditor();
    });
    bgPane.append(el('label', { class: 'check-row' }, bgChk, el('span', {}, '배경 사용하기')));

    if (sec.bgOn) {
      const isImage = sec.bgKind !== 'shape';
      bgPane.append(el('div', { class: 'seg' },
        el('button', { class: isImage ? 'active' : '', onclick: () => { upd((s) => { s.bgKind = 'image'; }); renderEditor(); } }, '이미지'),
        el('button', { class: !isImage ? 'active' : '', onclick: () => { upd((s) => { s.bgKind = 'shape'; }); renderEditor(); } }, '모형배경'),
      ));
      const DIMS_IMG = [['d1', '아주 밝게'], ['d2', '밝게'], ['d3', '보통'], ['d4', '어둡게'], ['d5', '아주 어둡게']];
      const DIMS_SHAPE = [['d1', '아주 옅게'], ['d2', '옅게'], ['d3', '보통'], ['d4', '진하게'], ['d5', '아주 진하게']];
      const dimSel = el('select', {}, (isImage ? DIMS_IMG : DIMS_SHAPE).map(([v, l]) => el('option', { value: v }, l)));
      dimSel.value = sec.bgDim || 'd3';
      dimSel.addEventListener('change', () => upd((s) => { s.bgDim = dimSel.value; }));
      bgPane.append(el('div', { class: 'field' }, el('label', {}, isImage ? '배경 어둡기 (5단계)' : '장식 진하기 (5단계)'), dimSel));
      if (isImage) {
        bgPane.append(mediaField('배경 이미지', sec.bg, (m) => upd((s) => { s.bg = m; })));
      } else {
        const shapeSel = el('select', {},
          el('option', { value: 'rings' }, '장식 링 (기본)'),
          el('option', { value: 'dots' }, '도트 패턴'),
          el('option', { value: 'stripes' }, '사선 스트라이프'),
        );
        shapeSel.value = sec.bgShape || 'rings';
        shapeSel.addEventListener('change', () => upd((s) => { s.bgShape = shapeSel.value; }));
        bgPane.append(el('div', { class: 'field' }, el('label', {}, '모양'), shapeSel));
      }
      const gradChk = el('input', { type: 'checkbox' });
      gradChk.checked = sec.bgGrad !== false;
      gradChk.addEventListener('change', () => upd((s) => { s.bgGrad = gradChk.checked; }));
      bgPane.append(el('label', { class: 'check-row' }, gradChk,
        el('span', {}, isImage ? '배경 그라데이션 (위는 밝고 아래로 어둡게)' : '장식에 브랜드 그라데이션 적용')));
    }
    pane.append(section('배경 사용하기', bgPane));
  }

  // ── 섹션 조작
  pane.append(section('섹션 조작', el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
    el('button', { class: 'btn btn-small', onclick: () => store.moveSection(store.selected, -1) }, '↑ 위로'),
    el('button', { class: 'btn btn-small', onclick: () => store.moveSection(store.selected, 1) }, '↓ 아래로'),
    el('button', { class: 'btn btn-small', onclick: () => { store.duplicateSection(store.selected); toast('섹션을 복제했습니다.'); } }, '복제'),
    el('button', { class: 'btn btn-small btn-danger-ghost', onclick: () => deleteSection(store.selected) }, '삭제'),
  )));
}

function section(title, ...children) {
  return el('div', { class: 'editor-section' }, el('h3', {}, title), ...children);
}

// 작성 방식 — 직접 만들기 / AI가 만들기 (섹션 단위 선택, 생성 후에도 수정 가능)
function buildAIPane(sec, upd) {
  const pane = el('div', { class: 'field' });
  const aiChk = el('input', { type: 'checkbox' });
  aiChk.checked = !!sec.ai;
  aiChk.addEventListener('change', () => {
    upd((s) => { s.ai = aiChk.checked; });
    renderEditor();
  });
  pane.append(el('label', { class: 'check-row' }, aiChk, el('span', {}, 'AI가 만들기 (끄면 직접 만들기)')));

  if (sec.ai) {
    const hint = el('input', { type: 'text', value: sec.aiHint || '', placeholder: 'AI 지시 (예: 20대 타깃, 건강함 강조)' });
    hint.addEventListener('input', () => upd((s) => { s.aiHint = hint.value; }));
    pane.append(el('div', { class: 'field' }, el('label', {}, '한 줄 지시 (선택)'), hint));

    const btn = el('button', { class: 'btn btn-small' }, sec.aiMade ? '🔄 다시 만들기' : '✨ AI로 채우기');
    btn.addEventListener('click', async () => {
      if (!aiConfigured()) {
        toast('먼저 AI 설정에서 API 키를 저장해 주세요.', { type: 'warn' });
        openAISettings();
        return;
      }
      btn.disabled = true;
      btn.textContent = '생성 중…';
      try {
        const fields = await generateSection(store.project, store.project.sections[store.selected]);
        store.updateSection(store.selected, (s) => { Object.assign(s, fields, { aiMade: true }); });
        renderEditor();
        toast('AI가 문구를 채웠습니다. 내용은 자유롭게 수정할 수 있습니다.');
      } catch (e) {
        toast('AI 생성 실패: ' + e.message, { type: 'warn', timeout: 6000 });
      } finally {
        btn.disabled = false;
        btn.textContent = sec.aiMade ? '🔄 다시 만들기' : '✨ AI로 채우기';
      }
    });
    pane.append(el('div', { class: 'media-actions' },
      btn,
      el('button', { class: 'btn btn-small btn-ghost', onclick: openAISettings }, 'AI 설정'),
    ));
    if (sec.aiMade) {
      pane.append(el('div', { style: 'font-size:11px;color:var(--ui-faint);margin-top:8px' }, '✨ AI 생성 문구입니다 — 아래 "내용" 폼에서 바로 수정할 수 있습니다.'));
    }
  }
  return pane;
}

// AI 설정 모달 — 키는 이 브라우저 localStorage에만 저장 (내보내기에 미포함)
function openAISettings() {
  const saved = loadAIConfig();
  openModal('AI 설정', '섹션 단위 AI 문구 생성에 사용됩니다. 키는 이 브라우저에만 저장되고 프로젝트 JSON·ZIP에는 포함되지 않습니다.', (box, close) => {
    const providerSel = el('select', {},
      el('option', { value: 'gemini' }, 'Google Gemini'),
      el('option', { value: 'openai' }, 'OpenAI 호환'),
    );
    const baseUrl = el('input', { type: 'text', placeholder: AI_PROVIDERS.gemini.baseUrl });
    const model = el('input', { type: 'text', placeholder: AI_PROVIDERS.gemini.model });
    const apiKey = el('input', { type: 'password', placeholder: 'API 키' });
    const applyProvider = () => {
      const p = AI_PROVIDERS[providerSel.value];
      if (saved && saved.provider === providerSel.value) {
        baseUrl.value = saved.baseUrl;
        model.value = saved.model;
        apiKey.value = saved.apiKey;
      } else {
        baseUrl.value = p.baseUrl;
        model.value = p.model;
        apiKey.value = '';
      }
    };
    providerSel.value = saved ? saved.provider : 'gemini';
    applyProvider();
    providerSel.addEventListener('change', applyProvider);

    const testBtn = el('button', { class: 'btn btn-small' }, '연결 테스트');
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = '테스트 중…';
      try {
        const txt = await aiChat({
          provider: providerSel.value,
          baseUrl: baseUrl.value || AI_PROVIDERS[providerSel.value].baseUrl,
          model: model.value.trim(),
          apiKey: apiKey.value.trim(),
        }, '요청받은 단어 하나만 그대로 출력한다.', 'OK');
        toast(`연결 성공 — 응답: ${String(txt).trim().slice(0, 24)}`);
      } catch (e) {
        toast('연결 실패: ' + e.message, { type: 'warn', timeout: 6000 });
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = '연결 테스트';
      }
    });

    box.append(
      el('div', { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', {}, '제공자'), providerSel),
        el('div', { class: 'field' }, el('label', {}, '모델'), model),
      ),
      el('div', { class: 'field' }, el('label', {}, 'Base URL'), baseUrl),
      el('div', { class: 'field' }, el('label', {}, AI_PROVIDERS[providerSel.value].keyHint), apiKey),
      el('div', { class: 'modal-actions' },
        testBtn,
        el('button', { class: 'btn', onclick: close }, '취소'),
        el('button', { class: 'btn btn-primary', onclick: () => {
          try {
            saveAIConfig({ provider: providerSel.value, baseUrl: baseUrl.value, model: model.value, apiKey: apiKey.value });
            toast('AI 설정을 저장했습니다.');
            close();
          } catch (e) {
            toast('저장 실패: ' + e.message, { type: 'warn' });
          }
        } }, '저장'),
      ),
    );
  });
}

function textField(labelText, value, placeholder, onChange) {
  const input = el('input', { type: 'text', value: value || '', placeholder: placeholder || '' });
  input.addEventListener('input', () => onChange(input.value));
  return el('div', { class: 'field' }, el('label', {}, labelText), input);
}

function linesField(labelText, lines, placeholder, onChange, max = 99) {
  const wrap = el('div', { class: 'field' });
  wrap.append(el('label', {}, labelText));
  const editor = el('div', { class: 'lines-editor' });
  const arr = lines && lines.length ? lines.slice() : [''];
  const rebuild = () => {
    editor.innerHTML = '';
    arr.forEach((line, i) => {
      const input = el('input', { type: 'text', value: line, placeholder: placeholder || '' });
      input.addEventListener('input', () => {
        arr[i] = input.value;
        onChange(arr.slice());
      });
      const x = el('button', { class: 'row-x', title: '줄 삭제', onclick: () => {
        arr.splice(i, 1);
        if (!arr.length) arr.push('');
        onChange(arr.slice());
        rebuild();
      } }, '✕');
      editor.append(el('div', { class: 'line-row' }, input, x));
    });
    if (arr.length < max) {
      editor.append(el('button', { class: 'lines-add', onclick: () => {
        arr.push('');
        onChange(arr.slice());
        rebuild();
      } }, '+ 줄 추가'));
    }
  };
  rebuild();
  wrap.append(editor);
  return wrap;
}

// 구조화 항목 리스트 (features/howto/spec/review/faq/certification/notice 공용)
function listField(labelText, sec, key, fields, max, makeNew) {
  const wrap = el('div', { class: 'field' });
  wrap.append(el('label', {}, labelText));
  const list = el('div', {});
  const rebuild = () => {
    list.innerHTML = '';
    (sec[key] || []).forEach((item, i) => {
      const inputs = fields.map((f) => {
        const input = el('input', {
          type: f.type === 'number' ? 'number' : 'text',
          value: f.get ? f.get(item) : (item[f.key] ?? ''),
          placeholder: f.ph || '',
        });
        input.addEventListener('input', () => {
          if (f.set) f.set(item, input.value);
          else item[f.key] = f.type === 'number' ? (parseInt(input.value, 10) || 0) : input.value;
          store.updateSection(store.selected, () => {});
        });
        return el('div', { class: 'field', style: 'margin-bottom:0' }, el('label', {}, f.label), input);
      });
      list.append(el('div', { class: 'item-row' },
        el('span', { class: 'item-no' }, String(i + 1)),
        el('div', { class: 'item-fields' }, ...inputs),
        el('button', { class: 'row-x', title: '항목 삭제', onclick: () => {
          store.updateSection(store.selected, (s) => {
            s[key].splice(i, 1);
            if (!s[key].length) s[key].push(makeNew());
          });
          renderEditor();
        } }, '✕'),
      ));
    });
    if ((sec[key] || []).length < max) {
      list.append(el('button', { class: 'lines-add', onclick: () => {
        store.updateSection(store.selected, (s) => { s[key].push(makeNew()); });
        renderEditor();
      } }, `+ 항목 추가`));
    }
  };
  rebuild();
  wrap.append(list);
  return wrap;
}

// 단일 이미지 필드 (media 값 자체를 받아 onChange로 돌려준다)
function mediaField(labelText, media, onChange) {
  const box = el('div', { class: `media-box ${media ? 'has-image' : ''}` });
  const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: '' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const norm = await normalizeImage(file);
      onChange(norm);
      renderEditor();
      toast('이미지를 추가했습니다.');
    } catch (e) {
      toast('이미지를 불러오지 못했습니다: ' + e.message, { type: 'warn' });
    }
  });
  if (media) {
    box.append(el('img', { src: media.src, alt: '섹션 이미지' }));
  } else {
    box.append(el('div', { class: 'media-empty' }, '이미지가 없습니다.\n플레이스홀더로 표시됩니다.'));
  }
  box.append(el('div', { class: 'media-actions' },
    el('button', { class: 'btn btn-small', onclick: () => fileInput.click() }, media ? '이미지 교체' : '이미지 추가'),
    media ? el('button', { class: 'btn btn-small btn-danger-ghost', onclick: () => { onChange(null); renderEditor(); } }, '제거') : null,
  ), fileInput);
  return el('div', { class: 'field' }, el('label', {}, labelText), box);
}

// 갤러리 4슬롯
function galleryField(sec) {
  const wrap = el('div', { class: 'field' });
  wrap.append(el('label', {}, `갤러리 이미지 (2×2, 최대 ${LIMITS.gallery}장)`));
  const grid = el('div', { class: 'media-grid' });
  for (let i = 0; i < 4; i++) {
    const m = (sec.images || [])[i];
    const box = el('div', { class: `media-box ${m ? 'has-image' : ''}` });
    const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: '' });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const norm = await normalizeImage(file);
        store.updateSection(store.selected, (s) => { s.images[i] = norm; });
        renderEditor();
        toast(`${i + 1}번 이미지를 추가했습니다.`);
      } catch (e) {
        toast('이미지를 불러오지 못했습니다: ' + e.message, { type: 'warn' });
      }
    });
    if (m) box.append(el('img', { src: m.src, alt: `갤러리 ${i + 1}` }));
    else box.append(el('div', { class: 'media-empty' }, `${i + 1}번 슬롯`));
    box.append(el('div', { class: 'media-actions' },
      el('button', { class: 'btn btn-small', onclick: () => fileInput.click() }, m ? '교체' : '추가'),
      m ? el('button', { class: 'btn btn-small btn-danger-ghost', onclick: () => {
        store.updateSection(store.selected, (s) => { s.images[i] = null; });
        renderEditor();
      } }, '제거') : null,
    ), fileInput);
    grid.append(box);
  }
  wrap.append(grid);
  return wrap;
}

// 섹션 타입 미니 아이콘
function typeIcon(id) {
  const s = `<svg width="22" height="28" viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg">`;
  const st = `stroke="currentColor" stroke-width="1.6"`;
  const icons = {
    hero: `<rect x="1.5" y="1.5" width="19" height="25" rx="2.5" ${st}/><path d="M3 17 C8 15 15 19 19 17.5 V24 a2 2 0 0 1 -2 2 H5 a2 2 0 0 1 -2 -2 Z" fill="currentColor" opacity="0.75"/>`,
    problem: `<circle cx="11" cy="10" r="6.5" ${st}/><path d="M9 9.5 a2 2 0 1 1 3 1.7 c-.8.5-1 .9-1 1.8" ${st} stroke-linecap="round"/><path d="M11 16v6M8 25h6" ${st} stroke-linecap="round"/>`,
    solution: `<path d="M11 3l2.4 5 5.6.7-4.1 3.8 1.1 5.5-5-2.7-5 2.7 1.1-5.5L3 8.7 8.6 8Z" ${st} stroke-linejoin="round"/><path d="M6 25h10" ${st} stroke-linecap="round"/>`,
    features: `<rect x="2" y="3" width="8" height="10" rx="2" ${st}/><rect x="12" y="3" width="8" height="10" rx="2" ${st} fill="currentColor" fill-opacity="0.25"/><rect x="2" y="15" width="8" height="10" rx="2" ${st} fill="currentColor" fill-opacity="0.25"/><rect x="12" y="15" width="8" height="10" rx="2" ${st}/>`,
    gallery: `<rect x="2" y="3" width="8" height="10" rx="2" ${st}/><rect x="12" y="3" width="8" height="10" rx="2" ${st}/><rect x="2" y="15" width="8" height="10" rx="2" ${st}/><rect x="12" y="15" width="8" height="10" rx="2" ${st}/>`,
    howto: `<rect x="2" y="2.5" width="7" height="6" rx="1.5" ${st} fill="currentColor" fill-opacity="0.25"/><rect x="2" y="11" width="7" height="6" rx="1.5" ${st}/><rect x="2" y="19.5" width="7" height="6" rx="1.5" ${st} fill="currentColor" fill-opacity="0.25"/><path d="M12 5.5h8M12 14h8M12 22.5h8" ${st} stroke-linecap="round"/>`,
    spec: `<rect x="3" y="3" width="16" height="22" rx="2.5" ${st}/><path d="M6.5 9h9M6.5 14h9M6.5 19h6" ${st} stroke-linecap="round"/>`,
    packages: `<rect x="1.5" y="6" width="5.6" height="16" rx="1.6" ${st}/><rect x="8.2" y="3" width="5.6" height="19" rx="1.6" ${st} fill="currentColor" fill-opacity="0.3"/><rect x="14.9" y="6" width="5.6" height="16" rx="1.6" ${st}/>`,
    comparison: `<rect x="1.5" y="4" width="8.5" height="20" rx="2" ${st}/><rect x="12" y="4" width="8.5" height="20" rx="2" ${st} fill="currentColor" fill-opacity="0.25"/>`,
    review: `<path d="M6 6l1.4 2.9 3.2.4-2.3 2.2.5 3.1L6 13.1l-2.8 1.5.5-3.1-2.3-2.2 3.2-.4Z" ${st} stroke-linejoin="round"/><path d="M16 6l1.4 2.9 3.2.4-2.3 2.2.5 3.1L16 13.1l-2.8 1.5.5-3.1-2.3-2.2 3.2-.4Z" ${st} stroke-linejoin="round"/><path d="M4 25h14" ${st} stroke-linecap="round"/>`,
    faq: `<rect x="2" y="4" width="18" height="14" rx="2.5" ${st}/><path d="M8 18l-1 5 5-5" ${st} stroke-linejoin="round"/><path d="M8.5 9.5 a2.5 2.5 0 1 1 3.7 2.2 c-.9.5-1.2 1-1.2 1.9" ${st} stroke-linecap="round"/>`,
    certification: `<circle cx="11" cy="11" r="7.5" ${st}/><path d="M7.8 11l2.2 2.2 4-4.4" ${st} stroke-linecap="round" stroke-linejoin="round"/><path d="M8 22l1-4h4l1 4-3-1.6Z" ${st} stroke-linejoin="round"/>`,
    notice: `<rect x="3" y="3" width="16" height="22" rx="2.5" ${st}/><path d="M7 9h8M7 13.5h8M7 18h5" ${st} stroke-linecap="round"/>`,
    cta: `<rect x="3" y="8" width="16" height="11" rx="5.5" ${st}/><circle cx="11" cy="13.5" r="2" fill="currentColor" fill-opacity="0.4"/><path d="M6 24h10" ${st} stroke-linecap="round"/>`,
    disclaimer: `<path d="M11 2.5l7 3v6c0 5-3 8.5-7 10-4-1.5-7-5-7-10v-6Z" ${st} stroke-linejoin="round"/><path d="M8.2 11.5l2 2 3.6-4" ${st} stroke-linecap="round" stroke-linejoin="round"/>`,
  };
  return el('span', { html: s + (icons[id] || '') + '</svg>' });
}

// ---------- 섹션 삭제 ----------
function deleteSection(i) {
  if (store.project.sections.length <= 1) {
    toast('마지막 섹션은 삭제할 수 없습니다.', { type: 'warn' });
    return;
  }
  store.deleteSection(i);
  toast('섹션을 삭제했습니다.', { actionLabel: '실행 취소', onAction: () => store.restoreDeleted(), timeout: 6000 });
}

// ---------- 모달: 섹션 추가 ----------
function openAddSection() {
  openModal('섹션 추가', '추가할 섹션 타입을 고르세요. 기본 문구가 채워진 상태로 현재 섹션 다음에 들어갑니다.', (box, close) => {
    const grid = el('div', { class: 'type-grid' });
    for (const t of SECTION_TYPES) {
      grid.append(el('button', {
        class: 'type-btn',
        title: t.desc,
        onclick: () => {
          store.addSection(t.id);
          renderEditor();
          close();
          toast(`[${t.name}] 섹션을 추가했습니다.`);
        },
      }, typeIcon(t.id), el('span', { class: 'name' }, t.name)));
    }
    box.append(grid);
  });
}

// ---------- 모달: 상품 정보 → 초안 생성 ----------
function taRow(labelText, value, ph, hint) {
  const ta = el('textarea', { class: 'big', spellcheck: 'false', placeholder: ph || '' });
  ta.value = (value || []).join('\n');
  return { ta, field: el('div', { class: 'field' }, el('label', {}, labelText), ta, hint ? el('div', { class: 'hint' }, hint) : null) };
}

function openProduct() {
  const P = store.project;
  openModal('상품 정보 → 섹션 초안', '유형을 고르고 정보를 채운 뒤 [초안 생성]을 누르면 상세페이지 표준 구성 순서로 섹션이 자동 배치됩니다. "항목|내용" 구분자를 지켜 주세요.', (box, close) => {
    const state = { type: P.type || 'product' };
    const toneSel = el('select', {},
      el('option', { value: 'feature' }, '기능형 — 스펙·성능 중심 카피'),
      el('option', { value: 'empath' }, '공감형 — 불공감→해결 흐름 카피'),
      el('option', { value: 'premium' }, '프리미엄형 — 품격·완성도 카피'),
    );
    toneSel.value = (P.theme && P.theme.copyTone) || 'feature';
    const fieldsBox = el('div', {});

    box.append(
      el('div', { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', {}, '상품 유형'), (() => {
          const sel = el('select', {},
            el('option', { value: 'product' }, '일반 제품 (유형상품)'),
            el('option', { value: 'service' }, '서비스 · 무형상품 (크몽 스타일)'),
          );
          sel.value = state.type;
          sel.addEventListener('change', () => { state.type = sel.value; buildFields(); });
          return sel;
        })()),
        el('div', { class: 'field' }, el('label', {}, '문구 톤 (공감·해결·CTA 기본 카피)'), toneSel),
      ),
      el('div', { class: 'divider' }),
      fieldsBox,
      el('div', { class: 'modal-actions' },
        el('button', { class: 'btn btn-primary', onclick: () => {
          const product = readProduct();
          if (!product.name.trim()) { toast(state.type === 'service' ? '서비스명을 입력해 주세요.' : '제품명을 입력해 주세요.', { type: 'warn' }); return; }
          if (!confirm(`현재 섹션 구성을 ${state.type === 'service' ? '서비스' : '제품'} 초안으로 교체할까요?\n(지금까지 편집한 섹션 내용은 사라집니다)`)) return;
          store.update((proj) => {
            proj.product = product;
            proj.type = state.type;
            proj.theme.copyTone = toneSel.value;
          });
          const sections = buildDraft(product, toneSel.value, P.brand && P.brand.name, state.type);
          store.update((proj) => { proj.sections = sections; });
          store.select(0);
          renderEditor();
          close();
          $('#preview-wrap').scrollTop = 0;
          toast(`초안 ${sections.length}개 섹션을 생성했습니다. 이미지를 넣어 마무리해 주세요.`, { timeout: 5000 });
        } }, '초안 생성'),
        el('button', { class: 'btn', onclick: close }, '완료'),
      ),
    );

    function readProduct() {
      return {
        name: F.name.value, category: F.category.value, tagline: F.tagline.value,
        features: taLines(F.features), steps: taLines(F.steps), specs: taLines(F.specs),
        packages: F.packages ? taLines(F.packages) : [],
        certifications: F.certs ? taLines(F.certs) : [],
        reviews: taLines(F.reviews), faqs: taLines(F.faqs),
        notices: taLines(F.notices), warnings: taLines(F.warnings),
      };
    }
    const taLines = (r) => r.ta.value.split('\n').map((s) => s.trim()).filter(Boolean);

    let F = {};
    function buildFields() {
      const p = P.product;
      const svc = state.type === 'service';
      F = {};
      fieldsBox.innerHTML = '';
      F.name = el('input', { type: 'text', value: p.name || '', placeholder: svc ? '예: 브랜드 로고 · BI 디자인' : '예: 포켓 미니 청소기 에어리' });
      F.category = el('input', { type: 'text', value: p.category || '', placeholder: svc ? '예: 디자인' : '예: 생활가전' });
      F.tagline = el('input', { type: 'text', value: p.tagline || '', placeholder: svc ? '예: 당일 시안, 무제한 수정' : '예: 한 손에 쏙, 데스크 위 먼지는 3초면 끝' });
      F.features = taRow(svc ? '서비스 강점 — 줄당 "제목|설명"' : '핵심 특징 — 줄당 "제목|설명"', p.features, svc ? '당일 제작|오후 문의 시 당일 시안 제공' : '3초 강력 흡입|8kPa 흡입력으로 부스러기 한 번에', '줄마다 하나. 3~5개 권장');
      F.steps = taRow(svc ? '진행 프로세스 — 줄당 "단계|설명"' : '사용 방법 — 줄당 "단계|설명"', p.steps, svc ? '문의|원하는 방향과 일정 공유' : '전원 켜기|버튼을 2초 길게 누릅니다', svc ? '문의→작업→수정→납품 순서를 추천합니다' : '비우면 사용방법 섹션이 생략됩니다');
      F.specs = taRow(svc ? '포함 내역 — 줄당 "항목|값"' : '스펙 · 구성 — 줄당 "항목|값"', p.specs, svc ? '납품 파일|AI·SVG·PNG 전부' : '무게|160g', '');
      if (svc) {
        F.packages = taRow('패키지 가격 — 줄당 "이름|가격|설명|포함1,포함2,포함3"', p.packages, '표준|150,000원|가장 많이 선택|로고 3안,수정 3회,원본 파일', '최대 3개 (기본/표준/프리미엄) — 가운데가 강조됩니다');
        F.certs = taRow('자격 · 경력 — 줄당 "제목|설명"', p.certifications, '컬러리스트 국가자격|산업기사 취득', '비우면 자격·경력 섹션이 생략됩니다');
      }
      F.reviews = taRow('고객 후기 — 줄당 "이름|별점|내용"', p.reviews, '김OO|5|생각보다 훨씬 좋아요.', '최대 3개 사용');
      F.faqs = taRow('FAQ — 줄당 "질문|답변"', p.faqs, svc ? '수정은 몇 번 가능한가요?|패키지별로 정해져 있습니다.' : '배송은 얼마나 걸리나요?|영업일 1~3일입니다.', svc ? '작업 과정·수정·납기 질문을 추천합니다' : '');
      F.notices = taRow(svc ? '진행 · 환불 안내 — 줄당 "제목|내용"' : '배송 · 교환 안내 — 줄당 "제목|내용"', p.notices, svc ? '취소 및 환불|작업 시작 전 100% 환불' : '배송|영업일 1~3일 발송', '비우면 기본 안내 문구로 채워집니다');
      F.warnings = taRow('유의사항 — 줄당 한 문장', p.warnings, svc ? '작업 범위는 패키지 및 사전 협의에 따릅니다.' : '이미지는 실제 제품과 다소 차이가 있을 수 있습니다.', '비우면 기본 문구로 채워집니다');

      fieldsBox.append(
        el('div', { class: 'form-grid' },
          el('div', { class: 'field' }, el('label', {}, svc ? '서비스명' : '제품명'), F.name),
          el('div', { class: 'field' }, el('label', {}, '카테고리'), F.category),
        ),
        el('div', { class: 'field' }, el('label', {}, '캐치프레이즈'), F.tagline),
        el('div', { class: 'divider' }),
        F.features.field, F.steps.field, F.specs.field,
        F.packages ? F.packages.field : null,
        F.certs ? F.certs.field : null,
        F.reviews.field, F.faqs.field, F.notices.field, F.warnings.field,
      );

      const bindText = (input, keys) => input.addEventListener('input', () => store.update((proj) => {
        keys.forEach((k) => { proj.product[k] = readProduct()[k]; });
      }));
      bindText(F.name, ['name']);
      bindText(F.category, ['category']);
      bindText(F.tagline, ['tagline']);
      for (const key of ['features', 'steps', 'specs', 'packages', 'certifications', 'reviews', 'faqs', 'notices', 'warnings']) {
        if (F[key]) F[key].ta.addEventListener('input', () => store.update((proj) => { proj.product[key] = taLines(F[key]); }));
      }
    }
    buildFields();
  });
}

// ---------- 모달: 테마 ----------
const ACCENTS = ['#0071e3', '#0A84FF', '#5E5CE6', '#FF2D55', '#FF3B30', '#FF9500', '#34C759', '#1D1D1F'];

function openTheme() {
  const P = store.project;
  openModal('테마 · 브랜드', '모든 섹션에 일괄 적용되는 브랜드 설정입니다. 히어로·CTA·유의사항에 브랜드명이 표시됩니다.', (box, close) => {
    const brandName = el('input', { type: 'text', value: (P.brand && P.brand.name) || '', placeholder: '예: 에어리랩' });
    brandName.addEventListener('input', () => store.update((p) => { p.brand.name = brandName.value; }));

    const colorInput = el('input', { type: 'color', value: P.theme.accent });
    const swatches = el('div', { class: 'swatches' });
    const rebuildSwatches = () => {
      swatches.innerHTML = '';
      for (const c of ACCENTS) {
        swatches.append(el('button', {
          class: `swatch ${P.theme.accent.toLowerCase() === c.toLowerCase() ? 'active' : ''}`,
          style: `background:${c}`,
          title: c,
          onclick: () => { store.update((p) => { p.theme.accent = c; }); colorInput.value = c; rebuildSwatches(); },
        }));
      }
    };
    colorInput.addEventListener('input', () => { store.update((p) => { p.theme.accent = colorInput.value; }); rebuildSwatches(); });
    rebuildSwatches();

    // 영역별 폰트 선택 (전부 SIL OFL — 상업적 이용 가능, 카드뉴스 스튜디오와 동일 5종)
    const mkFontSel = (areaKey) => {
      const sel = el('select', {}, Object.entries(FAMILIES).map(([k, f]) => el('option', { value: k }, f.label)));
      sel.value = (P.theme.fonts && P.theme.fonts[areaKey]) || 'gmarket';
      sel.addEventListener('change', () => store.update((p) => {
        if (!p.theme.fonts) p.theme.fonts = {};
        p.theme.fonts[areaKey] = sel.value;
      }));
      return sel;
    };
    const fTitle = mkFontSel('title');
    const fBody = mkFontSel('body');
    const fAux = mkFontSel('aux');

    box.append(
      el('div', { class: 'field' }, el('label', {}, '브랜드명'), brandName),
      el('div', { class: 'field' }, el('label', {}, '브랜드 색 (액센트)'), colorInput, swatches),
      el('div', { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', {}, '제목 폰트'), fTitle),
        el('div', { class: 'field' }, el('label', {}, '본문·항목 폰트'), fBody),
        el('div', { class: 'field' }, el('label', {}, '보조 폰트 (킥커·배지·푸터)'), fAux),
      ),
      el('div', { class: 'modal-actions' },
        el('button', { class: 'btn btn-danger-ghost', onclick: () => {
          if (!confirm('빈 상품 정보로 초기화합니다. 현재 작업은 사라집니다. 계속할까요?')) return;
          store.setProject(emptyProject());
          store.save();
          renderEditor();
          close();
          toast('빈 프로젝트로 초기화했습니다.');
        } }, '빈 프로젝트로'),
        el('button', { class: 'btn btn-danger-ghost', onclick: () => {
          if (!confirm('서비스(무형상품) 샘플로 초기화합니다. 현재 작업은 사라집니다. 계속할까요?')) return;
          store.setProject(sampleServiceProject());
          store.save();
          renderEditor();
          close();
          toast('서비스 샘플로 초기화했습니다. (패키지·프로세스 구성)');
        } }, '서비스 샘플로'),
        el('button', { class: 'btn', onclick: () => {
          if (!confirm('샘플 프로젝트로 초기화합니다. 현재 작업은 사라집니다. 계속할까요?')) return;
          store.setProject(sampleProject());
          store.save();
          renderEditor();
          close();
          toast('샘플 프로젝트로 초기화했습니다.');
        } }, '제품 샘플로'),
        el('button', { class: 'btn btn-primary', onclick: close }, '완료'),
      ),
    );
  });
}

// ---------- 모달: AI 초안 ----------
const AI_PROMPT = `쇼핑몰 상세페이지를 기획해 JSON으로만 출력해줘. 설명은 붙이지 말고 JSON 코드블록 하나만.

상세페이지 표준 흐름(순서 준수):
1) hero — 대표 이미지 위 제품명·카테고리·캐치프레이즈
2) problem — 고객 불공감 항목 3~4개
3) solution — "이 제품이 답" 한마디
4) features — 특징 카드 4~6개 (제목|설명)
5) howto — 사용 단계 3~5개
6) spec — 스펙 표 4~8행
7) comparison — 기존 제품 vs 이 제품, 각 3항목
8) review — 후기 3개 (이름|별점|내용)
9) faq — 질문 3~5개
10) notice — 배송·교환·A/S 안내
11) cta — 구매 유도 문구 + 버튼
12) disclaimer — 유의사항 3개

카피 규칙:
- 혜택(결과)을 먼저 말하고 기능을 나중에. 번역투·과장 금지
- title은 의미 단위 줄 배열(1~2줄), 한 줄은 짧게
- 숫자·구체 표현을 쓸 것

JSON 형식:
{"title":"프로젝트명","brand":{"name":"브랜드명"},
 "product":{"name":"제품명","category":"카테고리","tagline":"캐치프레이즈","features":["제목|설명"],"steps":["단계|설명"],"specs":["항목|값"],"reviews":["이름|5|내용"],"faqs":["질문|답변"],"notices":["제목|내용"],"warnings":["문장"]},
 "sections":[
  {"type":"hero","badge":"카테고리","title":["제품명"],"body":["캐치프레이즈"]},
  {"type":"problem","kicker":"혹시 이런 경험 없으신가요?","title":["2줄 제목"],"items":["불편 1","불편 2","불편 3"]},
  {"type":"solution","badge":"그래서 만들었습니다","title":["해결 선언"],"body":["설명"]},
  {"type":"features","kicker":"KEY FEATURES","title":"핵심 특징","items":[{"title":"특징","desc":"설명"}]},
  {"type":"howto","kicker":"HOW TO USE","title":"이렇게 사용하세요","items":[{"text":"단계","sub":"설명"}]},
  {"type":"spec","kicker":"PRODUCT INFO","title":"제품 구성 · 스펙","rows":[{"k":"항목","v":"값"}]},
  {"type":"comparison","kicker":"BEFORE · AFTER","title":"이렇게 달라집니다","labelA":"기존 제품","itemsA":["..."],"labelB":"이 제품","itemsB":["..."]},
  {"type":"review","kicker":"REVIEW","title":"고객 후기","items":[{"name":"김OO","rating":5,"text":"내용"}]},
  {"type":"faq","kicker":"FAQ","title":"자주 묻는 질문","items":[{"q":"질문","a":"답변"}]},
  {"type":"notice","kicker":"NOTICE","title":"배송 · 교환 안내","items":[{"title":"배송","desc":"내용"}]},
  {"type":"cta","title":["지금, 바로 만나보세요"],"body":["보조 문구"],"action":"지금 구매하기","sub":["무료배송 · 안전결제"]},
  {"type":"disclaimer","items":["유의사항 1","유의사항 2","유의사항 3"]}
 ]}

sections 순서는 위 표준 흐름을 따르고, 각 type은 hero/problem/solution/features/gallery/howto/spec/comparison/review/faq/certification/notice/cta/disclaimer 중 하나.
주제: 【여기에 제품 정보·특징·타깃을 붙여넣기】`;

function openAI() {
  openModal('✨ AI 초안 만들기', '아래 프롬프트를 ChatGPT·Claude 등에 붙여넣어 JSON 초안을 받아오세요. 가져온 뒤에도 모든 섹션을 자유롭게 수정할 수 있습니다.', (box) => {
    const pre = el('pre', {}, AI_PROMPT);
    const ta = el('textarea', { class: 'big', placeholder: 'AI가 만들어준 JSON을 여기에 붙여넣고 [프로젝트로 가져오기]를 누르세요.' });
    box.append(
      el('div', { class: 'field' }, el('label', {}, '1. 프롬프트 복사 (주제 칸 교체)'), pre,
        el('button', { class: 'btn', onclick: async () => {
          try { await navigator.clipboard.writeText(AI_PROMPT); toast('프롬프트를 복사했습니다.'); }
          catch { toast('복사 실패 — 직접 선택해 복사해 주세요.', { type: 'warn' }); }
        } }, '프롬프트 복사')),
      el('div', { class: 'field' }, el('label', {}, '2. 결과 JSON 붙여넣기'), ta),
      el('div', { class: 'modal-actions' },
        el('button', { class: 'btn btn-ghost', onclick: openAISettings }, '⚙ AI 설정 (섹션 단위 AI용)'),
        el('button', { class: 'btn btn-primary', onclick: () => {
          let raw = ta.value.trim();
          if (!raw) { toast('JSON을 붙여넣어 주세요.', { type: 'warn' }); return; }
          const m = raw.match(/\{[\s\S]*\}/);
          if (m) raw = m[0];
          try {
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.sections) || !parsed.sections.length) throw new Error('sections 배열이 없습니다.');
            if (!confirm('현재 프로젝트를 AI 초안으로 교체할까요?')) return;
            store.setProject(parsed);
            renderEditor();
            $('#modal-root').innerHTML = '';
            toast('AI 초안을 가져왔습니다. 이미지는 직접 넣어주세요.');
          } catch (e) {
            toast('JSON 해석 실패: ' + e.message, { type: 'warn', timeout: 5000 });
          }
        } }, '프로젝트로 가져오기'),
      ),
    );
  });
}

// ---------- 헤더 / 키보드 ----------
function syncWidthControls() {
  const P = store.project;
  const preset = $('#width-preset');
  const custom = $('#width-custom');
  if (P.width === 860) preset.value = '860';
  else if (P.width === 1000) preset.value = '1000';
  else preset.value = 'custom';
  custom.hidden = preset.value !== 'custom';
  custom.value = P.width;
}

function applyZoom() {
  const P = store.project;
  const stack = $('#page-stack');
  const zoom = $('#zoom-preset').value;
  if (zoom === 'fit') {
    stack.style.width = 'min(100%, 620px)';
  } else {
    stack.style.width = `${Math.round(P.width * (parseInt(zoom, 10) / 100))}px`;
  }
}

function wireHeader() {
  const titleInput = $('#project-title');
  titleInput.value = store.project.title;
  titleInput.addEventListener('input', () => {
    store.project.title = titleInput.value;
    store.save();
  });

  $('#btn-product').addEventListener('click', openProduct);
  $('#btn-theme').addEventListener('click', openTheme);
  $('#btn-ai').addEventListener('click', openAI);

  $('#btn-json-save').addEventListener('click', () => {
    exportProjectJSON(store.project);
    toast('프로젝트 JSON을 저장했습니다.');
  });
  $('#btn-json-load').addEventListener('click', () => $('#file-json').click());
  $('#file-json').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.sections)) throw new Error('sections 배열이 없습니다.');
      store.setProject(parsed);
      renderEditor();
      syncWidthControls();
      toast('프로젝트를 불러왔습니다.');
    } catch (err) {
      toast('불러오기 실패: ' + err.message, { type: 'warn', timeout: 5000 });
    }
    e.target.value = '';
  });

  $('#btn-png').addEventListener('click', async () => {
    try {
      await exportSectionPNG(store.project, store.selected);
      toast(`${store.selected + 1}번 섹션 PNG를 저장했습니다.`);
    } catch (e) {
      toast('PNG 저장 실패: ' + e.message, { type: 'warn' });
    }
  });

  const zipBtn = $('#btn-zip');
  zipBtn.addEventListener('click', async () => {
    const original = zipBtn.textContent;
    try {
      zipBtn.disabled = true;
      zipBtn.textContent = '만드는 중…';
      const zip = await exportZip(store.project, (i, n) => { zipBtn.textContent = `만드는 중… (${i + 1}/${n})`; });
      const blob = new Blob([zip], { type: 'application/zip' });
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `${store.project.title || 'detailpage'}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('ZIP 다운로드를 시작했습니다. (전체 이어본 + 섹션별 분할 + JSON)');
    } catch (e) {
      log.error(e);
      toast('ZIP 생성 실패: ' + e.message, { type: 'warn', timeout: 6000 });
    } finally {
      zipBtn.disabled = false;
      zipBtn.textContent = original;
    }
  });

  // 규격 (캔버스 폭)
  const preset = $('#width-preset');
  const custom = $('#width-custom');
  preset.addEventListener('change', () => {
    custom.hidden = preset.value !== 'custom';
    if (preset.value !== 'custom') {
      store.update((p) => { p.width = parseInt(preset.value, 10); });
    } else {
      custom.focus();
    }
  });
  custom.addEventListener('change', () => {
    const w = clampW(custom.value);
    custom.value = w;
    store.update((p) => { p.width = w; });
  });

  $('#zoom-preset').addEventListener('change', applyZoom);
}

function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'ArrowDown' && !typing) { e.preventDefault(); store.select(store.selected + 1); }
    else if (e.key === 'ArrowUp' && !typing) { e.preventDefault(); store.select(store.selected - 1); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      $('#btn-zip').click();
    }
  });
}

// ---------- 스토어 이벤트 ----------
function wireStore() {
  store.on('project', async () => {
    const P = store.project;
    await ensureImages(P);
    await ensureProjectFonts(P); // 선택 폰트 지연 로드 — 캔버스 렌더 전 보장
    renderStage();
    qaResult = runQA(P, heights);
    renderRail();
    renderQA();
    updatePageInfo();
    const t = $('#project-title');
    if (t.value !== P.title) t.value = P.title;
  });
  store.on('selection', () => {
    renderStage();
    renderEditor();
    renderQA();
    document.querySelectorAll('#section-rail .rail-item').forEach((n) => {
      n.classList.toggle('active', Number(n.dataset.index) === store.selected);
    });
  });
  store.on('quota-exceeded', () => {
    toast('브라우저 저장 공간이 부족해 자동저장에 실패했습니다. 이미지를 줄이거나 JSON으로 백업해 주세요.', { type: 'warn', timeout: 6000 });
  });
}

// ---------- 부트 ----------
(async function boot() {
  try {
    await loadFonts();
  } catch (e) {
    log.warn('폰트 로드 실패, 시스템 폰트로 진행:', e);
  }
  const restored = store.load();
  if (!restored) {
    store.setProject(sampleProject(), { silent: true });
    store.save(); // 새 사용자도 새로고침 시 작업이 유지되도록
  }

  wireHeader();
  wireStore();
  wireKeyboard();
  syncWidthControls();
  applyZoom();

  await repaint({ editor: true });

  if (restored) toast('마지막 작업을 복원했습니다.', { timeout: 2200 });
  log.info('상세페이지 스튜디오 시작');
})();
