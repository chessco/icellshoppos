import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveMembership, requireSession } from "@/lib/server-auth";
import { isSubscriptionActive } from "@/lib/subscription";
import { sendEmail } from "@/lib/email";

type DIOWeekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type DIOSettings = {
  enabled: boolean;
  thresholdDays: number;
  weekdays: DIOWeekday[];
  time: string;
  timezone: string;
  lastSentSlots?: string[];
};

type OrgDioSettingsRecord = {
  dioReminderJson: unknown;
};

const DEFAULT_DIO_SETTINGS: DIOSettings = {
  enabled: false,
  thresholdDays: 7,
  weekdays: ["mon", "fri"],
  time: "09:00",
  timezone: "America/Mexico_City",
  lastSentSlots: [],
};

const VALID_WEEKDAYS: DIOWeekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function daysInStock(baseDate: Date) {
  const diffMs = Date.now() - baseDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

function extractFirstName(value: string | null | undefined) {
  if (!value) return "there";
  const firstName = value.trim().split(/\s+/)[0];
  return firstName || "there";
}

function buildEmailBody(
  orgName: string,
  thresholdDays: number,
  firstName: string,
  rows: Array<{ imei: string | null; model: string; capacity: string; color: string; days: number }>
) {
  const header =
    `Dear ${firstName},\n\n` +
    `Please review these devices that have been in stock for more than ${thresholdDays} days.\n` +
    `Here is what's getting old:\n\n` +
    `Organization: ${orgName}\n` +
    `Threshold: ${thresholdDays}+ days\n\n`;
  const lines = rows
    .map((row) => `${row.imei || "N/A"} | ${[row.model, row.capacity, row.color].filter(Boolean).join(" ")} | ${row.days} days`)
    .join("\n");

  return `${header}${lines}\n\nThank you,\nPro Buyer`;
}

function buildEmailHtml(
  orgName: string,
  thresholdDays: number,
  firstName: string,
  rows: Array<{ imei: string | null; model: string; capacity: string; color: string; days: number }>
) {
  const items = rows
    .map((row) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${row.imei || "N/A"}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${[row.model, row.capacity, row.color].filter(Boolean).join(" ")}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${row.days}</td></tr>`)
    .join("");

  return [
    `<p><strong>DIO Dead Stock Test Reminder</strong></p>`,
    `<p>Dear ${firstName},</p>`,
    `<p>Please review these devices that have been in stock for more than <strong>${thresholdDays}</strong> days.</p>`,
    `<p>Here is what's getting old:</p>`,
    `<p>Organization: ${orgName}<br/>Threshold: ${thresholdDays}+ days</p>`,
    `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px;">`,
    `<thead><tr><th align="left" style="padding:6px 8px;border-bottom:2px solid #ddd;">IMEI</th><th align="left" style="padding:6px 8px;border-bottom:2px solid #ddd;">Model / Capacity / Color</th><th align="left" style="padding:6px 8px;border-bottom:2px solid #ddd;">Days in Stock</th></tr></thead>`,
    `<tbody>${items}</tbody>`,
    `</table>`,
    `<p style="margin-top:14px;">Thank you,<br/>Pro Buyer</p>`,
  ].join("");
}

function normalizeSettings(value: unknown): DIOSettings {
  const source = (value && typeof value === "object" ? value : {}) as Partial<DIOSettings>;

  const thresholdDaysRaw = Number(source.thresholdDays ?? DEFAULT_DIO_SETTINGS.thresholdDays);
  const thresholdDays = Number.isFinite(thresholdDaysRaw)
    ? Math.max(1, Math.min(365, Math.round(thresholdDaysRaw)))
    : DEFAULT_DIO_SETTINGS.thresholdDays;

  const weekdays = Array.isArray(source.weekdays)
    ? Array.from(new Set(source.weekdays.map((item) => String(item).toLowerCase()).filter((item): item is DIOWeekday => VALID_WEEKDAYS.includes(item as DIOWeekday))))
    : [...DEFAULT_DIO_SETTINGS.weekdays];

  const time = typeof source.time === "string" && HH_MM_REGEX.test(source.time)
    ? source.time
    : DEFAULT_DIO_SETTINGS.time;

  const timezone = typeof source.timezone === "string" && source.timezone.trim().length > 0
    ? source.timezone.trim()
    : DEFAULT_DIO_SETTINGS.timezone;

  const lastSentSlots = Array.isArray(source.lastSentSlots)
    ? source.lastSentSlots.map((item) => String(item)).filter(Boolean).slice(-100)
    : [];

  return {
    enabled: Boolean(source.enabled),
    thresholdDays,
    weekdays: weekdays.length > 0 ? weekdays : [...DEFAULT_DIO_SETTINGS.weekdays],
    time,
    timezone,
    lastSentSlots,
  };
}

async function getOrgWithSubscription(organizationId: string) {
  const [organization, subscription] = await Promise.all([
    (db.organization as unknown as { findUnique: (args: unknown) => Promise<OrgDioSettingsRecord | null> }).findUnique({
      where: { id: organizationId },
      select: { dioReminderJson: true },
    }),
    db.subscription.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        trialEndsAt: true,
        plan: { select: { code: true } },
      },
    }),
  ]);

  const hasActiveSubscription = isSubscriptionActive(subscription);
  const isProPlan = subscription?.plan?.code?.toLowerCase() === "pro";

  return {
    organization,
    hasProAccess: hasActiveSubscription && isProPlan,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { organization, hasProAccess } = await getOrgWithSubscription(membership.organizationId);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const settings = normalizeSettings(organization.dioReminderJson);

    return NextResponse.json({
      hasProAccess,
      settings,
      defaults: DEFAULT_DIO_SETTINGS,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (membership.role === "staff") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { organization, hasProAccess } = await getOrgWithSubscription(membership.organizationId);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    if (!hasProAccess) {
      return NextResponse.json({ error: "DIO reminders are available on Pro plan only." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const settings = normalizeSettings((body as { settings?: unknown }).settings);

    await (db.organization as unknown as { update: (args: unknown) => Promise<unknown> }).update({
      where: { id: membership.organizationId },
      data: { dioReminderJson: settings as unknown as object },
    });

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (membership.role === "staff") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { organization, hasProAccess } = await getOrgWithSubscription(membership.organizationId);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    if (!hasProAccess) {
      return NextResponse.json({ error: "DIO reminders are available on Pro plan only." }, { status: 403 });
    }

    const settings = normalizeSettings(organization.dioReminderJson);

    const orgWithRecipients = await db.organization.findUnique({
      where: { id: membership.organizationId },
      select: {
        name: true,
        memberships: {
          where: {
            role: { in: ["admin", "superadmin"] },
            user: { status: "active" },
          },
          select: {
            user: { select: { email: true, fullName: true } },
          },
        },
      },
    });

    if (!orgWithRecipients) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const recipients = Array.from(
      new Map(
        orgWithRecipients.memberships
          .map((membership) => {
            const email = membership.user?.email?.trim().toLowerCase() ?? "";
            const fullName = membership.user?.fullName ?? null;
            return [email, { email, fullName }] as const;
          })
          .filter(([email]) => Boolean(email))
      ).values()
    );

    if (recipients.length === 0) {
      return NextResponse.json({ error: "No active admin recipients found." }, { status: 400 });
    }

    const inventoryRows = await db.inventoryItem.findMany({
      where: {
        organizationId: membership.organizationId,
        status: { notIn: ["Sold", "Deleted"] },
      },
      select: {
        imei: true,
        model: true,
        capacity: true,
        color: true,
        createdAt: true,
        dateOfPurchase: true,
      },
    });

    const flagged = inventoryRows
      .map((row) => {
        const baseDate = row.dateOfPurchase ?? row.createdAt;
        return {
          imei: row.imei,
          model: row.model,
          capacity: row.capacity,
          color: row.color,
          days: daysInStock(baseDate),
        };
      })
      .filter((row) => row.days >= settings.thresholdDays)
      .sort((a, b) => b.days - a.days);

    if (flagged.length === 0) {
      return NextResponse.json({ error: "No dead stock items found for current threshold." }, { status: 400 });
    }

    const subject = `TEST DIO Reminder: ${flagged.length} dead stock item${flagged.length === 1 ? "" : "s"} (${settings.thresholdDays}+ days)`;
    for (const recipient of recipients) {
      const firstName = extractFirstName(recipient.fullName);
      const text = buildEmailBody(orgWithRecipients.name, settings.thresholdDays, firstName, flagged);
      const html = buildEmailHtml(orgWithRecipients.name, settings.thresholdDays, firstName, flagged);

      await sendEmail({
        to: recipient.email,
        subject,
        text,
        html,
      });
    }

    return NextResponse.json({ success: true, recipients: recipients.length, itemCount: flagged.length });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
