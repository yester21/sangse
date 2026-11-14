# 상세페이지 스튜디오 (Detail Studio)

쇼핑몰 상세페이지 제작기 — 상품 정보를 채우면 **상세페이지 표준 구성 순서로 섹션 초안이 자동 배치**되고,
네이버 860px·쿠팡 1000px 규격 PNG로 내려받는 정적 웹 앱.
**일반 제품(유형상품)과 서비스·디지털(무형상품) 모두 지원** — 서비스 모드는 크몽 상세페이지 관습
(패키지 3단 가격표·진행 프로세스·포함 내역·자격·경력·진행/환불 안내)을 따른다.

> 입력은 사람 / 구조는 코드 — 레이아웃은 코드가 고정하고, 사람은 문구와 이미지만 넣는다.
> (cardnews-studio · blog-post-studio · invoice-studio와 같은 스튜디오 세트, Apple Reference Design System 공용 토큰)

## 실행

빌드·의존성 설치 없음. 정적 서버로 폴더를 서빙하면 끝난다.

```bash
python -m http.server 8030 --directory sangse
# http://localhost:8030
```

아무 서버나 가능 (`npx serve` 등). `file://`로 여는 것은 ES 모듈·폰트 로딩(CORS) 때문에 불가.

## 기능

| 기능 | 내용 |
|---|---|
| 상품 정보 → 초안 생성 | 제품명·특징·스펙·후기·FAQ·안내를 "항목\|내용" 형식으로 채우고 [초안 생성] → 표준 흐름(히어로→공감→해결→특징→사용법→스펙→비교→후기→FAQ→안내→CTA→유의사항)으로 섹션 자동 배치 |
| 상품 유형 | **일반 제품(유형상품) / 서비스·무형상품** 선택 — 서비스는 크몽 관습 초안(타깃 → 소개 → 강점 → 진행 프로세스 → 패키지 가격 → 포함 내역 → 작업물 샘플 → 후기 → FAQ → 자격·경력 → 진행·환불 안내 → 주문 유도), 라벨도 서비스용으로 전환(서비스명·강점·포함 내역·환불 안내) |
| 섹션 타입 15종 | hero · problem · solution · features · gallery · howto · spec · **packages(3열 가격표, 표준 강조)** · comparison · review · faq · certification · notice · cta · disclaimer |
| 문구 톤 프리셋 | 공감형 / 기능형 / 프리미엄형 — 섹션 추가·초안 생성 시 기본 카피가 톤을 따름 |
| 테마 | 브랜드명 · 액센트 색 8프리셋+커스텀 · 폰트(Gmarket Sans 번들 / 시스템) — 전 섹션 일괄 적용 |
| 규격 | 860px(네이버) / 1000px(쿠팡 등) / 600~1400px 직접 입력 |
| 배경 톤 | 섹션별 자동(타입 기본값)·화이트·그레이·다크·브랜드 워시 |
| 배경 (옵트인) | "배경 사용하기" 체크 시 활성화 — 종류 **이미지/모형배경** 선택, **어둡기(이미지)·장식 진하기(모형) 5단계**, **배경 그라데이션 사용 여부**, 모형 모양(장식 링/도트/사선). 켜면 기본값(이미지·보통·그라데이션 사용)이 미리 선택된 상태로 시작. 사진 배경은 자동 스크림+글씨 흰색 전환, 브랜드 색이 어두우면 액센트 텍스트도 흰색으로 대체 |
| 섹션 단위 AI | 섹션마다 **직접 만들기 / AI가 만들기** 선택 — AI 생성 후에도 내용 폼에서 자유 수정, **다시 만들기** 재생성, 한 줄 지시 지원. 설정(AI 설정 모달): Google Gemini 또는 OpenAI 호환(Base URL 교체로 z.ai·LM Studio 등) — 키는 이 브라우저에만 저장되고 프로젝트 JSON·ZIP에 미포함. 레일에 ✨ 표시 |
| 편집 | 좌 레일(썸네일·순서·복제·삭제) / 중앙 스테이지(세로 이어본 프리뷰, 프리뷰=출력물) / 우 에디터 폼 |
| QA 게이트 | 텍스트 넘침·이미지 누락·항목 부족·첫/마지막 섹션 흐름·전체 높이 2만 px 초과 경고 (차단 없음) |
| 내보내기 | 선택 섹션 PNG / 전체 이어본 PNG + 섹션별 분할 PNG + project.json ZIP (캔버스 한계 32,767px 초과 시 전체 PNG는 생략하고 분할만) |
| 저장 | localStorage 자동저장(`detail-studio-v1`) + 프로젝트 JSON 저장/불러오기 |
| AI 초안 | 프롬프트 복사 → 챗봇에서 JSON 생성 → 붙여넣어 가져오기 (외부 API 호출 없음) |

## JSON 스키마 (요약)

```jsonc
{
  "version": 1,
  "title": "프로젝트명",
  "type": "product",  // product(유형상품) | service(무형상품) — 초안 흐름·모달 라벨 전환
  "brand": { "name": "브랜드명", "logo": null },
  "product": {  // 상품 정보 모달의 스테이징 — 초안 생성에 사용
    "name": "", "category": "", "tagline": "",
    "features": ["제목|설명"], "steps": ["단계|설명"], "specs": ["항목|값"],
    "packages": ["기본|50,000원|설명|포함1,포함2"], "certifications": ["제목|설명"],
    "reviews": ["이름|별점|내용"], "faqs": ["질문|답변"],
    "notices": ["제목|내용"], "warnings": ["문장"]
  },
  "theme": { "accent": "#0071e3", "font": "gmarket", "copyTone": "feature" },  // font: gmarket | system, copyTone: feature | empath | premium
  "width": 1000,                                        // 860 | 1000 | 600~1400
  "sections": [
    { "id": "s-...", "type": "hero", "tone": "auto",
      "media": { "src": "data:...", "w": 0, "h": 0 },
      "badge": "카테고리", "title": ["제품명"], "body": ["캐치프레이즈"] },
    { "type": "features", "items": [{ "title": "", "desc": "" }] },
    { "type": "spec", "rows": [{ "k": "", "v": "" }] },
    { "type": "notice",
      "bgOn": true, "bgKind": "image", "bg": { "src": "data:...", "w": 0, "h": 0 },
      "bgDim": "d3", "bgGrad": true, "bgShape": "rings",
      "ai": true, "aiMade": true, "aiHint": "20대 타깃",
      "items": [{ "title": "", "desc": "" }] },
    { "type": "cta", "action": "지금 구매하기", "sub": ["무료배송 · 안전결제"] }
    // type별 필드는 js/sections.js blankSection 참조
    // 배경: bgOn(옵트인) + bgKind(image|shape) + bgDim(d1~d5 5단계) + bgGrad + bgShape(rings|dots|stripes)
    // AI: ai(AI가 만들기) + aiMade(생성 이력) + aiHint(한 줄 지시)
  ]
}
```

## 폴더 구조

```
sangse/
  index.html            # 앱 셸 (헤더 / 좌 레일·중앙 스테이지·우 에디터)
  assets/app.css        # Apple 토큰 + 스테이지·에디터 스타일
  assets/fonts/         # GmarketSans Light/Medium/Bold (번들, FontFace API 로드)
  js/app.js             # 부트·이벤트·레일/스테이지/에디터 렌더·모달(상품정보/테마/AI)
  js/store.js           # Store 클래스 + localStorage 자동저장 + normalizeProject (구버전 배경 필드 마이그레이션 포함)
  js/sections.js        # 섹션 타입 14종·blankSection·문구 톤 프리셋·buildDraft(규칙 초안)
  js/render.js          # 결정적 캔버스 섹션 렌더러 (높이 선계산 → 배경 → 내용, 사진/모형 배경 2패스)
  js/ai.js              # 섹션 단위 AI 문구 생성 (Gemini·OpenAI 호환, 키는 브라우저에만 저장)
  js/qa.js              # 정적 QA 경고
  js/export.js          # PNG(선택/전체/분할 ZIP)·JSON 내보내기
  js/zip.js             # 무의존 ZIP 라이터 (store 방식, cardnews-studio 동일)
  js/fonts.js           # FontFace 로더 + 폰트 스택
  js/util.js  js/sample.js
```

## 렌더러 설계 원칙

- **프리뷰 = 출력물**: 스테이지의 섹션 캔버스가 곧 내보내기 픽셀이다. 좌표를 외부에서 넣지 않는다.
- **높이 자동**: 각 섹션 렌더러가 콘텐츠 양에서 자기 높이를 계산한다 (measure → 배경 → 내용 순서).
- **넘침 처리**: 텍스트가 폭을 넘으면 블록 폰트를 최대 62%까지 축소, 그래도 넘치면 말줄임 + `_overflow` → QA 경고.
- **스케일**: 모든 수치는 s = 폭/1000 비율로 스케일되어 860px에서도 비율이 유지된다.

## 형제 앱

- `../cardnews-studio` — 인스타그램·스레드 카드뉴스
- `../blog-post-studio` — 블로그 발행 패키지
- `../invoice-studio` — 견적서·인보이스
- `../photo-studio` — 사진 편집기
