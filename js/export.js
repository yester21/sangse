// export.js — PNG 내보내기 (선택 섹션 / 전체 이어본 / 분할 ZIP / 프로젝트 JSON)
import { ensureImages, renderSectionCanvas } from './render.js';
import { makeZip } from './zip.js';
import { download, slugify, log } from './util.js';

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 인코딩 실패'))), 'image/png');
  });
}

function blobToU8(blob) {
  return blob.arrayBuffer().then((buf) => new Uint8Array(buf));
}

// 브라우저 캔버스 한계: 한 변 최대 32,767px / 전체 면적 약 2.68억 px²
const MAX_DIM = 32767;
const MAX_AREA = 260_000_000;

export function checkFullSize(width, totalH) {
  if (totalH > MAX_DIM) return `전체 높이 ${totalH.toLocaleString('ko-KR')}px는 브라우저 캔버스 한계(32,767px)를 넘습니다. 분할 ZIP으로 내보내 주세요.`;
  if (width * totalH > MAX_AREA) return `전체 크기(${width}×${totalH.toLocaleString('ko-KR')})가 브라우저 캔버스 면적 한계를 넘습니다. 분할 ZIP으로 내보내 주세요.`;
  return null;
}

/** 선택한 섹션 1개를 PNG로 저장 */
export async function exportSectionPNG(P, index) {
  const sec = P.sections[index];
  if (!sec) throw new Error('섹션이 없습니다.');
  await ensureImages(P);
  const { canvas } = renderSectionCanvas(P, sec, index);
  const blob = await canvasToBlob(canvas);
  download(blob, `${slugify(P.title)}_${String(index + 1).padStart(2, '0')}_${sec.type}.png`);
}

/**
 * 전체 이어본 PNG 1장 생성
 * @returns {{blob: Blob, w: number, h: number}}
 */
export async function exportFullPNG(P) {
  await ensureImages(P);
  // 1차: 각 섹션 캔버스 렌더 + 높이 합
  const parts = P.sections.map((sec, i) => renderSectionCanvas(P, sec, i));
  const totalH = parts.reduce((a, p) => a + p.h, 0);
  const limitMsg = checkFullSize(P.width, totalH);
  if (limitMsg) throw new Error(limitMsg);
  // 2차: 이어붙이기
  const out = document.createElement('canvas');
  out.width = P.width;
  out.height = totalH;
  const ctx = out.getContext('2d');
  let y = 0;
  for (const p of parts) {
    ctx.drawImage(p.canvas, 0, y);
    y += p.h;
  }
  const blob = await canvasToBlob(out);
  return { blob, w: P.width, h: totalH };
}

/**
 * 분할 ZIP: 섹션별 PNG + 전체 이어본 PNG(한계 내) + 프로젝트 JSON
 */
export async function exportZip(P, onProgress = () => {}) {
  await ensureImages(P);
  const files = [];
  const parts = [];
  for (let i = 0; i < P.sections.length; i++) {
    onProgress(i, P.sections.length);
    const { canvas, h } = renderSectionCanvas(P, P.sections[i], i);
    parts.push({ canvas, h, index: i });
  }
  const totalH = parts.reduce((a, p) => a + p.h, 0);
  const base = slugify(P.title);

  for (const p of parts) {
    const sec = P.sections[p.index];
    const blob = await canvasToBlob(p.canvas);
    files.push({ name: `${String(p.index + 1).padStart(2, '0')}_${sec.type}.png`, data: await blobToU8(blob) });
  }

  if (!checkFullSize(P.width, totalH)) {
    const out = document.createElement('canvas');
    out.width = P.width;
    out.height = totalH;
    const ctx = out.getContext('2d');
    let y = 0;
    for (const p of parts) {
      ctx.drawImage(p.canvas, 0, y);
      y += p.h;
    }
    const blob = await canvasToBlob(out);
    files.push({ name: `${base}_full.png`, data: await blobToU8(blob) });
  } else {
    log.warn('전체 이어본은 캔버스 한계 초과로 ZIP에서 생략됩니다:', P.width, 'x', totalH);
  }

  files.push({
    name: 'project.json',
    data: new TextEncoder().encode(JSON.stringify(P, null, 2)),
  });
  return makeZip(files);
}

export function exportProjectJSON(P) {
  const blob = new Blob([JSON.stringify(P, null, 2)], { type: 'application/json' });
  download(blob, `${slugify(P.title)}.json`);
}
