import path from "node:path";
import { DomainError } from "./errors.js";

export const MAX_SOURCE_FILE_BYTES = 50 * 1024 * 1024;

const ALLOWED = {
  SCRIPT: new Map([
    [".pdf", "application/pdf"],
    [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    [".json", "application/json"],
  ]),
  MASTER_CUE: new Map([
    [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    [".pdf", "application/pdf"],
    [".json", "application/json"],
  ]),
} as const;

export function sanitizeFilename(value: string): string {
  const filename = path.basename(value).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!filename || filename.length > 180) {
    throw new DomainError(422, "SOURCE_FILENAME_INVALID", "Source filename is invalid.");
  }
  return filename;
}

export function assertSourceFile(
  role: "SCRIPT" | "MASTER_CUE",
  filename: string,
  mediaType: string,
  bytes: Uint8Array,
): void {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SOURCE_FILE_BYTES) {
    throw new DomainError(413, "SOURCE_FILE_SIZE_INVALID", "Source file must be between 1 byte and 50 MB.");
  }
  const extension = path.extname(filename).toLowerCase();
  const expectedMediaType = ALLOWED[role].get(extension as never);
  if (!expectedMediaType) {
    throw new DomainError(415, "SOURCE_MEDIA_TYPE_INVALID", `${role} file type is not supported.`);
  }
  if (extension === ".json") {
    if (mediaType && mediaType !== expectedMediaType && mediaType !== "text/plain") {
      throw new DomainError(415, "SOURCE_MEDIA_TYPE_INVALID", `${role} file type is not supported.`);
    }
  } else if (mediaType !== expectedMediaType) {
    throw new DomainError(415, "SOURCE_MEDIA_TYPE_INVALID", `${role} file type is not supported.`);
  }

  const isPdf = extension === ".pdf" && Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-";
  const isZip =
    (extension === ".docx" || extension === ".xlsx") &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b;
  if (!isPdf && !isZip && extension !== ".json") {
    throw new DomainError(422, "SOURCE_SIGNATURE_INVALID", "Source file signature does not match its type.");
  }
}
