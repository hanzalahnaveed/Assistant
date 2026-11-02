export function classifyGoogleApiFailure({ status, reason = "", message = "" } = {}) {
  const detail = typeof message === "string" ? message.slice(0, 240) : "";
  if (status === 401) {
    return {
      code: "GOOGLE_REAUTH_REQUIRED",
      retryable: false,
      reauthRequired: true,
      message: "Google access was rejected. Reconnect your Google account.",
    };
  }
  if (status === 403 && ["insufficientPermissions", "authError"].includes(reason)) {
    return {
      code: "GOOGLE_REAUTH_REQUIRED",
      retryable: false,
      reauthRequired: true,
      message: "Google permission was rejected. Reconnect your Google account and grant the requested access.",
    };
  }
  if (status === 429 || (status === 403 && ["rateLimitExceeded", "userRateLimitExceeded"].includes(reason)) || status >= 500) {
    return {
      code: "GOOGLE_API_RETRYABLE",
      retryable: true,
      reauthRequired: false,
      message: "Google Workspace is temporarily unavailable. The request can be retried.",
    };
  }
  return {
    code: "GOOGLE_API_ERROR",
    retryable: false,
    reauthRequired: false,
    message: detail ? "Google Workspace API error: " + detail : "Google Workspace API request failed.",
  };
}

export function isGoogleReauthRequiredError(error) {
  return error?.code === "GOOGLE_REAUTH_REQUIRED";
}
