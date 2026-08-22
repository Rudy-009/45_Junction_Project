import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { buildApp } from "../src/app.js";
import { DomainError } from "../src/domain/errors.js";
import { createSupabaseAuthenticator } from "../src/security/supabase-auth.js";

test("Supabase authenticator verifies signature, issuer, audience, role, and subject", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "standby-test-key";
  publicJwk.alg = "RS256";
  const projectUrl = "https://standby-test.supabase.co";
  const authenticate = createSupabaseAuthenticator({
    projectUrl,
    keySet: createLocalJWKSet({ keys: [publicJwk] }),
  });
  const valid = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
    .setIssuer(`${projectUrl}/auth/v1`)
    .setAudience("authenticated")
    .setSubject("user-123")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  assert.deepEqual(await authenticate(valid), { actorId: "user-123" });

  const wrongAudience = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
    .setIssuer(`${projectUrl}/auth/v1`)
    .setAudience("anon")
    .setSubject("user-123")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  await assert.rejects(
    () => authenticate(wrongAudience),
    (error: unknown) => error instanceof DomainError && error.code === "UNAUTHENTICATED",
  );
});

test("authenticated users cannot read another user's case", async () => {
  const app = await buildApp({
    allowedOrigins: ["http://localhost:5173"],
    authenticateToken: async (token) => ({ actorId: token }),
  });
  try {
    const created = await app.inject({
      method: "POST",
      url: "/v1/cases",
      headers: { authorization: "Bearer user-a", "idempotency-key": "create-a" },
      payload: { title: "private rehearsal" },
    });
    assert.equal(created.statusCode, 201, created.body);
    const caseId = (created.json() as { case_id: string }).case_id;

    const denied = await app.inject({
      method: "GET",
      url: `/v1/cases/${caseId}/review-queue`,
      headers: { authorization: "Bearer user-b" },
    });
    assert.equal(denied.statusCode, 404);
    assert.equal((denied.json() as { error: { code: string } }).error.code, "RESOURCE_NOT_FOUND");
  } finally {
    await app.close();
  }
});

test("demo auth bypass permits domain requests without a bearer token", async () => {
  const app = await buildApp({
    allowedOrigins: ["http://localhost:5173"],
    authBypass: true,
  });
  try {
    const created = await app.inject({
      method: "POST",
      url: "/v1/cases",
      headers: { "idempotency-key": "demo-create" },
      payload: { title: "demo rehearsal" },
    });
    assert.equal(created.statusCode, 201, created.body);
  } finally {
    await app.close();
  }
});
