import Link from "next/link";

type LegacyFeatureNoticeProps = {
  title: string;
  message: string;
};

export default function LegacyFeatureNotice({ title, message }: LegacyFeatureNoticeProps) {
  return (
    <div className="min-h-screen bg-[#f5f9ff] px-6 py-16 text-[#0f1f3d]">
      <div className="mx-auto max-w-3xl rounded-3xl border border-[#d6e4ff] bg-white p-8 shadow-[0_12px_36px_rgba(37,99,235,0.12)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4b6292]">Legacy Route Retired</p>
        <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
        <p className="mt-4 text-sm text-[#5f7298]">{message}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
          >
            Open Dashboard
          </Link>
          <Link
            href="/inventory"
            className="rounded-full border border-[#bfd5ff] px-5 py-2 text-sm font-semibold text-[#1f3563] hover:bg-[#eef5ff]"
          >
            Open Inventory
          </Link>
        </div>
      </div>
    </div>
  );
}
