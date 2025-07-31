import { useSeasonalTheme } from "@/hooks/useSeasonalTheme";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SeasonalProgress() {
  const { user } = useAuth();
  const seasonalTheme = useSeasonalTheme();

  if (!user) return null;

  return (
    <Card className="loan-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <i className={seasonalTheme.iconClass + " text-primary"}></i>
          Your Growth Journey
        </CardTitle>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <div className="text-6xl mb-4">
          {seasonalTheme.treeStage}
        </div>
        <div>
          <h4 className="font-semibold text-neutral-800 capitalize">
            {seasonalTheme.season} Theme
          </h4>
          <p className="text-sm text-neutral-600 mt-1">
            Tree Growth: {user.treeGrowthLevel || 0}%
          </p>
        </div>
        <div className="w-full bg-neutral-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full bg-gradient-to-r ${seasonalTheme.gradientFrom} ${seasonalTheme.gradientTo}`}
            style={{ width: `${user.treeGrowthLevel || 0}%` }}
          ></div>
        </div>
        <p className="text-xs text-neutral-600 italic">
          {seasonalTheme.motivationalMessage}
        </p>
      </CardContent>
    </Card>
  );
}