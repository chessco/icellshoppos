export default function DesignTestingPage() {
  return (
    <main className="min-h-screen bg-[#f4f8ff] px-6 py-8 md:px-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-3xl border border-[#d6e4ff] bg-white shadow-sm">
          <div className="grid gap-6 p-7 md:grid-cols-[1.3fr_1fr] md:p-10">
            <div className="space-y-5">
              <span className="inline-flex rounded-full border border-[#bfd4ff] bg-[#eff5ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[#2563eb]">
                Design Testing
              </span>
              <h1 className="text-3xl font-bold leading-tight text-[#0f1f3d] md:text-5xl">
                Premium storefront concept for high-conversion device sales.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-[#5f7298] md:text-base">
                This page is a UI sandbox only. Use it to validate spacing, hierarchy, card treatments, and CTA styling before wiring any business logic.
              </p>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  className="rounded-full bg-[#2563eb] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]"
                >
                  Start New Campaign
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#bfd4ff] bg-white px-6 py-2.5 text-sm font-semibold text-[#1f3563] transition hover:bg-[#f7fbff]"
                >
                  Preview Theme
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#ead8c6] bg-[#fffaf3] px-6 py-2.5 text-sm font-semibold text-[#6a4d3a] transition hover:bg-[#fff3e6]"
                >
                  Export Mock Data
                </button>
              </div>
            </div>

            <div className="grid gap-3 rounded-2xl border border-[#d6e4ff] bg-[#f7fbff] p-4">
              <div className="h-28 rounded-2xl bg-gradient-to-br from-[#dbeafe] via-[#eff6ff] to-[#f8fafc]" />
              <div className="h-28 rounded-2xl bg-gradient-to-br from-[#fef3c7] via-[#fff7ed] to-[#ffedd5]" />
              <div className="h-28 rounded-2xl bg-gradient-to-br from-[#dcfce7] via-[#f0fdf4] to-[#ecfeff]" />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Today Revenue", value: "$24,580", trend: "+12.4%" },
            { label: "Orders", value: "142", trend: "+8.1%" },
            { label: "Average Ticket", value: "$173", trend: "+3.9%" },
            { label: "Conversion", value: "6.8%", trend: "+1.1%" },
          ].map((item) => (
            <article key={item.label} className="rounded-2xl border border-[#d6e4ff] bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5f7298]">{item.label}</p>
              <p className="mt-2 text-2xl font-bold text-[#0f1f3d]">{item.value}</p>
              <p className="mt-1 text-xs font-semibold text-[#2a7c3b]">{item.trend} vs last week</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <article className="rounded-2xl border border-[#d6e4ff] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#0f1f3d]">Featured Products</h2>
              <button
                type="button"
                className="rounded-full border border-[#bfd4ff] px-4 py-1.5 text-xs font-semibold text-[#1f3563] transition hover:bg-[#f7fbff]"
              >
                View All
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                "iPhone 15 Pro Max · 256GB · Titanium",
                "Samsung S24 Ultra · 512GB · Black",
                "iPhone 14 Pro · 128GB · Purple",
                "Pixel 9 Pro · 256GB · Snow",
              ].map((name) => (
                <div key={name} className="rounded-xl border border-[#e4ecff] bg-[#f9fbff] p-4">
                  <div className="h-24 rounded-lg bg-gradient-to-br from-[#e6edff] to-[#f4f7ff]" />
                  <p className="mt-3 text-sm font-semibold text-[#1f3563]">{name}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm font-bold text-[#0f1f3d]">$999</span>
                    <button
                      type="button"
                      className="rounded-full bg-[#1f1a16] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
                    >
                      Add to Cart
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-[#d6e4ff] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#0f1f3d]">Campaign Builder</h2>
            <p className="mt-1 text-sm text-[#5f7298]">Static controls for visual QA only.</p>

            <div className="mt-4 space-y-3">
              <label className="grid gap-1 text-sm text-[#3b2a1e]">
                Campaign Name
                <input
                  readOnly
                  value="Spring Upgrade Event"
                  className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm text-[#1f3563] outline-none"
                />
              </label>

              <label className="grid gap-1 text-sm text-[#3b2a1e]">
                Segment
                <select
                  disabled
                  className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm text-[#1f3563] outline-none"
                >
                  <option>VIP Customers</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm text-[#3b2a1e]">
                Message
                <textarea
                  readOnly
                  value="Limited-time trade-in bonus and instant checkout financing."
                  className="min-h-[110px] rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm text-[#1f3563] outline-none"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1d4ed8]"
              >
                Save Draft
              </button>
              <button
                type="button"
                className="rounded-full border border-[#d6e4ff] px-4 py-2 text-xs font-semibold text-[#1f3563] transition hover:bg-[#f7fbff]"
              >
                Schedule
              </button>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
