import type { Metadata } from "next";
import LegacyFeatureNotice from "@/components/LegacyFeatureNotice";

export const metadata: Metadata = {
  title: "Available Inventory",
  description: "Browse available cell phone inventory from Pro Buyer resellers.",
};

export default function PublicInventoryPage() {
  return (
    <LegacyFeatureNotice
      title="Public Google flow retired"
      message="The old public inventory route used Google sign-in. Use slug-based public inventory pages and settings that run from the app database."
    />
  );
}
