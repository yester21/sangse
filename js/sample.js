// sample.js — 데모용 샘플 프로젝트 (새 사용자 최초 진입 시 로드)
import { buildDraft, blankSection } from './sections.js';

const SAMPLE_PRODUCT = {
  name: '포켓 미니 청소기 에어리',
  category: '생활가전',
  tagline: '한 손에 쏙, 데스크 위 먼지는 3초면 끝',
  features: [
    '3초 강력 흡입|과자 부스러기도 한 번에 빨아들이는 8kPa 흡입력',
    '160g 초경량|커피보다 가벼운 무게로 한 손에 들어옵니다',
    'USB-C 충전|2시간 충전으로 3주 사용',
    '세척 간편|투명 먼지통 분리 후 물세척',
  ],
  steps: [
    '먼지통 확인|투명 커버로 잔량을 바로 확인하세요',
    '전원 ON|버튼을 2초 길게 누르면 강력 모드',
    '틈새 청소|노즐을 끼워 키보드 틈도 청소',
    '물세척|먼지통을 분리해 흐르는 물에 세척',
  ],
  specs: [
    '구성품|본체, 노즐 2종, 브러시, USB-C 케이블',
    '크기|168 × 96 × 52 mm',
    '무게|160 g',
    '흡입력|최대 8kPa',
    '배터리|2,000 mAh (연속 25분)',
    '충전|USB-C, 약 2시간',
  ],
  reviews: [
    '김서연|5|기대 이상이에요. 책상 위 부스러기가 정말 3초 만에 사라집니다.',
    '박지훈|5|차 안에 두고 쓰는데 자석처럼 손이 갑니다. 가벼워요.',
    '이수진|4|소음이 생각보다 있지만 성능은 만족합니다.',
  ],
  faqs: [
    '배송은 얼마나 걸리나요?|영업일 기준 1~3일 내에 발송됩니다.',
    '필터는 교체해야 하나요?|헤파 필터는 물세척 후 반영구 사용 가능합니다.',
    '충전기는 별도인가요?|USB-C 케이블이 포함되어 있어 스마트폰 충전기로 충전됩니다.',
  ],
  notices: [
    '배송|영업일 오후 2시 이전 주문 시 당일 발송',
    '교환·반품|수령 후 7일 이내, 미사용 상품에 한함',
    'A/S|구매일로부터 1년 무상 보증',
  ],
  warnings: [
    '본 상세페이지의 이미지는 실제 제품과 다소 차이가 있을 수 있습니다.',
    '제품 색상은 모니터 환경에 따라 다르게 보일 수 있습니다.',
    '사이즈는 측정 방법에 따라 1~3cm의 오차가 있을 수 있습니다.',
  ],
};

export function sampleProject() {
  const sections = buildDraft(SAMPLE_PRODUCT, 'feature', '에어리랩');

  // 사용법 뒤에 갤러리·비교 섹션을 끼워 넣어 풀 구성 시연
  const gallery = { ...blankSection('gallery'), kicker: 'GALLERY', title: '이렇게 쓰입니다', images: [null, null, null, null] };
  const compare = { ...blankSection('comparison'), kicker: 'BEFORE · AFTER', title: '청소가 이렇게 달라집니다' };
  const howtoIdx = sections.findIndex((s) => s.type === 'howto');
  const at = howtoIdx >= 0 ? howtoIdx + 1 : sections.length - 1;
  sections.splice(at, 0, gallery, compare);

  return {
    version: 1,
    title: '포켓 미니 청소기 상세페이지',
    brand: { name: '에어리랩', logo: null },
    product: { ...SAMPLE_PRODUCT },
    theme: { accent: '#0071e3', font: 'gmarket' },
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
    theme: { accent: '#0071e3', font: 'gmarket', copyTone: 'feature' },
    width: 1000,
    sections: [blankSection('hero')],
  };
}

// 서비스(무형상품) 샘플 — 크몽 관습: 패키지 3단 · 진행 프로세스 · 포함 내역 · 자격·경력
export function sampleServiceProject() {
  const product = {
    name: '브랜드 로고 · BI 디자인',
    category: '디자인',
    tagline: '당일 시안, 만족할 때까지 수정',
    features: [
      '당일 시안|오후 문의 시 당일 시안 제안',
      '무제한 수정|프리미엄 한정, 만족할 때까지',
      '원본 파일|AI·SVG·PNG 전부 납품',
      '상위 2% 전문가|크몽 PRIME 공식 인증',
    ],
    steps: [
      '문의|브랜드와 방향을 공유',
      '시안|1~3안 제안',
      '수정|피드백 반영',
      '납품|원본 파일 전달',
    ],
    specs: [
      '납품 파일|AI·SVG·PNG·JPG 전부',
      '제작 기간|1~3일 (당일 가능)',
      '소통|채팅 상시 공유',
      '수정|패키지별 상이',
    ],
    packages: [
      '기본|50,000원|텍스트 로고 1안|로고 1안,PNG·JPG 납품',
      '표준|150,000원|가장 많이 선택|로고 3안,수정 3회,원본 파일(AI·SVG)',
      '프리미엄|320,000원|브랜드 올인원|로고 5안,무제한 수정,명함·서식 적용',
    ],
    certifications: [
      '컬러리스트 국가자격|산업기사 취득',
      '크몽 어워즈 3년 연속 수상|디자인 부문',
    ],
    reviews: [
      '김OO|5|하루 만에 시안이 나왔어요. 방향 잡기 너무 좋았습니다.',
      '박OO|5|수정도 빠르고 친절해요. 원본까지 받아서 만족합니다.',
      '이OO|4|가성비 최고예요. 재문의 예정입니다.',
    ],
    faqs: [
      '작업 과정은 어떻게 되나요?|문의 → 히어링 → 시안 → 수정 → 납품 순으로 진행됩니다.',
      '수정은 몇 번 가능한가요?|패키지별로 정해져 있으며, 프리미엄은 무제한입니다.',
      '당일 제작도 가능한가요?|오후 문의 시 당일 시안 제안이 가능합니다.',
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
    title: '브랜드 로고 디자인 서비스 상세페이지',
    type: 'service',
    brand: { name: '로고랩', logo: null },
    product,
    theme: { accent: '#5e5ce6', font: 'gmarket', copyTone: 'premium' },
    width: 1000,
    sections: buildDraft(product, 'premium', '로고랩', 'service'),
  };
}
