import "server-only";
import { Resend } from "resend";
import { serverEnv } from "@/lib/env";
import type { EmailContent } from "@/lib/email/templates";

export type SendResult =
  | { status: "sent"; id: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

let resend: Resend | null = null;

/**
 * Sends an email through Resend. Without RESEND_API_KEY (local development)
 * the email is NOT sent: it is logged and reported as "skipped".
 */
export async function sendEmail(to: string, content: EmailContent): Promise<SendResult> {
  const apiKey = serverEnv.resendApiKey;
  if (!apiKey) {
    console.info(`[email] RESEND_API_KEY not set — email NOT sent. to=${to} subject="${content.subject}"`);
    if (process.env.NODE_ENV !== "production") console.info(`[email] text body:\n${content.text}`);
    return { status: "skipped", reason: "RESEND_API_KEY not configured" };
  }

  resend ??= new Resend(apiKey);
  try {
    const { data, error } = await resend.emails.send({
      from: serverEnv.emailFrom,
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
    if (error || !data) {
      console.error("[email] Resend rejected the email", { subject: content.subject, error: error?.message });
      return { status: "failed", error: error?.message ?? "Unknown Resend error" };
    }
    return { status: "sent", id: data.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[email] Failed to call Resend", { subject: content.subject, error: message });
    return { status: "failed", error: message };
  }
}
