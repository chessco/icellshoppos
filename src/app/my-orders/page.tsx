import LegacyFeatureNotice from "@/components/LegacyFeatureNotice";

export default function MyOrdersPage() {
  return (
    <LegacyFeatureNotice
      title="Legacy customer orders retired"
      message="This route depended on Google OAuth tokens. Customer order tracking is being moved to the database-backed account flow."
    />
  );
}
