import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { CueRow } from "./types.js";

const FIELDS = [
  { label: "EVENT", pattern: /(event|이벤트|cue|큐|scene|씬|마커)/i },
  { label: "TRIGGER", pattern: /(trigger|트리거|타이밍|대사)/i },
  { label: "DEPARTMENT", pattern: /(department|부서|파트)/i },
  { label: "ACTION", pattern: /(action|operation|실행|내용|무대|조명|음향)/i },
  { label: "CAST", pattern: /(character|cast|배우|인물|등장)/i },
  { label: "LOCATION", pattern: /(location|위치|상수|하수)/i },
  { label: "NOTES", pattern: /(note|비고|메모)/i },
] as const;

const BLANK = "________________";

function standardRows(rows: CueRow[]): string[][] {
  return rows.map((row) => FIELDS.map(({ pattern }) => {
    const values = Object.entries(row)
      .filter(([key, value]) => key !== "id" && pattern.test(key) && value.trim() !== "")
      .map(([, value]) => value.trim());
    return values.length > 0 ? [...new Set(values)].join(" / ") : BLANK;
  }));
}

export async function standardCueDocx(title: string, revisionId: string, rows: CueRow[]): Promise<Uint8Array> {
  const header = new TableRow({
    tableHeader: true,
    children: FIELDS.map((field) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: field.label, bold: true })] })],
    })),
  });
  const body = standardRows(rows).map((values) => new TableRow({
    children: values.map((value) => new TableCell({
      children: [new Paragraph({ children: [new TextRun(value)] })],
    })),
  }));
  const document = new Document({
    sections: [{
      children: [
        new Paragraph({ text: "STANDBY · STANDARD CUE", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: title }),
        new Paragraph({ text: `Revision: ${revisionId}` }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...body] }),
      ],
    }],
  });
  return Uint8Array.from(await Packer.toBuffer(document));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export function standardCuePrintHtml(title: string, revisionId: string, rows: CueRow[]): string {
  const head = FIELDS.map((field) => `<th>${field.label}</th>`).join("");
  const body = standardRows(rows)
    .map((values) => `<tr>${values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`)
    .join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>STANDBY Standard Cue</title><style>
@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;color:#111}h1{font:700 18px ui-monospace,monospace;letter-spacing:.18em}p{margin:2px 0 12px;font-size:10px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #444;padding:5px;vertical-align:top;font-size:8px;overflow-wrap:anywhere}th{background:#eee;font-size:7px;letter-spacing:.06em}tr{break-inside:avoid}</style></head><body><h1>STANDBY · STANDARD CUE</h1><p>${escapeHtml(title)} · ${escapeHtml(revisionId)}</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><script>addEventListener('load',()=>setTimeout(()=>print(),100))</script></body></html>`;
}
