import type { AppLocale } from "@/lib/i18n/config";
import { manualContentEn } from "@/lib/manual/content.en";
import { manualContentEs } from "@/lib/manual/content.es";

export const getManualContent = (locale: AppLocale) => {
  return locale === "es" ? manualContentEs : manualContentEn;
};
