import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";

test("anonymous demo sessions require a valid UUID and remain isolated", async () => {
  const app = await buildApp({
    allowedOrigins: ["http://localhost:5173"],
    allowAnonymous: true,
  });
  const sessionA = "5d1d3514-6277-4a32-8109-ce01035830b4";
  const sessionB = "0c61dd96-9f37-4584-8d53-6c4bc7ca9741";
  try {
    const invalid = await app.inject({
      method: "POST",
      url: "/v1/cases",
      headers: { "x-standby-session": "not-a-session", "idempotency-key": "invalid" },
      payload: { title: "invalid" },
    });
    assert.equal(invalid.statusCode, 401);

    const created = await app.inject({
      method: "POST",
      url: "/v1/cases",
      headers: { "x-standby-session": sessionA, "idempotency-key": "anonymous-a" },
      payload: { title: "public demo" },
    });
    assert.equal(created.statusCode, 201, created.body);
    const caseId = (created.json() as { case_id: string }).case_id;

    const denied = await app.inject({
      method: "GET",
      url: `/v1/cases/${caseId}/review-queue`,
      headers: { "x-standby-session": sessionB },
    });
    assert.equal(denied.statusCode, 404);
  } finally {
    await app.close();
  }
});
