import Link from "next/link";

export default function ToolUnavailableBanner({ toolName }: { toolName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
      <div className="rounded-2xl border border-[#ffd9d1] bg-[#fff6f3] p-8 max-w-sm shadow-sm">
        <p className="text-4xl mb-3">🔒</p>
        <h2 className="text-lg font-bold text-[#0f1f3d] mb-2">{toolName} — Not Available</h2>
        <p className="text-sm text-[#5f7298] mb-6">
          Your free trial has ended. Upgrade to a paid plan to continue using this tool.
        </p>
        <Link
          href="/billing"
          className="inline-block rounded-xl bg-gradient-to-r from-[#2563eb] to-[#0ea5e9] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-[#1d4ed8] hover:to-[#0284c7]"
        >
          View Plans &amp; Upgrade
        </Link>
      </div>
    </div>
  );
}
