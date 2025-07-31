import { useAuth } from "./useAuth";
import { useMemo } from "react";

type Season = "spring" | "summer" | "fall" | "winter";

interface SeasonalTheme {
  season: Season;
  primaryColor: string;
  gradientFrom: string;
  gradientTo: string;
  backgroundColor: string;
  treeStage: string;
  motivationalMessage: string;
  iconClass: string;
}

export function useSeasonalTheme() {
  const { user } = useAuth();

  const seasonalTheme = useMemo((): SeasonalTheme => {
    if (!user) {
      return getSeasonalTheme("spring", 0);
    }

    return getSeasonalTheme(
      user.seasonalTheme as Season || "spring",
      user.treeGrowthLevel || 0
    );
  }, [user?.seasonalTheme, user?.treeGrowthLevel]);

  return seasonalTheme;
}

function getSeasonalTheme(season: Season, treeGrowthLevel: number): SeasonalTheme {
  const themes: Record<Season, SeasonalTheme> = {
    spring: {
      season: "spring",
      primaryColor: "hsl(142, 76%, 36%)",
      gradientFrom: "from-green-400",
      gradientTo: "to-emerald-600",
      backgroundColor: "from-green-50/30 via-white to-emerald-50/30",
      treeStage: getTreeStage("spring", treeGrowthLevel),
      motivationalMessage: "New beginnings bloom with every payment! 🌱",
      iconClass: "fas fa-seedling"
    },
    summer: {
      season: "summer",
      primaryColor: "hsl(45, 93%, 47%)",
      gradientFrom: "from-yellow-400",
      gradientTo: "to-orange-500",
      backgroundColor: "from-yellow-50/30 via-white to-orange-50/30",
      treeStage: getTreeStage("summer", treeGrowthLevel),
      motivationalMessage: "Your financial growth is flourishing! ☀️",
      iconClass: "fas fa-sun"
    },
    fall: {
      season: "fall",
      primaryColor: "hsl(25, 95%, 53%)",
      gradientFrom: "from-orange-400",
      gradientTo: "to-red-500",
      backgroundColor: "from-orange-50/30 via-white to-red-50/30",
      treeStage: getTreeStage("fall", treeGrowthLevel),
      motivationalMessage: "Harvesting the rewards of consistency! 🍂",
      iconClass: "fas fa-leaf"
    },
    winter: {
      season: "winter",
      primaryColor: "hsl(220, 13%, 69%)",
      gradientFrom: "from-blue-400",
      gradientTo: "to-indigo-600",
      backgroundColor: "from-blue-50/30 via-white to-indigo-50/30",
      treeStage: getTreeStage("winter", treeGrowthLevel),
      motivationalMessage: "Building strength for future growth! ❄️",
      iconClass: "fas fa-snowflake"
    }
  };

  return themes[season];
}

function getTreeStage(season: Season, growthLevel: number): string {
  const stages = {
    spring: [
      "🌱", // 0-20: seedling
      "🌿", // 21-40: small plant
      "🌳", // 41-60: small tree
      "🌲", // 61-80: growing tree
      "🌲🌸" // 81-100: flowering tree
    ],
    summer: [
      "🌱", // 0-20: seedling
      "🌿", // 21-40: leafy plant
      "🌳", // 41-60: full green tree
      "🌳🍃", // 61-80: lush tree
      "🌳🌺" // 81-100: fruit tree
    ],
    fall: [
      "🌱", // 0-20: seedling
      "🌿", // 21-40: changing plant
      "🍂", // 41-60: tree with falling leaves
      "🌳🍁", // 61-80: colorful tree
      "🌳🍎" // 81-100: harvest tree
    ],
    winter: [
      "🌱", // 0-20: hardy seedling
      "❄️🌿", // 21-40: frost-resistant plant
      "🌲", // 41-60: evergreen
      "🌲❄️", // 61-80: snow-covered tree
      "🌲⭐" // 81-100: majestic winter tree
    ]
  };

  const stageIndex = Math.floor(growthLevel / 20);
  return stages[season][Math.min(stageIndex, 4)] || stages[season][0];
}

export function calculateSeasonProgression(onTimePayments: number, totalPayments: number): {
  newSeason: Season;
  newGrowthLevel: number;
  shouldAdvanceSeason: boolean;
} {
  const currentDate = new Date();
  const month = currentDate.getMonth();
  
  // Base season on actual calendar season
  let baseSeason: Season;
  if (month >= 2 && month <= 4) baseSeason = "spring";
  else if (month >= 5 && month <= 7) baseSeason = "summer";
  else if (month >= 8 && month <= 10) baseSeason = "fall";
  else baseSeason = "winter";

  // Calculate growth based on payment performance
  const paymentRate = totalPayments > 0 ? (onTimePayments / totalPayments) : 1;
  const newGrowthLevel = Math.min(100, Math.floor(paymentRate * 100));
  
  // Advance season if user has been performing well (80%+ on-time payments) and growth is high
  const shouldAdvanceSeason = paymentRate >= 0.8 && newGrowthLevel >= 80;
  
  let newSeason = baseSeason;
  if (shouldAdvanceSeason) {
    const seasons: Season[] = ["spring", "summer", "fall", "winter"];
    const currentSeasonIndex = seasons.indexOf(baseSeason);
    newSeason = seasons[(currentSeasonIndex + 1) % 4];
  }

  return {
    newSeason,
    newGrowthLevel,
    shouldAdvanceSeason
  };
}