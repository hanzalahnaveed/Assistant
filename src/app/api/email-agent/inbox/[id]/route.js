import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";
import { extractMessageText } from "@/lib/email-agent/format.mjs";
import { getGmailModifyPayload, GMAIL_MODIFY_SCOPE } from "@/lib/email-agent/gmail-mutations.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const MAX_BODY_LENGTH = 100000;
const actionSchema = z.object({
  action: z.enum(["MARK_READ", "MARK_UNREAD", "STAR", "UNSTAR", "ARCHIVE", "MOVE_TO_INBOX", "RESTORE_FROM_TRASH"]),
});

function getHeader(message, name) {
  return message.payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function collectAttachments(part, output = []) {
  if (!part) return output;
  if (typeof part.filename === "string" && part.filename.trim()) {
    output.push({
      name: part.filename.slice(0, 300),
      mimeType: typeof part.mimeType === "string" ? part.mimeType.slice(0, 120) : "application/octet-stream",
      size: Number.isFinite(part.body?.size) ? part.body.size : 0,
    });
  }
  for (const child of part.parts || []) collectAttachments(child, output);
  return output;
}

async function getOwnedEmail(userId, id) {
  return prisma.inboundEmail.findFirst({
    where: { id, userId },
    select: { id: true, gmailMessageId: true, fromEmail: true, subject: true, receivedAt: true, status: true, summary: true, draftId: true },
  });
}

async function getConnectedGoogle(userId) {
  const integration = await prisma.integration.findFirst({
    where: { userId, provider: "GOOGLE", status: "CONNECTED" },
    orderBy: { updatedAt: "desc" },
    select: { scopes: true },
  });
  if (!integration) return { error: "Connect Google Workspace before managing this email.", status: 403 };
  let token;
  try {
    token = await getGoogleAccessToken(userId);
  } catch {
    return { error: "Your Google connection needs to be reconnected.", status: 403 };
  }
  if (!token?.accessToken) return { error: "Your Google connection needs to be reconnected.", status: 403 };
  return { token, scopes: integration.scopes };
}

async function gmailPost(accessToken, url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: "Bearer " + accessToken,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof result.error?.message === "string" ? result.error.message.slice(0, 200) : "Gmail rejected the mailbox update.";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return result;
}

async function getLabels(accessToken, gmailMessageId) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(gmailMessageId));
  url.searchParams.set("format", "minimal");
  return googleApiGet(accessToken, url.toString());
}

export async function GET(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to read this email." }, { status: 401 });

  const { id } = await context.params;
  const record = await getOwnedEmail(user.id, id);
  if (!record) return NextResponse.json({ error: "Email not found." }, { status: 404 });

  const access = await getConnectedGoogle(user.id);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.scopes.includes(EMAIL_READ_SCOPE)) {
    return NextResponse.json({ error: "Reconnect Google with Gmail read permission to open the original email." }, { status: 403 });
  }

  try {
    const apiUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(record.gmailMessageId));
    apiUrl.searchParams.set("format", "full");
    const gmailMessage = await googleApiGet(access.token.accessToken, apiUrl.toString());
    const body = extractMessageText(gmailMessage, MAX_BODY_LENGTH);
    const internalDate = gmailMessage.internalDate ? new Date(Number(gmailMessage.internalDate)) : null;
    const labels = Array.isArray(gmailMessage.labelIds) ? gmailMessage.labelIds : [];
    return NextResponse.json({
      message: {
        id: record.id,
        from: getHeader(gmailMessage, "From") || record.fromEmail,
        to: getHeader(gmailMessage, "To"),
        cc: getHeader(gmailMessage, "Cc"),
        replyTo: getHeader(gmailMessage, "Reply-To"),
        subject: getHeader(gmailMessage, "Subject") || record.subject,
        receivedAt: internalDate && !Number.isNaN(internalDate.getTime()) ? internalDate : record.receivedAt,
        body,
        bodyTruncated: body.length >= MAX_BODY_LENGTH,
        attachments: collectAttachments(gmailMessage.payload).slice(0, 30),
        status: record.status,
        summary: record.summary,
        draftId: record.draftId,
        labelIds: labels,
        canModify: access.scopes.includes(GMAIL_MODIFY_SCOPE),
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gmail could not return this email." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}

export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to update this email." }, { status: 401 });
  const { id } = await context.params;
  const record = await getOwnedEmail(user.id, id);
  if (!record) return NextResponse.json({ error: "Email not found." }, { status: 404 });

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a supported Gmail mailbox action." }, { status: 400 });

  const access = await getConnectedGoogle(user.id);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.scopes.includes(GMAIL_MODIFY_SCOPE)) {
    return NextResponse.json({
      error: "Gmail modification permission is not granted. Reconnect Google from Connections and approve Gmail modify access.",
      reconnectRequired: true,
    }, { status: 403 });
  }

  const base = "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(record.gmailMessageId);
  try {
    if (parsed.data.action === "RESTORE_FROM_TRASH") {
      await gmailPost(access.token.accessToken, base + "/untrash");
    } else {
      await gmailPost(access.token.accessToken, base + "/modify", getGmailModifyPayload(parsed.data.action));
    }
    const updated = await getLabels(access.token.accessToken, record.gmailMessageId);
    await prisma.auditEvent.create({
      data: {
        userId: user.id,
        eventType: "GMAIL_MESSAGE_UPDATED",
        actor: "USER",
        resourceId: record.id,
        metadata: { action: parsed.data.action },
      },
    }).catch(() => undefined);
    return NextResponse.json({
      updated: true,
      message: {
        id: record.id,
        labelIds: Array.isArray(updated.labelIds) ? updated.labelIds : [],
        canModify: true,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error?.status === 404 ? 404 : error?.status === 403 ? 403 : 502;
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Gmail could not update this message.",
    }, { status });
  }
}

export async function DELETE(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to move this email to Trash." }, { status: 401 });
  const { id } = await context.params;
  const record = await getOwnedEmail(user.id, id);
  if (!record) return NextResponse.json({ error: "Email not found." }, { status: 404 });

  const access = await getConnectedGoogle(user.id);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.scopes.includes(GMAIL_MODIFY_SCOPE)) {
    return NextResponse.json({
      error: "Gmail modification permission is not granted. Reconnect Google from Connections and approve Gmail modify access.",
      reconnectRequired: true,
    }, { status: 403 });
  }

  const base = "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(record.gmailMessageId);
  try {
    const updated = await gmailPost(access.token.accessToken, base + "/trash");
    await prisma.auditEvent.create({
      data: {
        userId: user.id,
        eventType: "GMAIL_MESSAGE_TRASHED",
        actor: "USER",
        resourceId: record.id,
        metadata: { subject: record.subject },
      },
    }).catch(() => undefined);
    return NextResponse.json({
      trashed: true,
      message: { id: record.id, labelIds: Array.isArray(updated.labelIds) ? updated.labelIds : ["TRASH"], canModify: true },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error?.status === 404 ? 404 : error?.status === 403 ? 403 : 502;
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Gmail could not move this message to Trash.",
    }, { status });
  }
}
