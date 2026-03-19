import { useCallback, useEffect, useRef, useState } from "react";
import {
  type WorldPos,
  type ScreenPos,
  type SimulatedBody,
  type FlowParticle,
  type PulseWave,
  type WarpStreak,
  type CameraState,
  type TimeControl,
  type SimConfig,
  type TxStar,
  type Constellation,
  type GravLink,
  type CelestialBody,
  type OrbitalState,
  type HealthRating,
  type FinancialMetrics,
  worldPos,
  screenPos,
  vec2Dist,
  worldToScreen,
  screenToWorld,
  createCamera,
  lerpCamera,
  createTimeControl,
  deriveHealth,
  healthToColor,
  netIncome,
  effectiveClass,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_CONFIG,
} from "@/lib/orbital-types";
import {
  ENTITIES,
  LINKS,
  LINK_COLORS,
  TIMELINE,
  generateStarField,
  generateConstellations,
  generateWarpStreaks,
} from "@/lib/orbital-data";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PARTICLE_ID_COUNTER = { value: 0 };
const WARP_STREAK_COUNT = 120;

// ---------------------------------------------------------------------------
// Initialization Helpers
// ---------------------------------------------------------------------------

function computeVisualRadius(assets: number): number {
  const base = Math.log10(Math.max(assets, 1000)) - 2;
  return Math.max(6, base * 12);
}

function initBody(def: CelestialBody, index: number, siblings: number): SimulatedBody {
  const cls = effectiveClass(def);
  const isStar = cls === "star";
  const isMoon = cls === "moon";

  const angleOffset = (index / Math.max(siblings, 1)) * Math.PI * 2 + Math.random() * 0.3;

  const orbitalRadius = isStar
    ? 0
    : isMoon
    ? DEFAULT_CONFIG.moonOrbitRadius + index * 28
    : DEFAULT_CONFIG.orbitBaseRadius + index * 100;

  const velocityFactor = def.metrics.cashVelocity / 100;
  const angularVelocity = isStar
    ? 0
    : (DEFAULT_CONFIG.baseAngularSpeed / Math.sqrt(Math.max(orbitalRadius, 1))) * velocityFactor;

  const state: OrbitalState = {
    angle: angleOffset,
    orbitalRadius,
    angularVelocity,
    position: worldPos(
      Math.cos(angleOffset) * orbitalRadius,
      Math.sin(angleOffset) * orbitalRadius,
    ),
    trail: [],
  };

  return {
    def,
    state,
    visualRadius: computeVisualRadius(def.metrics.totalAssets),
    mass: def.metrics.totalAssets / 100_000,
  };
}

function initBodies(entities: CelestialBody[]): SimulatedBody[] {
  const byParent = new Map<string | null, CelestialBody[]>();
  entities.forEach((e) => {
    const arr = byParent.get(e.parentId) ?? [];
    arr.push(e);
    byParent.set(e.parentId, arr);
  });

  return entities.map((e) => {
    const siblings = byParent.get(e.parentId) ?? [];
    const idx = siblings.indexOf(e);
    return initBody(e, idx, siblings.length);
  });
}

// ---------------------------------------------------------------------------
// Timeline: apply monthly metric snapshot to bodies
// ---------------------------------------------------------------------------

function applyTimelineMonth(bodies: SimulatedBody[], monthIndex: number): void {
  const snap = TIMELINE[monthIndex];
  if (!snap) return;
  for (const body of bodies) {
    const patch = snap.entityMetrics[body.def.id as keyof typeof snap.entityMetrics];
    if (!patch) continue;
    // Patch the def metrics (safe: we own the array, def is from our init)
    const m = body.def.metrics;
    const patched: FinancialMetrics = {
      ...m,
      ...(patch.monthlyRevenue != null ? { monthlyRevenue: patch.monthlyRevenue } : {}),
      ...(patch.monthlyExpenses != null ? { monthlyExpenses: patch.monthlyExpenses } : {}),
      ...(patch.cashVelocity != null ? { cashVelocity: patch.cashVelocity } : {}),
    };
    // Apply to body — update the def with patched metrics
    (body as { def: CelestialBody }).def = { ...body.def, metrics: patched };
    // Update derived values
    body.visualRadius = computeVisualRadius(patched.totalAssets);
    body.mass = patched.totalAssets / 100_000;
    // Update angular velocity based on new cash velocity
    const cls = effectiveClass(body.def);
    if (cls !== "star") {
      const velocityFactor = patched.cashVelocity / 100;
      body.state.angularVelocity =
        (DEFAULT_CONFIG.baseAngularSpeed / Math.sqrt(Math.max(body.state.orbitalRadius, 1))) * velocityFactor;
    }
  }
}

// ---------------------------------------------------------------------------
// Physics Update
// ---------------------------------------------------------------------------

function updatePhysics(
  bodies: SimulatedBody[],
  dt: number,
  config: SimConfig,
): void {
  const bodyMap = new Map(bodies.map((b) => [b.def.id, b]));

  for (const body of bodies) {
    if (effectiveClass(body.def) === "star") {
      body.state.position = worldPos(0, 0);
      continue;
    }

    // Advance orbital angle (wrap to [0, 2*PI) for both directions)
    body.state.angle += body.state.angularVelocity * dt;
    body.state.angle = ((body.state.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    // Compute position relative to parent
    const parent = body.def.parentId ? bodyMap.get(body.def.parentId) : null;
    const pp = parent ? parent.state.position : worldPos(0, 0);

    body.state.position = worldPos(
      pp.x + Math.cos(body.state.angle) * body.state.orbitalRadius,
      pp.y + Math.sin(body.state.angle) * body.state.orbitalRadius,
    );

    // Record trail
    body.state.trail.push(worldPos(body.state.position.x, body.state.position.y));
    if (body.state.trail.length > config.maxTrailLength) {
      body.state.trail.shift();
    }
  }
}

// ---------------------------------------------------------------------------
// Particle System
// ---------------------------------------------------------------------------

function spawnParticles(
  particles: FlowParticle[],
  links: GravLink[],
  config: SimConfig,
): void {
  if (particles.length >= config.maxParticles) return;

  for (const link of links) {
    if (Math.random() > config.particleSpawnRate) continue;
    const isInbound = Math.random() > 0.4;
    particles.push({
      id: PARTICLE_ID_COUNTER.value++,
      sourceId: isInbound ? link.targetId : link.sourceId,
      targetId: isInbound ? link.sourceId : link.targetId,
      amount: 500 + Math.random() * 5000,
      direction: isInbound ? "inbound" : "outbound",
      progress: 0,
      speed: 0.3 + Math.random() * 0.5,
      size: 1.5 + Math.random() * 2.5,
    });
  }
}

function updateParticles(particles: FlowParticle[], dt: number): FlowParticle[] {
  return particles.filter((p) => {
    p.progress += p.speed * dt;
    return p.progress < 1;
  });
}

// ---------------------------------------------------------------------------
// Pulse Waves
// ---------------------------------------------------------------------------

function updatePulses(
  pulses: PulseWave[],
  dt: number,
  lastPulseTime: { value: number },
  now: number,
  health: HealthRating,
  config: SimConfig,
): PulseWave[] {
  if (now - lastPulseTime.value > config.pulseIntervalMs) {
    lastPulseTime.value = now;
    pulses.push({
      radius: 20,
      opacity: 0.5,
      maxRadius: 600,
      speed: 120,
      color: healthToColor(health),
    });
  }

  return pulses.filter((p) => {
    p.radius += p.speed * dt;
    p.opacity = Math.max(0, 0.5 * (1 - p.radius / p.maxRadius));
    return p.opacity > 0.01;
  });
}

// ---------------------------------------------------------------------------
// Canvas Rendering
// ---------------------------------------------------------------------------

function renderFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bodies: SimulatedBody[],
  particles: FlowParticle[],
  stars: TxStar[],
  constellations: Constellation[],
  links: GravLink[],
  pulses: PulseWave[],
  warpStreaks: WarpStreak[],
  camera: CameraState,
  time: TimeControl,
  selectedId: string | null,
  hoveredId: string | null,
  frameCount: number,
): void {
  const bodyMap = new Map(bodies.map((b) => [b.def.id, b]));
  const t = frameCount * 0.016;

  // -- Background gradient
  const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
  bgGrad.addColorStop(0, "#0a0a14");
  bgGrad.addColorStop(0.4, "#06060e");
  bgGrad.addColorStop(1, "#020208");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // -- Nebula clouds (layered noise-like fog around the star)
  const sunScreen = worldToScreen(worldPos(0, 0), camera, w, h);
  for (let layer = 0; layer < DEFAULT_CONFIG.nebulaLayers; layer++) {
    const phase = t * 0.05 + layer * 2.1;
    const nebulaR = (200 + layer * 120) * camera.zoom;
    const ox = Math.cos(phase) * 20 * camera.zoom;
    const oy = Math.sin(phase * 0.7) * 15 * camera.zoom;
    const ng = ctx.createRadialGradient(
      sunScreen.x + ox, sunScreen.y + oy, nebulaR * 0.1,
      sunScreen.x + ox, sunScreen.y + oy, nebulaR,
    );
    const colors = [
      ["rgba(255, 180, 50, 0.025)", "rgba(200, 100, 20, 0.01)", "rgba(0,0,0,0)"],
      ["rgba(100, 80, 200, 0.015)", "rgba(60, 40, 140, 0.008)", "rgba(0,0,0,0)"],
      ["rgba(50, 150, 200, 0.012)", "rgba(30, 80, 120, 0.006)", "rgba(0,0,0,0)"],
    ];
    const c = colors[layer % colors.length];
    ng.addColorStop(0, c[0]);
    ng.addColorStop(0.5, c[1]);
    ng.addColorStop(1, c[2]);
    ctx.beginPath();
    ctx.arc(sunScreen.x + ox, sunScreen.y + oy, nebulaR, 0, Math.PI * 2);
    ctx.fillStyle = ng;
    ctx.fill();
  }

  // -- Grid lines (very subtle)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.012)";
  ctx.lineWidth = 1;
  const gridSize = 100 * camera.zoom;
  const gox = (w / 2 - camera.x * camera.zoom) % gridSize;
  const goy = (h / 2 - camera.y * camera.zoom) % gridSize;
  for (let x = gox; x < w; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = goy; y < h; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // -- Stars (background transactions)
  for (const star of stars) {
    const sp = worldToScreen(worldPos(star.x, star.y), camera, w, h);
    if (sp.x < -10 || sp.x > w + 10 || sp.y < -10 || sp.y > h + 10) continue;
    const twinkle = 0.4 + 0.6 * Math.sin(t * star.twinkleSpeed + star.twinklePhase) ** 2;
    const alpha = star.brightness * twinkle * 0.7;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, star.radius * camera.zoom * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200, 210, 255, ${alpha})`;
    ctx.fill();
  }

  // -- Constellation lines
  ctx.lineWidth = 0.5;
  for (const c of constellations) {
    ctx.strokeStyle = `${c.color}12`;
    ctx.beginPath();
    for (let i = 0; i < c.starIndices.length - 1; i++) {
      const s1 = stars[c.starIndices[i]];
      const s2 = stars[c.starIndices[i + 1]];
      const p1 = worldToScreen(worldPos(s1.x, s1.y), camera, w, h);
      const p2 = worldToScreen(worldPos(s2.x, s2.y), camera, w, h);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();
  }

  // -- Gravitational links
  for (const link of links) {
    const src = bodyMap.get(link.sourceId);
    const tgt = bodyMap.get(link.targetId);
    if (!src || !tgt) continue;
    const sp1 = worldToScreen(src.state.position, camera, w, h);
    const sp2 = worldToScreen(tgt.state.position, camera, w, h);
    ctx.strokeStyle = LINK_COLORS[link.linkType];
    ctx.lineWidth = link.strength * 2 * camera.zoom;
    ctx.setLineDash([4 * camera.zoom, 8 * camera.zoom]);
    ctx.beginPath();
    ctx.moveTo(sp1.x, sp1.y);
    ctx.lineTo(sp2.x, sp2.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // -- Orbit paths
  for (const body of bodies) {
    if (effectiveClass(body.def) === "star") continue;
    const parent = body.def.parentId ? bodyMap.get(body.def.parentId) : null;
    const center = parent
      ? worldToScreen(parent.state.position, camera, w, h)
      : worldToScreen(worldPos(0, 0), camera, w, h);
    const r = body.state.orbitalRadius * camera.zoom;

    // Orbit path glow — brighter for selected body's orbit
    const isOwnOrbit = body.def.id === selectedId;
    ctx.strokeStyle = isOwnOrbit ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.035)";
    ctx.lineWidth = isOwnOrbit ? 1.5 : 1;
    ctx.beginPath();
    ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // -- Pulse waves
  for (const pulse of pulses) {
    const center = worldToScreen(worldPos(0, 0), camera, w, h);
    const r = pulse.radius * camera.zoom;
    ctx.strokeStyle = `${pulse.color}${Math.round(pulse.opacity * 255).toString(16).padStart(2, "0")}`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // -- Motion trails
  for (const body of bodies) {
    if (body.state.trail.length < 2) continue;
    if (effectiveClass(body.def) === "star") continue;
    for (let i = 1; i < body.state.trail.length; i++) {
      const alpha = (i / body.state.trail.length) * 0.2;
      const p1 = worldToScreen(body.state.trail[i - 1], camera, w, h);
      const p2 = worldToScreen(body.state.trail[i], camera, w, h);
      ctx.strokeStyle = `${body.def.visuals.baseColor}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
      ctx.lineWidth = body.visualRadius * camera.zoom * 0.4 * (i / body.state.trail.length);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  // -- Cash flow particles
  for (const p of particles) {
    const src = bodyMap.get(p.sourceId);
    const tgt = bodyMap.get(p.targetId);
    if (!src || !tgt) continue;

    const s = src.state.position;
    const e = tgt.state.position;
    const mid = worldPos(
      (s.x + e.x) / 2 + (s.y - e.y) * 0.3,
      (s.y + e.y) / 2 + (e.x - s.x) * 0.3,
    );
    const t1 = p.progress;
    const pos = worldPos(
      (1 - t1) * (1 - t1) * s.x + 2 * (1 - t1) * t1 * mid.x + t1 * t1 * e.x,
      (1 - t1) * (1 - t1) * s.y + 2 * (1 - t1) * t1 * mid.y + t1 * t1 * e.y,
    );
    const sp = worldToScreen(pos, camera, w, h);

    const color = p.direction === "inbound" ? "#4ade80" : "#f43f5e";
    const alpha = Math.sin(t1 * Math.PI);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, p.size * camera.zoom, 0, Math.PI * 2);
    ctx.fillStyle = `${color}${Math.round(alpha * 200).toString(16).padStart(2, "0")}`;
    ctx.fill();

    // Particle glow
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, p.size * camera.zoom * 3, 0, Math.PI * 2);
    ctx.fillStyle = `${color}${Math.round(alpha * 30).toString(16).padStart(2, "0")}`;
    ctx.fill();
  }

  // -- Celestial bodies
  for (const body of bodies) {
    const sp = worldToScreen(body.state.position, camera, w, h);
    const r = body.visualRadius * camera.zoom;
    const cls = effectiveClass(body.def);
    const isSelected = body.def.id === selectedId;
    const isHovered = body.def.id === hoveredId;

    // Revenue-driven glow intensity
    const revenueGlow = Math.min(1, body.def.metrics.monthlyRevenue / 30_000);

    // Atmosphere glow
    const glowR = r * (cls === "star" ? 4 : 2 + revenueGlow * 1.5);
    const glow = ctx.createRadialGradient(sp.x, sp.y, r * 0.5, sp.x, sp.y, glowR);
    glow.addColorStop(0, body.def.visuals.atmosphereColor);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, glowR, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Rings (recurring revenue streams)
    if (body.def.visuals.ringColor && body.def.metrics.recurringStreams > 0) {
      const ringCount = Math.min(body.def.metrics.recurringStreams, 4);
      for (let i = 0; i < ringCount; i++) {
        const ringR = r * (1.6 + i * 0.35);
        const ringTilt = Math.PI * 0.15 + Math.sin(t * 0.2 + i) * 0.03; // gentle wobble
        ctx.strokeStyle = body.def.visuals.ringColor;
        ctx.lineWidth = 1.5 * camera.zoom;
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y, ringR, ringR * 0.3, ringTilt, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Star corona
    if (cls === "star") {
      const coronaPhases = [0, Math.PI * 0.66, Math.PI * 1.33];
      for (const phase of coronaPhases) {
        const flicker = 0.85 + 0.15 * Math.sin(t * 3 + phase);
        const coronaGrad = ctx.createRadialGradient(sp.x, sp.y, r * 0.3, sp.x, sp.y, r * 1.8 * flicker);
        coronaGrad.addColorStop(0, "rgba(255, 230, 100, 0.4)");
        coronaGrad.addColorStop(0.4, "rgba(255, 180, 50, 0.15)");
        coronaGrad.addColorStop(1, "rgba(255, 120, 0, 0)");
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, r * 1.8 * flicker, 0, Math.PI * 2);
        ctx.fillStyle = coronaGrad;
        ctx.fill();
      }
      // Solar prominences
      for (let i = 0; i < 6; i++) {
        const promAngle = t * 0.5 + i * Math.PI / 3;
        const promLen = r * (0.5 + 0.3 * Math.sin(t * 2 + i * 1.7));
        const px = sp.x + Math.cos(promAngle) * (r + promLen * 0.5);
        const py = sp.y + Math.sin(promAngle) * (r + promLen * 0.5);
        const pg = ctx.createRadialGradient(px, py, 0, px, py, promLen * 0.4);
        pg.addColorStop(0, "rgba(255, 200, 80, 0.12)");
        pg.addColorStop(1, "rgba(255, 120, 0, 0)");
        ctx.beginPath();
        ctx.arc(px, py, promLen * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = pg;
        ctx.fill();
      }
    }

    // Main body disc
    const bodyGrad = ctx.createRadialGradient(
      sp.x - r * 0.3, sp.y - r * 0.3, 0,
      sp.x, sp.y, r,
    );
    bodyGrad.addColorStop(0, lightenColor(body.def.visuals.baseColor, 40));
    bodyGrad.addColorStop(0.7, body.def.visuals.baseColor);
    bodyGrad.addColorStop(1, body.def.visuals.glowColor);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Band pattern for gas giants
    if (body.def.visuals.surfacePattern === "bands") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
      ctx.clip();
      for (let i = 0; i < 5; i++) {
        const bandY = sp.y - r + r * 0.2 + i * r * 0.32;
        const bandH = r * 0.08 + Math.sin(t * 0.3 + i) * r * 0.02;
        ctx.fillStyle = `rgba(0, 0, 0, ${0.08 + i * 0.02})`;
        ctx.fillRect(sp.x - r, bandY, r * 2, bandH);
      }
      ctx.restore();
    }

    // Crater pattern for moons/terrestrial
    if (body.def.visuals.surfacePattern === "craters") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
      ctx.clip();
      const seed = body.def.id.charCodeAt(0) + body.def.id.charCodeAt(body.def.id.length - 1);
      for (let i = 0; i < 4; i++) {
        const cx = sp.x + Math.cos(seed + i * 2.1) * r * 0.35;
        const cy = sp.y + Math.sin(seed * 1.3 + i * 1.7) * r * 0.35;
        const cr = r * (0.1 + (i % 2) * 0.08);
        ctx.fillStyle = `rgba(0, 0, 0, ${0.08 + i * 0.02})`;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();
        // Crater rim highlight
        ctx.strokeStyle = `rgba(255, 255, 255, 0.04)`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(cx - cr * 0.1, cy - cr * 0.1, cr, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Pending status (ghost effect)
    if (body.def.status === "pending") {
      const ghostAlpha = 0.4 + 0.1 * Math.sin(t * 2);
      ctx.globalAlpha = ghostAlpha;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r + 4 * camera.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = "#64748B";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Selection / hover ring
    if (isSelected || isHovered) {
      ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r + 6 * camera.zoom, 0, Math.PI * 2);
      ctx.stroke();

      // Scan lines for selected
      if (isSelected) {
        const scanR = r + 10 * camera.zoom;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
          ctx.beginPath();
          ctx.moveTo(sp.x + Math.cos(angle) * scanR, sp.y + Math.sin(angle) * scanR);
          ctx.lineTo(
            sp.x + Math.cos(angle) * (scanR + 15 * camera.zoom),
            sp.y + Math.sin(angle) * (scanR + 15 * camera.zoom),
          );
          ctx.stroke();
        }
        // Rotating scan ring
        const scanAngle = t * 1.5;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, scanR + 20 * camera.zoom, scanAngle, scanAngle + Math.PI * 0.3);
        ctx.stroke();
      }
    }

    // Label
    const labelAlpha = camera.zoom > 0.6 ? 1 : camera.zoom / 0.6;
    if (labelAlpha > 0.1) {
      ctx.font = `600 ${Math.max(10, 11 * camera.zoom)}px "Sora", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(255, 255, 255, ${labelAlpha * 0.85})`;
      ctx.fillText(body.def.shortName, sp.x, sp.y + r + 14 * camera.zoom);

      if (camera.zoom > 1.2) {
        ctx.font = `500 ${Math.max(8, 9 * camera.zoom)}px "IBM Plex Mono", monospace`;
        ctx.fillStyle = `rgba(255, 255, 255, ${labelAlpha * 0.4})`;
        const rev = `$${(body.def.metrics.monthlyRevenue / 1000).toFixed(1)}k/mo`;
        ctx.fillText(rev, sp.x, sp.y + r + 26 * camera.zoom);
      }
    }
  }

  // -- Hover tooltip (canvas-rendered for smooth tracking)
  if (hoveredId && hoveredId !== selectedId) {
    const hBody = bodyMap.get(hoveredId);
    if (hBody) {
      const hsp = worldToScreen(hBody.state.position, camera, w, h);
      const ni = netIncome(hBody.def.metrics);
      const label = `${hBody.def.name}  ${fmtMoney(ni)}/mo`;
      ctx.font = `500 11px "IBM Plex Mono", monospace`;
      const tm = ctx.measureText(label);
      const tx = hsp.x + hBody.visualRadius * camera.zoom + 12;
      const ty = hsp.y - 8;
      const pad = 6;
      // Background
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.beginPath();
      ctx.roundRect(tx - pad, ty - 12 - pad, tm.width + pad * 2, 16 + pad * 2, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // Text
      ctx.fillStyle = ni >= 0 ? "#4ade80" : "#f43f5e";
      ctx.textAlign = "left";
      ctx.fillText(label, tx, ty);
    }
  }

  // -- Warp speed effect (persistent streaks)
  if (time.warpMode) {
    const cx = w / 2;
    const cy = h / 2;
    for (const streak of warpStreaks) {
      const animOffset = (t * streak.speed * 0.01) % 1;
      const sr = streak.startR + animOffset * streak.length * 0.5;
      const er = sr + streak.length;
      ctx.strokeStyle = `rgba(180, 200, 255, ${streak.alpha})`;
      ctx.lineWidth = streak.width;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(streak.angle) * sr, cy + Math.sin(streak.angle) * sr);
      ctx.lineTo(cx + Math.cos(streak.angle) * er, cy + Math.sin(streak.angle) * er);
      ctx.stroke();
    }
    // Central chromatic flare
    const flareGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80);
    flareGrad.addColorStop(0, `rgba(200, 220, 255, ${0.04 + Math.sin(t * 5) * 0.02})`);
    flareGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = flareGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 80, 0, Math.PI * 2);
    ctx.fill();
  }

  // -- Mini-map (bottom-right, above legend)
  renderMiniMap(ctx, w, h, bodies, camera, selectedId);

  // -- Scanline overlay (CRT feel)
  ctx.fillStyle = "rgba(0, 0, 0, 0.025)";
  for (let y = 0; y < h; y += 3) {
    ctx.fillRect(0, y, w, 1);
  }

  // -- Vignette
  const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------
// Mini-Map
// ---------------------------------------------------------------------------

function renderMiniMap(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bodies: SimulatedBody[],
  camera: CameraState,
  selectedId: string | null,
): void {
  const mapSize = 100;
  const mapPad = 16;
  const mapX = w - mapSize - mapPad;
  const mapY = h - mapSize - mapPad - 60; // above bottom bar
  const worldExtent = 500; // world units visible in mini-map

  // Background
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(mapX, mapY, mapSize, mapSize, 4);
  ctx.fill();
  ctx.stroke();

  // Bodies as dots
  for (const body of bodies) {
    const bx = mapX + mapSize / 2 + (body.state.position.x / worldExtent) * (mapSize / 2);
    const by = mapY + mapSize / 2 + (body.state.position.y / worldExtent) * (mapSize / 2);
    if (bx < mapX || bx > mapX + mapSize || by < mapY || by > mapY + mapSize) continue;
    const dotR = effectiveClass(body.def) === "star" ? 3 : 2;
    const isSelected = body.def.id === selectedId;
    ctx.beginPath();
    ctx.arc(bx, by, dotR, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "#ffffff" : body.def.visuals.baseColor;
    ctx.fill();
  }

  // Camera viewport indicator
  const vpW = (w / camera.zoom) / worldExtent * (mapSize / 2);
  const vpH = (h / camera.zoom) / worldExtent * (mapSize / 2);
  const vpX = mapX + mapSize / 2 + (camera.x / worldExtent) * (mapSize / 2) - vpW / 2;
  const vpY = mapY + mapSize / 2 + (camera.y / worldExtent) * (mapSize / 2) - vpH / 2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    Math.max(mapX, vpX),
    Math.max(mapY, vpY),
    Math.min(vpW, mapSize),
    Math.min(vpH, mapSize),
  );

  // Label
  ctx.font = '500 7px "IBM Plex Mono", monospace';
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  ctx.textAlign = "right";
  ctx.fillText("MAP", mapX + mapSize - 4, mapY + 10);
}

// ---------------------------------------------------------------------------
// Color Helpers
// ---------------------------------------------------------------------------

function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, r + amount)}, ${Math.min(255, g + amount)}, ${Math.min(255, b + amount)})`;
}

// ---------------------------------------------------------------------------
// Hit Testing
// ---------------------------------------------------------------------------

function hitTest(
  wp: WorldPos,
  bodies: SimulatedBody[],
): SimulatedBody | null {
  for (let i = bodies.length - 1; i >= 0; i--) {
    const body = bodies[i];
    const dist = vec2Dist(wp, body.state.position);
    const hitRadius = body.visualRadius * 1.5 + 10;
    if (dist < hitRadius) return body;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Format Helpers
// ---------------------------------------------------------------------------

function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtPercent(n: number | undefined): string {
  if (n == null) return "N/A";
  return `${(n * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Detail Panel Component
// ---------------------------------------------------------------------------

function DetailPanel({
  body,
  onClose,
}: {
  body: SimulatedBody;
  onClose: () => void;
}) {
  const health = deriveHealth(body.def.metrics);
  const m = body.def.metrics;
  const ni = netIncome(m);
  const cls = effectiveClass(body.def);

  return (
    <Card className="absolute top-4 right-4 w-80 bg-black/80 border-white/10 backdrop-blur-xl z-50 shadow-2xl animate-fade-in">
      <CardHeader className="pb-3 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors font-mono text-xs"
        >
          x
        </button>
        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-full shadow-lg"
            style={{
              backgroundColor: body.def.visuals.baseColor,
              boxShadow: `0 0 12px ${body.def.visuals.glowColor}`,
            }}
          />
          <div>
            <CardTitle className="text-sm font-display text-white/90 tracking-wide">
              {body.def.name}
            </CardTitle>
            <p className="text-[10px] font-mono text-white/30 mt-0.5 uppercase tracking-widest">
              {body.def.tenantType} &middot; {cls}
              {body.def.celestialClassOverride ? " (override)" : ""}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="w-fit mt-2 text-[10px] font-mono tracking-wider border-0"
          style={{ color: healthToColor(health), backgroundColor: `${healthToColor(health)}15` }}
        >
          {health.toUpperCase()}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[11px] text-white/40 font-sans leading-relaxed">
          {body.def.description}
        </p>

        {/* Revenue/Expense bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[9px] font-mono text-white/25 uppercase tracking-wider">
            <span>Revenue vs Expenses</span>
            <span>{fmtMoney(ni)}</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden flex">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (m.monthlyRevenue / Math.max(m.monthlyRevenue + m.monthlyExpenses, 1)) * 100)}%`,
                backgroundColor: "#4ade80",
              }}
            />
            <div
              className="h-full"
              style={{
                width: `${Math.min(100, (m.monthlyExpenses / Math.max(m.monthlyRevenue + m.monthlyExpenses, 1)) * 100)}%`,
                backgroundColor: "#f43f5e",
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <MetricRow label="Total Assets" value={fmtMoney(m.totalAssets)} />
          <MetricRow label="Monthly Rev" value={fmtMoney(m.monthlyRevenue)} color="#4ade80" />
          <MetricRow label="Monthly Exp" value={fmtMoney(m.monthlyExpenses)} color="#f43f5e" />
          <MetricRow label="Net Income" value={fmtMoney(ni)} color={ni >= 0 ? "#4ade80" : "#f43f5e"} />
          <MetricRow label="Cash Velocity" value={`${m.cashVelocity} tx/mo`} />
          <MetricRow label="Recurring" value={`${m.recurringStreams} streams`} />
          {m.occupancyRate != null && (
            <MetricRow label="Occupancy" value={fmtPercent(m.occupancyRate)} color="#38bdf8" />
          )}
          {m.capRate != null && (
            <MetricRow label="Cap Rate" value={fmtPercent(m.capRate)} color="#fbbf24" />
          )}
        </div>

        <div className="pt-2 border-t border-white/5">
          <div className="flex justify-between items-center text-[10px] font-mono text-white/25">
            <span>ORBIT: {body.state.orbitalRadius.toFixed(0)}AU</span>
            <span>MASS: {body.mass.toFixed(1)}</span>
            <span>R: {body.visualRadius.toFixed(0)}px</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[9px] font-mono text-white/25 uppercase tracking-wider">{label}</div>
      <div className="text-xs font-mono font-medium" style={{ color: color ?? "rgba(255,255,255,0.8)" }}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HUD Overlay (top-left telemetry)
// ---------------------------------------------------------------------------

function HUD({
  bodies,
  camera,
  time,
  particles,
}: {
  bodies: SimulatedBody[];
  camera: CameraState;
  time: TimeControl;
  particles: FlowParticle[];
}) {
  const sun = bodies.find((b) => effectiveClass(b.def) === "star");
  const health = sun ? deriveHealth(sun.def.metrics) : "stable" as HealthRating;
  const totalAssets = bodies.reduce((s, b) => s + b.def.metrics.totalAssets, 0);
  const totalRevenue = bodies.reduce((s, b) => s + b.def.metrics.monthlyRevenue, 0);
  const totalExpenses = bodies.reduce((s, b) => s + b.def.metrics.monthlyExpenses, 0);
  const totalNet = totalRevenue - totalExpenses;
  const inbound = particles.filter((p) => p.direction === "inbound").length;
  const outbound = particles.filter((p) => p.direction === "outbound").length;

  return (
    <div className="absolute top-4 left-4 z-40 pointer-events-none select-none">
      <div className="font-display text-lg tracking-[0.2em] text-white/60 uppercase">
        Orbital Finance
      </div>
      <div className="font-display text-[10px] tracking-[0.35em] text-white/20 uppercase mt-0.5">
        Console
      </div>
      <div className="mt-4 space-y-1.5 font-mono text-[10px]">
        <HUDRow label="HEALTH" value={health.toUpperCase()} color={healthToColor(health)} />
        <HUDRow label="ASSETS" value={fmtMoney(totalAssets)} color="rgba(255,255,255,0.6)" />
        <HUDRow label="REVENUE" value={`${fmtMoney(totalRevenue)}/mo`} color="#4ade80b3" />
        <HUDRow label="EXPENSE" value={`${fmtMoney(totalExpenses)}/mo`} color="#f43f5eb3" />
        <HUDRow label="NET" value={`${fmtMoney(totalNet)}/mo`} color={totalNet >= 0 ? "#4ade80b3" : "#f43f5eb3"} />
        <div className="flex items-center gap-2">
          <span className="text-white/20 w-16">FLOWS</span>
          <span className="text-[#4ade80]/50">{inbound}</span>
          <span className="text-white/10">/</span>
          <span className="text-[#f43f5e]/50">{outbound}</span>
        </div>
        <HUDRow label="ZOOM" value={`${camera.zoom.toFixed(2)}x`} color="rgba(255,255,255,0.3)" />
        <HUDRow label="EPOCH" value={TIMELINE[time.month]?.label ?? "—"} color="rgba(255,255,255,0.3)" />
        <HUDRow label="BODIES" value={`${bodies.length}`} color="rgba(255,255,255,0.3)" />
      </div>
    </div>
  );
}

function HUDRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-white/20 w-16">{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time Scrubber (bottom bar)
// ---------------------------------------------------------------------------

function TimeScrubber({
  time,
  onMonthChange,
  onWarpToggle,
  onPauseToggle,
  onSpeedChange,
}: {
  time: TimeControl;
  onMonthChange: (m: number) => void;
  onWarpToggle: () => void;
  onPauseToggle: () => void;
  onSpeedChange: (s: number) => void;
}) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 bg-black/60 backdrop-blur-md border-t border-white/5 px-6 py-3">
      <div className="flex items-center gap-6">
        <button
          onClick={onPauseToggle}
          className="w-8 h-8 flex items-center justify-center rounded border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors font-mono text-xs"
        >
          {time.paused ? "\u25B6" : "\u2016"}
        </button>

        <div className="flex items-center gap-1">
          {[0.5, 1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                time.speed === s
                  ? "bg-white/10 text-white/80"
                  : "text-white/25 hover:text-white/50"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        <div className="flex-1 flex items-center gap-3">
          <span className="text-[10px] font-mono text-white/25 w-16 shrink-0">
            {TIMELINE[time.month]?.label ?? "—"}
          </span>
          <Slider
            value={[time.month]}
            onValueChange={([v]) => onMonthChange(v)}
            min={0}
            max={time.totalMonths - 1}
            step={1}
            className="flex-1"
          />
          <span className="text-[10px] font-mono text-white/25 w-16 shrink-0 text-right">
            {TIMELINE[time.totalMonths - 1]?.label ?? "—"}
          </span>
        </div>

        <button
          onClick={onWarpToggle}
          className={`px-3 py-1.5 rounded text-[10px] font-mono tracking-widest uppercase transition-all ${
            time.warpMode
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
              : "text-white/25 border border-white/5 hover:text-white/50 hover:border-white/15"
          }`}
        >
          WARP
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend (bottom-left, above keyboard hints)
// ---------------------------------------------------------------------------

function Legend() {
  return (
    <div className="absolute bottom-16 right-4 z-40 pointer-events-none select-none">
      <div className="space-y-1 font-mono text-[9px]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#4ade80]" />
          <span className="text-white/25">Income flow</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#f43f5e]" />
          <span className="text-white/25">Expense flow</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-0.5 border-t border-dashed border-white/20" />
          <span className="text-white/25">Gravitational link</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full border border-white/30" />
          <span className="text-white/25">Orbit path</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function OrbitalConsole() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Simulation state refs (not React state — mutated in rAF loop)
  const bodiesRef = useRef<SimulatedBody[]>(initBodies(ENTITIES));
  const particlesRef = useRef<FlowParticle[]>([]);
  const pulsesRef = useRef<PulseWave[]>([]);
  const cameraRef = useRef<CameraState>(createCamera());
  const starsRef = useRef<TxStar[]>(generateStarField(DEFAULT_CONFIG.starCount, 800));
  const constellationsRef = useRef<Constellation[]>(generateConstellations(starsRef.current));
  const warpStreaksRef = useRef<WarpStreak[]>(generateWarpStreaks(WARP_STREAK_COUNT));
  const frameCountRef = useRef(0);
  const lastPulseRef = useRef({ value: 0 });

  // React state for UI overlay
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const [time, setTime] = useState<TimeControl>(createTimeControl(TIMELINE.length));
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [selectedBody, setSelectedBody] = useState<SimulatedBody | null>(null);

  // Apply timeline month changes to body metrics
  const lastAppliedMonth = useRef(-1);

  // -- Resize handler
  useEffect(() => {
    function handleResize() {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
      setCanvasSize({ w: rect.width, h: rect.height });
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // -- Mouse interactions
  const isDragging = useRef(false);
  const dragStart = useRef(screenPos(0, 0));
  const cameraStart = useRef(worldPos(0, 0));

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current = screenPos(e.clientX, e.clientY);
    cameraStart.current = worldPos(cameraRef.current.targetX, cameraRef.current.targetY);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sp = screenPos(e.clientX - rect.left, e.clientY - rect.top);

    if (isDragging.current) {
      const dx = (e.clientX - dragStart.current.x) / cameraRef.current.zoom;
      const dy = (e.clientY - dragStart.current.y) / cameraRef.current.zoom;
      cameraRef.current.targetX = cameraStart.current.x - dx;
      cameraRef.current.targetY = cameraStart.current.y - dy;
      return;
    }

    // Hover detection
    const wp = screenToWorld(sp, cameraRef.current, canvasSize.w, canvasSize.h);
    const hit = hitTest(wp, bodiesRef.current);
    hoveredIdRef.current = hit?.def.id ?? null;
  }, [canvasSize]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    isDragging.current = false;

    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 5) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sp = screenPos(e.clientX - rect.left, e.clientY - rect.top);
    const wp = screenToWorld(sp, cameraRef.current, canvasSize.w, canvasSize.h);
    const hit = hitTest(wp, bodiesRef.current);

    if (hit) {
      setSelectedId(hit.def.id);
      setSelectedBody({ ...hit });
      cameraRef.current.targetX = hit.state.position.x;
      cameraRef.current.targetY = hit.state.position.y;
      cameraRef.current.targetZoom = Math.min(MAX_ZOOM, Math.max(1.5, cameraRef.current.targetZoom));
    } else {
      setSelectedId(null);
      setSelectedBody(null);
    }
  }, [canvasSize]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sp = screenPos(e.clientX - rect.left, e.clientY - rect.top);
    const wp = screenToWorld(sp, cameraRef.current, canvasSize.w, canvasSize.h);
    // Zoom toward cursor position
    cameraRef.current.targetX = wp.x;
    cameraRef.current.targetY = wp.y;
    cameraRef.current.targetZoom = Math.min(MAX_ZOOM, cameraRef.current.targetZoom * 1.8);
  }, [canvasSize]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    cameraRef.current.targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cameraRef.current.targetZoom * delta));
  }, []);

  // -- Animation loop
  useEffect(() => {
    let lastTime = performance.now();

    function loop(now: number) {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.1) * time.speed * (time.paused ? 0 : 1) * (time.warpMode ? 8 : 1);

      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(loop); return; }
      const ctx = canvas.getContext("2d");
      if (!ctx) { rafRef.current = requestAnimationFrame(loop); return; }
      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;

      // Apply timeline month if changed
      if (time.month !== lastAppliedMonth.current) {
        lastAppliedMonth.current = time.month;
        applyTimelineMonth(bodiesRef.current, time.month);
        // Refresh selected body data
        if (selectedId) {
          const sb = bodiesRef.current.find((b) => b.def.id === selectedId);
          if (sb) setSelectedBody({ ...sb });
        }
      }

      // Update physics
      updatePhysics(bodiesRef.current, dt, DEFAULT_CONFIG);

      // Update particles
      if (!time.paused) {
        spawnParticles(particlesRef.current, LINKS, DEFAULT_CONFIG);
        particlesRef.current = updateParticles(particlesRef.current, dt);
      }

      // Update pulses
      const sun = bodiesRef.current.find((b) => effectiveClass(b.def) === "star");
      const health = sun ? deriveHealth(sun.def.metrics) : ("stable" as HealthRating);
      pulsesRef.current = updatePulses(
        pulsesRef.current, dt, lastPulseRef.current, now, health, DEFAULT_CONFIG,
      );

      // Smooth camera
      lerpCamera(cameraRef.current, DEFAULT_CONFIG.cameraSmoothing);

      frameCountRef.current++;

      // Render
      renderFrame(
        ctx, cw, ch,
        bodiesRef.current,
        particlesRef.current,
        starsRef.current,
        constellationsRef.current,
        LINKS,
        pulsesRef.current,
        warpStreaksRef.current,
        cameraRef.current,
        time,
        selectedId,
        hoveredIdRef.current,
        frameCountRef.current,
      );

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [time, selectedId]);

  // -- Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectedId(null);
        setSelectedBody(null);
        cameraRef.current.targetX = 0;
        cameraRef.current.targetY = 0;
        cameraRef.current.targetZoom = 1;
      }
      if (e.key === " ") {
        e.preventDefault();
        setTime((t) => ({ ...t, paused: !t.paused }));
      }
      if (e.key === "w" || e.key === "W") {
        setTime((t) => ({ ...t, warpMode: !t.warpMode }));
      }
      // Arrow keys for timeline
      if (e.key === "ArrowRight") {
        setTime((t) => ({ ...t, month: Math.min(t.totalMonths - 1, t.month + 1) }));
      }
      if (e.key === "ArrowLeft") {
        setTime((t) => ({ ...t, month: Math.max(0, t.month - 1) }));
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden cursor-crosshair"
      style={{ backgroundColor: "#020208" }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        className="absolute inset-0"
      />

      <HUD
        bodies={bodiesRef.current}
        camera={cameraRef.current}
        time={time}
        particles={particlesRef.current}
      />

      {selectedBody && (
        <DetailPanel body={selectedBody} onClose={() => { setSelectedId(null); setSelectedBody(null); }} />
      )}

      <Legend />

      <TimeScrubber
        time={time}
        onMonthChange={(m) => setTime((t) => ({ ...t, month: m }))}
        onWarpToggle={() => setTime((t) => ({ ...t, warpMode: !t.warpMode }))}
        onPauseToggle={() => setTime((t) => ({ ...t, paused: !t.paused }))}
        onSpeedChange={(s) => setTime((t) => ({ ...t, speed: s }))}
      />

      {/* Keyboard hints */}
      <div className="absolute bottom-16 left-4 z-40 pointer-events-none select-none font-mono text-[9px] text-white/15 space-y-0.5">
        <div>SPACE pause &middot; W warp &middot; ESC reset</div>
        <div>Scroll zoom &middot; Drag pan &middot; DblClick zoom in</div>
        <div>&larr;&rarr; timeline &middot; Click select</div>
      </div>
    </div>
  );
}
