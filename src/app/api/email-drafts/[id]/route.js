import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken } from "@/lib/google/client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const email = z.string().trim().email().max(254).transform(v => v.toLowerCase());
export async function PATCH(request, context) {
    const user = await getSessionUser();
    if (!user)
        return NextResponse.json({ error: "Sign in to edit drafts." }, { status: 401 });
    const { id } = await context.params;
    const parsed = z.object({ toEmail: email, ccEmail: z.union([email, z.literal("")]).optional().default(""), subject: z.string().trim().min(1).max(250), body: z.string().trim().min(1).max(30000), goal: z.string().trim().max(4000).optional().default("") }).safeParse(await request.json().catch(() => null));
    if (!parsed.success)
        return NextResponse.json({ error: "Recipient, subject, and body are required.", details: parsed.error.flatten() }, { status: 400 });
    const result = await prisma.emailDraft.updateMany({ where: { id, userId: user.id, status: { in: ["DRAFT", "FAILED"] } }, data: { toEmail: parsed.data.toEmail, ccEmail: parsed.data.ccEmail || null, subject: parsed.data.subject, body: parsed.data.body, goal: parsed.data.goal || null, status: "DRAFT", lastError: null } });
    if (!result.count)
        return NextResponse.json({ error: "Draft not found or it can no longer be edited in its current state." }, { status: 409 });
    const draft = await prisma.emailDraft.findFirst({ where: { id, userId: user.id } });
    await prisma.auditEvent.create({ data: { userId: user.id, eventType: "EMAIL_DRAFT_EDITED", actor: "USER", resourceId: id, metadata: { toEmail: parsed.data.toEmail } } });
    return NextResponse.json({ draft }, { headers: { "cache-control": "no-store" } });
}
export async function POST(request, context) {
    const user = await getSessionUser();
    if (!user)
        return NextResponse.json({ error: "Sign in to manage email drafts." }, { status: 401 });
    const { id } = await context.params;
    const parsed = z.object({ action: z.enum(["APPROVE", "SEND", "CANCEL", "CONFIRM_SENT", "CONFIRM_NOT_SENT"]) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success)
        return NextResponse.json({ error: "Choose approve, send, or cancel." }, { status: 400 });
    const draft = await prisma.emailDraft.findFirst({ where: { id, userId: user.id } });
    if (!draft)
        return NextResponse.json({ error: "Email draft not found." }, { status: 404 });
    if (parsed.data.action === "CONFIRM_SENT" || parsed.data.action === "CONFIRM_NOT_SENT") {
        if (draft.status !== "SEND_UNCERTAIN")
            return NextResponse.json({ error: "Only an email with an uncertain send outcome can be manually resolved." }, { status: 409 });
        const confirmedSent = parsed.data.action === "CONFIRM_SENT";
        const changed = await prisma.emailDraft.updateMany({
            where: { id, userId: user.id, status: "SEND_UNCERTAIN" },
            data: confirmedSent
                ? { status: "SENT", sentAt: new Date(), lastError: null }
                : { status: "APPROVED", lastError: null }
        });
        if (!changed.count)
            return NextResponse.json({ error: "This email was already resolved." }, { status: 409 });
        await prisma.auditEvent.create({
            data: { userId: user.id, eventType: confirmedSent ? "EMAIL_SEND_MANUALLY_CONFIRMED_SENT" : "EMAIL_SEND_MANUALLY_CONFIRMED_NOT_SENT", actor: "USER", resourceId: id, metadata: { userConfirmedAfterCheckingGmail: true } }
        });
        return NextResponse.json({ draft: await prisma.emailDraft.findUnique({ where: { id } }) }, { headers: { "cache-control": "no-store" } });
    }
    if (parsed.data.action === "CANCEL") {
        const changed = await prisma.emailDraft.updateMany({ where: { id, userId: user.id, status: { in: ["DRAFT", "APPROVED", "FAILED"] } }, data: { status: "CANCELLED" } });
        if (!changed.count)
            return NextResponse.json({ error: "This email can no longer be cancelled." }, { status: 409 });
        await prisma.auditEvent.create({ data: { userId: user.id, eventType: "EMAIL_DRAFT_CANCELLED", actor: "USER", resourceId: id, metadata: {} } });
        return NextResponse.json({ draft: await prisma.emailDraft.findUnique({ where: { id } }) }, { headers: { "cache-control": "no-store" } });
    }
    if (parsed.data.action === "APPROVE") {
        const changed = await prisma.emailDraft.updateMany({ where: { id, userId: user.id, status: "DRAFT" }, data: { status: "APPROVED", approvedAt: new Date(), lastError: null } });
        if (!changed.count)
            return NextResponse.json({ error: "Only an unapproved draft can be approved. Edit it first if needed." }, { status: 409 });
        await prisma.auditEvent.create({ data: { userId: user.id, eventType: "EMAIL_DRAFT_APPROVED", actor: "USER", resourceId: id, metadata: { toEmail: draft.toEmail, subject: draft.subject } } });
        return NextResponse.json({ draft: await prisma.emailDraft.findUnique({ where: { id } }) }, { headers: { "cache-control": "no-store" } });
    }
    if (draft.status !== "APPROVED")
        return NextResponse.json({ error: "Approve this exact draft before sending." }, { status: 409 });
    const integration = await prisma.integration.findFirst({ where: { userId: user.id, provider: "GOOGLE", status: "CONNECTED" }, orderBy: { updatedAt: "desc" } });
    const scope = "https://www.googleapis.com/auth/gmail.send";
    if (!integration || !integration.scopes.includes(scope))
        return NextResponse.json({ error: "Gmail sending permission is not granted. Reconnect Google from Connections and approve the Gmail send permission." }, { status: 403 });
    const token = await getGoogleAccessToken(user.id);
    if (!token)
        return NextResponse.json({ error: "Google connection needs reconnecting." }, { status: 403 });
    const claim = await prisma.emailDraft.updateMany({ where: { id, userId: user.id, status: "APPROVED" }, data: { status: "SENDING", lastError: null } });
    if (!claim.count)
        return NextResponse.json({ error: "This draft is already being processed or has changed." }, { status: 409 });
    const headers = ["To: " + draft.toEmail, ...(draft.ccEmail ? ["Cc: " + draft.ccEmail] : []), "Subject: " + draft.subject.replace(/[\r\n]+/g, " "), "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit"];
    const raw = Buffer.from(headers.join("\r\n") + "\r\n\r\n" + draft.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64url");
    try {
        const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { authorization: "Bearer " + token.accessToken, "content-type": "application/json" }, body: JSON.stringify({ raw }), cache: "no-store", signal: AbortSignal.timeout(25000) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            const uncertain = response.status >= 500;
            const message = uncertain ? "Google returned a server error; check your Sent folder before retrying to avoid duplicates." : response.status === 403 ? "Google denied Gmail send access. Reconnect and confirm the send permission." : "Gmail rejected this message. Check the recipient and message, then edit the draft.";
            await prisma.emailDraft.update({ where: { id }, data: { status: uncertain ? "SEND_UNCERTAIN" : "FAILED", lastError: message } });
            await prisma.auditEvent.create({ data: { userId: user.id, eventType: uncertain ? "EMAIL_SEND_UNCERTAIN" : "EMAIL_SEND_FAILED", actor: "SYSTEM", resourceId: id, metadata: { httpStatus: response.status } } }).catch(() => undefined);
            return NextResponse.json({ error: message }, { status: uncertain ? 502 : 400 });
        }
        const sent = await prisma.emailDraft.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), providerMessageId: result.id ?? null, lastError: null } });
        await prisma.auditEvent.create({ data: { userId: user.id, eventType: "EMAIL_SENT", actor: "USER", resourceId: id, metadata: { toEmail: draft.toEmail, subject: draft.subject, providerMessageId: result.id ?? null } } }).catch(() => undefined);
        return NextResponse.json({ draft: sent }, { headers: { "cache-control": "no-store" } });
    }
    catch {
        const message = "The send outcome could not be confirmed. Check Gmail Sent before retrying; this draft is locked to avoid accidental duplicate sending.";
        await prisma.emailDraft.update({ where: { id }, data: { status: "SEND_UNCERTAIN", lastError: message } });
        await prisma.auditEvent.create({ data: { userId: user.id, eventType: "EMAIL_SEND_UNCERTAIN", actor: "SYSTEM", resourceId: id, metadata: {} } }).catch(() => undefined);
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
