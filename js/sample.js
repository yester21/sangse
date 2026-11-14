// sample.js — 데모용 샘플 프로젝트 (새 사용자 최초 진입 시 로드)
// 제품 샘플: 무선 미니 블렌더 / 서비스 샘플: 쇼핑몰 상세페이지 제작 대행
import { buildDraft, blankSection } from './sections.js';

const SAMPLE_PRODUCT = {
  name: '무선 미니 블렌더 포드믹스',
  category: '주방가전',
  tagline: '컵째로 블렌딩하고, 뚜껑 열어 한 모금 — 30초면 완성',
  features: [
    '6날 스테인리스 블레이드|얼음도 가는 25,000rpm 분쇄력',
    '350ml 트리툼 컵|컵이 그대로 텀블러, 뚜껑 끼우고 바로 이동',
    'USB-C 무선 충전|1회 충전으로 약 15회 블렌딩',
    '원터치 30초|버튼 2회 연속 누르면 자동으로 30초 작동',
  ],
  steps: [
    '재료 넣기|과일·우유·얼음을 컵 2/3 아래까지',
    '컵 결합|뚜껑(블레이드 뚜껑)을 시계 방향으로 잠금',
    '블렌딩|본체를 뒤집어 버튼 2회 연타 — 30초 자동',
    '바로 마시기|본체만 분리하고 뚜껑 교체 후 이동',
  ],
  specs: [
    '구성품|본체, 컵 350ml, 블레이드 뚜껑, 이동용 뚜껑, 브러시, USB-C 케이블',
    '용량|350 ml (실사용 300 ml)',
    '모터|25,000 rpm / 45 W',
    '배터리|4,000 mAh (약 15회 블렌딩)',
    '크기|105 × 105 × 225 mm',
    '무게|본체 190 g + 컵 130 g',
    '충전|USB-C, 약 2시간 30분',
  ],
  reviews: [
    '정하린|5|아침마다 스무디 만드는데 설거지 거의 없어서 좋아요. 얼음도 잘 갈립니다.',
    '오세훈|5|헬스장 다닐 때 들고 다니는데 진짜 실용적이에요. 냄새도 안 배어요.',
    '유지민|4|부드러운 스무디는 완벽한데 아이스박스 좀 남아요. 그래도 만족합니다.',
  ],
  faqs: [
    '뜨거운 음료도 가능한가요?|고온 액체는 사용하지 마세요. 60℃ 이하의 미지근한 액체만 가능합니다.',
    '분쇄가 안 될 때는?|재료를 너무 꽉 채우지 말고(2/3 이하) 액체를 먼저 넣어 주세요.',
    '세척은 어떻게 하나요?|컵에 물과 세제를 넣고 버튼을 눌러 자동 세척 후 헹구면 끝납니다.',
  ],
  notices: [
    '배송|영업일 오후 2시 이전 주문 시 당일 발송',
    '교환·반품|수령 후 7일 이내, 미사용 상품에 한함',
    'A/S|구매일로부터 1년 무상 보증',
  ],
  warnings: [
    '본 상세페이지의 이미지는 실제 제품과 다소 차이가 있을 수 있습니다.',
    '뜨거운 액체·탄산음료·건조 재료 장시간 분쇄는 제품 손상의 원인이 됩니다.',
    '본체 충전 중에는 블렌딩을 사용할 수 없습니다.',
  ],
};

export function sampleProject() {
  const sections = buildDraft(SAMPLE_PRODUCT, 'empath', '포드믹스');

  // 사용법 뒤에 갤러리·비교 섹션을 끼워 넣어 풀 구성 시연
  const gallery = { ...blankSection('gallery'), kicker: 'GALLERY', title: '이렇게 활용됩니다', images: [null, null, null, null] };
  const compare = { ...blankSection('comparison'), kicker: 'BEFORE · AFTER', title: '아침이 이렇게 달라집니다' };
  const howtoIdx = sections.findIndex((s) => s.type === 'howto');
  const at = howtoIdx >= 0 ? howtoIdx + 1 : sections.length - 1;
  sections.splice(at, 0, gallery, compare);

  return {
    version: 1,
    title: '무선 미니 블렌더 상세페이지',
    brand: { name: '포드믹스', logo: null },
    product: { ...SAMPLE_PRODUCT },
    theme: { accent: '#0071e3', fonts: { title: 'gmarket', body: 'gmarket', aux: 'gmarket' } },
    width: 1000,
    sections,
  };
}

// 빈 상품 정보로 시작할 때의 초기 프로젝트
export function emptyProject() {
  return {
    version: 1,
    title: '새 상세페이지',
    type: 'product',
    brand: { name: '', logo: null },
    product: {
      name: '', category: '', tagline: '',
      features: [], steps: [], specs: [], packages: [], certifications: [], reviews: [], faqs: [], notices: [], warnings: [],
    },
    theme: { accent: '#0071e3', fonts: { title: 'gmarket', body: 'gmarket', aux: 'gmarket' }, copyTone: 'feature' },
    width: 1000,
    sections: [blankSection('hero')],
  };
}

// 서비스(무형상품) 샘플 — 크몽 관습: 패키지 3단 · 진행 프로세스 · 포함 내역 · 자격·경력
export function sampleServiceProject() {
  const product = {
    name: '쇼핑몰 상세페이지 제작',
    category: '디자인',
    tagline: '전환율을 노린 구성, 3영업일 내 납품',
    features: [
      '판매 유도 구성|히어로→공감→해결→증거 표준 흐름으로 전환율 설계',
      '모바일 최적화|네이버·쿠팡 규격(860/1000px) 그대로 납품',
      '카피 전문|특징 나열이 아닌 구매 이유를 만드는 문구',
      '수정 3회|납품 후 2주 이내 자유 수정',
    ],
    steps: [
      '히어링|제품·타깃·경쟁 정보 수집',
      '구성|판매 흐름에 맞춘 섹션 설계',
      '제작|카피·디자인 시안 1차 전달',
      '납품|수정 반영 후 최종 파일·이미지 전달',
    ],
    specs: [
      '낡품 파일|PNG(섹션별·전체), 편집용 원본 선택 가능',
      '제작 기간|3~5영업일 (급행 별도 협의)',
      '규격|네이버 860px / 쿠팡 1000px / 직접 지정',
      '수정|납품 후 2주 이내 3회',
    ],
    packages: [
      '기본|150,000원|8개 섹션 표준 구성|히어로,특징,사용법,스펙,CTA',
      '표준|280,000원|가장 많이 선택|12개 섹션,리뷰·FAQ 포함,수정 3회',
      '프리미엄|450,000원|이미지·카피 올인원|15개 섹션,카디션 카피,후기 정리,수정 5회',
    ],
    certifications: [
      '올해의 디자인 대상|이커머스 부문 수상',
      '누적 제작 200건 이상|쇼핑몰 상세페이지 전문',
    ],
    reviews: [
      '김OO|5|구성이 판매 로직이라 그런지 바로 주문이 붙었어요. 재의뢰합니다.',
      '박OO|5|수정 요청을 정리해서 주니 한 번에 반영해 주셨어요.',
      '이OO|4|일정보다 하루 늦게 받았지만 퀄리티는 만족합니다.',
    ],
    faqs: [
      '이미지는 어떻게 하나요?|제품 사진을 받아 보정·보완해 사용합니다. 촬영이 필요하면 별도 협의됩니다.',
      '몇 개 섹션으로 구성되나요?|패키지별 8~15개이며 제품 특성에 따라 조정됩니다.',
      '수정은 어떤 범위인가요?|카피·레이아웃 조정은 포함이며, 신규 섹션 추가는 별도 견적입니다.',
    ],
    notices: [
      '수정 및 재진행|패키지별 제공 횟수 내 무료',
      '취소 및 환불|작업 시작 전 100% 환불',
      '상담 시간|평일 10:00~19:00',
    ],
    warnings: [
      '작업 범위는 패키지 및 사전 협의 내용에 따릅니다.',
      '표시된 가격은 최소 금액이며 분량에 따라 달라질 수 있습니다.',
      '제공받은 자료·이미지의 저작권은 의뢰인에게 있습니다.',
    ],
  };

  return {
    version: 1,
    title: '상세페이지 제작 서비스 상세페이지',
    type: 'service',
    brand: { name: '페이지랩', logo: null },
    product,
    theme: { accent: '#5e5ce6', fonts: { title: 'gmarket', body: 'gmarket', aux: 'gmarket' }, copyTone: 'premium' },
    width: 1000,
    sections: buildDraft(product, 'premium', '페이지랩', 'service'),
  };
}
