export type ActionRisk = "READ" | "LOW" | "SENSITIVE" | "PROHIBITED";
export type ActionDecision = "ALLOW" | "REQUIRE_APPROVAL" | "DENY";

const prohibitedActions = new Set([
  "transfer_funds",
  "share_credentials",
  "forward_private_data_externally",
  "permanently_delete_account_data"
]);

const sensitiveActions = new Set([
  "send_email",
  "cancel_meeting",
  "invite_external_attendee",
  "share_document_externally"
]);

export function evaluateActionPolicy(input: {
  actionType: string;
  userApprovalMode: "AUTO" | "CONFIRM" | "BLOCK";
  explicitlyApproved?: boolean;
}): { decision: ActionDecision; reason: string } {
  const action = input.actionType.toLowerCase();

  if (prohibitedActions.has(action)) {
    return { decision: "DENY", reason: "This action is not permitted by the product safety policy." };
  }

  if (input.userApprovalMode === "BLOCK") {
    return { decision: "DENY", reason: "This action category is blocked by the user's settings." };
  }

  if (sensitiveActions.has(action) && !input.explicitlyApproved) {
    return { decision: "REQUIRE_APPROVAL", reason: "This action affects other people or shares information and needs explicit approval." };
  }

  if (input.userApprovalMode === "CONFIRM" && !input.explicitlyApproved) {
    return { decision: "REQUIRE_APPROVAL", reason: "The user's default policy requires confirmation." };
  }

  return { decision: "ALLOW", reason: "Action is permitted by the configured policy." };
}
