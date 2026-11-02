import assert from "node:assert/strict";
import { classifyGoogleApiFailure, isGoogleReauthRequiredError } from "../src/lib/email-agent/provider-errors.mjs";

const unauthorized = classifyGoogleApiFailure({ status: 401, message: "Unauthorized" });
assert.equal(unauthorized.code, "GOOGLE_REAUTH_REQUIRED");
assert.equal(unauthorized.reauthRequired, true);
assert.equal(unauthorized.retryable, false);
assert.equal(isGoogleReauthRequiredError({ code: unauthorized.code }), true);

const missingScope = classifyGoogleApiFailure({ status: 403, reason: "insufficientPermissions" });
assert.equal(missingScope.code, "GOOGLE_REAUTH_REQUIRED");
assert.equal(missingScope.reauthRequired, true);

const rateLimited = classifyGoogleApiFailure({ status: 429, message: "quota" });
assert.equal(rateLimited.code, "GOOGLE_API_RETRYABLE");
assert.equal(rateLimited.retryable, true);
assert.equal(rateLimited.reauthRequired, false);

const googleRateLimit = classifyGoogleApiFailure({ status: 403, reason: "userRateLimitExceeded" });
assert.equal(googleRateLimit.retryable, true);
assert.equal(googleRateLimit.reauthRequired, false);

const unavailable = classifyGoogleApiFailure({ status: 503 });
assert.equal(unavailable.retryable, true);

const ordinaryForbidden = classifyGoogleApiFailure({ status: 403, reason: "forbidden", message: "Resource policy denied the request." });
assert.equal(ordinaryForbidden.code, "GOOGLE_API_ERROR");
assert.equal(ordinaryForbidden.reauthRequired, false);

console.log("PASS Google provider error policy: revocation, missing scopes, rate limits, and transient failures");
