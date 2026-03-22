/**
 * IT CAN BE LLC entity hierarchy mapped to celestial bodies.
 * Financial metrics are representative mock data for visualization.
 */

import type {
  CelestialBody,
  GravLink,
  TxStar,
  Constellation,
  FinancialMetrics,
  LinkType,
  WarpStreak,
} from "./orbital-types";
import { createMetrics } from "./orbital-types";

// ---------------------------------------------------------------------------
// Entity IDs — typed union for compile-time key validation
// ---------------------------------------------------------------------------

export const ENTITY_IDS = [
  "itcanbe",
  "jav",
  "aribia",
  "aribia-mgmt",
  "city-studio",
  "apt-arlene",
  "chittycorp",
] as const;

export type EntityId = typeof ENTITY_IDS[number];

// ---------------------------------------------------------------------------
// Entity Definitions (using createMetrics factory for consistency)
// ---------------------------------------------------------------------------

export const ENTITIES: CelestialBody[] = [
  {
    id: "itcanbe",
    name: "IT CAN BE LLC",
    shortName: "ICBE",
    tenantType: "holding",
    parentId: null,
    // Root holding → star (default classification, no override needed)
    status: "active",
    description: "Parent holding company — the gravitational center of all financial operations",
    metrics: createMetrics(2_850_000, 48_500, 31_200, 145, 6),
    visuals: {
      baseColor: "#FFD700",
      glowColor: "#FFA500",
      atmosphereColor: "rgba(255, 200, 0, 0.12)",
      ringColor: null,
      surfacePattern: "glow",
    },
  },
  {
    id: "jav",
    name: "JEAN ARLENE VENTURING LLC",
    shortName: "JAV",
    tenantType: "personal",
    parentId: "itcanbe",
    status: "active",
    description: "Personal income funnel — 85% owner of IT CAN BE LLC",
    metrics: createMetrics(420_000, 12_800, 4_200, 35, 2),
    visuals: {
      baseColor: "#818CF8",
      glowColor: "#6366F1",
      atmosphereColor: "rgba(129, 140, 248, 0.1)",
      ringColor: "rgba(129, 140, 248, 0.3)",
      surfacePattern: "solid",
    },
  },
  {
    id: "aribia",
    name: "ARIBIA LLC",
    shortName: "ARIBIA",
    tenantType: "series",
    parentId: "itcanbe",
    status: "active",
    description: "Series LLC — parent of all property and management entities",
    metrics: createMetrics(1_650_000, 28_400, 19_800, 92, 4),
    visuals: {
      baseColor: "#F97316",
      glowColor: "#EA580C",
      atmosphereColor: "rgba(249, 115, 22, 0.1)",
      ringColor: "rgba(249, 115, 22, 0.25)",
      surfacePattern: "bands",
    },
  },
  {
    id: "aribia-mgmt",
    name: "ARIBIA LLC - MGMT",
    shortName: "MGMT",
    tenantType: "management",
    parentId: "aribia",
    status: "active",
    description: "Management company — Chicago Furnished Condos & Chitty Services",
    metrics: createMetrics(180_000, 8_200, 5_400, 48, 2),
    visuals: {
      baseColor: "#2DD4BF",
      glowColor: "#14B8A6",
      atmosphereColor: "rgba(45, 212, 191, 0.1)",
      ringColor: null,
      surfacePattern: "craters",
    },
  },
  {
    id: "city-studio",
    name: "ARIBIA LLC - CITY STUDIO",
    shortName: "CITY",
    tenantType: "property",
    parentId: "aribia",
    status: "active",
    description: "550 W Surf St C211, Chicago IL — furnished rental unit",
    metrics: createMetrics(385_000, 4_200, 2_800, 18, 1, { occupancyRate: 0.88, capRate: 0.052 }),
    visuals: {
      baseColor: "#38BDF8",
      glowColor: "#0EA5E9",
      atmosphereColor: "rgba(56, 189, 248, 0.08)",
      ringColor: null,
      surfacePattern: "craters",
    },
  },
  {
    id: "apt-arlene",
    name: "ARIBIA LLC - APT ARLENE",
    shortName: "ARLENE",
    tenantType: "property",
    parentId: "aribia",
    status: "active",
    description: "4343 N Clarendon #1610, Chicago IL — residential rental",
    metrics: createMetrics(310_000, 3_400, 2_100, 14, 1, { occupancyRate: 0.95, capRate: 0.048 }),
    visuals: {
      baseColor: "#A78BFA",
      glowColor: "#8B5CF6",
      atmosphereColor: "rgba(167, 139, 250, 0.08)",
      ringColor: null,
      surfacePattern: "craters",
    },
  },
  {
    id: "chittycorp",
    name: "ChittyCorp LLC",
    shortName: "CCORP",
    tenantType: "holding",
    parentId: "itcanbe",
    // Override: although type is "holding", this pending entity renders as "dwarf"
    // Default classifyBody("holding", false) would return "gas_giant"
    celestialClassOverride: "dwarf",
    status: "pending",
    description: "Technology holding company — pending formation",
    metrics: createMetrics(5_000, 0, 150, 2, 0),
    visuals: {
      baseColor: "#64748B",
      glowColor: "#475569",
      atmosphereColor: "rgba(100, 116, 139, 0.06)",
      ringColor: null,
      surfacePattern: "solid",
    },
  },
];

// ---------------------------------------------------------------------------
// Inter-Entity Relationships (Gravitational Links)
// ---------------------------------------------------------------------------

export const LINKS: GravLink[] = [
  { sourceId: "itcanbe", targetId: "jav",         strength: 0.85, linkType: "ownership" },
  { sourceId: "itcanbe", targetId: "aribia",       strength: 1.0,  linkType: "ownership" },
  { sourceId: "itcanbe", targetId: "chittycorp",   strength: 0.5,  linkType: "ownership" },
  { sourceId: "aribia",  targetId: "aribia-mgmt",  strength: 0.9,  linkType: "management" },
  { sourceId: "aribia",  targetId: "city-studio",  strength: 0.7,  linkType: "rental" },
  { sourceId: "aribia",  targetId: "apt-arlene",   strength: 0.7,  linkType: "rental" },
  { sourceId: "aribia-mgmt", targetId: "city-studio", strength: 0.6, linkType: "service" },
  { sourceId: "aribia-mgmt", targetId: "apt-arlene",  strength: 0.6, linkType: "service" },
  { sourceId: "jav",     targetId: "aribia-mgmt",  strength: 0.3,  linkType: "service" },
];

// ---------------------------------------------------------------------------
// Transaction Categories for Star Field
// ---------------------------------------------------------------------------

const TX_CATEGORIES = [
  "Rent", "Utilities", "Insurance", "Maintenance", "Legal",
  "Technology", "Marketing", "Accounting", "Taxes",
  "Capital", "Distributions", "Consulting",
] as const;

export type TxCategory = typeof TX_CATEGORIES[number];

const CATEGORY_COLORS: Record<TxCategory, string> = {
  Rent:          "#4ade80",
  Utilities:     "#fbbf24",
  Insurance:     "#f97316",
  Maintenance:   "#ef4444",
  Legal:         "#a78bfa",
  Technology:    "#38bdf8",
  Marketing:     "#ec4899",
  Accounting:    "#2dd4bf",
  Taxes:         "#f43f5e",
  Capital:       "#818cf8",
  Distributions: "#22d3ee",
  Consulting:    "#fb923c",
};

// ---------------------------------------------------------------------------
// Star Field Generation
// ---------------------------------------------------------------------------

export function generateStarField(count: number, spread: number): TxStar[] {
  const stars: TxStar[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * spread;
    const cat = TX_CATEGORIES[Math.floor(Math.random() * TX_CATEGORIES.length)];
    const amount = Math.pow(Math.random(), 3) * 50_000 + 50;
    stars.push({
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      brightness: Math.min(1, amount / 20_000),
      amount,
      category: cat,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.5 + Math.random() * 2,
      radius: 0.5 + (amount / 50_000) * 2,
    });
  }
  return stars;
}

// ---------------------------------------------------------------------------
// Constellation Generation
// ---------------------------------------------------------------------------

export function generateConstellations(stars: TxStar[]): Constellation[] {
  const byCategory = new Map<string, number[]>();
  stars.forEach((s, i) => {
    const arr = byCategory.get(s.category) ?? [];
    arr.push(i);
    byCategory.set(s.category, arr);
  });

  const constellations: Constellation[] = [];
  byCategory.forEach((indices, category) => {
    const bright = indices
      .filter((i) => stars[i].brightness > 0.3)
      .slice(0, 8);
    if (bright.length >= 3) {
      constellations.push({
        category,
        starIndices: bright,
        color: CATEGORY_COLORS[category as TxCategory] ?? "#ffffff",
      });
    }
  });
  return constellations;
}

// ---------------------------------------------------------------------------
// Warp Streak Generation (persistent, animated)
// ---------------------------------------------------------------------------

export function generateWarpStreaks(count: number): WarpStreak[] {
  return Array.from({ length: count }, () => ({
    angle: Math.random() * Math.PI * 2,
    startR: 30 + Math.random() * 150,
    length: 100 + Math.random() * 400,
    width: 0.3 + Math.random() * 1.5,
    alpha: 0.03 + Math.random() * 0.08,
    speed: 80 + Math.random() * 200,
  }));
}

// ---------------------------------------------------------------------------
// Month-over-Month data for timeline scrubbing
// ---------------------------------------------------------------------------

export interface MonthSnapshot {
  readonly label: string;
  readonly year: number;
  readonly month: number;
  readonly entityMetrics: Partial<Record<EntityId, Partial<Pick<
    FinancialMetrics,
    "monthlyRevenue" | "monthlyExpenses" | "cashVelocity"
  >>>>;
}

export const TIMELINE: MonthSnapshot[] = Array.from({ length: 12 }, (_, i) => {
  const month = ((2 + i) % 12);
  const year = 2025 + Math.floor((2 + i) / 12);
  const sf = 1 + 0.15 * Math.sin((month - 3) * Math.PI / 6); // peak in summer
  return {
    label: `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month]} ${year}`,
    year,
    month,
    entityMetrics: {
      "itcanbe":      { monthlyRevenue: Math.round(48500 * sf), monthlyExpenses: 31200, cashVelocity: Math.round(145 * sf) },
      "jav":          { monthlyRevenue: 12800, monthlyExpenses: 4200, cashVelocity: 35 },
      "aribia":       { monthlyRevenue: Math.round(28400 * sf), monthlyExpenses: 19800, cashVelocity: Math.round(92 * sf) },
      "aribia-mgmt":  { monthlyRevenue: Math.round(8200 * sf), monthlyExpenses: 5400, cashVelocity: Math.round(48 * sf) },
      "city-studio":  { monthlyRevenue: Math.round(4200 * sf), monthlyExpenses: 2800, cashVelocity: Math.round(18 * sf) },
      "apt-arlene":   { monthlyRevenue: 3400, monthlyExpenses: 2100, cashVelocity: 14 },
      "chittycorp":   { monthlyRevenue: 0, monthlyExpenses: 150, cashVelocity: 2 },
    },
  };
});

// ---------------------------------------------------------------------------
// Link type colors
// ---------------------------------------------------------------------------

export const LINK_COLORS: Record<LinkType, string> = {
  ownership:  "rgba(255, 215, 0, 0.12)",
  management: "rgba(45, 212, 191, 0.10)",
  service:    "rgba(56, 189, 248, 0.08)",
  rental:     "rgba(167, 139, 250, 0.08)",
};
