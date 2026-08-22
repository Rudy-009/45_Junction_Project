import { DomainError } from "./errors.js";
import type { FactCandidate, ScriptProjectionSegment } from "./types.js";
import { hashJson } from "../lib/hash.js";

const MAX_SEGMENTS = 10_000;
const MAX_TEXT_LENGTH = 50_000;
const MAX_SPEAKER_LENGTH = 180;
const MAX_EVENT_ID_LENGTH = 200;
const MAX_LOCATOR_LENGTH = 4_096;
const MAX_QUOTE_LENGTH = 50_000;

type JsonObject = Record<string, unknown>;

function invalid(message: string): never {
  throw new DomainError(502, "UPSTAGE_SCRIPT_PROJECTION_INVALID", message);
}

function objectValue(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalid(`${label} must be an object.`);
  }
  return value as JsonObject;
}

function optionalExactString(
  value: unknown,
  label: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    return invalid(`${label} must be a non-empty bounded string when provided.`);
  }
  return value;
}

function firstExactString(
  object: JsonObject,
  keys: readonly string[],
  label: string,
  maxLength: number,
): string | null {
  for (const key of keys) {
    const value = optionalExactString(object[key], `${label}.${key}`, maxLength);
    if (value !== null) return value;
  }
  return null;
}

export function projectScriptSegments(facts: FactCandidate[]): ScriptProjectionSegment[] {
  const segments: ScriptProjectionSegment[] = [];

  for (const [factIndex, fact] of facts.entries()) {
    if (
      fact.source_role !== "SCRIPT" ||
      fact.origin !== "USER_PROVIDED" ||
      fact.review_status !== "UNREVIEWED" ||
      fact.reviewed_value !== null
    ) {
      return invalid("Script projection accepts only unreviewed SCRIPT facts.");
    }
    if (fact.locator.length === 0 || fact.locator.length > MAX_LOCATOR_LENGTH) {
      return invalid(`SCRIPT fact ${factIndex} has an invalid locator.`);
    }
    if (fact.quote.length === 0 || fact.quote.length > MAX_QUOTE_LENGTH) {
      return invalid(`SCRIPT fact ${factIndex} has an invalid source quote.`);
    }

    const raw = objectValue(fact.raw_value, `SCRIPT fact ${factIndex}.raw_value`);
    const dialogue = firstExactString(
      raw,
      [
        "trigger_line_raw",
        "dialogue_raw",
        "dialogue",
        "dialogue_text_raw",
        "dialogue_text",
      ],
      `SCRIPT fact ${factIndex}`,
      MAX_TEXT_LENGTH,
    );
    const stageDirection = firstExactString(
      raw,
      ["stage_direction_raw", "stage_direction", "stage_direction_text_raw", "stage_direction_text"],
      `SCRIPT fact ${factIndex}`,
      MAX_TEXT_LENGTH,
    );
    const speaker = firstExactString(
      raw,
      ["speaker_raw", "speaker", "character_raw", "character"],
      `SCRIPT fact ${factIndex}`,
      MAX_SPEAKER_LENGTH,
    );
    const eventId = firstExactString(
      raw,
      ["event_id_raw", "event_id"],
      `SCRIPT fact ${factIndex}`,
      MAX_EVENT_ID_LENGTH,
    );
    const rawFactSha256 = hashJson(raw);

    const append = (
      kind: ScriptProjectionSegment["kind"],
      text: string,
      segmentSpeaker: string | null,
    ): void => {
      if (segments.length >= MAX_SEGMENTS) {
        return invalid(`Script projection cannot exceed ${MAX_SEGMENTS} segments.`);
      }
      segments.push({
        segment_id: `${fact.fact_id}:${kind.toLowerCase()}`,
        sequence_index: segments.length,
        kind,
        text,
        speaker: segmentSpeaker,
        event_id: eventId,
        locator: fact.locator,
        source_quote: fact.quote,
        provenance: {
          raw_fact_id: fact.fact_id,
          raw_fact_sha256: rawFactSha256,
        },
      });
    };

    // Studio's Script Extract schema orders dialogue before stage_direction. Preserve
    // that field order when a single raw fact contains both exact excerpts.
    if (dialogue !== null) append("DIALOGUE", dialogue, speaker);
    if (stageDirection !== null) append("STAGE_DIRECTION", stageDirection, null);
  }

  if (segments.length === 0) {
    return invalid(
      "SCRIPT Agent output contained no displayable trigger lines or stage directions.",
    );
  }

  return segments;
}
