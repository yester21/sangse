// ai.js — 섹션 단위 AI 문구 생성 (브라우저에서 직접 호출)
// 설정은 localStorage 'detail-studio-ai-v1'에만 저장된다. 프로젝트 JSON·ZIP 내보내기에는 절대 포함되지 않는다.
// 지원: Gemini (generativelanguage.googleapis.com, CORS 허용) / OpenAI 호환 (baseUrl 교체로 z.ai·로컬 LM 등)

const AI_KEY = 'detail-studio-ai-v1';

export const AI_PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
    keyHint: 'Google AI Studio에서 발급한 API 키',
  },
  openai: {
    name: 'OpenAI 호환',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyHint: 'API 키 (z.ai·LM Studio 등은 Base URL을 바꿔 주세요)',
  },
};

export function loadAIConfig() {
  try {
    const raw = localStorage.getItem(AI_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || !c.apiKey || !c.model) return null;
    return {
      provider: c.provider === 'openai' ? 'openai' : 'gemini',
      baseUrl: String(c.baseUrl || AI_PROVIDERS[c.provider === 'openai' ? 'openai' : 'gemini'].baseUrl),
      model: String(c.model),
      apiKey: String(c.apiKey),
    };
  } catch {
    return null;
  }
}

export function saveAIConfig(cfg) {
  const clean = {
    provider: cfg.provider === 'openai' ? 'openai' : 'gemini',
    baseUrl: String(cfg.baseUrl || '').trim(),
    model: String(cfg.model || '').trim(),
    apiKey: String(cfg.apiKey || '').trim(),
  };
  if (!clean.model || !clean.apiKey) throw new Error('모델과 API 키는 필수입니다.');
  localStorage.setItem(AI_KEY, JSON.stringify(clean));
  return clean;
}

export function aiConfigured() {
  return !!loadAIConfig();
}

/** 저수준 호출 — 텍스트 하나를 돌려준다 */
export async function aiChat(cfg, system, user, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let text = '';
    if (cfg.provider === 'openai') {
      const base = (cfg.baseUrl || AI_PROVIDERS.openai.baseUrl).replace(/\/+$/, '');
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.8,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`API ${res.status} ${await safeErr(res)}`);
      const data = await res.json();
      text = data.choices?.[0]?.message?.content || '';
    } else {
      const base = (cfg.baseUrl || AI_PROVIDERS.gemini.baseUrl).replace(/\/+$/, '');
      const res = await fetch(`${base}/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.8 },
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`API ${res.status} ${await safeErr(res)}`);
      const data = await res.json();
      text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    }
    if (!text.trim()) throw new Error('응답이 비어 있습니다.');
    return text;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('응답 시간 초과 (45초)');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function safeErr(res) {
  try {
    const j = await res.json();
    return j.error?.message || j.message || '';
  } catch {
    return '';
  }
}

// ---------- 섹션 단위 생성 ----------
const TONE_DESC = {
  feature: '기능형 — 스펙과 성능 중심의 신뢰감 있는 카피',
  empath: '공감형 — 고객 불편에 공감하고 해결을 제안하는 흐름',
  premium: '프리미엄형 — 품격·완성도·디테일을 강조하는 카피',
};

// 타입별 생성 필드 스키마 + 항목 상한
const SCHEMAS = {
  hero: { badge: '카테고리 배지 한 단어', title: ['제품명 (1~2줄 배열)'], body: ['캐치프레이즈 (1줄 배열)'] },
  problem: { kicker: '소제목 (짧게)', title: ['공감 제목 2줄 배열'], items: ['고객 불편 항목 3~4개'] },
  solution: { badge: '배지 짧은 문구', title: ['해결 선언 2줄 배열'], body: ['설명 1~2줄 배열'] },
  features: { kicker: '소제목', title: '섹션 제목', items: [{ title: '특징 제목', desc: '한 줄 설명' }] },
  gallery: { kicker: '소제목', title: '섹션 제목' },
  howto: { kicker: '소제목', title: '섹션 제목', items: [{ text: '단계명', sub: '짧은 설명' }] },
  spec: { kicker: '소제목', title: '섹션 제목', rows: [{ k: '항목명', v: '값' }] },
  packages: { kicker: '소제목', title: '섹션 제목', items: [{ name: '기본', price: '50,000원', desc: '한 줄 설명', features: ['포함 항목 2~4개'] }] },
  comparison: { kicker: '소제목', title: '섹션 제목', labelA: '기존 라벨', labelB: '이 제품 라벨', itemsA: ['기존 불편 3개'], itemsB: ['나은 점 3개'] },
  review: { kicker: '소제목', title: '섹션 제목', items: [{ name: '김OO 형식 익명', rating: '4~5 숫자', text: '한 줄 후기' }] },
  faq: { kicker: '소제목', title: '섹션 제목', items: [{ q: '질문', a: '답변 (2문장 이내)' }] },
  certification: { kicker: '소제목', title: '섹션 제목', items: [{ title: '인증·보증 제목', desc: '한 줄 설명' }] },
  notice: { kicker: '소제목', title: '섹션 제목', items: [{ title: '안내 제목', desc: '한 줄 설명' }] },
  cta: { title: ['구매 유도 문구 1~2줄 배열'], body: ['보조 문구 1줄 배열'], action: '버튼 문구 (짧게)', sub: ['신뢰 문구 1줄 배열'] },
  disclaimer: { items: ['유의사항 문장 2~4개'] },
};

const CAPS = { problem: 4, features: 6, howto: 5, spec: 12, comparison: 4, review: 3, faq: 6, certification: 4, notice: 6, disclaimer: 8 };

const SYSTEM = '너는 한국 쇼핑몰 상세페이지 전문 카피라이터다. 요청받은 JSON 스키마 그대로, 한국어로만, JSON 객체 하나만 출력한다. 코드블록·설명·주석 금지.';

/**
 * 섹션 하나의 문구를 AI로 생성해 검증된 필드 객체로 돌려준다.
 * @returns {Promise<object>} 섹션에 그대로 Object.assign 가능한 필드
 */
export async function generateSection(P, sec) {
  const schema = SCHEMAS[sec.type];
  if (!schema) throw new Error('이 섹션 타입은 AI 생성을 지원하지 않습니다.');
  const pr = P.product || {};
  const tone = (P.theme && P.theme.copyTone) || 'feature';
  const user = [
    '쇼핑몰 상세페이지의 한 섹션 문구를 작성한다.',
    `제품: ${pr.name || '(제품명 미입력)'} / 카테고리: ${pr.category || '-'} / 캐치프레이즈: ${pr.tagline || '-'}`,
    `브랜드: ${(P.brand && P.brand.name) || '-'} / 문구 톤: ${TONE_DESC[tone]}`,
    sec.aiHint ? `사용자 지시: ${sec.aiHint}` : '사용자 지시: 없음',
    '',
    `출력 필드(이 키 그대로): ${JSON.stringify(schema)}`,
    '규칙: 혜택(결과)을 먼저 말하고 기능을 나중에. 구체적인 숫자를 쓰되 임의의 허위 수치 주장 금지. 번역투·과장 금지. 각 문장은 짧게. items 배열 개수는 스키마 예시 범위를 지킨다. 후기 이름은 김OO·이OO 형식의 익명만.',
  ].join('\n');

  const text = await aiChat(loadAIConfigRequired(), SYSTEM, user);
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('응답에서 JSON을 찾지 못했습니다.');
  let parsed;
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    throw new Error('응답 JSON 해석에 실패했습니다. 다시 만들기를 시도해 주세요.');
  }
  return sanitizeSection(sec.type, parsed);
}

function loadAIConfigRequired() {
  const cfg = loadAIConfig();
  if (!cfg) throw new Error('AI 설정이 없습니다. AI 설정에서 키를 저장해 주세요.');
  return cfg;
}

// AI 응답을 섹션 필드로 안전하게 변환 (렌더러가 기대하는 형태로 강제)
function sanitizeSection(type, raw) {
  const out = {};
  const lines = (v, max = 3) => {
    if (typeof v === 'string') return v.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, max);
    if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, max);
    return [];
  };
  const s1 = (v) => (typeof v === 'string' ? v.trim() : '');
  const cap = CAPS[type] || 6;

  if (typeof raw.kicker === 'string') out.kicker = s1(raw.kicker);
  if (typeof raw.badge === 'string') out.badge = s1(raw.badge);
  if (raw.title !== undefined) out.title = lines(raw.title, type === 'cta' || type === 'hero' ? 2 : 2);
  if (raw.body !== undefined) out.body = lines(raw.body, 3);
  if (typeof raw.action === 'string') out.action = s1(raw.action);
  if (raw.sub !== undefined) out.sub = lines(raw.sub, 2);

  if (Array.isArray(raw.items)) {
    out.items = raw.items.slice(0, cap).map((it) => {
      if (typeof it === 'string') {
        if (type === 'problem' || type === 'disclaimer') return it.trim();
        if (type === 'howto') return { text: it.trim(), sub: '' };
        return { title: it.trim(), desc: '' };
      }
      const o = {};
      if (type === 'problem') return s1(it.text || it.item || '');
      if (type === 'howto') return { text: s1(it.text || it.title), sub: s1(it.sub || it.desc) };
      if (type === 'review') return { name: s1(it.name) || '김OO', rating: Math.min(5, Math.max(1, parseInt(it.rating, 10) || 5)), text: s1(it.text) };
      if (type === 'faq') return { q: s1(it.q || it.title), a: s1(it.a || it.desc) };
      if (type === 'spec') return { k: s1(it.k || it.title), v: s1(it.v || it.desc) };
      if (type === 'packages') {
        let features = [];
        if (Array.isArray(it.features)) features = it.features.map((x) => s1(x)).filter(Boolean);
        else if (typeof it.features === 'string' && it.features.trim()) features = it.features.split(',').map((x) => x.trim()).filter(Boolean);
        return { name: s1(it.name || it.title), price: s1(it.price), desc: s1(it.desc), features: features.slice(0, 5) };
      }
      return { title: s1(it.title || it.text), desc: s1(it.desc || it.sub) };
    }).filter(Boolean).filter((it) => (typeof it === 'string' ? it : (it.title || it.text || it.q || it.k || it.name)));
    if (type === 'problem' || type === 'disclaimer') out.items = out.items.filter((x) => typeof x === 'string');
  }
  if (type === 'comparison') {
    out.labelA = s1(raw.labelA) || '기존 제품';
    out.labelB = s1(raw.labelB) || '이 제품';
    out.itemsA = lines(raw.itemsA, CAPS.comparison);
    out.itemsB = lines(raw.itemsB, CAPS.comparison);
    delete out.items; // AI가 items를 넣어버린 경우 제거
  }
  return out;
}
