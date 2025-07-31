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
  // Use Font Awesome icons instead of emojis for better cross-platform compatibility
  const stages = {
    spring: [
      '<i class="fas fa-seedling text-green-500"></i>', // 0-20: seedling
      '<i class="fas fa-leaf text-green-600"></i>', // 21-40: small plant
      '<i class="fas fa-tree text-green-700"></i>', // 41-60: small tree
      '<i class="fas fa-tree text-green-800"></i>', // 61-80: growing tree
      '<i class="fas fa-tree text-pink-500"></i>' // 81-100: flowering tree
    ],
    summer: [
      '<i class="fas fa-seedling text-yellow-500"></i>', // 0-20: seedling
      '<i class="fas fa-leaf text-yellow-600"></i>', // 21-40: leafy plant
      '<i class="fas fa-tree text-yellow-700"></i>', // 41-60: full green tree
      '<i class="fas fa-tree text-yellow-800"></i>', // 61-80: lush tree
      '<i class="fas fa-tree text-orange-500"></i>' // 81-100: fruit tree
    ],
    fall: [
      '<i class="fas fa-seedling text-orange-500"></i>', // 0-20: seedling
      '<i class="fas fa-leaf text-orange-600"></i>', // 21-40: changing plant
      '<i class="fas fa-tree text-orange-700"></i>', // 41-60: tree with falling leaves
      '<i class="fas fa-tree text-red-600"></i>', // 61-80: colorful tree
      '<i class="fas fa-tree text-red-800"></i>' // 81-100: harvest tree
    ],
    winter: [
      '<i class="fas fa-seedling text-blue-400"></i>', // 0-20: hardy seedling
      '<i class="fas fa-leaf text-blue-500"></i>', // 21-40: frost-resistant plant
      '<i class="fas fa-tree text-blue-600"></i>', // 41-60: evergreen
      '<i class="fas fa-tree text-blue-700"></i>', // 61-80: snow-covered tree
      '<i class="fas fa-tree text-indigo-600"></i>' // 81-100: majestic winter tree
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