// qa.js — 렌더 전 정적 QA 검사 (원칙: 차단이 아니라 경고. _overflow 플래그와 함께 표시)
import { LIMITS } from './render.js';

/**
 * @param {object} P 프로젝트
 * @param {number[]} heights 섹션별 렌더 높이(px, 프리뷰에서 계산된 값)
 */
export function runQA(P, heights = []) {
  const secWarnings = new Map(); // sectionId -> [msg]
  const global = [];
  const warn = (id, msg) => {
    if (!secWarnings.has(id)) secWarnings.set(id, []);
    secWarnings.get(id).push(msg);
  };

  if (!P.brand || !P.brand.name.trim()) global.push('브랜드명이 비어 있습니다 — 테마 설정에서 넣어주세요. (히어로·CTA·유의사항에 표시됩니다)');
  if (!P.product || !P.product.name.trim()) global.push('상품 정보가 비어 있습니다 — [상품 정보]에서 채우고 초안을 생성해 보세요.');

  const totalH = heights.reduce((a, b) => a + b, 0);
  if (totalH > 20000) global.push(`전체 높이가 ${totalH.toLocaleString('ko-KR')}px입니다. 일부 쇼핑몰은 2만 px 이상 업로드가 제한될 수 있어요 — 분할 ZIP을 권장합니다.`);

  const secs = P.sections;
  secs.forEach((sec, i) => {
    const items = (arr) => (Array.isArray(arr) ? arr.filter((x) => (typeof x === 'string' ? x.trim() : x)).length : 0);
    if (sec._overflow) warn(sec.id, '텍스트가 영역보다 길어 축소·말줄임되었습니다. 문장을 줄여보세요.');
    switch (sec.type) {
      case 'hero':
        if (!sec.media) warn(sec.id, '대표 이미지가 없습니다. 이미지 없는 히어로는 워시 배경으로 렌더됩니다.');
        if (!sec.title.filter((l) => l.trim()).length) warn(sec.id, '제품명이 비어 있습니다.');
        break;
      case 'problem':
        if (items(sec.items) < 2) warn(sec.id, `공감 항목이 부족합니다 (2개 이상 권장, 최대 ${LIMITS.problem}개).`);
        break;
      case 'solution':
        if (!sec.title.filter((l) => l.trim()).length) warn(sec.id, '해결 문구가 비어 있습니다.');
        break;
      case 'features':
        if (sec.items.filter((x) => x.title.trim()).length < 3) warn(sec.id, '특징은 3개 이상 권장합니다 (2열 그리드에 어울립니다).');
        if (sec.items.length > LIMITS.features) warn(sec.id, `특징은 ${LIMITS.features}개까지 표시됩니다.`);
        break;
      case 'gallery':
        if (!(sec.images || []).some(Boolean)) warn(sec.id, '갤러리 이미지가 없습니다. 상세 컷을 넣어주세요.');
        break;
      case 'howto':
        if (sec.items.filter((x) => x.text.trim()).length < 2) warn(sec.id, '사용 단계가 부족합니다 (2개 이상 권장).');
        break;
      case 'spec':
        if (sec.rows.filter((r) => r.k.trim() || r.v.trim()).length < 2) warn(sec.id, '스펙 항목이 부족합니다.');
        break;
      case 'packages':
        if (sec.items.filter((x) => x.name.trim() || x.price.trim()).length < 2) warn(sec.id, '패키지는 2개 이상 권장합니다 (기본/표준/프리미엄).');
        if (sec.items.some((x) => !x.price.trim())) warn(sec.id, '가격이 비어 있는 패키지가 있습니다.');
        break;
      case 'comparison':
        if (sec.itemsA.filter((x) => x.trim()).length < 2 || sec.itemsB.filter((x) => x.trim()).length < 2)
          warn(sec.id, '비교 항목이 부족합니다 (각 2개 이상 권장).');
        break;
      case 'review':
        if (sec.items.length < 2) warn(sec.id, '후기는 2개 이상 권장합니다.');
        if (sec.items.some((x) => !x.rating)) warn(sec.id, '별점이 0인 후기가 있습니다.');
        break;
      case 'faq':
        if (sec.items.filter((x) => x.q.trim()).length < 2) warn(sec.id, 'FAQ가 부족합니다 (2개 이상 권장).');
        break;
      case 'certification':
        if (sec.items.filter((x) => x.title.trim()).length < 1) warn(sec.id, '인증·보증 항목이 비어 있습니다.');
        break;
      case 'notice':
        if (sec.items.filter((x) => x.title.trim()).length < 2) warn(sec.id, '안내 항목이 부족합니다 (배송·교환·A/S 권장).');
        break;
      case 'cta':
        if (!sec.action.trim()) warn(sec.id, '버튼 문구가 비어 있습니다.');
        break;
      case 'disclaimer':
        if (items(sec.items) < 1) warn(sec.id, '유의사항이 비어 있습니다.');
        break;
    }
  });

  if (secs.length && secs[0].type !== 'hero') global.push('첫 섹션은 [메인 비주얼]로 시작하는 것을 권장합니다.');
  const last = secs[secs.length - 1];
  if (last && !['cta', 'disclaimer'].includes(last.type)) global.push('마지막 섹션은 [구매 유도]나 [유의사항]으로 마무리하는 것을 권장합니다.');

  return { secWarnings, global, totalH };
}
