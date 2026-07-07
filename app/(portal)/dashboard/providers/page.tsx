import { Suspense } from "react";
import ProviderManagementDashboard from "@/components/providers/dashboard";

export default function ProvidersPage() {
  return (
    <Suspense fallback={null}>
      <ProviderManagementDashboard />
    </Suspense>
  );
}
