import { db } from "@/lib/db";

type SeatAvailabilityArgs = {
  organizationId: string;
  includePendingInvites?: boolean;
};

export type SeatAvailability = {
  isUnlimited: boolean;
  availableSeats: number;
  maxSeats: number | null;
  usedSeats: number;
  pendingInvites: number;
  canAddSeat: boolean;
  reason?: string;
};

const BLOCK_MESSAGE =
  "No seats available for your current plan. Go to Billing and click 'Add Seat via Portal' to purchase an extra seat.";

export async function getSeatAvailabilityForOrganization(
  args: SeatAvailabilityArgs
): Promise<SeatAvailability> {
  const includePendingInvites = args.includePendingInvites ?? false;

  const [subscription, usedSeats, pendingInvites] = await Promise.all([
    db.subscription.findFirst({
      where: { organizationId: args.organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        plan: {
          select: {
            code: true,
            includedSeats: true,
          },
        },
        items: {
          select: {
            itemType: true,
            quantity: true,
          },
        },
      },
    }),
    db.membership.count({ where: { organizationId: args.organizationId } }),
    includePendingInvites
      ? (db as unknown as {
          organizationInvite: {
            count: (params: unknown) => Promise<number>;
          };
        }).organizationInvite.count({
          where: {
            organizationId: args.organizationId,
            status: "pending",
            expiresAt: { gt: new Date() },
          },
        })
      : Promise.resolve(0),
  ]);

  const planCode = subscription?.plan?.code?.toLowerCase() ?? "";
  if (planCode === "pro") {
    return {
      isUnlimited: true,
      availableSeats: Number.POSITIVE_INFINITY,
      maxSeats: null,
      usedSeats,
      pendingInvites,
      canAddSeat: true,
    };
  }

  const includedSeats = subscription?.plan?.includedSeats ?? 1;
  const extraSeats = (subscription?.items ?? [])
    .filter((item) => item.itemType === "extra_seat")
    .reduce((sum, item) => sum + Math.max(0, item.quantity ?? 0), 0);

  const maxSeats = includedSeats + extraSeats;
  const reservedByPendingInvites = includePendingInvites ? pendingInvites : 0;
  const consumedSeats = usedSeats + reservedByPendingInvites;
  const availableSeats = Math.max(0, maxSeats - consumedSeats);

  return {
    isUnlimited: false,
    availableSeats,
    maxSeats,
    usedSeats,
    pendingInvites,
    canAddSeat: availableSeats > 0,
    reason: availableSeats > 0 ? undefined : BLOCK_MESSAGE,
  };
}
