import ProviderDetailClient from "./ProviderDetailClient";

// Provider detail page — thin server wrapper around the (client) detail UI.
// The client component reads its own params via useParams(), so no props
// are required here.
export const dynamic = "force-dynamic";

export default function ProviderDetailPage() {
  return <ProviderDetailClient />;
}
