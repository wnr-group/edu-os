import { Home, Info } from "lucide-react";
import Link from "next/link";

interface FeatureDisabledProps {
  featureName: string;
  description?: string;
  dashboardHref?: string;
}

/**
 * Renders a centered message when a feature is disabled.
 * Prevents misleading empty states and clearly communicates that the feature
 * is not available rather than having no data.
 */
export function FeatureDisabled({
  featureName,
  description = "This feature is not currently enabled for your school.",
  dashboardHref = "/",
}: FeatureDisabledProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="text-center max-w-md space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
          <Info className="w-8 h-8 text-gray-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-gray-900">{featureName} Not Enabled</h2>
          <p className="text-gray-600">{description}</p>
        </div>
        <Link
          href={dashboardHref}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Home className="w-4 h-4" />
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
