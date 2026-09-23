import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-log";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import {
  resolveApprovedDiscountAndStatus,
  type ReviewAction,
  type AuthorizationSnapshot,
} from "@/lib/discount-authorization";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { permissions, organizationId } = await getRequestOrgAccess(request);
    const { id } = await params;

    const auth = await db.discountAuthorization.findFirst({
      where: {
        id,
        organizationId,
      },
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
    });

    if (!auth) {
      return NextResponse.json({ error: "Solicitud de autorización no encontrada." }, { status: 404 });
    }

    const canApprove = permissions.canApproveDiscounts;
    const canViewCost = permissions.canViewCostAndMargin;

    if (!canViewCost && !canApprove) {
      const snapshot = auth.snapshotJson as unknown as AuthorizationSnapshot;
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
      return NextResponse.json({
        authorization: {
          ...auth,
          snapshotJson: sanitizedSnapshot,
        },
      });
    }

    return NextResponse.json({ authorization: auth });
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, organizationId, permissions } = await getRequestOrgAccess(request);
    const { id } = await params;

    // FASE 8: No cualquier usuario debe poder autorizar.
    if (!permissions.canApproveDiscounts) {
      return NextResponse.json(
        { error: "No tienes permiso para autorizar descuentos (canApproveDiscounts requerido)." },
        { status: 403 }
      );
    }

    // FASE 6 - REGLA 9: Verificar tenant / organización
    const authorization = await db.discountAuthorization.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!authorization) {
      return NextResponse.json({ error: "Solicitud no encontrada en esta organización." }, { status: 404 });
    }

    // FASE 6 - REGLA 7: Una autorización respondida no puede modificarse libremente.
    if (authorization.status !== "PENDING") {
      return NextResponse.json(
        {
          error: `Esta solicitud ya fue procesada anteriormente con estado ${authorization.status} y no puede modificarse.`,
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const action = body.action as ReviewAction;
    const partialAmount = body.partialAmount !== undefined ? Number(body.partialAmount) : undefined;
    const responseNote = body.responseNote ? String(body.responseNote).trim() : null;

    if (!action || !["APPROVE", "APPROVE_PARTIAL", "REJECT"].includes(action)) {
      return NextResponse.json(
        { error: "Acción inválida. Debe ser APPROVE, APPROVE_PARTIAL o REJECT." },
        { status: 400 }
      );
    }

    // FASE 6 - REGLAS 1, 3, 4, 5
    let resolution: ReturnType<typeof resolveApprovedDiscountAndStatus>;
    try {
      resolution = resolveApprovedDiscountAndStatus({
        action,
        requestedDiscount: Number(authorization.requestedDiscount),
        partialAmount,
      });
    } catch (valErr) {
      return NextResponse.json(
        { error: valErr instanceof Error ? valErr.message : "Error de validación" },
        { status: 400 }
      );
    }

    const updated = await db.discountAuthorization.update({
      where: { id: authorization.id },
      data: {
        status: resolution.status,
        approvedDiscount: resolution.approvedDiscount,
        authorizedByUserId: session.userId,
        responseNote,
        respondedAt: new Date(),
      },
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
    });

    // FASE 10 - AUDITORÍA
    await logAudit({
      organizationId,
      actorUserId: session.userId,
      action: `discount_authorization.${resolution.status.toLowerCase()}`,
      entity: "DiscountAuthorization",
      entityId: updated.id,
      meta: {
        action,
        draftSaleId: updated.draftSaleId,
        requestedDiscount: Number(updated.requestedDiscount),
        approvedDiscount: Number(updated.approvedDiscount),
        status: updated.status,
        responseNote,
        authorizedByUserId: session.userId,
      },
    });

    return NextResponse.json({ authorization: updated });
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
