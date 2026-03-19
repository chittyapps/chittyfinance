/**
 * Type system for the Orbital Finance Console.
 *
 * Maps the IT CAN BE LLC entity structure onto a celestial mechanics
 * simulation where financial metrics drive physics and visual properties.
 *
 * Invariants:
 *  - Every CelestialBody has exactly one parent (or null for the root star)
 *  - Financial metrics are non-negative (amounts in whole USD dollars)
 *  - netIncome is always derived from monthlyRevenue - monthlyExpenses
 *  - Orbital angles are in radians [0, 2*PI)
 *  - Progress values are clamped to [0, 1]
 *  - Camera zoom is clamped to [MIN_ZOOM, MAX_ZOOM]
 *  - WorldPos and ScreenPos are branded to prevent coordinate-space misuse
 */

// ---------------------------------------------------------------------------
// Branded Coordinate Types
// ---------------------------------------------------------------------------

export interface Vec2 {
  x: number;
  y: number;
}

declare const WorldBrand: unique symbol;
declare const ScreenBrand: unique symbol;

/** A Vec2 in world-space (centered on the Sun at origin) */
export type WorldPos = Vec2 & { readonly [WorldBrand]?: never };
/** A Vec2 in screen-space (canvas pixel coordinates) */
export type ScreenPos = Vec2 & { readonly [ScreenBrand]?: never };

export function worldPos(x: number, y: number): WorldPos {
  return { x, y } as WorldPos;
}

export function screenPos(x: number, y: number): ScreenPos {
  return { x, y } as ScreenPos;
}

// ---------------------------------------------------------------------------
// Vec2 Operations (accept any Vec2, including branded subtypes)
// ---------------------------------------------------------------------------

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function vec2Add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vec2Scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function vec2Dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function vec2Lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// ---------------------------------------------------------------------------
// Entity Classification
// ---------------------------------------------------------------------------

/** Tenant types from IT CAN BE LLC entity hierarchy */
export type TenantType =
  | "holding"
  | "series"
  | "property"
  | "management"
  | "personal"
  | "brand";

/** Celestial body classification derived from tenant type + hierarchy depth */
export type CelestialClass =
  | "star"       // Root holding company — the Sun
  | "gas_giant"  // Major entities (series LLCs, holdings)
  | "terrestrial"// Operational entities (management, personal)
  | "moon"       // Property entities — orbit their parent
  | "dwarf"      // Brands, pending entities
  ;

/** Entity operational status */
export type EntityStatus = "active" | "pending" | "dormant";

/** Cash flow direction between entities */
export type FlowDirection = "inbound" | "outbound";

/** Financial health derived from net income ratio */
export type HealthRating = "thriving" | "stable" | "cautious" | "critical";

/** Type of inter-entity relationship */
export type LinkType = "ownership" | "management" | "service" | "rental";

// ---------------------------------------------------------------------------
// Financial Domain
// ---------------------------------------------------------------------------

/** Financial metrics for a single entity — all amounts in whole dollars */
export interface FinancialMetrics {
  readonly totalAssets: number;
  readonly monthlyRevenue: number;
  readonly monthlyExpenses: number;
  readonly cashVelocity: number;       // transactions per month
  readonly recurringStreams: number;    // count of recurring revenue sources
  readonly occupancyRate?: number;     // 0-1, properties only
  readonly capRate?: number;           // annualized, properties only
}

/** Derive net income from metrics (single source of truth) */
export function netIncome(m: FinancialMetrics): number {
  return m.monthlyRevenue - m.monthlyExpenses;
}

/** Factory ensuring metrics are constructed consistently */
export function createMetrics(
  totalAssets: number,
  monthlyRevenue: number,
  monthlyExpenses: number,
  cashVelocity: number,
  recurringStreams: number,
  opts?: { occupancyRate?: number; capRate?: number },
): FinancialMetrics {
  return {
    totalAssets,
    monthlyRevenue,
    monthlyExpenses,
    cashVelocity,
    recurringStreams,
    ...opts,
  };
}

export function deriveHealth(m: FinancialMetrics): HealthRating {
  if (m.monthlyRevenue === 0) return m.monthlyExpenses > 0 ? "critical" : "cautious";
  const ratio = netIncome(m) / m.monthlyRevenue;
  if (ratio > 0.2) return "thriving";
  if (ratio > 0) return "stable";
  if (ratio > -0.1) return "cautious";
  return "critical";
}

export function healthToColor(h: HealthRating): string {
  switch (h) {
    case "thriving": return "#4ade80";
    case "stable":   return "#38bdf8";
    case "cautious": return "#fbbf24";
    case "critical": return "#f43f5e";
  }
}

// ---------------------------------------------------------------------------
// Celestial Body (Static Definition)
// ---------------------------------------------------------------------------

export interface CelestialVisuals {
  readonly baseColor: string;
  readonly glowColor: string;
  readonly atmosphereColor: string;
  readonly ringColor: string | null;
  readonly surfacePattern: "solid" | "bands" | "craters" | "glow";
}

/**
 * Immutable definition of an entity as a celestial body.
 *
 * `celestialClassOverride` allows intentional deviation from the
 * default classification. If absent, use `classifyBody()` to derive
 * the class from tenantType + hierarchy position.
 */
export interface CelestialBody {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly tenantType: TenantType;
  readonly parentId: string | null;
  readonly celestialClassOverride?: CelestialClass;
  readonly metrics: FinancialMetrics;
  readonly visuals: CelestialVisuals;
  readonly status: EntityStatus;
  readonly description: string;
}

/** Derive the default celestial class from tenant type */
export function classifyBody(type: TenantType, isRoot: boolean): CelestialClass {
  if (isRoot) return "star";
  switch (type) {
    case "holding":    return "gas_giant";
    case "series":     return "gas_giant";
    case "personal":   return "terrestrial";
    case "management": return "terrestrial";
    case "property":   return "moon";
    case "brand":      return "dwarf";
  }
}

/** Resolve effective celestial class: override wins, else derived */
export function effectiveClass(body: CelestialBody): CelestialClass {
  return body.celestialClassOverride ?? classifyBody(body.tenantType, body.parentId === null);
}

// ---------------------------------------------------------------------------
// Physics Simulation State (Mutable)
// ---------------------------------------------------------------------------

/** Per-body mutable simulation state */
export interface OrbitalState {
  angle: number;           // current orbital angle in radians
  orbitalRadius: number;   // distance from parent center
  angularVelocity: number; // radians per second
  position: WorldPos;      // computed world position
  trail: WorldPos[];       // last N positions for motion trails
}

/** A body in the live simulation = definition + physics state + computed visuals */
export interface SimulatedBody {
  readonly def: CelestialBody;
  state: OrbitalState;
  visualRadius: number;  // pixel radius derived from totalAssets (mutable for timeline updates)
  mass: number;          // simulation mass from totalAssets (mutable for timeline updates)
}

// ---------------------------------------------------------------------------
// Particle System
// ---------------------------------------------------------------------------

/** Cash flow particle traveling between two entities */
export interface FlowParticle {
  id: number;
  sourceId: string;
  targetId: string;
  amount: number;
  direction: FlowDirection;
  progress: number;  // 0→1 along cubic bezier
  speed: number;
  size: number;
}

/** Gravitational link visualizing inter-entity relationship */
export interface GravLink {
  readonly sourceId: string;
  readonly targetId: string;
  readonly strength: number;  // 0-1 normalized
  readonly linkType: LinkType;
}

// ---------------------------------------------------------------------------
// Star Field & Constellations
// ---------------------------------------------------------------------------

/** Background star representing a transaction */
export interface TxStar {
  x: number;
  y: number;
  brightness: number;  // 0-1
  amount: number;
  category: string;
  twinklePhase: number;
  twinkleSpeed: number;
  radius: number;
}

/** Constellation connecting related transaction stars */
export interface Constellation {
  readonly category: string;
  readonly starIndices: readonly number[];
  readonly color: string;
}

// ---------------------------------------------------------------------------
// Camera & Controls
// ---------------------------------------------------------------------------

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 4.0;

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  targetX: number;
  targetY: number;
  targetZoom: number;
}

export function createCamera(): CameraState {
  return { x: 0, y: 0, zoom: 1, targetX: 0, targetY: 0, targetZoom: 1 };
}

export function lerpCamera(cam: CameraState, smoothing: number): void {
  cam.x += (cam.targetX - cam.x) * smoothing;
  cam.y += (cam.targetY - cam.y) * smoothing;
  cam.zoom += (cam.targetZoom - cam.zoom) * smoothing;
  cam.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom));
}

/** Convert world coords to screen coords */
export function worldToScreen(
  world: WorldPos,
  cam: CameraState,
  canvasW: number,
  canvasH: number,
): ScreenPos {
  return screenPos(
    (world.x - cam.x) * cam.zoom + canvasW / 2,
    (world.y - cam.y) * cam.zoom + canvasH / 2,
  );
}

/** Convert screen coords to world coords */
export function screenToWorld(
  screen: ScreenPos,
  cam: CameraState,
  canvasW: number,
  canvasH: number,
): WorldPos {
  return worldPos(
    (screen.x - canvasW / 2) / cam.zoom + cam.x,
    (screen.y - canvasH / 2) / cam.zoom + cam.y,
  );
}

// ---------------------------------------------------------------------------
// Time Control
// ---------------------------------------------------------------------------

export interface TimeControl {
  speed: number;     // multiplier (1 = normal)
  paused: boolean;
  month: number;     // current month index in timeline
  readonly totalMonths: number;
  warpMode: boolean;
}

export function createTimeControl(totalMonths: number): TimeControl {
  return { speed: 1, paused: false, month: 0, totalMonths, warpMode: false };
}

// ---------------------------------------------------------------------------
// Pulse Wave
// ---------------------------------------------------------------------------

export interface PulseWave {
  radius: number;
  opacity: number;
  maxRadius: number;
  speed: number;
  color: string;
}

// ---------------------------------------------------------------------------
// Warp Streak (persistent, not random per frame)
// ---------------------------------------------------------------------------

export interface WarpStreak {
  angle: number;
  startR: number;
  length: number;
  width: number;
  alpha: number;
  speed: number;
}

// ---------------------------------------------------------------------------
// Simulation Config
// ---------------------------------------------------------------------------

export interface SimConfig {
  readonly baseAngularSpeed: number;
  readonly particleSpawnRate: number;
  readonly maxParticles: number;
  readonly maxTrailLength: number;
  readonly starCount: number;
  readonly pulseIntervalMs: number;
  readonly cameraSmoothing: number;
  readonly orbitBaseRadius: number;
  readonly moonOrbitRadius: number;
  readonly nebulaLayers: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  baseAngularSpeed: 0.3,
  particleSpawnRate: 0.05,
  maxParticles: 200,
  maxTrailLength: 30,
  starCount: 400,
  pulseIntervalMs: 3000,
  cameraSmoothing: 0.08,
  orbitBaseRadius: 180,
  moonOrbitRadius: 60,
  nebulaLayers: 3,
};

// ---------------------------------------------------------------------------
// Month labels for timeline
// ---------------------------------------------------------------------------

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
