import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import { projectScriptSegments } from "../src/domain/script-projection.js";
import type { FactCandidate, InternalSourceVersion, ScriptProjection } from "../src/domain/types.js";
import { sha256 } from "../src/lib/hash.js";
import type { ScriptProjectionProvider } from "../src/providers/script-projection-provider.js";
import { UpstageAgentProvider } from "../src/providers/upstage-agent-provider.js";

const TOKEN = "script-projection-test-token";
const DOCX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function auth(idempotencyKey?: string): Record<string, string> {
  return {
    authorization: `Bearer ${TOKEN}`,
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
}

function multipartFile(input: {
  boundary: string;
  filename: string;
  mediaType: string;
  bytes: Buffer;
  extraField?: boolean;
}): Buffer {
  return Buffer.concat([
    ...(input.extraField
      ? [
          Buffer.from(
            `--${input.boundary}\r\nContent-Disposition: form-data; name="event_id"\r\n\r\nE1\r\n`,
          ),
        ]
      : []),
    Buffer.from(
      `--${input.boundary}\r\nContent-Disposition: form-data; name="file"; filename="${input.filename}"\r\n` +
        `Content-Type: ${input.mediaType}\r\n\r\n`,
    ),
    input.bytes,
    Buffer.from(`\r\n--${input.boundary}--\r\n`),
  ]);
}

function docxBytes(): Buffer {
  const filenames = ["[Content_Types].xml", "word/document.xml"];
  const localParts: Buffer[] = [];
  const directoryParts: Buffer[] = [];
  let localOffset = 0;
  for (const filename of filenames) {
    const name = Buffer.from(filename, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(localOffset, 42);
    directoryParts.push(directory, name);
    localOffset += local.length + name.length;
  }
  const directory = Buffer.concat(directoryParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(filenames.length, 8);
  eocd.writeUInt16LE(filenames.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, directory, eocd]);
}

function scriptSource(bytes: Uint8Array): InternalSourceVersion {
  return {
    contract_version: "standby.source.v1",
    source_id: "source_script",
    case_id: "projection_fixture",
    role: "SCRIPT",
    sha256: sha256(bytes),
    origin: "USER_PROVIDED",
    authority: "UNREVIEWED",
    media_type: DOCX_MEDIA_TYPE,
    original_filename: "script.docx",
    created_at: "2026-08-23T00:00:00.000Z",
    content: null,
    bytes,
  };
}

test("DOCX projection runs through the configured Upstage Script Agent and returns exact excerpts", async () => {
  const bytes = docxBytes();
  let uploadSeen = false;
  const provider = new UpstageAgentProvider({
    apiKey: "secret-test-key",
    agentIds: { SCRIPT: "agt_script" },
    configIds: { SCRIPT: "1" },
    pollIntervalMs: 0,
    timeoutMs: 1_000,
    fetchImpl: async (input, init) => {
      const url = String(input);
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer secret-test-key");
      if (url.endsWith("/v2/files")) {
        assert.ok(init?.body instanceof FormData);
        const file = init.body.get("file");
        assert.ok(file instanceof File);
        assert.equal(file.name, "script.docx");
        assert.equal(file.type, DOCX_MEDIA_TYPE);
        assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
        uploadSeen = true;
        return Response.json({ id: "file-script" });
      }
      if (url.endsWith("/v2/responses") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        assert.equal(body.model, "agt_script");
        assert.equal(body.config_id, "1");
        return Response.json({ id: "job-script" });
      }
      const pollUrl = new URL(url);
      assert.equal(pollUrl.searchParams.get("include[]"), "all");
      return Response.json({
        id: "job-script",
        status: "completed",
        output: [{
          content: [{
            additional_values: {
              script_facts: [
                {
                  fact_type: "DIALOGUE",
                  dialogue_raw: "여기가 맞아?",
                  speaker_raw: "민",
                  event_id: "evt_002",
                  locator: "p.2:l.4",
                  source_quote_raw: "민: 여기가 맞아?",
                },
                {
                  fact_type: "STAGE_DIRECTION",
                  stage_direction_raw: "민이 무대 중앙으로 들어온다.",
                  section_marker_raw: "evt_003",
                  locator: "p.2:l.5",
                  source_quote_raw: "(민이 무대 중앙으로 들어온다.)",
                },
              ],
            },
          }],
        }],
      });
    },
  });
  const app = await buildApp({
    apiToken: TOKEN,
    allowedOrigins: ["http://localhost:5173"],
    scriptProjectionProvider: provider,
  });
  try {
    const boundary = "standby-script-docx";
    const response = await app.inject({
      method: "POST",
      url: "/v1/script-projections",
      headers: {
        ...auth("project-script-docx"),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartFile({
        boundary,
        filename: "../script.docx",
        mediaType: DOCX_MEDIA_TYPE,
        bytes,
      }),
    });
    assert.equal(response.statusCode, 202, response.body);
    assert.match(String(response.headers["operation-location"] ?? ""), /^\/v1\/operations\//);
    const operationId = (response.json() as { operation_id: string }).operation_id;
    await new Promise<void>((resolve) => setImmediate(resolve));

    const operationResponse = await app.inject({
      method: "GET",
      url: `/v1/operations/${operationId}`,
      headers: auth(),
    });
    const operation = operationResponse.json() as {
      status: string;
      result_source: string;
      resource_ref: { type: string; id: string };
    };
    assert.equal(operation.status, "SUCCEEDED");
    assert.equal(operation.result_source, "UPSTAGE");
    assert.equal(operation.resource_ref.type, "script_projection");

    const projectionResponse = await app.inject({
      method: "GET",
      url: `/v1/script-projections/${operation.resource_ref.id}`,
      headers: auth(),
    });
    assert.equal(projectionResponse.statusCode, 200, projectionResponse.body);
    const projection = projectionResponse.json() as ScriptProjection;
    assert.equal(uploadSeen, true);
    assert.equal(projection.contract_version, "standby.script-projection.v1");
    assert.equal(projection.authority, "NON_AUTHORITATIVE");
    assert.deepEqual(projection.source, {
      filename: "script.docx",
      sha256: sha256(bytes),
      media_type: DOCX_MEDIA_TYPE,
    });
    assert.equal(projection.provenance.provider, "UPSTAGE_AGENT");
    assert.equal(projection.provenance.agent_id, "agt_script");
    assert.equal(projection.provenance.config_id, "1");
    assert.deepEqual(
      projection.segments.map(({ sequence_index, kind, text, speaker, event_id, locator }) => ({
        sequence_index,
        kind,
        text,
        speaker,
        event_id,
        locator,
      })),
      [
        {
          sequence_index: 0,
          kind: "DIALOGUE",
          text: "여기가 맞아?",
          speaker: "민",
          event_id: "evt_002",
          locator: "p.2:l.4",
        },
        {
          sequence_index: 1,
          kind: "STAGE_DIRECTION",
          text: "민이 무대 중앙으로 들어온다.",
          speaker: null,
          event_id: null,
          locator: "p.2:l.5",
        },
      ],
    );
    assert.ok(projection.segments.every((segment) => /^[a-f0-9]{64}$/.test(segment.provenance.raw_fact_sha256)));
    assert.equal("bytes" in projection.source, false);
  } finally {
    await app.close();
  }
});

test("PDF is accepted as the secondary script format and projection ownership stays actor-scoped", async () => {
  const pdfBytes = Buffer.from("%PDF-1.7\nfixture\n%%EOF");
  const provider: ScriptProjectionProvider = {
    async projectScript(source) {
      return {
        facts: [{
          fact_id: "fact_script_pdf",
          fact_type: "DIALOGUE",
          raw_value: { dialogue_raw: "PDF 대사" },
          reviewed_value: null,
          source_role: "SCRIPT",
          source_id: source.source_id,
          locator: "p.1:l.1",
          quote: "PDF 대사",
          origin: "USER_PROVIDED",
          confidence: "NOT_PROVIDED",
          review_status: "UNREVIEWED",
        }],
        run: {
          source_id: source.source_id,
          role: "SCRIPT",
          provider: "UPSTAGE",
          provider_job_id: "job_pdf",
          agent_id: "agt_script",
          config_id: "1",
          adapter_version: "test.v1",
          schema_version: "standby.extraction.v1",
          raw_response_sha256: sha256("pdf-response"),
        },
      };
    },
  };
  const app = await buildApp({
    allowedOrigins: ["http://localhost:5173"],
    allowAnonymous: true,
    scriptProjectionProvider: provider,
  });
  const ownerSession = "11111111-1111-4111-8111-111111111111";
  const otherSession = "22222222-2222-4222-8222-222222222222";
  try {
    const boundary = "standby-script-pdf";
    const start = await app.inject({
      method: "POST",
      url: "/v1/script-projections",
      headers: {
        "x-standby-session": ownerSession,
        "idempotency-key": "project-script-pdf",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartFile({
        boundary,
        filename: "script.pdf",
        mediaType: "application/pdf",
        bytes: pdfBytes,
      }),
    });
    assert.equal(start.statusCode, 202, start.body);
    const operationId = (start.json() as { operation_id: string }).operation_id;
    await new Promise<void>((resolve) => setImmediate(resolve));
    const ownerOperation = await app.inject({
      method: "GET",
      url: `/v1/operations/${operationId}`,
      headers: { "x-standby-session": ownerSession },
    });
    assert.equal(ownerOperation.statusCode, 200);
    const projectionId = (ownerOperation.json() as { resource_ref: { id: string } }).resource_ref.id;

    const otherRead = await app.inject({
      method: "GET",
      url: `/v1/script-projections/${projectionId}`,
      headers: { "x-standby-session": otherSession },
    });
    assert.equal(otherRead.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("script projection rejects unsupported fields, types, and spoofed DOCX archives", async () => {
  let calls = 0;
  const provider: ScriptProjectionProvider = {
    async projectScript() {
      calls += 1;
      throw new Error("must not run");
    },
  };
  const app = await buildApp({
    apiToken: TOKEN,
    allowedOrigins: ["http://localhost:5173"],
    scriptProjectionProvider: provider,
  });
  try {
    const inputs = [
      {
        boundary: "script-json",
        filename: "script.json",
        mediaType: "application/json",
        bytes: Buffer.from("{}"),
        expectedStatus: 415,
      },
      {
        boundary: "script-spoofed-docx",
        filename: "script.docx",
        mediaType: DOCX_MEDIA_TYPE,
        bytes: Buffer.from("PK\u0003\u0004not-a-word-document"),
        expectedStatus: 422,
      },
      {
        boundary: "script-extra-field",
        filename: "script.pdf",
        mediaType: "application/pdf",
        bytes: Buffer.from("%PDF-1.7\nfixture"),
        extraField: true,
        expectedStatus: 400,
      },
    ];
    for (const [index, input] of inputs.entries()) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/script-projections",
        headers: {
          ...auth(`reject-script-${index}`),
          "content-type": `multipart/form-data; boundary=${input.boundary}`,
        },
        payload: multipartFile(input),
      });
      assert.equal(response.statusCode, input.expectedStatus, response.body);
    }
    assert.equal(calls, 0);
  } finally {
    await app.close();
  }
});

test("projection never creates an event link from section labels or source text", () => {
  const fact: FactCandidate = {
    fact_id: "fact_script_unlinked",
    fact_type: "STAGE_DIRECTION",
    raw_value: {
      stage_direction_raw: "E7에서 배우가 퇴장한다.",
      section_marker_raw: "E7",
    },
    reviewed_value: null,
    source_role: "SCRIPT",
    source_id: "source_script",
    locator: "p.7:l.2",
    quote: "E7에서 배우가 퇴장한다.",
    origin: "USER_PROVIDED",
    confidence: "HIGH",
    review_status: "UNREVIEWED",
  };

  const [segment] = projectScriptSegments([fact]);
  assert.ok(segment);
  assert.equal(segment.event_id, null);
});
