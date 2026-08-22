import ExcelJS from "exceljs";
import { DomainError } from "../domain/errors.js";

const XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type JsonRow = {
  json_pointer: string;
  value_type: string;
  value: string;
};

function pointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function flattenJson(value: unknown, pointer: string, rows: JsonRow[]): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      rows.push({ json_pointer: pointer || "/", value_type: "array", value: "[]" });
      return;
    }
    value.forEach((item, index) => flattenJson(item, `${pointer}/${index}`, rows));
    return;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      rows.push({ json_pointer: pointer || "/", value_type: "object", value: "{}" });
      return;
    }
    entries.forEach(([key, item]) => flattenJson(item, `${pointer}/${pointerSegment(key)}`, rows));
    return;
  }

  rows.push({
    json_pointer: pointer || "/",
    value_type: value === null ? "null" : typeof value,
    value: value === null ? "null" : String(value),
  });
}

export async function jsonToUpstageXlsx(bytes: Uint8Array): Promise<Uint8Array> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new DomainError(
      422,
      "SOURCE_JSON_INVALID",
      "MASTER_CUE JSON must be valid UTF-8 JSON.",
    );
  }

  const rows: JsonRow[] = [];
  flattenJson(parsed, "", rows);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "STANDBY";
  workbook.title = "Upstage JSON transport";
  const sheet = workbook.addWorksheet("JSON Source", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "JSON Pointer", key: "json_pointer", width: 72 },
    { header: "Value Type", key: "value_type", width: 16 },
    { header: "Value", key: "value", width: 96 },
  ];
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn("value").alignment = { wrapText: true, vertical: "top" };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export function jsonTransportFilename(originalFilename: string | null, sourceHash: string): string {
  const fallback = `master-cue-${sourceHash.slice(0, 8)}`;
  const stem = originalFilename?.replace(/\.json$/i, "").trim() || fallback;
  return `${stem}.upstage.xlsx`;
}

export { XLSX_MEDIA_TYPE };
