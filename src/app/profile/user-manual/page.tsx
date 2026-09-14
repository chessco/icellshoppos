"use client";

import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { useLocale, useT } from "@/components/LocaleProvider";
import { getManualContent } from "@/lib/manual";

export default function UserManualPage() {
  const pathname = usePathname();
  const { locale } = useLocale();
  const t = useT();
  const manual = getManualContent(locale);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbff,#eef4ff)] text-[#10213d]">
      <div className="mx-auto grid max-w-[1400px] md:grid-cols-[250px_1fr]">
        <AppSidebar pathname={pathname} />
        <main className="p-4 md:p-8">
          <div className="mb-6 rounded-2xl border border-[#dbe7ff] bg-white p-5 shadow-[0_10px_28px_rgba(15,31,61,0.08)] md:p-7">
            <h1 className="text-2xl font-semibold text-[#0f1f3d] md:text-3xl">{manual.title}</h1>
            <p className="mt-2 text-sm text-[#3f5680] md:text-base">{manual.subtitle}</p>
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-[#5a7098]">
              {t("manual.updated", "Last update")}: {manual.updatedAt}
            </p>
          </div>

          <div id="manual-index" className="mb-6 rounded-2xl border border-[#dbe7ff] bg-white p-4 shadow-[0_8px_22px_rgba(15,31,61,0.06)] md:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a7098]">
              {t("manual.index", "Index by Subject")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {manual.sections.map((section) => (
                <a
                  key={`index-${section.id}`}
                  href={`#${section.id}`}
                  className="rounded-full border border-[#cfe0ff] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#1b3f86] transition hover:bg-[#edf4ff]"
                >
                  {section.title}
                </a>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:gap-5">
            {manual.sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="rounded-2xl border border-[#dbe7ff] bg-white p-5 shadow-[0_10px_24px_rgba(15,31,61,0.06)] md:p-6"
              >
                <h2 className="text-xl font-semibold text-[#0f1f3d]">{section.title}</h2>
                <p className="mt-1 text-sm text-[#47608a]">{section.summary}</p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {section.features.map((feature) => (
                    <article
                      key={`${section.id}-${feature.title}`}
                      className="rounded-xl border border-[#e2ebff] bg-[#f8fbff] p-4"
                    >
                      <h3 className="text-sm font-semibold text-[#12316d]">{feature.title}</h3>
                      <p className="mt-1 text-sm text-[#3f5680]">{feature.description}</p>
                      {feature.routes?.length ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5a7098]">
                            {t("manual.routes", "Routes")}
                          </span>
                          {feature.routes.map((route) => (
                            <span
                              key={`${section.id}-${feature.title}-${route}`}
                              className="rounded-full border border-[#cfe0ff] bg-white px-2.5 py-1 text-xs font-medium text-[#1b3f86]"
                            >
                              {route}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-[#e2ebff] bg-[#f8fbff] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a7098]">
                    {t("manual.connections", "Connected Workflows")}
                  </p>
                  <ul className="mt-2 grid gap-1.5 text-sm text-[#3f5680]">
                    {section.connections.map((connection) => (
                      <li key={`${section.id}-${connection}`} className="flex items-start gap-2">
                        <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-[#2d5db3]" />
                        <span>{connection}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3 flex justify-end">
                  <a
                    href="#manual-index"
                    className="rounded-full border border-[#cfe0ff] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#1b3f86] transition hover:bg-[#edf4ff]"
                  >
                    {t("manual.backToIndex", "Back to index")}
                  </a>
                </div>
              </section>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
