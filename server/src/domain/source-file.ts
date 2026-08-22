import path from "node:path";
import { DomainError } from "./errors.js";

export const MAX_SOURCE_FILE_BYTES = 50 * 1024 * 1024;

const ALLOWED = {
  SCRIPT: new Map([
    [".pdf", "application/pdf"],
    [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ]),
  MASTER_CUE: new Map([
    [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    [".pdf", "application/pdf"],
    [".json", "application/json"],
  ]),
} as const;

function zipEntryNames(bytes: Uint8Array): Set<string> | null {
  const archive = Buffer.from(bytes);
  const minimumEocdSize = 22;
  const maximumCommentSize = 65_535;
  const firstPossibleEocd = Math.max(0, archive.length - minimumEocdSize - maximumCommentSize);
  let eocdOffset = -1;
  for (let offset = archive.length - minimumEocdSize; offset >= firstPossibleEocd; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) return null;

  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  const directorySize = archive.readUInt32LE(eocdOffset + 12);
  const directoryOffset = archive.readUInt32LE(eocdOffset + 16);
  const directoryEnd = directoryOffset + directorySize;
  if (directoryEnd > eocdOffset || directoryEnd > archive.length) return null;

  const names = new Set<string>();
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > directoryEnd || archive.readUInt32LE(offset) !== 0x02014b50) return null;
    const filenameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const nextOffset = offset + 46 + filenameLength + extraLength + commentLength;
    if (nextOffset > directoryEnd) return null;
    names.add(archive.subarray(offset + 46, offset + 46 + filenameLength).toString("utf8"));
    offset = nextOffset;
  }
  return offset === directoryEnd ? names : null;
}

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

export function assertScriptProjectionFile(
  filename: string,
  mediaType: string,
  bytes: Uint8Array,
): void {
  assertSourceFile("SCRIPT", filename, mediaType, bytes);
  if (path.extname(filename).toLowerCase() !== ".docx") return;

  const entries = zipEntryNames(bytes);
  if (!entries?.has("[Content_Types].xml") || !entries.has("word/document.xml")) {
    throw new DomainError(
      422,
      "SOURCE_SIGNATURE_INVALID",
      "DOCX archive does not contain the required Word document entries.",
    );
  }
}
