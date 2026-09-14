import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
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

type CronOrganizationRow = {
  id: string;
  name: string;
  dioReminderJson: unknown;
  subscriptions: Array<{
    status: string;
    trialEndsAt: Date | null;
    plan: { code: string | null } | null;
  }>;
  memberships: Array<{
    user: { email: string | null; fullName: string | null } | null;
  }>;
};

const DEFAULT_DIO_SETTINGS: DIOSettings = {
  enabled: false,
  thresholdDays: 7,
  weekdays: ["mon", "fri"],
  time: "09:00",
  timezone: "America/Mexico_City",
  lastSentSlots: [],
};

const WEEKDAY_BY_SHORT: Record<string, DIOWeekday> = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
};

const HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
// GitHub scheduled jobs can drift, so keep a wider grace window and dedupe by slot key.
const DIO_DUE_WINDOW_MINUTES = 59;

function normalizeSettings(value: unknown): DIOSettings {
  const source = (value && typeof value === "object" ? value : {}) as Partial<DIOSettings>;

  const thresholdRaw = Number(source.thresholdDays ?? DEFAULT_DIO_SETTINGS.thresholdDays);
  const thresholdDays = Number.isFinite(thresholdRaw)
    ? Math.max(1, Math.min(365, Math.round(thresholdRaw)))
    : DEFAULT_DIO_SETTINGS.thresholdDays;

  const weekdays = Array.isArray(source.weekdays)
    ? Array.from(new Set(source.weekdays.map((item) => String(item).toLowerCase()).filter((item): item is DIOWeekday => Object.values(WEEKDAY_BY_SHORT).includes(item as DIOWeekday))))
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

function getNowInTimezone(timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });

  const parts = formatter.formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";

  const weekdayShort = read("weekday");
  const year = Number(read("year"));
  const month = Number(read("month"));
  const day = Number(read("day"));
  const hour = Number(read("hour"));
  const minute = Number(read("minute"));

  return {
    weekday: WEEKDAY_BY_SHORT[weekdayShort] ?? null,
    year,
    month,
    day,
    hour,
    minute,
  };
}

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
    `<p><strong>DIO Dead Stock Reminder</strong></p>`,
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

function isDueNow(settings: DIOSettings) {
  const now = getNowInTimezone(settings.timezone);
  if (!now.weekday) return { due: false, slotKey: "" };
  if (!settings.weekdays.includes(now.weekday)) return { due: false, slotKey: "" };

  const [targetHour, targetMinute] = settings.time.split(":").map((value) => Number(value));
  const currentMinutes = now.hour * 60 + now.minute;
  const targetMinutes = targetHour * 60 + targetMinute;

  const withinWindow = currentMinutes >= targetMinutes && currentMinutes <= targetMinutes + DIO_DUE_WINDOW_MINUTES;
  const slotKey = `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}:${settings.time}:${now.weekday}`;

  return { due: withinWindow, slotKey };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const tokenFromHeader = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    const tokenFromQuery = request.nextUrl.searchParams.get("token")?.trim() || "";
    const providedToken = tokenFromHeader || tokenFromQuery;

    const expectedToken = process.env.DIO_CRON_SECRET?.trim();
    if (!expectedToken || providedToken !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizations: CronOrganizationRow[] = await (db.organization as unknown as {
      findMany: (args: unknown) => Promise<CronOrganizationRow[]>;
    }).findMany({
      select: {
        id: true,
        name: true,
        dioReminderJson: true,
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            status: true,
            trialEndsAt: true,
            plan: { select: { code: true } },
          },
        },
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

    let sent = 0;
    const results: Array<{ organizationId: string; sent: boolean; reason?: string; count?: number }> = [];

    for (const org of organizations) {
      const currentSub = org.subscriptions[0];
      const hasProAccess =
        isSubscriptionActive(currentSub) &&
        currentSub?.plan?.code?.toLowerCase() === "pro";

      if (!hasProAccess) {
        results.push({ organizationId: org.id, sent: false, reason: "not-pro" });
        continue;
      }

      const settings = normalizeSettings(org.dioReminderJson);
      if (!settings.enabled) {
        results.push({ organizationId: org.id, sent: false, reason: "disabled" });
        continue;
      }

      const dueCheck = isDueNow(settings);
      if (!dueCheck.due) {
        results.push({ organizationId: org.id, sent: false, reason: "not-due" });
        continue;
      }

      if ((settings.lastSentSlots ?? []).includes(dueCheck.slotKey)) {
        results.push({ organizationId: org.id, sent: false, reason: "already-sent" });
        continue;
      }

      const recipients = Array.from(
        new Map(
          org.memberships
            .map((membership) => {
              const email = membership.user?.email?.trim().toLowerCase() ?? "";
              const fullName = membership.user?.fullName ?? null;
              return [email, { email, fullName }] as const;
            })
            .filter(([email]) => Boolean(email))
        ).values()
      );

      if (recipients.length === 0) {
        results.push({ organizationId: org.id, sent: false, reason: "no-recipients" });
        continue;
      }

      const inventoryRows = await db.inventoryItem.findMany({
        where: {
          organizationId: org.id,
          status: { equals: "available", mode: "insensitive" },
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
        results.push({ organizationId: org.id, sent: false, reason: "no-dead-stock" });
        continue;
      }

      const subject = `DIO Reminder: ${flagged.length} dead stock item${flagged.length === 1 ? "" : "s"} (${settings.thresholdDays}+ days)`;
      for (const recipient of recipients) {
        const firstName = extractFirstName(recipient.fullName);
        const text = buildEmailBody(org.name, settings.thresholdDays, firstName, flagged);
        const html = buildEmailHtml(org.name, settings.thresholdDays, firstName, flagged);
        await sendEmail({
          to: recipient.email,
          subject,
          text,
          html,
        });
      }

      const nextSettings: DIOSettings = {
        ...settings,
        lastSentSlots: [...(settings.lastSentSlots ?? []), dueCheck.slotKey].slice(-100),
      };

      await (db.organization as unknown as { update: (args: unknown) => Promise<unknown> }).update({
        where: { id: org.id },
        data: { dioReminderJson: nextSettings as unknown as object },
      });

      sent += 1;
      results.push({ organizationId: org.id, sent: true, count: flagged.length });
    }

    return NextResponse.json({ ok: true, sent, checked: organizations.length, results });
  } catch (error) {
    console.error("[cron/dio-reminders] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
