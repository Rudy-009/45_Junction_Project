import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyRequest } from "fastify";
import { DomainError } from "./domain/errors.js";
import { assertSourceFile, MAX_SOURCE_FILE_BYTES, sanitizeFilename } from "./domain/source-file.js";
import type { CellPatch, ExtractionAdapter, Origin, SourceRole } from "./domain/types.js";
import { sha256 } from "./lib/hash.js";
import type { ExtractionProvider } from "./providers/extraction-provider.js";
import { InMemoryStore } from "./store/in-memory-store.js";
import type { TokenAuthenticator } from "./security/supabase-auth.js";

declare module "fastify" {
  interface FastifyRequest {
    standbyActorId: string;
  }
}

export type ServerConfig = {
  apiToken?: string;
  authenticateToken?: TokenAuthenticator;
  authBypass?: boolean;
  allowedOrigins: string[];
  logger?: boolean;
  extractionProvider?: ExtractionProvider;
};

const SOURCE_ROLES = new Set<SourceRole>(["SCRIPT", "MASTER_CUE", "STAGE_SPEC"]);
const ORIGINS = new Set<Origin>([
  "REAL_REFERENCE",
  "USER_PROVIDED",
  "CONTROLLED_FIXTURE",
  "MUTATED_FIXTURE",
]);

function bodyRecord(request: FastifyRequest): Record<string, unknown> {
  const body = request.body;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new DomainError(400, "INVALID_ARGUMENT", "JSON object body is required.");
  }
  return body as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError(400, "INVALID_ARGUMENT", `${field} is required.`);
  }
  return value;
}

function idempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError(428, "PRECONDITION_REQUIRED", "Idempotency-Key header is required.");
  }
  return value;
}

function revisionProjection<T extends { rows: unknown }>(revision: T): Omit<T, "rows"> {
  const { rows: _rows, ...projection } = revision;
  return projection;
}

export async function buildApp(
  config: ServerConfig,
  store = new InMemoryStore(config.extractionProvider ?? null),
) {
  const app = Fastify({
    logger: config.logger ?? false,
    bodyLimit: 1_048_576,
    trustProxy: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  });
  await app.register(cors, {
    credentials: false,
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed"), false);
    },
  });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
  });
  await app.register(multipart, {
    limits: { files: 1, fields: 4, fileSize: MAX_SOURCE_FILE_BYTES },
  });

  app.decorateRequest("standbyActorId", "");
  app.addHook("onRequest", async (request) => {
    if (request.url === "/healthz") return;
    if (!request.url.startsWith("/v1/")) return;
    if (config.authBypass) {
      request.standbyActorId = "demo-user";
      return;
    }
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) {
      throw new DomainError(401, "UNAUTHENTICATED", "A valid bearer token is required.");
    }
    if (config.authenticateToken) {
      request.standbyActorId = (await config.authenticateToken(token)).actorId;
      return;
    }
    if (!config.apiToken || token !== config.apiToken) {
      throw new DomainError(401, "UNAUTHENTICATED", "A valid bearer token is required.");
    }
    request.standbyActorId = "dev-user";
  });

  app.setErrorHandler((error, request, reply) => {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "FST_REQ_FILE_TOO_LARGE"
    ) {
      void reply.status(413).send({
        error: {
          code: "SOURCE_FILE_SIZE_INVALID",
          message: "Source file must be 50 MB or smaller.",
          request_id: request.id,
          retryable: false,
          details: {},
        },
      });
      return;
    }
    if (error instanceof DomainError) {
      void reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          request_id: request.id,
          retryable: error.statusCode >= 500,
          details: error.details,
        },
      });
      return;
    }
    request.log.error({ err: error }, "Unhandled request error");
    void reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected server error.",
        request_id: request.id,
        retryable: false,
        details: {},
      },
    });
  });

  app.get("/healthz", async () => ({ status: "ok" }));

  app.post("/v1/cases", async (request, reply) => {
    const body = bodyRecord(request);
    const title = requiredString(body.title, "title");
    const response = store.withIdempotency(
      `${request.standbyActorId}:POST:/v1/cases`,
      idempotencyKey(request),
      body,
      () => store.createCase(title, request.standbyActorId),
    );
    return reply.status(201).send(response);
  });

  app.post<{ Params: { caseId: string; role: string } }>(
    "/v1/cases/:caseId/sources/:role",
    async (request, reply) => {
      if (!SOURCE_ROLES.has(request.params.role as SourceRole)) {
        throw new DomainError(422, "ENUM_VALUE_INVALID", "Unknown source role.");
      }
      const role = request.params.role as SourceRole;
      store.assertCaseOwner(request.params.caseId, request.standbyActorId);
      if (request.isMultipart()) {
        if (role === "STAGE_SPEC") {
          throw new DomainError(415, "SOURCE_MEDIA_TYPE_INVALID", "STAGE_SPEC must be JSON.");
        }
        const part = await request.file();
        if (!part) throw new DomainError(400, "INVALID_ARGUMENT", "file is required.");
        const originField = part.fields.origin;
        const origin =
          originField && "value" in originField && typeof originField.value === "string"
            ? originField.value
            : null;
        if (!ORIGINS.has(origin as Origin)) {
          throw new DomainError(422, "ENUM_VALUE_INVALID", "Unknown source origin.");
        }
        const filename = sanitizeFilename(part.filename);
        const bytes = await part.toBuffer();
        assertSourceFile(role, filename, part.mimetype, bytes);
        const fingerprint = {
          origin,
          filename,
          media_type: part.mimetype,
          sha256: sha256(bytes),
        };
        const response = store.withIdempotency(
          `POST:/v1/cases/${request.params.caseId}/sources/${role}`,
          idempotencyKey(request),
          fingerprint,
          () =>
            store.uploadFileSource({
              caseId: request.params.caseId,
              role,
              origin: origin as Origin,
              bytes,
              mediaType: part.mimetype,
              originalFilename: filename,
            }),
        );
        return reply.status(201).send(response);
      }

      const body = bodyRecord(request);
      if (!ORIGINS.has(body.origin as Origin)) {
        throw new DomainError(422, "ENUM_VALUE_INVALID", "Unknown source origin.");
      }
      if (!("content" in body)) {
        throw new DomainError(400, "INVALID_ARGUMENT", "content is required.");
      }
      const response = store.withIdempotency(
        `POST:/v1/cases/${request.params.caseId}/sources/${role}`,
        idempotencyKey(request),
        body,
        () =>
          store.uploadSource({
            caseId: request.params.caseId,
            role,
            origin: body.origin as Origin,
            content: body.content,
            mediaType: typeof body.media_type === "string" ? body.media_type : null,
            originalFilename:
              typeof body.original_filename === "string" ? body.original_filename : null,
          }),
      );
      return reply.status(201).send(response);
    },
  );

  app.post<{ Params: { caseId: string } }>(
    "/v1/cases/:caseId/extraction-runs",
    async (request, reply) => {
      store.assertCaseOwner(request.params.caseId, request.standbyActorId);
      const body = bodyRecord(request);
      const adapter = body.adapter;
      if (adapter !== "CONTROLLED_FIXTURE" && adapter !== "UPSTAGE_AGENT") {
        throw new DomainError(422, "ENUM_VALUE_INVALID", "Unknown extraction adapter.");
      }
      const response = store.withIdempotency(
        `POST:/v1/cases/${request.params.caseId}/extraction-runs`,
        idempotencyKey(request),
        body,
        () => store.startExtraction(request.params.caseId, adapter as ExtractionAdapter),
      );
      reply.header("Operation-Location", `/v1/operations/${response.operation_id}`);
      return reply.status(202).send(response);
    },
  );

  app.get<{ Params: { operationId: string } }>(
    "/v1/operations/:operationId",
    async (request) => {
      store.assertOperationOwner(request.params.operationId, request.standbyActorId);
      return store.getOperation(request.params.operationId);
    },
  );

  app.get<{ Params: { runId: string } }>(
    "/v1/extraction-runs/:runId",
    async (request) => {
      store.assertExtractionRunOwner(request.params.runId, request.standbyActorId);
      return store.getExtractionRun(request.params.runId);
    },
  );

  app.get<{ Params: { caseId: string } }>(
    "/v1/cases/:caseId/review-queue",
    async (request) => {
      store.assertCaseOwner(request.params.caseId, request.standbyActorId);
      return store.getReviewQueue(request.params.caseId);
    },
  );

  app.post<{ Params: { caseId: string } }>(
    "/v1/cases/:caseId/fact-reviews:batch",
    async (request, reply) => {
      store.assertCaseOwner(request.params.caseId, request.standbyActorId);
      const body = bodyRecord(request);
      if (!Array.isArray(body.reviews) || body.reviews.length === 0) {
        throw new DomainError(400, "INVALID_ARGUMENT", "reviews must be a non-empty array.");
      }
      const reviews = body.reviews.map((value) => {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          throw new DomainError(400, "INVALID_ARGUMENT", "review item must be an object.");
        }
        const item = value as Record<string, unknown>;
        const decision = item.decision;
        if (decision !== "REVIEWED" && decision !== "REJECTED") {
          throw new DomainError(422, "ENUM_VALUE_INVALID", "Unknown review decision.");
        }
        return {
          fact_id: requiredString(item.fact_id, "fact_id"),
          decision: decision as "REVIEWED" | "REJECTED",
          corrected_value: (item.corrected_value ?? null) as unknown,
        };
      });
      const response = store.withIdempotency(
        `POST:/v1/cases/${request.params.caseId}/fact-reviews:batch`,
        idempotencyKey(request),
        body,
        () =>
          store.reviewFacts({
            caseId: request.params.caseId,
            actorId: request.standbyActorId,
            reviews,
          }),
      );
      return reply.status(201).send(response);
    },
  );

  app.post<{ Params: { caseId: string } }>(
    "/v1/cases/:caseId/review-snapshots",
    async (request, reply) => {
      store.assertCaseOwner(request.params.caseId, request.standbyActorId);
      const body = bodyRecord(request);
      const response = store.withIdempotency(
        `POST:/v1/cases/${request.params.caseId}/review-snapshots`,
        idempotencyKey(request),
        body,
        () => store.createReviewSnapshot(request.params.caseId, request.standbyActorId),
      );
      return reply.status(201).send(response);
    },
  );

  app.get<{ Params: { caseId: string } }>(
    "/v1/cases/:caseId/workspace",
    async (request) => {
      store.assertCaseOwner(request.params.caseId, request.standbyActorId);
      return store.getWorkspace(request.params.caseId);
    },
  );

  app.post<{ Params: { caseId: string } }>(
    "/v1/cases/:caseId/cue-revisions",
    async (request, reply) => {
      store.assertCaseOwner(request.params.caseId, request.standbyActorId);
      const body = bodyRecord(request);
      if (!Array.isArray(body.patches)) {
        throw new DomainError(400, "INVALID_ARGUMENT", "patches must be an array.");
      }
      const patches = body.patches.map((value) => {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          throw new DomainError(400, "INVALID_ARGUMENT", "patch must be an object.");
        }
        const patch = value as Record<string, unknown>;
        if (!("from" in patch) || !("to" in patch)) {
          throw new DomainError(400, "INVALID_ARGUMENT", "patch from and to are required.");
        }
        return {
          row_id: requiredString(patch.row_id, "row_id"),
          column: requiredString(patch.column, "column"),
          from: patch.from as CellPatch["from"],
          to: patch.to as CellPatch["to"],
        };
      });
      const response = store.withIdempotency(
        `POST:/v1/cases/${request.params.caseId}/cue-revisions`,
        idempotencyKey(request),
        body,
        () =>
          store.createRevision({
            caseId: request.params.caseId,
            actorId: request.standbyActorId,
            baseRevisionId: requiredString(body.base_revision_id, "base_revision_id"),
            baseSourceSha256: requiredString(body.base_source_sha256, "base_source_sha256"),
            patches,
          }),
      );
      return reply.status(201).send(revisionProjection(response));
    },
  );

  return app;
}
