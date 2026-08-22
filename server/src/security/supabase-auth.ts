import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { DomainError } from "../domain/errors.js";

export type AuthenticatedActor = { actorId: string };
export type TokenAuthenticator = (token: string) => Promise<AuthenticatedActor>;

export function createSupabaseAuthenticator(input: {
  projectUrl: string;
  audience?: string;
  keySet?: JWTVerifyGetKey;
}): TokenAuthenticator {
  const projectUrl = input.projectUrl.replace(/\/$/, "");
  const issuer = `${projectUrl}/auth/v1`;
  const jwks = input.keySet ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const audience = input.audience ?? "authenticated";

  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer, audience });
      if (typeof payload.sub !== "string" || !payload.sub.trim() || payload.role !== "authenticated") {
        throw new Error("Required authenticated claims are missing.");
      }
      return { actorId: payload.sub };
    } catch {
      throw new DomainError(401, "UNAUTHENTICATED", "A valid user access token is required.");
    }
  };
}
