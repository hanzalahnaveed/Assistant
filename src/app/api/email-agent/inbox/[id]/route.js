import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";
import { extractMessageText } from "@/lib/email-agent/format.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const MAX_BODY_LENGTH = 100000;

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

export async function GET(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to read this email." }, { status: 401 });

  const { id } = await context.params;
  const record = await prisma.inboundEmail.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      gmailMessageId: true,
      fromEmail: true,
      subject: true,
      receivedAt: true,
      status: true,
      summary: true,
      draftId: true,
    },
  });
  if (!record) return NextResponse.json({ error: "Email not found." }, { status: 404 });

  const integration = await prisma.integration.findFirst({
    where: { userId: user.id, provider: "GOOGLE", status: "CONNECTED" },
    orderBy: { updatedAt: "desc" },
    select: { scopes: true },
  });
  if (!integration || !integration.scopes.includes(EMAIL_READ_SCOPE)) {
    return NextResponse.json(
      { error: "Reconnect Google with Gmail read permission to open the original email." },
      { status: 403 },
    );
  }

  let token;
  try {
    token = await getGoogleAccessToken(user.id);
  } catch {
    return NextResponse.json(
      { error: "Your Google connection needs to be reconnected before this email can be opened." },
      { status: 403 },
    );
  }
  if (!token?.accessToken) {
    return NextResponse.json(
      { error: "Your Google connection needs to be reconnected before this email can be opened." },
      { status: 403 },
    );
  }

  try {
    const apiUrl = new URL(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(record.gmailMessageId),
    );
    apiUrl.searchParams.set("format", "full");
    const gmailMessage = await googleApiGet(token.accessToken, apiUrl.toString());
    const body = extractMessageText(gmailMessage, MAX_BODY_LENGTH);
    const internalDate = gmailMessage.internalDate ? new Date(Number(gmailMessage.internalDate)) : null;
    return NextResponse.json({
      message: {
        id: record.id,
        from: getHeader(gmailMessage, "From") || record.fromEmail,
        to: getHeader(gmailMessage, "To"),
        cc: getHeader(gmailMessage, "Cc"),
        replyTo: getHeader(gmailMessage, "Reply-To"),
        subject: getHeader(gmailMessage, "Subject") || record.subject,
        receivedAt: internalDate && !Number.isNaN(internalDate.getTime())
          ? internalDate
          : record.receivedAt,
        body,
        bodyTruncated: body.length >= MAX_BODY_LENGTH,
        attachments: collectAttachments(gmailMessage.payload).slice(0, 30),
        status: record.status,
        summary: record.summary,
        draftId: record.draftId,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gmail could not return this email." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
