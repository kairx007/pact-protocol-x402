import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

const originalEnv = { ...process.env };
process.env.NODE_ENV = "test";
process.env.AUTH_HMAC_SECRET =
  "test-secret-with-at-least-thirty-two-characters";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017";
const { app } = await import("./app.js");

describe("Phase 2 API authentication", () => {
  it("rejects organization creation without an authenticated owner session", async () => {
    const response = await request(app)
      .post("/v1/organizations")
      .send({ name: "PACT Labs", slug: "pact-labs" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects invalid session tokens", async () => {
    const response = await request(app)
      .get("/v1/agents")
      .set("Authorization", "Bearer forged.token");
    expect(response.status).toBe(401);
  });
});

beforeAll(() => {
  process.env.NODE_ENV = "test";
});

afterAll(() => {
  process.env = originalEnv;
});
