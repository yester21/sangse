// sections.js — 섹션 타입 카탈로그 14종 · 문구 톤 프리셋 · 규칙 기반 초안 생성기
// "입력은 사람 / 구조는 코드": 상품 정보(product)를 채우면 상세페이지 표준 구성 순서로
// 섹션 초안을 자동 배치한다. 콘텐츠 소유는 각 섹션이 갖는다(cardnews 카드 모델 계승).

import { uid } from './util.js';

export const SECTION_TYPES = [
  { id: 'hero',         name: '메인 비주얼',   desc: '대표 이미지 + 제품명·캐치프레이즈 (첫 섹션)' },
  { id: 'problem',      name: '공감',          desc: '고객이 겪는 불편을 짚는 섹션' },
  { id: 'solution',     name: '해결 제시',     desc: '이 제품이 답이라는 한마디' },
  { id: 'features',     name: '핵심 특징',     desc: '특징 카드 그리드 (2열)' },
  { id: 'gallery',      name: '갤러리',        desc: '상세 컷 2×2 이미지 그리드' },
  { id: 'howto',        name: '사용 방법',     desc: '번호가 붙은 사용 순서' },
  { id: 'spec',         name: '스펙 · 구성',   desc: '키-값 표 형태 제품 정보' },
  { id: 'packages',     name: '패키지 · 가격', desc: '기본/표준/프리미엄 3열 가격표 (서비스 필수)' },
  { id: 'comparison',   name: '전 · 후 비교',  desc: 'BEFORE / AFTER 두 패널' },
  { id: 'review',       name: '고객 후기',     desc: '별점 · 후기 카드' },
  { id: 'faq',          name: '자주 묻는 질문', desc: 'Q&A 목록' },
  { id: 'certification',name: '인증 · 보증',   desc: '인증서·품질보증 목록' },
  { id: 'notice',       name: '배송 · 교환 안내', desc: '안내 항목 목록' },
  { id: 'cta',          name: '구매 유도',     desc: '다크 마무리 + 버튼 문구' },
  { id: 'disclaimer',   name: '유의사항',      desc: '소문자 주의 문구 마무리' },
];

export const TYPE_NAME = Object.fromEntries(SECTION_TYPES.map((t) => [t.id, t.name]));

// 섹션별 자동 배경 톤 (tone:'auto'일 때 적용)
export const AUTO_TONE = {
  hero: 'wash', problem: 'gray', solution: 'white', features: 'gray',
  gallery: 'white', howto: 'gray', spec: 'white', packages: 'gray', comparison: 'white',
  review: 'gray', faq: 'white', certification: 'gray', notice: 'white',
  cta: 'dark', disclaimer: 'gray',
};

// ---------- 문구 톤 프리셋 (섹션 추가·초안 생성 시 기본 카피) ----------
export const TONES = {
  empath: {
    name: '공감형',
    problem: {
      kicker: '혹시 이런 경험 없으신가요?',
      title: ['매일 쓰는데', '매번 불편했던 것'],
      items: ['쓰다 만 지저분함', '한 번 쓰면 손이 안 가는 귀찮음', '기대보다 성능이 아쉬웠던 경험', '비싼 건 부담, 싼 건 불안'],
    },
    solutionBadge: '그래서 만들었습니다',
    ctaAction: '지금 편해지기',
  },
  feature: {
    name: '기능형',
    problem: {
      kicker: 'CHECK',
      title: ['제품 고를 때', '이것만은 꼭 보세요'],
      items: ['성능의 기준이 명확한가', '안전 인증을 받았는가', '사용 방법이 간단한가', '사후 관리가 되는가'],
    },
    solutionBadge: '핵심 스펙 요약',
    ctaAction: '스펙 자세히 보기',
  },
  premium: {
    name: '프리미엄형',
    problem: {
      kicker: 'PREMIUM QUALITY',
      title: ['매일의 만족을', '바꾸는 선택'],
      items: ['감각적인 디테일', '검증된 소재와 마감', '오래 쓸수록 빛나는 품질', '선물하기에도 좋은 완성도'],
    },
    solutionBadge: '프리미엄의 기준',
    ctaAction: '프리미엄을 경험하기',
  },
};

// ---------- 빈 섹션 ----------
export function blankSection(type = 'hero', toneKey = 'feature') {
  const tone = TONES[toneKey] || TONES.feature;
  const s = {
    id: uid(),
    type,
    tone: 'auto',
    // 배경 (옵트인 — "배경 사용하기"를 켜면 아래 프리셋이 기본 선택된 상태로 시작)
    bgOn: false,        // 배경 사용 여부
    bgKind: 'image',    // image(사진+스크림) | shape(모형배경)
    bg: null,           // 배경 이미지 {src,w,h}|null (bgKind='image')
    bgDim: 'd3',        // 5단계: d1(아주 밝게)~d5(아주 어둡게) / 모형은 장식 진하기
    bgGrad: true,       // 배경 그라데이션 사용 여부
    bgShape: 'rings',   // 모형배경 모양: rings | dots | stripes
    // 섹션 단위 AI
    ai: false,          // AI가 만들기 (직접 만들기=false)
    aiMade: false,      // AI 생성을 한 번이라도 실행했는지 (다시 만들기 버튼 라벨용)
    aiHint: '',         // AI 한 줄 지시
  };
  switch (type) {
    case 'hero':
      Object.assign(s, { media: null, badge: '', title: ['제품명을 넣어주세요'], body: ['한 줄 캐치프레이즈'] });
      break;
    case 'problem':
      Object.assign(s, {
        kicker: tone.problem.kicker,
        title: [...tone.problem.title],
        items: [...tone.problem.items],
      });
      break;
    case 'solution':
      Object.assign(s, {
        badge: tone.solutionBadge,
        title: ['제품명이', '바꿔드립니다'],
        body: ['핵심 효과를 한 문장으로 적어주세요.'],
        media: null,
      });
      break;
    case 'features':
      Object.assign(s, {
        kicker: 'KEY FEATURES',
        title: '핵심 특징',
        items: [
          { title: '특징 1', desc: '고객이 얻는 이점으로 적어주세요' },
          { title: '특징 2', desc: '고객이 얻는 이점으로 적어주세요' },
          { title: '특징 3', desc: '고객이 얻는 이점으로 적어주세요' },
          { title: '특징 4', desc: '고객이 얻는 이점으로 적어주세요' },
        ],
      });
      break;
    case 'gallery':
      Object.assign(s, { kicker: 'GALLERY', title: '상세 컷', images: [null, null, null, null] });
      break;
    case 'howto':
      Object.assign(s, {
        kicker: 'HOW TO USE',
        title: '이렇게 사용하세요',
        items: [
          { text: '준비', sub: '간단한 사용 전 준비' },
          { text: '사용', sub: '핵심 사용 방법' },
          { text: '마무리', sub: '보관·청소 방법' },
        ],
      });
      break;
    case 'spec':
      Object.assign(s, {
        kicker: 'PRODUCT INFO',
        title: '제품 구성 · 스펙',
        rows: [
          { k: '구성품', v: '본체, 구성품을 적어주세요' },
          { k: '크기', v: '가로 × 세로 × 높이' },
          { k: '무게', v: '000g' },
          { k: '재질', v: '소재를 적어주세요' },
        ],
      });
      break;
    case 'packages':
      Object.assign(s, {
        kicker: 'PACKAGE',
        title: '패키지 · 가격',
        items: [
          { name: '기본', price: '50,000원', desc: '기본 작업 범위', features: ['핵심 작업 1종', '결과물 파일 납품'], highlight: false },
          { name: '표준', price: '150,000원', desc: '가장 많이 선택', features: ['기본 패키지 전부', '수정 3회', '원본 파일 납품'], highlight: true },
          { name: '프리미엄', price: '320,000원', desc: '올인원 패키지', features: ['표준 패키지 전부', '무제한 수정', '사후 관리 포함'], highlight: false },
        ],
      });
      break;
    case 'comparison':
      Object.assign(s, {
        kicker: 'BEFORE · AFTER',
        title: '이렇게 달라집니다',
        labelA: '기존 제품', labelB: '이 제품',
        itemsA: ['불편했던 점 1', '불편했던 점 2', '불편했던 점 3'],
        itemsB: ['나아진 점 1', '나아진 점 2', '나아진 점 3'],
      });
      break;
    case 'review':
      Object.assign(s, {
        kicker: 'REVIEW',
        title: '고객 후기',
        items: [
          { name: '김OO', rating: 5, text: '생각보다 훨씬 좋아요. 재구매 의사 있습니다.' },
          { name: '이OO', rating: 5, text: '배송 빠르고 만족스러워요.' },
          { name: '박OO', rating: 4, text: '가성비 좋은 선택이었어요.' },
        ],
      });
      break;
    case 'faq':
      Object.assign(s, {
        kicker: 'FAQ',
        title: '자주 묻는 질문',
        items: [
          { q: '배송은 얼마나 걸리나요?', a: '영업일 기준 1~3일 내에 발송됩니다.' },
          { q: '교환·반품은 가능한가요?', a: '수령 후 7일 이내, 미사용 상품에 한해 가능합니다.' },
        ],
      });
      break;
    case 'certification':
      Object.assign(s, {
        kicker: 'CERTIFIED',
        title: '인증 · 품질 보증',
        items: [
          { title: '안전 인증', desc: 'KC 인증을 받은 제품입니다' },
          { title: '품질 보증', desc: '구매일로부터 1년 A/S 보증' },
        ],
      });
      break;
    case 'notice':
      Object.assign(s, {
        kicker: 'NOTICE',
        title: '배송 · 교환 안내',
        items: [
          { title: '배송', desc: '평일 오후 2시 이전 주문 시 당일 발송' },
          { title: '교환·반품', desc: '수령 후 7일 이내, 미개봉 상품에 한함' },
          { title: 'A/S', desc: '고객센터를 통해 접수해 주세요' },
        ],
      });
      break;
    case 'cta':
      Object.assign(s, {
        title: ['지금, 바로 만나보세요'],
        body: ['오늘 주문하면 내일 도착'],
        action: tone.ctaAction,
        sub: ['무료배송 · 안전결제 · 빠른 배송'],
      });
      break;
    case 'disclaimer':
      Object.assign(s, {
        items: [
          '본 상세페이지의 이미지는 실제 제품과 다소 차이가 있을 수 있습니다.',
          '제품 색상은 모니터 환경에 따라 다르게 보일 수 있습니다.',
          '사이즈는 측정 방법에 따라 1~3cm의 오차가 있을 수 있습니다.',
        ],
      });
      break;
  }
  return s;
}

// ---------- 상품 정보 → 규칙 기반 초안 생성 ----------
// product는 app의 상품 정보 모달에 입력된 문자열 묶음. "제목|설명" 구분자를 파싱한다.
export function parsePair(line) {
  const i = line.indexOf('|');
  if (i < 0) return { a: line.trim(), b: '' };
  return { a: line.slice(0, i).trim(), b: line.slice(i + 1).trim() };
}

// 상세페이지 표준 구성 순서.
// 제품: 히어로 → 공감 → 해결 → 특징 → 사용법 → 스펙 → 비교 → 후기 → FAQ → 인증 → 안내 → CTA → 유의사항
// 서비스(무형상품, 크몽 관습): 히어로 → 타깃 → 서비스 소개 → 강점 → 진행 프로세스 → 패키지 가격 → 포함 내역 → 작업물 샘플 → 후기 → FAQ → 자격·경력 → 진행·환불 안내 → CTA → 유의사항
export function buildDraft(product, toneKey = 'feature', brandName = '', pageType = 'product') {
  if (pageType === 'service') return buildServiceDraft(product, toneKey, brandName);
  const tone = TONES[toneKey] || TONES.feature;
  const p = product || {};
  const name = (p.name || '').trim() || '제품명';
  const secs = [];
  const push = (type, fields) => secs.push({ ...blankSection(type, toneKey), ...fields });

  // 1) 메인 비주얼
  push('hero', {
    badge: (p.category || '').trim(),
    title: splitTwo(name),
    body: (p.tagline || '').trim() ? [(p.tagline || '').trim()] : [],
  });

  // 2) 공감
  push('problem', { ...tone.problem });

  // 3) 해결 제시
  push('solution', {
    badge: tone.solutionBadge,
    title: splitTwo(name + '로' + ' 해결하세요'),
    body: (p.tagline || '').trim() ? [(p.tagline || '').trim()] : ['이 제품 하나로 불편함을 정리하세요.'],
  });

  // 4) 핵심 특징 (특징 줄: "제목|설명" 또는 한 줄)
  const feats = lines(p.features);
  if (feats.length) {
    push('features', {
      title: '핵심 특징',
      items: feats.slice(0, 6).map((l, i) => {
        const { a, b } = parsePair(l);
        return { title: a || `특징 ${i + 1}`, desc: b || '' };
      }),
    });
  }

  // 5) 사용 방법
  const steps = lines(p.steps);
  if (steps.length) {
    push('howto', {
      items: steps.slice(0, 5).map((l) => {
        const { a, b } = parsePair(l);
        return { text: a, sub: b };
      }),
    });
  }

  // 6) 스펙
  const specs = lines(p.specs);
  if (specs.length) {
    push('spec', {
      title: '제품 구성 · 스펙',
      rows: specs.slice(0, 12).map((l) => {
        const { a, b } = parsePair(l);
        return { k: a, v: b };
      }),
    });
  }

  // 7) 고객 후기
  const reviews = lines(p.reviews);
  if (reviews.length) {
    push('review', {
      items: reviews.slice(0, 3).map((l) => {
        const parts = l.split('|');
        const rating = Math.min(5, Math.max(0, parseInt(parts[1], 10) || 5));
        return { name: (parts[0] || '구매자').trim(), rating, text: (parts[2] || '').trim() };
      }),
    });
  }

  // 8) FAQ
  const faqs = lines(p.faqs);
  if (faqs.length) {
    push('faq', {
      items: faqs.slice(0, 6).map((l) => {
        const { a, b } = parsePair(l);
        return { q: a, a: b };
      }),
    });
  }

  // 9) 배송 · 교환 안내 (비었으면 기본 문구)
  const notices = lines(p.notices);
  push('notice', {
    items: (notices.length ? notices : ['배송|영업일 1~3일 내 발송', '교환·반품|수령 후 7일 이내, 미사용 상품', 'A/S|고객센터를 통해 접수'])
      .slice(0, 6)
      .map((l) => {
        const { a, b } = parsePair(l);
        return { title: a, desc: b };
      }),
  });

  // 10) 구매 유도
  push('cta', {
    title: splitTwo(`${name} 지금 만나보세요`),
    body: (p.tagline || '').trim() ? [(p.tagline || '').trim()] : [],
  });

  // 11) 유의사항
  const warns = lines(p.warnings);
  push('disclaimer', {
    items: (warns.length ? warns : blankSection('disclaimer').items).slice(0, 8),
  });

  return secs;
}

// 서비스(무형상품) 초안 — 크몽 상세페이지 관습 계승:
// 패키지 3단 가격표 · 진행 프로세스 체인 · 포함 내역 · 자격·경력 · 진행/환불 안내
function buildServiceDraft(product, toneKey, brandName) {
  const p = product || {};
  const name = (p.name || '').trim() || '서비스명';
  const secs = [];
  const push = (type, fields) => secs.push({ ...blankSection(type, toneKey), ...fields });

  push('hero', {
    badge: (p.category || '').trim() || 'SERVICE',
    title: splitTwo(name),
    body: (p.tagline || '').trim() ? [(p.tagline || '').trim()] : [],
  });

  // 타깃 ("이런 분께 딱이에요")
  const targets = lines(p.features).length
    ? lines(p.features).map((l) => parsePair(l).a)
    : ['이번에 딱 한 번만 필요한 분', '품질과 속도를 동시에 원하는 분', '소통이 편한 전문가를 찾는 분', '예산 안에서 확실한 결과를 원하는 분'];
  push('problem', {
    kicker: '이런 분께 딱이에요',
    title: ['찾고 계셨다면', '바로 이 서비스입니다'],
    items: targets.slice(0, 4),
  });

  // 서비스 소개
  push('solution', {
    badge: '서비스 소개',
    title: splitTwo(`${name}로 해결하세요`),
    body: (p.tagline || '').trim() ? [(p.tagline || '').trim()] : ['진행 상황을 계속 공유드려요.'],
  });

  // 서비스 강점
  const feats = lines(p.features);
  if (feats.length) {
    push('features', {
      title: '서비스 강점',
      items: feats.slice(0, 6).map((l, i) => {
        const { a, b } = parsePair(l);
        return { title: a || `강점 ${i + 1}`, desc: b || '' };
      }),
    });
  }

  // 진행 프로세스 (문의 → 히어링 → 작업 → 수정 → 납품)
  const steps = lines(p.steps);
  push('howto', {
    kicker: 'PROCESS',
    title: '진행 프로세스',
    items: (steps.length ? steps : ['문의|원하는 방향과 일정 공유', '히어링|요구사항 정리 및 일정 확정', '작업|시안·중간 결과 공유', '수정|피드백 반영', '납품|최종 결과물 전달'])
      .slice(0, 5)
      .map((l) => {
        const { a, b } = parsePair(l);
        return { text: a, sub: b };
      }),
  });

  // 패키지 · 가격 (크몽 3단: 기본/표준/프리미엄)
  const pkgs = lines(p.packages);
  push('packages', {
    items: (pkgs.length ? pkgs : ['기본|00,000원|기본 작업 범위|핵심 작업 1종,결과물 파일 납품', '표준|00,000원|가장 많이 선택|기본 전부,수정 3회,원본 파일', '프리미엄|00,000원|올인원|표준 전부,무제한 수정,사후 관리'])
      .slice(0, 3)
      .map((l) => {
        const parts = l.split('|').map((x) => x.trim());
        return {
          name: parts[0] || '기본',
          price: parts[1] || '00,000원',
          desc: parts[2] || '',
          features: (parts[3] || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 5),
          highlight: false,
        };
      }),
  });
  if (secs[secs.length - 1].items[1]) secs[secs.length - 1].items[1].highlight = true; // 표준 강조

  // 포함 내역
  const specs = lines(p.specs);
  if (specs.length) {
    push('spec', {
      kicker: 'INCLUDED',
      title: '포함 내역',
      rows: specs.slice(0, 12).map((l) => {
        const { a, b } = parsePair(l);
        return { k: a, v: b };
      }),
    });
  }

  // 작업물 샘플 · 포트폴리오
  push('gallery', { kicker: 'PORTFOLIO', title: '작업물 샘플' });

  // 후기
  const reviews = lines(p.reviews);
  if (reviews.length) {
    push('review', {
      items: reviews.slice(0, 3).map((l) => {
        const parts = l.split('|');
        const rating = Math.min(5, Math.max(0, parseInt(parts[1], 10) || 5));
        return { name: (parts[0] || '구매자').trim(), rating, text: (parts[2] || '').trim() };
      }),
    });
  }

  // FAQ (서비스 관습 질문 기본 제공)
  const faqs = lines(p.faqs);
  push('faq', {
    items: (faqs.length ? faqs : ['작업 과정은 어떻게 되나요?|문의 후 히어링 → 작업 → 수정 → 납품 순으로 진행됩니다.', '수정은 몇 번 가능한가요?|패키지별로 정해져 있으며, 프리미엄은 무제한입니다.', '납기는 얼마나 걸리나요?|기본 1~3일, 분량에 따라 협의 가능합니다.', '소통은 어떻게 진행되나요?|채팅으로 상시 공유드립니다.'])
      .slice(0, 6)
      .map((l) => {
        const { a, b } = parsePair(l);
        return { q: a, a: b };
      }),
  });

  // 자격 · 경력
  const certs = lines(p.certifications);
  if (certs.length) {
    push('certification', {
      kicker: 'EXPERT',
      title: '자격 · 경력',
      items: certs.slice(0, 4).map((l) => {
        const { a, b } = parsePair(l);
        return { title: a, desc: b };
      }),
    });
  }

  // 진행 · 환불 안내 (서비스 관습: 수정 범위 · 취소/환불 · 소통 시간)
  const notices = lines(p.notices);
  push('notice', {
    kicker: 'NOTICE',
    title: '진행 · 환불 안내',
    items: (notices.length ? notices : ['수정 및 재진행|패키지별 제공 횟수 내 무료', '취소 및 환불|작업 시작 전 100% 환불', '상담 시간|평일 10:00~19:00'])
      .slice(0, 6)
      .map((l) => {
        const { a, b } = parsePair(l);
        return { title: a, desc: b };
      }),
  });

  // 주문 유도
  push('cta', {
    title: splitTwo(`지금 ${name} 시작하세요`),
    body: (p.tagline || '').trim() ? [(p.tagline || '').trim()] : [],
    action: '지금 문의하기',
  });

  // 유의사항
  const warns = lines(p.warnings);
  push('disclaimer', {
    items: (warns.length ? warns : ['작업 범위는 패키지 및 사전 협의 내용에 따릅니다.', '표시된 가격은 최소 금액이며 분량에 따라 달라질 수 있습니다.', '제공받은 자료·이미지의 저작권은 의뢰인에게 있습니다.']).slice(0, 8),
  });

  return secs;
}

function splitTwo(text, max = 22) {  const t = (text || '').trim();
  if (t.length <= max) return [t];
  // 공백 기준 2줄 분할, 그래도 길면 잘라 2줄
  const mid = Math.floor(t.length / 2);
  let a = t.lastIndexOf(' ', mid);
  let b = t.indexOf(' ', mid);
  if (a < 0 && b < 0) return [t.slice(0, max), t.slice(max)];
  const cut = a >= 0 && (b < 0 || mid - a <= b - mid) ? a : b;
  if (cut < 0) return [t.slice(0, max), t.slice(max)];
  return [t.slice(0, cut).trim(), t.slice(cut).trim()].filter(Boolean);
}

function lines(v) {
  if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean);
  if (typeof v === 'string') return v.split('\n').map((x) => x.trim()).filter(Boolean);
  return [];
}
