import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-log";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import {
  calculateDiscountFinancials,
  type AuthorizationSnapshot,
  type EquipmentSnapshot,
} from "@/lib/discount-authorization";
import { notifyAuthorizerViaWhatsApp } from "@/lib/pitayacore-agent";

export async function GET(request: NextRequest) {
  try {
    const { session, organizationId, permissions } = await getRequestOrgAccess(request);

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status")?.trim().toUpperCase();
    const draftSaleId = searchParams.get("draftSaleId")?.trim();

    const whereClause: Record<string, unknown> = {
      organizationId,
    };

    if (statusParam && statusParam !== "ALL") {
      whereClause.status = statusParam;
    }

    if (draftSaleId) {
      whereClause.draftSaleId = draftSaleId;
    }

    // If user is just staff without canApproveDiscounts and without canViewCostAndMargin,
    // they can only see their own requests if requested
    const canApprove = permissions.canApproveDiscounts;
    const canViewCost = permissions.canViewCostAndMargin;

    const authorizations = await db.discountAuthorization.findMany({
      where: whereClause,
      include: {
        requestedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        authorizedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Strip sensitive cost/margin data from snapshot if user doesn't have permission to view costs
    const sanitized = authorizations.map((auth) => {
      const snapshot = auth.snapshotJson as unknown as AuthorizationSnapshot;
      if (!canViewCost && !canApprove) {
        const sanitizedSnapshot: AuthorizationSnapshot = {
          ...snapshot,
          items: (snapshot.items || []).map((item) => ({
            ...item,
            costPesos: 0,
          })),
          financials: {
            ...snapshot.financials,
            totalCost: 0,
            marginBeforeDiscount: 0,
            marginPercentageBeforeDiscount: 0,
            marginAfterRequestedDiscount: 0,
            marginPercentageAfterRequestedDiscount: 0,
          },
        };
        return {
          ...auth,
          snapshotJson: sanitizedSnapshot,
        };
      }
      return auth;
    });

    return NextResponse.json({ authorizations: sanitized });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session, organizationId, permissions } = await getRequestOrgAccess(request);

    if (!permissions.canCreateSales) {
      return NextResponse.json({ error: "Forbidden: No permission to create sales" }, { status: 403 });
    }

    const body = await request.json();
    const draftSaleId = String(body.draftSaleId || "").trim();
    const requestedDiscount = Number(body.requestedDiscount);
    const reason = String(body.reason || "").trim();
    const customerName = String(body.customerName || "").trim();
    const customerEmail = body.customerEmail ? String(body.customerEmail).trim() : null;
    const customerWhatsapp = body.customerWhatsapp ? String(body.customerWhatsapp).trim() : null;
    const itemsInput = Array.isArray(body.items) ? body.items : [];

    if (!draftSaleId) {
      return NextResponse.json({ error: "draftSaleId es requerido." }, { status: 400 });
    }

    if (!Number.isFinite(requestedDiscount) || requestedDiscount <= 0) {
      return NextResponse.json({ error: "El descuento solicitado debe ser mayor a 0." }, { status: 400 });
    }

    if (!reason) {
      return NextResponse.json({ error: "El motivo del descuento es requerido." }, { status: 400 });
    }

    if (itemsInput.length === 0) {
      return NextResponse.json({ error: "Debe incluir al menos un equipo en la solicitud." }, { status: 400 });
    }

    // Look up real inventory items from database for this organization
    const itemIds = itemsInput.map((it: { inventoryItemId?: string }) => it.inventoryItemId).filter(Boolean);
    const inventoryItems = await db.inventoryItem.findMany({
      where: {
        organizationId,
        id: { in: itemIds },
      },
    });

    const inventoryMap = new Map(inventoryItems.map((item) => [item.id, item]));

    const equipmentList: EquipmentSnapshot[] = itemsInput.map((it: { inventoryItemId: string; salePrice?: number }) => {
      const inv = inventoryMap.get(it.inventoryItemId);
      return {
        inventoryItemId: it.inventoryItemId,
        imei: inv?.imei || "",
        serialNumber: inv?.serialNumber || null,
        model: inv?.model || "Desconocido",
        capacity: inv?.capacity || "",
        color: inv?.color || "",
        batteryHealth: inv?.batteryHealth || null,
        costPesos: inv?.costPesos ? Number(inv.costPesos) : 0,
        salePrice: Number(it.salePrice) || (inv?.price ? Number(inv.price) : 0),
      };
    });

    const financials = calculateDiscountFinancials({
      items: equipmentList,
      requestedDiscount,
    });

    // Check that requested discount does not exceed the total sale price
    if (requestedDiscount > financials.originalPrice) {
      return NextResponse.json(
        { error: "El descuento solicitado no puede superar el precio total de la venta." },
        { status: 400 }
      );
    }

    const sellerUser = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, fullName: true, email: true },
    });

    const snapshot: AuthorizationSnapshot = {
      customer: {
        name: customerName || "Cliente Mostrador",
        email: customerEmail,
        whatsapp: customerWhatsapp,
      },
      seller: {
        id: session.userId,
        name: sellerUser?.fullName || session.email || "Vendedor",
        email: sellerUser?.email || session.email || "",
      },
      items: equipmentList,
      financials,
    };

    // If there is already an active PENDING authorization for this draftSaleId, mark it CANCELLED
    await db.discountAuthorization.updateMany({
      where: {
        organizationId,
        draftSaleId,
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
      },
    });

    const authorization = await db.discountAuthorization.create({
      data: {
        organizationId,
        draftSaleId,
        requestedByUserId: session.userId,
        status: "PENDING",
        requestedDiscount,
        approvedDiscount: 0,
        reason,
        snapshotJson: snapshot as unknown as object,
      },
      include: {
        requestedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    await logAudit({
      organizationId,
      actorUserId: session.userId,
      action: "discount_authorization.create",
      entity: "DiscountAuthorization",
      entityId: authorization.id,
      meta: {
        draftSaleId,
        requestedDiscount,
        reason,
        customerName,
      },
    });

    // --- Notificar al autorizador por WhatsApp via PitayaCore ---
    // Leer el número del autorizador configurado en la organización
    let agentTriggered = false;
    let agentError: string | undefined;

    try {
      const authorizerSetting = await db.systemSetting.findUnique({
        where: { key: `integration:${organizationId}:pitayacore_authorizer_phone` },
      });
      const authorizerPhone = authorizerSetting?.value || "";

      const agentResult = await notifyAuthorizerViaWhatsApp({
        authorizationId: authorization.id,
        organizationId,
        authorizerPhone,
        snapshot,
      });

      agentTriggered = agentResult.success;
      agentError = agentResult.error;

      if (!agentResult.success) {
        console.warn(
          `[PitayaCore] No se pudo notificar al autorizador para solicitud ${authorization.id}:`,
          agentResult.error
        );
      } else {
        console.log(
          `[PitayaCore] Notificación enviada al autorizador para solicitud ${authorization.id} | msgId: ${agentResult.messageId}`
        );
      }
    } catch (agentErr: any) {
      agentError = agentErr?.message || "Error al contactar PitayaCore.";
      console.error(`[PitayaCore] Excepción al notificar autorizador:`, agentErr);
    }

    return NextResponse.json({ authorization, agentTriggered, agentError: agentError || null }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
