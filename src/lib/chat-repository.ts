import { db } from "@/lib/db";
import { randomUUID } from "crypto";

export type ChatMessageRecord = {
  id: string;
  organizationId: string;
  channel: "WHATSAPP" | "INTERNAL";
  conversationId: string;
  senderId: string | null;
  senderName: string | null;
  recipientPhone: string | null;
  recipientName: string | null;
  recipientUserId: string | null;
  content: string;
  direction: "OUTBOUND" | "INBOUND";
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  mediaUrl: string | null;
  providerMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ConversationSummary = {
  id: string;
  conversationId: string;
  cleanPhone?: string;
  formattedPhone?: string;
  clientName?: string;
  partnerName?: string;
  partnerRole?: string;
  partnerUserId?: string;
  lastMessage: string;
  direction?: string;
  status?: string;
  updatedAt: string;
  unread: number;
};

export async function createChatMessage(data: {
  organizationId: string;
  channel: "WHATSAPP" | "INTERNAL";
  conversationId: string;
  senderId?: string | null;
  senderName?: string | null;
  recipientPhone?: string | null;
  recipientName?: string | null;
  recipientUserId?: string | null;
  content: string;
  direction?: "OUTBOUND" | "INBOUND";
  status?: "SENT" | "DELIVERED" | "READ" | "FAILED";
  mediaUrl?: string | null;
  providerMessageId?: string | null;
}): Promise<ChatMessageRecord> {
  const id = randomUUID();
  const now = new Date();
  const direction = data.direction || "OUTBOUND";
  const status = data.status || "SENT";

  await db.$executeRawUnsafe(
    `INSERT INTO "ChatMessage" (
      "id", "organizationId", "channel", "conversationId", 
      "senderId", "senderName", "recipientPhone", "recipientName", "recipientUserId", 
      "content", "direction", "status", "mediaUrl", "providerMessageId", 
      "createdAt", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    id,
    data.organizationId,
    data.channel,
    data.conversationId,
    data.senderId || null,
    data.senderName || null,
    data.recipientPhone || null,
    data.recipientName || null,
    data.recipientUserId || null,
    data.content,
    direction,
    status,
    data.mediaUrl || null,
    data.providerMessageId || null,
    now,
    now
  );

  return {
    id,
    organizationId: data.organizationId,
    channel: data.channel,
    conversationId: data.conversationId,
    senderId: data.senderId || null,
    senderName: data.senderName || null,
    recipientPhone: data.recipientPhone || null,
    recipientName: data.recipientName || null,
    recipientUserId: data.recipientUserId || null,
    content: data.content,
    direction,
    status,
    mediaUrl: data.mediaUrl || null,
    providerMessageId: data.providerMessageId || null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getChatMessages(
  organizationId: string,
  channel: "WHATSAPP" | "INTERNAL",
  conversationId: string
): Promise<ChatMessageRecord[]> {
  const rows = await db.$queryRawUnsafe<any[]>(
    `SELECT * FROM "ChatMessage"
     WHERE "organizationId" = $1 AND "channel" = $2 AND "conversationId" = $3
     ORDER BY "createdAt" ASC`,
    organizationId,
    channel,
    conversationId
  );

  return rows.map((r) => ({
    id: String(r.id),
    organizationId: String(r.organizationId),
    channel: r.channel as "WHATSAPP" | "INTERNAL",
    conversationId: String(r.conversationId),
    senderId: r.senderId ? String(r.senderId) : null,
    senderName: r.senderName ? String(r.senderName) : null,
    recipientPhone: r.recipientPhone ? String(r.recipientPhone) : null,
    recipientName: r.recipientName ? String(r.recipientName) : null,
    recipientUserId: r.recipientUserId ? String(r.recipientUserId) : null,
    content: String(r.content),
    direction: (r.direction || "OUTBOUND") as "OUTBOUND" | "INBOUND",
    status: (r.status || "SENT") as "SENT" | "DELIVERED" | "READ" | "FAILED",
    mediaUrl: r.mediaUrl ? String(r.mediaUrl) : null,
    providerMessageId: r.providerMessageId ? String(r.providerMessageId) : null,
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  }));
}

export async function getWhatsAppConversations(organizationId: string): Promise<ConversationSummary[]> {
  // Fetch messages grouped by conversationId
  const messages = await db.$queryRawUnsafe<any[]>(
    `SELECT DISTINCT ON ("conversationId") *
     FROM "ChatMessage"
     WHERE "organizationId" = $1 AND "channel" = 'WHATSAPP'
     ORDER BY "conversationId", "createdAt" DESC`,
    organizationId
  );

  // Also fetch customers with phone to ensure all known customers are available in the conversation list
  const customers = await db.customer.findMany({
    where: { organizationId, whatsapp: { not: null } },
    select: { id: true, name: true, whatsapp: true, updatedAt: true },
  });

  const repairCustomers = await db.repairCustomer.findMany({
    where: { organizationId, whatsapp: { not: null } },
    select: { id: true, name: true, whatsapp: true, updatedAt: true },
  });

  const convMap = new Map<string, ConversationSummary>();

  // Helper for phone clean & display
  const formatPhone = (digits: string) => {
    const d = digits.replace(/\D/g, "");
    if (d.length === 10) return `+52 ${d.substring(0, 3)} ${d.substring(3, 6)} ${d.substring(6)}`;
    if (d.length === 12 && d.startsWith("52")) return `+52 ${d.substring(2, 5)} ${d.substring(5, 8)} ${d.substring(8)}`;
    return `+${d}`;
  };

  // Add recorded message conversations
  for (const m of messages) {
    const cleanPhone = String(m.conversationId).replace(/\D/g, "");
    const formatted = formatPhone(cleanPhone);
    const clientName = m.recipientName || `CLIENTE (${formatted})`;

    convMap.set(cleanPhone, {
      id: cleanPhone,
      conversationId: cleanPhone,
      cleanPhone,
      formattedPhone: formatted,
      clientName: clientName.toUpperCase(),
      lastMessage: m.content || "Sin mensajes",
      direction: m.direction,
      status: m.status,
      updatedAt: new Date(m.createdAt).toISOString(),
      unread: 0,
    });
  }

  // Merge registered Customers
  for (const c of customers) {
    if (!c.whatsapp) continue;
    const cleanDigits = c.whatsapp.replace(/\D/g, "");
    const key = cleanDigits.length === 10 ? `52${cleanDigits}` : cleanDigits;
    if (!key) continue;

    if (convMap.has(key)) {
      const existing = convMap.get(key)!;
      if (c.name && (!existing.clientName || existing.clientName.startsWith("CLIENTE ("))) {
        existing.clientName = c.name.toUpperCase();
      }
    } else {
      convMap.set(key, {
        id: key,
        conversationId: key,
        cleanPhone: key,
        formattedPhone: formatPhone(key),
        clientName: (c.name || "CLIENTE").toUpperCase(),
        lastMessage: "Sin conversación previa",
        updatedAt: new Date(c.updatedAt).toISOString(),
        unread: 0,
      });
    }
  }

  // Merge Repair Customers
  for (const rc of repairCustomers) {
    if (!rc.whatsapp) continue;
    const cleanDigits = rc.whatsapp.replace(/\D/g, "");
    const key = cleanDigits.length === 10 ? `52${cleanDigits}` : cleanDigits;
    if (!key) continue;

    if (convMap.has(key)) {
      const existing = convMap.get(key)!;
      if (rc.name && (!existing.clientName || existing.clientName.startsWith("CLIENTE ("))) {
        existing.clientName = rc.name.toUpperCase();
      }
    } else {
      convMap.set(key, {
        id: key,
        conversationId: key,
        cleanPhone: key,
        formattedPhone: formatPhone(key),
        clientName: (rc.name || "CLIENTE REPARACIÓN").toUpperCase(),
        lastMessage: "Sin conversación previa",
        updatedAt: new Date(rc.updatedAt).toISOString(),
        unread: 0,
      });
    }
  }

  return Array.from(convMap.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getInternalConversations(
  organizationId: string,
  currentUserId: string
): Promise<ConversationSummary[]> {
  // Find all team members in this org
  const memberships = await db.membership.findMany({
    where: { organizationId },
    include: {
      user: {
        select: { id: true, fullName: true, email: true },
      },
    },
  });

  const users = memberships
    .map((m) => ({
      id: m.user.id,
      name: m.user.fullName || m.user.email.split("@")[0],
      role: m.role.toUpperCase(),
    }))
    .filter((u) => u.id !== currentUserId);

  // Find latest message for each partner
  const latestMessages = await db.$queryRawUnsafe<any[]>(
    `SELECT DISTINCT ON ("conversationId") *
     FROM "ChatMessage"
     WHERE "organizationId" = $1 AND "channel" = 'INTERNAL'
     ORDER BY "conversationId", "createdAt" DESC`,
    organizationId
  );

  const msgMap = new Map<string, any>();
  for (const m of latestMessages) {
    msgMap.set(m.conversationId, m);
  }

  const result: ConversationSummary[] = [];

  for (const u of users) {
    // Standard symmetric roomId for two users
    const roomId = [currentUserId, u.id].sort().join("_");
    const lastMsg = msgMap.get(roomId);

    result.push({
      id: roomId,
      conversationId: roomId,
      partnerUserId: u.id,
      partnerName: u.name,
      partnerRole: u.role,
      lastMessage: lastMsg?.content || "Sin mensajes aún",
      updatedAt: lastMsg ? new Date(lastMsg.createdAt).toISOString() : new Date(0).toISOString(),
      unread: 0,
    });
  }

  return result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
