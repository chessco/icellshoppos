// Temporary placeholder to fix build error. Replace with real implementation if needed.
function CreditPageContent() {
  return null;
}

import { Suspense } from "react";


function Stat({
  label,
  value,
  color,
  strong,
}: {
  label: string;
  value: string;
  color: "red" | "green" | "orange" | "blue";
  strong?: boolean;
}) {
  const colorClass = {
    red: "text-[#c24d34]",
    green: "text-[#1a5c30]",
    orange: "text-[#7a4e0e]",
    blue: "text-[#1f3563]",
  }[color];

  return (
    <div className="rounded-xl border border-[#d6e4ff] bg-[#f7fbff] px-3 py-3">
      <p className="text-xs text-[#5f7298]">{label}</p>
      <p className={["mt-1 text-base", strong ? "text-lg font-bold" : "font-semibold", colorClass].join(" ")}>
        {value}
      </p>
    </div>
  );
}

export default function CreditPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-[#5f7298]">
          Loading...
        </div>
      }
    >
      <CreditPageContent />
    </Suspense>
  );
}
