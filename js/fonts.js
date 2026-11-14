// fonts.js — GmarketSans 번들 폰트 로딩 (FontFace API, cardnews-studio 이식).
// 캔버스 렌더 전 반드시 로드가 끝나야 한다. 본문용 '시스템' 선택은 번들 없이 시스템 스택을 쓴다.
import { log } from './util.js';

const FACES = [
  { url: new URL('../assets/fonts/GmarketSansLight.woff', import.meta.url), weight: '300' },
  { url: new URL('../assets/fonts/GmarketSansMedium.woff', import.meta.url), weight: '500' },
  { url: new URL('../assets/fonts/GmarketSansBold.woff', import.meta.url), weight: '700' },
];

export const FAMILIES = {
  gmarket: { name: 'Gmarket Sans', stack: '"GmarketSans","Malgun Gothic","맑은 고딕",sans-serif' },
  system: { name: '시스템 기본', stack: '-apple-system,"Segoe UI","Helvetica Neue","Malgun Gothic","맑은 고딕",sans-serif' },
};

let loaded = false;

export function font(family, weight, size) {
  const stack = (FAMILIES[family] || FAMILIES.gmarket).stack;
  return `${weight} ${Math.round(size * 2) / 2}px ${stack}`;
}

export async function loadFonts() {
  if (loaded) return true;
  let ok = 0;
  await Promise.all(
    FACES.map(async (f) => {
      try {
        const res = await fetch(f.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const face = new FontFace('GmarketSans', buf, { weight: f.weight, display: 'swap' });
        await face.load();
        document.fonts.add(face);
        ok++;
      } catch (e) {
        log.warn(`폰트 로드 실패 (${f.weight}):`, e.message);
      }
    })
  );
  // 폰트가 준비될 때까지 최대 3초 대기 (실패 시 시스템 폰트로 폴백 렌더)
  await Promise.race([
    document.fonts.ready,
    new Promise((r) => setTimeout(r, 3000)),
  ]);
  loaded = ok > 0;
  return loaded;
}
