import nodemailer from "nodemailer";

/**
 * Sends a partial payment notification email to the customer.
 * @param args - { to, customerName, amountPaid, previousBalance, newBalance }
 */
export async function sendPartialPaymentNotificationEmail(args: {
  to: string;
  customerName?: string | null;
  amountPaid: number;
  previousBalance: number;
  newBalance: number;
}) {
  const customerName = args.customerName?.trim() || "customer";
  const subject = `Partial Payment Received`;
  const text =
    `Hey ${customerName},\n\n` +
    `We have received your $${args.amountPaid.toFixed(2)} partial payment.\n` +
    `Your balance was $${args.previousBalance.toFixed(2)} before your payment.\n` +
    `Your new outstanding balance is $${args.newBalance.toFixed(2)}.\n\n` +
    `Thank you.`;
  const html =
    `<p>Hey ${escapeHtml(customerName)},</p>` +
    `<p>We have received your <strong>$${args.amountPaid.toFixed(2)}</strong> partial payment.</p>` +
    `<p>Your balance was <strong>$${args.previousBalance.toFixed(2)}</strong> before your payment.<br/>` +
    `Your new outstanding balance is <strong>$${args.newBalance.toFixed(2)}</strong>.</p>` +
    `<p>Thank you.</p>`;
  return sendEmail({
    to: args.to,
    subject,
    text,
    html,
  });
}
type SendEmailArgs = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | Uint8Array;
    contentType?: string;
  }>;
};

type NotificationItem = {
  imei?: string | null;
  model?: string | null;
  capacity?: string | null;
  color?: string | null;
  salePrice?: string | number | null;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatItemLine = (item: NotificationItem) => {
  const parts = [item.model, item.capacity, item.color].filter(
    (value): value is string => Boolean(value && String(value).trim())
  );
  const detail = parts.join(" ").trim();
  const imei = String(item.imei ?? "").trim();
  const price = item.salePrice == null ? "" : String(item.salePrice).trim();

  return [detail || "Item", imei ? `IMEI: ${imei}` : "", price ? `Price: ${price}` : ""]
    .filter(Boolean)
    .join(" | ");
};

const buildItemsText = (items: NotificationItem[]) =>
  items.length > 0
    ? items.map((item, index) => `${index + 1}. ${formatItemLine(item)}`).join("\n")
    : "No items included.";

const buildItemsHtml = (items: NotificationItem[]) =>
  items.length > 0
    ? `<ul>${items
        .map((item) => `<li>${escapeHtml(formatItemLine(item))}</li>`)
        .join("")}</ul>`
    : "<p>No items included.</p>";

import { db } from "@/lib/db";

const getMailSettingsFromDb = async (): Promise<Record<string, string>> => {
  try {
    const records = await db.systemSetting.findMany({
      where: {
        key: {
          in: [
            "MAIL_PROVIDER",
            "RESEND_API_KEY",
            "RESEND_FROM_EMAIL",
            "MAILGUN_API_KEY",
            "MAILGUN_DOMAIN",
            "MAILGUN_FROM",
            "MAILGUN_REGION",
            "GMAIL_USER",
            "GMAIL_APP_PASSWORD",
          ],
        },
      },
    });
    const map: Record<string, string> = {};
    for (const record of records) {
      map[record.key] = record.value;
    }
    return map;
  } catch (err) {
    console.warn("[MailSettings] Could not query DB settings, using env:", err);
    return {};
  }
};

export type MailProviderType = "resend" | "mailgun" | "gmail";

export type MailConfig = {
  provider: MailProviderType;
  resendApiKey: string;
  resendFromEmail: string;
  mailgunApiKey: string;
  mailgunDomain: string;
  mailgunFrom: string;
  mailgunRegion: string;
  gmailUser: string;
  gmailAppPassword: string;
};

export const getEffectiveMailConfig = async (): Promise<MailConfig> => {
  const dbSettings = await getMailSettingsFromDb();

  const provider = (
    dbSettings["MAIL_PROVIDER"] ||
    process.env.MAIL_PROVIDER ||
    "resend"
  ).toLowerCase() as MailProviderType;

  return {
    provider: ["resend", "mailgun", "gmail"].includes(provider) ? provider : "resend",
    resendApiKey: (dbSettings["RESEND_API_KEY"] || process.env.RESEND_API_KEY || "").trim(),
    resendFromEmail: (
      dbSettings["RESEND_FROM_EMAIL"] ||
      process.env.RESEND_FROM_EMAIL ||
      "onboarding@resend.dev"
    ).trim(),
    mailgunApiKey: (dbSettings["MAILGUN_API_KEY"] || process.env.MAILGUN_API_KEY || "")
      .trim()
      .replace(/\s+/g, ""),
    mailgunDomain: (dbSettings["MAILGUN_DOMAIN"] || process.env.MAILGUN_DOMAIN || "")
      .trim()
      .replace(/\s+/g, ""),
    mailgunFrom: (dbSettings["MAILGUN_FROM"] || process.env.MAIL_FROM || "").trim(),
    mailgunRegion: (
      dbSettings["MAILGUN_REGION"] ||
      process.env.MAILGUN_REGION ||
      "US"
    ).toUpperCase(),
    gmailUser: (
      dbSettings["GMAIL_USER"] ||
      process.env.GMAIL_USER ||
      process.env.SMTP_USER ||
      ""
    )
      .trim()
      .toLowerCase(),
    gmailAppPassword: (
      dbSettings["GMAIL_APP_PASSWORD"] ||
      process.env.GMAIL_APP_PASSWORD ||
      process.env.SMTP_PASS ||
      ""
    ).replace(/\s+/g, ""),
  };
};

const sendViaResend = async (
  config: MailConfig,
  args: SendEmailArgs
): Promise<{ ok: boolean; messageId?: string }> => {
  if (!config.resendApiKey) {
    throw new Error("Missing RESEND_API_KEY in configuration.");
  }

  const fromEmail = config.resendFromEmail || "onboarding@resend.dev";
  const formattedFrom = fromEmail.includes("<")
    ? fromEmail
    : `Pro Buyer <${fromEmail}>`;

  const payload: Record<string, unknown> = {
    from: formattedFrom,
    to: [args.to],
    subject: args.subject,
    text: args.text,
  };

  if (args.html) {
    payload.html = args.html;
  }

  if (args.attachments && args.attachments.length > 0) {
    payload.attachments = args.attachments.map((att) => ({
      filename: att.filename,
      content: (Buffer.isBuffer(att.content)
        ? att.content
        : Buffer.from(att.content)
      ).toString("base64"),
    }));
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text().catch(() => "");
  let json: { id?: string; message?: string; error?: unknown } = {};
  try {
    json = JSON.parse(responseText);
  } catch {
    // raw text
  }

  if (!res.ok) {
    throw new Error(
      `Resend API error (${res.status}): ${json?.message || responseText || "Unknown error"}`
    );
  }

  console.log(`\n📧 [Email Sent via Resend] ID: ${json.id} to: ${args.to}`);
  return { ok: true, messageId: json.id };
};

const sendViaMailgun = async (
  config: MailConfig,
  args: SendEmailArgs
): Promise<{ ok: boolean; messageId?: string }> => {
  if (!config.mailgunApiKey || !config.mailgunDomain) {
    throw new Error("Missing MAILGUN_API_KEY or MAILGUN_DOMAIN in configuration.");
  }

  const apiBaseUrl =
    config.mailgunRegion === "EU"
      ? "https://api.eu.mailgun.net"
      : "https://api.mailgun.net";

  const domain = config.mailgunDomain;
  const configuredFrom = config.mailgunFrom || `no-reply@${domain}`;
  const fromDomain = configuredFrom.includes("@")
    ? configuredFrom.split("@").pop()?.toLowerCase() ?? ""
    : "";
  const domainLower = domain.toLowerCase();
  const fromMatches =
    fromDomain === domainLower ||
    fromDomain.endsWith(`.${domainLower}`) ||
    domainLower.endsWith(`.${fromDomain}`);
  const from = fromMatches ? configuredFrom : `no-reply@${domainLower}`;

  const authHeader =
    "Basic " + Buffer.from(`api:${config.mailgunApiKey}`).toString("base64");

  let response: Response;
  if (args.attachments && args.attachments.length > 0) {
    const formData = new FormData();
    formData.set("from", from);
    formData.set("to", args.to);
    formData.set("subject", args.subject);
    formData.set("text", args.text);
    if (args.html) formData.set("html", args.html);

    for (const attachment of args.attachments) {
      const bytes = Uint8Array.from(attachment.content);
      formData.append(
        "attachment",
        new Blob([bytes], {
          type: attachment.contentType ?? "application/octet-stream",
        }),
        attachment.filename
      );
    }

    response = await fetch(`${apiBaseUrl}/v3/${domain}/messages`, {
      method: "POST",
      headers: { Authorization: authHeader },
      body: formData,
    });
  } else {
    const body = new URLSearchParams();
    body.set("from", from);
    body.set("to", args.to);
    body.set("subject", args.subject);
    body.set("text", args.text);
    if (args.html) body.set("html", args.html);

    response = await fetch(`${apiBaseUrl}/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Mailgun send failed (${response.status}): ${errorText}`
    );
  }

  const json = (await response.json().catch(() => ({}))) as { id?: string };
  console.log(`\n📧 [Email Sent via Mailgun] ID: ${json.id} to: ${args.to}`);
  return { ok: true, messageId: json.id };
};

const sendViaGmail = async (
  config: MailConfig,
  args: SendEmailArgs
): Promise<{ ok: boolean; messageId?: string }> => {
  if (!config.gmailUser || !config.gmailAppPassword) {
    throw new Error("Missing GMAIL_USER or GMAIL_APP_PASSWORD in configuration.");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: config.gmailUser, pass: config.gmailAppPassword },
  });

  const mailOptions: Parameters<typeof transporter.sendMail>[0] = {
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html,
    attachments: args.attachments?.map((att) => ({
      filename: att.filename,
      content: Buffer.from(att.content),
      contentType: att.contentType,
    })),
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`\n📧 [Email Sent via Gmail] MessageId: ${info.messageId} to: ${args.to}`);
  return { ok: true, messageId: info.messageId };
};

export async function sendEmail({
  to,
  subject,
  text,
  html,
  attachments,
}: SendEmailArgs) {
  const config = await getEffectiveMailConfig();

  try {
    if (config.provider === "resend") {
      return await sendViaResend(config, { to, subject, text, html, attachments });
    }
    if (config.provider === "mailgun") {
      return await sendViaMailgun(config, { to, subject, text, html, attachments });
    }
    if (config.provider === "gmail") {
      return await sendViaGmail(config, { to, subject, text, html, attachments });
    }
  } catch (providerError) {
    console.error(`[Email Send Error via ${config.provider}]`, providerError);

    // If superadmin 2FA or local dev, always log to console
    if (
      process.env.NODE_ENV !== "production" ||
      subject.toLowerCase().includes("superadmin") ||
      subject.toLowerCase().includes("verification")
    ) {
      console.log(
        `\n=======================================================\n[FALLBACK EMAIL LOG — Provider: ${config.provider}]\nTo: ${to}\nSubject: ${subject}\nText:\n${text}\n=======================================================\n`
      );
      return { ok: true, fallback: true };
    }

    throw providerError;
  }

  // Fallback for dev mode when no provider matches
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `\n=======================================================\n[LOCAL EMAIL CONSOLE LOG]\nTo: ${to}\nSubject: ${subject}\nText:\n${text}\n=======================================================\n`
    );
    return { ok: true, devMode: true };
  }

  throw new Error(`Unsupported or unconfigured mail provider: ${config.provider}`);
}

export async function sendTestEmail(args: {
  to: string;
  provider?: MailProviderType;
  customConfig?: Partial<MailConfig>;
}) {
  const baseConfig = await getEffectiveMailConfig();
  const provider = args.provider || baseConfig.provider;
  const config: MailConfig = {
    ...baseConfig,
    ...args.customConfig,
    provider,
  };

  const subject = `Test Email from Pro Buyer (${provider.toUpperCase()})`;
  const text = `This is a test email sent from Pro Buyer using the ${provider.toUpperCase()} provider.\n\nSent at: ${new Date().toISOString()}`;
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #1f3563; max-width: 600px;">
      <h2 style="color: #2563eb; margin-bottom: 8px;">Pro Buyer — Test Email</h2>
      <p>Congratulations! Your email integration is working properly.</p>
      <div style="background: #f0f6ff; padding: 14px 18px; border-radius: 10px; border-left: 4px solid #2563eb; margin: 16px 0;">
        <p style="margin: 0; font-size: 14px;"><strong>Active Provider:</strong> ${provider.toUpperCase()}</p>
        <p style="margin: 4px 0 0; font-size: 13px; color: #5f7298;">Timestamp: ${new Date().toLocaleString()}</p>
      </div>
      <p style="font-size: 12px; color: #8fa0c0;">iCellShop / Pro Buyer Ecosystem</p>
    </div>
  `;

  if (provider === "resend") {
    return sendViaResend(config, { to: args.to, subject, text, html });
  }
  if (provider === "mailgun") {
    return sendViaMailgun(config, { to: args.to, subject, text, html });
  }
  if (provider === "gmail") {
    return sendViaGmail(config, { to: args.to, subject, text, html });
  }

  throw new Error(`Invalid provider: ${provider}`);
}


export async function sendVerificationCodeEmail(email: string, code: string) {
  const subject = "Your verification code - Pro Buyer";
  const text = `Your Pro Buyer verification code is: ${code}\n\nThis code expires in 10 minutes.`;
  const html = `<p>Your Pro Buyer verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p><p>This code expires in 10 minutes.</p>`;

  return sendEmail({
    to: email,
    subject,
    text,
    html,
  });
}

export async function sendSuperadminLoginCodeEmail(email: string, code: string) {
  const subject = "Your superadmin login code - Pro Buyer";
  const text =
    `Your Pro Buyer superadmin login code is: ${code}\n\n` +
    "This code expires in 3 minutes. If this wasn't you, change your password immediately.";
  const html =
    `<p>Your Pro Buyer superadmin login code is:</p>` +
    `<p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p>` +
    `<p>This code expires in 3 minutes.</p>` +
    `<p>If this wasn't you, change your password immediately.</p>`;

  return sendEmail({
    to: email,
    subject,
    text,
    html,
  });
}

export async function sendSaleReceiptEmail(args: {
  to: string;
  customerName?: string | null;
  companyName?: string | null;
  companyLogoDataUrl?: string | null;
  saleId: string;
  receiptPdf: Buffer | Uint8Array;
  correction?: boolean;
}) {
  const customerName = args.customerName?.trim() || "customer";
  const companyName = args.companyName?.trim() || "your company";
  const isCorrection = args.correction || (args.saleId && args.saleId.includes("-CORRECTED"));
  const subject = isCorrection
    ? `Corrected Invoice - Cancelled Sale Items (${args.saleId})`
    : `Thank you for your purchase - Receipt ${args.saleId}`;
  const text = isCorrection
    ? `Hello ${customerName},\n\nThis is a corrected invoice for your sale. Cancelled items are shown with strikethrough and negative price.\nYour corrected receipt is attached as a PDF (${args.saleId}).\n\n- ${companyName}`
    : `Hello ${customerName},\n\nThank you for your purchase with ${companyName}.\nYour receipt is attached as a PDF (${args.saleId}).\n\nWe appreciate your business.\n\n- ${companyName}`;
  const html = isCorrection
    ? `<p>Hello ${customerName},</p><p>This is a <strong>corrected invoice</strong> for your sale. Cancelled items are shown with <span style="text-decoration:line-through;">strikethrough</span> and negative price.</p><p>Your corrected receipt is attached as a PDF (<strong>${args.saleId}</strong>).</p><p>- ${companyName}</p>`
      + (args.companyLogoDataUrl
        ? `<div style="margin-top:16px;"><img src="${args.companyLogoDataUrl}" alt="${companyName} logo" style="max-height:64px;max-width:220px;object-fit:contain;" /></div>`
        : "")
    : `<p>Hello ${customerName},</p>` +
      `<p>Thank you for your purchase with <strong>${companyName}</strong>.</p>` +
      `<p>Your receipt is attached as a PDF (<strong>${args.saleId}</strong>).</p>` +
      `<p>We appreciate your business.</p>` +
      `<p>- ${companyName}</p>` +
      (args.companyLogoDataUrl
        ? `<div style="margin-top:16px;"><img src="${args.companyLogoDataUrl}" alt="${companyName} logo" style="max-height:64px;max-width:220px;object-fit:contain;" /></div>`
        : "");

  return sendEmail({
    to: args.to,
    subject,
    text,
    html,
    attachments: [
      {
        filename: `receipt-${args.saleId}.pdf`,
        content: args.receiptPdf,
        contentType: "application/pdf",
      },
    ],
  });
}

export async function sendOrganizationInviteEmail(args: {
  to: string;
  organizationName: string;
  inviterName?: string | null;
  inviteUrl: string;
  expiresAt: Date;
}) {
  const inviter = args.inviterName?.trim() || "A team admin";
  const expiresLabel = args.expiresAt.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const subject = `You're invited to join ${args.organizationName} on Pro Buyer`;
  const text =
    `${inviter} invited you to join ${args.organizationName} on Pro Buyer.\n\n` +
    `Accept invite: ${args.inviteUrl}\n\n` +
    `This invitation expires on ${expiresLabel}.`;
  const html =
    `<p>${inviter} invited you to join <strong>${args.organizationName}</strong> on Pro Buyer.</p>` +
    `<p><a href="${args.inviteUrl}">Accept invitation</a></p>` +
    `<p>This invitation expires on ${expiresLabel}.</p>`;

  return sendEmail({
    to: args.to,
    subject,
    text,
    html,
  });
}

export async function sendPurchaseRequestNotificationEmail(args: {
  to: string;
  organizationName: string;
  requesterName: string;
  requesterEmail: string;
  requesterWhatsapp?: string | null;
  saleId: string;
  items: NotificationItem[];
  reviewUrl: string;
}) {
  const subject = `New purchase request for ${args.organizationName}`;
  const text =
    `A new purchase request has been received for ${args.organizationName}.\n\n` +
    `Sent by: ${args.requesterName}\n` +
    `Email: ${args.requesterEmail}\n` +
    `WhatsApp: ${args.requesterWhatsapp?.trim() || "Not provided"}\n` +
    `Reference: ${args.saleId}\n\n` +
    `Items:\n${buildItemsText(args.items)}\n\n` +
    `Please review it in your UI: ${args.reviewUrl}`;
  const html =
    `<p>A new purchase request has been received for <strong>${escapeHtml(args.organizationName)}</strong>.</p>` +
    `<p><strong>Sent by:</strong> ${escapeHtml(args.requesterName)}<br/>` +
    `<strong>Email:</strong> ${escapeHtml(args.requesterEmail)}<br/>` +
    `<strong>WhatsApp:</strong> ${escapeHtml(args.requesterWhatsapp?.trim() || "Not provided")}<br/>` +
    `<strong>Reference:</strong> ${escapeHtml(args.saleId)}</p>` +
    `<p><strong>Items</strong></p>` +
    buildItemsHtml(args.items) +
    `<p><a href="${escapeHtml(args.reviewUrl)}">Review this purchase request in Pro Buyer</a></p>`;

  return sendEmail({
    to: args.to,
    subject,
    text,
    html,
  });
}

export async function sendInventoryRequestNotificationEmail(args: {
  to: string;
  sourceOrganizationName: string;
  targetOrganizationName: string;
  customerEmail?: string | null;
  saleId: string;
  items: NotificationItem[];
  reviewUrl: string;
}) {
  const subject = `New inventory request for ${args.targetOrganizationName}`;
  const text =
    `A new inventory request has been received for ${args.targetOrganizationName}.\n\n` +
    `Sent by organization: ${args.sourceOrganizationName}\n` +
    `Customer email used: ${args.customerEmail?.trim() || "Not provided"}\n` +
    `Reference: ${args.saleId}\n\n` +
    `Items:\n${buildItemsText(args.items)}\n\n` +
    `Please review it in your UI: ${args.reviewUrl}`;
  const html =
    `<p>A new inventory request has been received for <strong>${escapeHtml(args.targetOrganizationName)}</strong>.</p>` +
    `<p><strong>Sent by organization:</strong> ${escapeHtml(args.sourceOrganizationName)}<br/>` +
    `<strong>Customer email used:</strong> ${escapeHtml(args.customerEmail?.trim() || "Not provided")}<br/>` +
    `<strong>Reference:</strong> ${escapeHtml(args.saleId)}</p>` +
    `<p><strong>Items</strong></p>` +
    buildItemsHtml(args.items) +
    `<p><a href="${escapeHtml(args.reviewUrl)}">Review this inventory request in Pro Buyer</a></p>`;

  return sendEmail({
    to: args.to,
    subject,
    text,
    html,
  });
}
