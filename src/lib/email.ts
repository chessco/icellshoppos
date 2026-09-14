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

const getMailConfig = () => {
  const rawApiKey = process.env.MAILGUN_API_KEY?.trim().replace(/\s+/g, "");
  const domain = process.env.MAILGUN_DOMAIN?.trim().replace(/\s+/g, "");
  const region = (process.env.MAILGUN_REGION || "US").toUpperCase();
  const apiBaseUrl = process.env.MAILGUN_API_BASE_URL || (region === "EU" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net");
  const configuredFrom = (process.env.MAIL_FROM || `no-reply@${domain ?? "imeicheck2.com"}`).trim().replace(/\s+/g, "");

  if (!rawApiKey || !domain) {
    throw new Error("Missing MAILGUN_API_KEY or MAILGUN_DOMAIN in environment variables.");
  }

  const fromDomain = configuredFrom.includes("@") ? configuredFrom.split("@").pop()?.toLowerCase() ?? "" : "";
  const domainLower = domain.toLowerCase();
  const fromMatchesDomain =
    fromDomain === domainLower ||
    fromDomain.endsWith(`.${domainLower}`) ||
    domainLower.endsWith(`.${fromDomain}`);

  const from = fromMatchesDomain ? configuredFrom : `no-reply@${domainLower}`;

  return { apiKey: rawApiKey, domain, from, apiBaseUrl };
};

const getGmailTransport = () => {
  const user = (process.env.GMAIL_USER?.trim() || process.env.SMTP_USER?.trim())?.toLowerCase();
  const pass = (process.env.GMAIL_APP_PASSWORD?.trim() || process.env.SMTP_PASS?.trim())?.replace(/\s+/g, "");
  if (!user || !pass) return null;

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
};

export async function sendEmail({ to, subject, text, html, attachments }: SendEmailArgs) {
  // 1. Try Gmail SMTP if configured
  const gmailTransport = getGmailTransport();
  if (gmailTransport) {
    try {
      const fromUser = process.env.GMAIL_USER?.trim() || process.env.SMTP_USER?.trim();
      const mailOptions: nodemailer.SendMailOptions = {
        from: `Pro Buyer <${fromUser}>`,
        to,
        subject,
        text,
        html,
        attachments: attachments?.map((att) => ({
          filename: att.filename,
          content: Buffer.from(att.content),
          contentType: att.contentType,
        })),
      };
      const info = await gmailTransport.sendMail(mailOptions);
      console.log(`\n📧 [Email Sent via Gmail] MessageId: ${info.messageId} to: ${to}`);
      return { ok: true, messageId: info.messageId };
    } catch (gmailError) {
      console.error("[Gmail Send Error]", gmailError);
      if (process.env.NODE_ENV !== "production") {
        console.log(`\n=======================================================\n[LOCAL 2FA CODE / EMAIL FALLBACK]\nTo: ${to}\nSubject: ${subject}\nText:\n${text}\n=======================================================\n`);
        return { ok: true, fallback: true };
      }
      throw gmailError;
    }
  }

  // 2. In local development without Mailgun credentials, log code to console so user is never blocked
  if (process.env.NODE_ENV !== "production" && (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN)) {
    console.log(`\n=======================================================\n[LOCAL 2FA CODE / EMAIL CONSOLE LOG]\nTo: ${to}\nSubject: ${subject}\nText:\n${text}\n=======================================================\n`);
    return { ok: true, devMode: true };
  }

  const { apiKey, domain, from, apiBaseUrl } = getMailConfig();

  const authHeader =
    "Basic " + Buffer.from(`api:${apiKey}`).toString("base64");

  let response: Response;

  if (attachments && attachments.length > 0) {
    const formData = new FormData();
    formData.set("from", from);
    formData.set("to", to);
    formData.set("subject", subject);
    formData.set("text", text);
    if (html) {
      formData.set("html", html);
    }

    for (const attachment of attachments) {
      const attachmentBytes = Uint8Array.from(attachment.content);
      formData.append(
        "attachment",
        new Blob([attachmentBytes], {
          type: attachment.contentType ?? "application/octet-stream",
        }),
        attachment.filename
      );
    }

    response = await fetch(`${apiBaseUrl}/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
      },
      body: formData,
    });
  } else {
    const body = new URLSearchParams();
    body.set("from", from);
    body.set("to", to);
    body.set("subject", subject);
    body.set("text", text);
    if (html) {
      body.set("html", html);
    }

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
      `Mailgun send failed with status ${response.status}${errorText ? `: ${errorText}` : ""}`
    );
  }

  return response.json().catch(() => ({ ok: true }));
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
