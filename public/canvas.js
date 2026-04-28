
//================================
//=============EFFECTS============
//================================

// Effect arrays
const absorptions = [];
const suctionParticles = [];
const pulseEffects = [];
const orbBursts = [];
let screenShake = { x: 0, y: 0, intensity: 0 };

// Player trail system
//
// Trails are sampled on *world distance moved*, not on a fixed frame
// cadence. That's the difference between a tail and an aura: tiny
// players move many pixels per frame, huge players barely move - if we
// always sample every 3 frames we end up with overlapping breadcrumbs
// stacked on top of huge players, which renders as a fat halo. Sampling
// by distance keeps the trail orbs spaced like a real path no matter
// what size the player is.
const playerTrails = new Map();
const MIN_TRAIL_LENGTH = 14;
const MAX_TRAIL_LENGTH = 36;

function clearPlayerTrails() {
    playerTrails.clear();
}

// Helper to convert rgb() to rgba()
function rgbToRgba(color, alpha) {
    if (!color) return `rgba(255,255,255,${alpha})`;
    if (color.startsWith('rgba')) return color;
    if (color.startsWith('rgb(')) {
        return color.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
    }
    return color;
}

// The player's color is now authoritative on the server - it gets
// updated to the boost orb color on absorption and persists. The client
// just renders p.color directly. Helper kept as a single-source choke
// point in case we want client-side blending again later.
function getPlayerColor(p) {
    if (!p) return 'rgb(100, 100, 255)';
    return p.color || 'rgb(100, 100, 255)';
}

// Update player trails - DISTANCE-BASED capture.
//
// We only push a new breadcrumb after the player has moved roughly half
// a body-radius. That keeps spacing proportional to size: a small fast
// player still gets dense samples while a huge slow player gets nicely
// spaced-out tail orbs. Trail length also scales with size so bigger
// players have visibly longer tails (matching their actual visual mass).
function updatePlayerTrails(playersArray) {
    const activeIds = new Set();

    playersArray.forEach(p => {
        if (!p.uid) return;
        if (!isFinite(p.locX) || !isFinite(p.locY) || !isFinite(p.radius)) return;
        activeIds.add(p.uid);

        if (!playerTrails.has(p.uid)) {
            playerTrails.set(p.uid, []);
        }

        const trail = playerTrails.get(p.uid);
        const radius = Math.max(1, p.radius);
        // Spacing between trail points - tied to size so the tail looks
        // like a path regardless of how big the player is.
        const minStep = Math.max(3, Math.min(80, radius * 0.45));
        const last = trail[0];
        let shouldAdd = !last;
        if (last) {
            const dx = p.locX - last.x;
            const dy = p.locY - last.y;
            if (dx * dx + dy * dy >= minStep * minStep) shouldAdd = true;
        }
        if (!shouldAdd) return;

        trail.unshift({
            x: p.locX,
            y: p.locY,
            radius: radius,
            color: getPlayerColor(p)
        });

        // Bigger players get longer tails. Capped so we don't tank perf
        // on a huge endgame whale.
        const maxLen = Math.min(
            MAX_TRAIL_LENGTH,
            Math.max(MIN_TRAIL_LENGTH, Math.floor(MIN_TRAIL_LENGTH + radius / 12))
        );
        while (trail.length > maxLen) trail.pop();
    });

    for (const uid of playerTrails.keys()) {
        if (!activeIds.has(uid)) {
            playerTrails.delete(uid);
        }
    }
}

// Draw player trails. The visual identity of each trail point (color,
// radius) is captured at the moment of sampling, so a player picking up
// a new boost orb produces a visible color "ripple" running backwards
// through their tail as the new color overwrites the old samples.
function drawPlayerTrails(ctx) {
    playerTrails.forEach((trail) => {
        if (!trail || trail.length < 2) return;

        // Connecting strokes - this is what makes the trail look like a
        // continuous path instead of a line of dots. Width scales with
        // body radius so huge players get a *thick* tail rather than a
        // thin line behind a giant blob.
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = trail.length - 1; i >= 1; i--) {
            const point = trail[i];
            const nextPoint = trail[i - 1];
            if (!point || !nextPoint) continue;
            if (!isFinite(point.x) || !isFinite(point.radius)) continue;

            const progress = 1 - (i / trail.length);
            const alpha = (0.18 + progress * 0.55);
            const lineWidth = Math.max(2, point.radius * (0.55 + progress * 0.6));

            ctx.beginPath();
            ctx.strokeStyle = rgbToRgba(point.color, alpha);
            ctx.lineWidth = lineWidth;
            ctx.moveTo(point.x, point.y);
            ctx.lineTo(nextPoint.x, nextPoint.y);
            ctx.stroke();
        }
        ctx.restore();

        // Sparse breadcrumb dots on top so individual trail steps still
        // read as discrete orbs. Skipped on tiny radii (looks busy).
        for (let i = trail.length - 1; i >= 1; i--) {
            const point = trail[i];
            if (!point || !isFinite(point.x) || !isFinite(point.y)) continue;
            if (!isFinite(point.radius) || point.radius <= 0) continue;

            const progress = 1 - (i / trail.length);
            const alpha = progress * 0.45;
            const scale = 0.35 + progress * 0.45;
            const pcolor = point.color || 'rgb(100, 100, 255)';

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.fillStyle = pcolor;
            ctx.arc(point.x, point.y, Math.max(1.5, point.radius * scale), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    });
}

// Resolve an absorber by uid each frame so effects track the player as
// they keep moving (otherwise everything sucks toward a stale spawn point).
function resolveAbsorber(uid, fallbackX, fallbackY, fallbackR) {
    if (uid && Array.isArray(players)) {
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            if (p && p.uid === uid && isFinite(p.locX) && isFinite(p.locY)) {
                return { x: p.locX, y: p.locY, r: p.radius || fallbackR || 20 };
            }
        }
    }
    return { x: fallbackX, y: fallbackY, r: fallbackR || 20 };
}

// Absorption effect - the orb is pulled magnetically into the absorber's
// body, accelerating as it gets closer, then visually merges (vanishes
// inside the absorber's radius).
class AbsorptionEffect {
    constructor(startX, startY, color, radius, absorberUid, fallbackX, fallbackY, fallbackR) {
        this.x = startX;
        this.y = startY;
        this.absorberUid = absorberUid;
        this.fallbackX = fallbackX;
        this.fallbackY = fallbackY;
        this.fallbackR = fallbackR;
        this.color = color;
        this.radius = radius;
        this.originalRadius = radius;

        // Start with a small tangential nudge so the path curves in like
        // a comet rather than just snapping to the target.
        const tx = (fallbackX - startX) || 1;
        const ty = (fallbackY - startY) || 0;
        const baseAngle = Math.atan2(ty, tx);
        const sideways = baseAngle + (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2);
        const kick = 0.6 + Math.random() * 0.6;
        this.vx = Math.cos(sideways) * kick;
        this.vy = Math.sin(sideways) * kick;

        this.trail = [];
        this.dead = false;
    }

    update() {
        const target = resolveAbsorber(
            this.absorberUid, this.fallbackX, this.fallbackY, this.fallbackR
        );
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.max(0.0001, Math.sqrt(dx * dx + dy * dy));

        // Magnetic pull: stronger as we get closer (1/dist style, capped).
        const pull = 0.6 + Math.min(2.4, 80 / dist);
        this.vx += (dx / dist) * pull;
        this.vy += (dy / dist) * pull;
        // Light damping keeps it from overshooting wildly.
        this.vx *= 0.86;
        this.vy *= 0.86;

        this.x += this.vx;
        this.y += this.vy;

        // Trail breadcrumbs for the streak.
        this.trail.push({
            x: this.x, y: this.y,
            radius: this.radius * 0.65, alpha: 0.9
        });
        if (this.trail.length > 12) this.trail.shift();
        for (const t of this.trail) {
            t.alpha *= 0.82;
            t.radius *= 0.93;
        }
        this.trail = this.trail.filter(t => t.alpha > 0.04);

        // Shrink rapidly once we're inside ~150px so the orb visibly
        // disappears INTO the absorber rather than sitting on top of it.
        const closeness = Math.max(0, 1 - dist / 150);
        this.radius = this.originalRadius * (1 - 0.95 * closeness);

        // Arrived at / inside the absorber - we're done.
        if (dist <= target.r * 0.85) {
            this.dead = true;
        }
    }

    draw(ctx) {
        for (const t of this.trail) {
            ctx.save();
            ctx.globalAlpha = t.alpha * 0.55;
            ctx.beginPath();
            ctx.fillStyle = this.color;
            ctx.arc(t.x, t.y, Math.max(0.5, t.radius), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        if (this.radius > 0.4) {
            const target = resolveAbsorber(
                this.absorberUid, this.fallbackX, this.fallbackY, this.fallbackR
            );
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const angle = Math.atan2(dy, dx);
            // Stretch along the line of motion so it looks like a streak.
            const speed = Math.min(8, Math.sqrt(this.vx * this.vx + this.vy * this.vy));
            const stretch = 1 + speed * 0.18;

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.scale(stretch, 1 / Math.max(1, stretch * 0.6));

            const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 2.2);
            glow.addColorStop(0, this.color);
            glow.addColorStop(0.45, rgbToRgba(this.color, 0.55));
            glow.addColorStop(1, 'transparent');
            ctx.beginPath();
            ctx.fillStyle = glow;
            ctx.arc(0, 0, this.radius * 2.2, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.fillStyle = this.color;
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    }

    isDead() {
        return this.dead || this.radius < 0.4;
    }
}

// Suction particle - a small chunk of the absorbed thing flying into the
// absorber. Same magnetic-pull model so all debris converges on the
// (moving) absorber.
class SuctionParticle {
    constructor(x, y, color, absorberUid, fallbackX, fallbackY, fallbackR) {
        this.x = x;
        this.y = y;
        this.absorberUid = absorberUid;
        this.fallbackX = fallbackX;
        this.fallbackY = fallbackY;
        this.fallbackR = fallbackR;
        this.color = color;
        this.size = 2 + Math.random() * 3.5;
        this.life = 1;

        // Slight random initial fling so particles fan out before being
        // sucked back in.
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.2 + Math.random() * 2.2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.dead = false;
    }

    update() {
        const target = resolveAbsorber(
            this.absorberUid, this.fallbackX, this.fallbackY, this.fallbackR
        );
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.max(0.0001, Math.sqrt(dx * dx + dy * dy));

        const pull = 0.45 + Math.min(2.8, 70 / dist);
        this.vx += (dx / dist) * pull;
        this.vy += (dy / dist) * pull;
        this.vx *= 0.9;
        this.vy *= 0.9;

        this.x += this.vx;
        this.y += this.vy;

        this.life -= 0.025;
        // Don't shrink while we're still flying in - keeps the streak
        // bright until the moment it disappears into the absorber.
        if (dist < 60) this.size *= 0.95;

        if (dist <= target.r * 0.8 || this.size < 0.4) {
            this.dead = true;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, this.life));
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 2);
        gradient.addColorStop(0, '#fff');
        gradient.addColorStop(0.3, this.color);
        gradient.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    isDead() {
        return this.dead || this.life <= 0;
    }
}

// Pulse effect - expands briefly when absorption completes
class PulseEffect {
    constructor(x, y, color, maxRadius) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = maxRadius * 0.8;
        this.maxRadius = maxRadius * 1.3;
        this.life = 1;
    }

    update() {
        this.radius += (this.maxRadius - this.radius) * 0.2;
        this.life -= 0.08;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life * 0.6;
        
        const gradient = ctx.createRadialGradient(this.x, this.y, this.radius * 0.7, this.x, this.y, this.radius);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(0.7, rgbToRgba(this.color, 0.3));
        gradient.addColorStop(1, this.color);
        
        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }

    isDead() {
        return this.life <= 0;
    }
}

// Spawn absorption effect for orbs. `absorberUid` is preferred so the
// effect tracks the (moving) absorber every frame; the x/y/r args are
// just fallbacks if the player has already left the players[] array.
function spawnOrbAbsorption(orbX, orbY, orbColor, orbRadius, absorberUid, absorberX, absorberY, absorberRadius) {
    absorptions.push(new AbsorptionEffect(
        orbX, orbY, orbColor, orbRadius,
        absorberUid, absorberX, absorberY, absorberRadius
    ));

    // Small chunks fanning outward then sucked back in with the orb.
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 / 6) * i + Math.random() * 0.25;
        const dist = orbRadius + 2;
        const px = orbX + Math.cos(angle) * dist;
        const py = orbY + Math.sin(angle) * dist;
        suctionParticles.push(new SuctionParticle(
            px, py, orbColor,
            absorberUid, absorberX, absorberY, absorberRadius
        ));
    }

    // Pulse on the absorber's CURRENT position at the moment the orb
    // arrives - look it up live so it lands on the player, not on the
    // stale spawn point.
    setTimeout(() => {
        const t = resolveAbsorber(absorberUid, absorberX, absorberY, absorberRadius);
        pulseEffects.push(new PulseEffect(t.x, t.y, orbColor, t.r + 8));
    }, 220);
}

// Visual-only "rebirth" burst when a player's size resets after hitting
// the configured cap. Spits out a shower of small orbs flying outward
// from the position they shrank at. None of these are real game orbs,
// they just look the part for a beat then fade.
class OrbBurstEffect {
    constructor(x, y, color, radius) {
        this.particles = [];
        // Scale particle count with how big the player got - bigger
        // collapse, bigger spectacle. Capped for perf.
        const count = Math.max(14, Math.min(32, Math.floor(8 + radius / 12)));
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
            const speed = 4 + Math.random() * 6;
            // Mix in some white-hot and the player color so it reads as
            // chunks of *the player* being expelled.
            const useWhite = Math.random() < 0.3;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 4 + Math.random() * 5,
                color: useWhite ? 'rgb(255, 255, 255)' : color,
                life: 1
            });
        }
    }

    update() {
        for (const p of this.particles) {
            p.x += p.vx;
            p.y += p.vy;
            // Drag - so the chunks decelerate dramatically and fall to
            // a stop instead of continuing forever.
            p.vx *= 0.92;
            p.vy *= 0.92;
            p.life -= 0.022;
        }
        this.particles = this.particles.filter(p => p.life > 0);
    }

    draw(ctx) {
        for (const p of this.particles) {
            const alpha = Math.max(0, Math.min(1, p.life));
            const r = Math.max(0.5, p.radius * (0.4 + 0.6 * alpha));

            ctx.save();
            ctx.globalAlpha = alpha;

            // Glow halo
            const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
            glow.addColorStop(0, p.color);
            glow.addColorStop(0.45, rgbToRgba(p.color, 0.4));
            glow.addColorStop(1, 'transparent');
            ctx.beginPath();
            ctx.fillStyle = glow;
            ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
            ctx.fill();

            // Core orb
            ctx.beginPath();
            ctx.fillStyle = p.color;
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    }

    isDead() {
        return this.particles.length === 0;
    }
}

function spawnOrbBurst(x, y, color, radius) {
    orbBursts.push(new OrbBurstEffect(x, y, color || 'rgb(255,255,255)', radius || 60));
    pulseEffects.push(new PulseEffect(x, y, color || 'rgb(255,255,255)', (radius || 60) * 1.4));
    triggerScreenShake(4);
}

// Spawn effects for player absorption (bigger, more dramatic).
function spawnPlayerAbsorption(killedX, killedY, killedColor, killedRadius, killerUid, killerX, killerY, killerRadius) {
    absorptions.push(new AbsorptionEffect(
        killedX, killedY, killedColor, killedRadius,
        killerUid, killerX, killerY, killerRadius
    ));

    // A whole shower of debris streaming into the killer.
    const debrisCount = 22;
    for (let i = 0; i < debrisCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = killedRadius * (0.4 + Math.random() * 0.9);
        const px = killedX + Math.cos(angle) * dist;
        const py = killedY + Math.sin(angle) * dist;
        suctionParticles.push(new SuctionParticle(
            px, py, killedColor,
            killerUid, killerX, killerY, killerRadius
        ));
    }

    // Two pulses: one immediate at the death point (the "pop"), one
    // delayed on the killer when the mass arrives.
    pulseEffects.push(new PulseEffect(killedX, killedY, killedColor, killedRadius * 1.6));
    setTimeout(() => {
        const t = resolveAbsorber(killerUid, killerX, killerY, killerRadius);
        pulseEffects.push(new PulseEffect(t.x, t.y, killedColor, t.r + killedRadius * 0.6));
        triggerScreenShake(5);
    }, 260);
}

// Screen shake effect
function triggerScreenShake(intensity) {
    screenShake.intensity = Math.max(screenShake.intensity, intensity);
}

function updateScreenShake() {
    if (screenShake.intensity > 0) {
        screenShake.x = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.y = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.intensity *= 0.85;
        if (screenShake.intensity < 0.3) {
            screenShake.intensity = 0;
            screenShake.x = 0;
            screenShake.y = 0;
        }
    }
}

// Update all effects
function updateEffects() {
    // Update absorptions
    for (let i = absorptions.length - 1; i >= 0; i--) {
        absorptions[i].update();
        if (absorptions[i].isDead()) {
            absorptions.splice(i, 1);
        }
    }
    
    // Update suction particles
    for (let i = suctionParticles.length - 1; i >= 0; i--) {
        suctionParticles[i].update();
        if (suctionParticles[i].isDead()) {
            suctionParticles.splice(i, 1);
        }
    }
    
    // Update pulse effects
    for (let i = pulseEffects.length - 1; i >= 0; i--) {
        pulseEffects[i].update();
        if (pulseEffects[i].isDead()) {
            pulseEffects.splice(i, 1);
        }
    }

    // Update orb-burst rebirth effects
    for (let i = orbBursts.length - 1; i >= 0; i--) {
        orbBursts[i].update();
        if (orbBursts[i].isDead()) {
            orbBursts.splice(i, 1);
        }
    }

    updateScreenShake();
}

// Draw all effects
function drawEffects(ctx) {
    // Draw pulse effects (behind)
    pulseEffects.forEach(p => p.draw(ctx));

    // Draw absorptions
    absorptions.forEach(a => a.draw(ctx));

    // Draw orb bursts (size-reset rebirth)
    orbBursts.forEach(b => b.draw(ctx));

    // Draw suction particles (on top)
    suctionParticles.forEach(p => p.draw(ctx));
}

//================================
//=============DRAW===============
//================================

var background = new Image();
background.src = "images/starfield.jpg";

// Parallax star layers
const starLayers = [];
const NUM_STAR_LAYERS = 3;
const STARS_PER_LAYER = [220, 120, 50];
const STAR_SIZES = [1, 1.5, 2.5]; // Size per layer
const PARALLAX_SPEEDS = [0.05, 0.12, 0.25]; // How much they move relative to camera

// Initialize stars
function initStars() {
    try {
        for (let layer = 0; layer < NUM_STAR_LAYERS; layer++) {
            starLayers[layer] = [];
            for (let i = 0; i < STARS_PER_LAYER[layer]; i++) {
                starLayers[layer].push({
                    x: Math.random() * 6000 - 1000,
                    y: Math.random() * 6000 - 1000,
                    size: STAR_SIZES[layer] * (0.6 + Math.random() * 0.6),
                    twinkle: Math.random() * Math.PI * 2,
                    twinkleSpeed: 0.015 + Math.random() * 0.025
                });
            }
        }
    } catch(e) {
        console.error('Error initializing stars:', e);
    }
}
initStars();

// Draw parallax starfield
function drawStarfield(ctx, camX, camY) {
    if (!starLayers || starLayers.length === 0) return;

    for (let layer = 0; layer < NUM_STAR_LAYERS; layer++) {
        const speed = PARALLAX_SPEEDS[layer];
        const stars = starLayers[layer];
        if (!stars) continue;
        
        ctx.save();
        
        for (let i = 0; i < stars.length; i++) {
            const star = stars[i];
            
            // Update twinkle
            star.twinkle += star.twinkleSpeed;
            const alpha = 0.5 + Math.sin(star.twinkle) * 0.3;
            
            // Calculate parallax position
            const px = star.x + camX * speed;
            const py = star.y + camY * speed;

            // Simple star (faster rendering)
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(px, py, star.size, 0, Math.PI * 2);
            ctx.fill();
            
            // Subtle glow for larger stars only
            if (star.size > 1.9 && i % 3 === 0) {
                ctx.globalAlpha = alpha * 0.3;
                ctx.beginPath();
                ctx.arc(px, py, star.size * 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        ctx.restore();
    }
}

function drawSpeedBoostOrb(ctx, orb) {
    const x = orb.locX;
    const y = orb.locY;
    const r = orb.radius || 8;
    const level = Math.max(1, Math.min(8, orb.boostLevel || 1));
    const boostPalette = [
        'rgb(0, 255, 255)',
        'rgb(80, 220, 255)',
        'rgb(120, 255, 160)',
        'rgb(255, 255, 100)',
        'rgb(255, 190, 90)',
        'rgb(255, 120, 120)',
        'rgb(255, 110, 220)',
        'rgb(180, 120, 255)'
    ];
    const atomColor = boostPalette[level - 1];
    const t = performance.now() * 0.003;

    // Nucleus glow
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
    glow.addColorStop(0, rgbToRgba(atomColor, 0.85));
    glow.addColorStop(0.4, rgbToRgba(atomColor, 0.35));
    glow.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.fillStyle = glow;
    ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Orbital rings (old-school Bohr atom icon style)
    const ringScales = [
        { rx: 2.1, ry: 0.9, rot: 0.0 },
        { rx: 2.0, ry: 0.85, rot: Math.PI / 3 },
        { rx: 1.9, ry: 0.8, rot: -Math.PI / 3 }
    ];

    ringScales.forEach((ring) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ring.rot);
        ctx.beginPath();
        ctx.strokeStyle = rgbToRgba(atomColor, 0.85);
        ctx.lineWidth = 1.4;
        ctx.ellipse(0, 0, r * ring.rx, r * ring.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    });

    // Rotating electrons: higher level = more electrons and longer boost visual signal.
    for (let i = 0; i < level; i++) {
        const ring = ringScales[i % ringScales.length];
        const phase = i * (Math.PI * 2 / level);
        const angle = t * (1.2 + level * 0.06 + (i % 3) * 0.15) + phase;
        const ex = x + Math.cos(angle) * r * ring.rx * Math.cos(ring.rot) - Math.sin(angle) * r * ring.ry * Math.sin(ring.rot);
        const ey = y + Math.cos(angle) * r * ring.rx * Math.sin(ring.rot) + Math.sin(angle) * r * ring.ry * Math.cos(ring.rot);
        ctx.beginPath();
        ctx.fillStyle = atomColor;
        ctx.arc(ex, ey, Math.max(1.8, r * 0.23), 0, Math.PI * 2);
        ctx.fill();
    }

    // Nucleus core
    const nucleus = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, 0, x, y, r * 1.1);
    nucleus.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    nucleus.addColorStop(0.35, rgbToRgba(atomColor, 0.95));
    nucleus.addColorStop(1, rgbToRgba(atomColor, 0.65));
    ctx.beginPath();
    ctx.fillStyle = nucleus;
    ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
}

// (Boost recoloring is now done server-side: when a player absorbs a
// speed-boost orb the server overwrites pData.color with the orb color
// and broadcasts it. The client just renders p.color. The old
// getEffectivePlayerColor / drawLocalBoostTail helpers were retired.)

function isRealOtherPlayer(entity) {
    if (!entity?.uid || entity.uid === player.uid) return false;
    const realUids = player.realPlayerUids || [];
    return realUids.includes(entity.uid);
}

function isInView(entity) {
    const zoom = player.zoom || 1;
    const halfWidth = wWidth / (2 * zoom);
    const halfHeight = wHeight / (2 * zoom);
    const left = (player.locX || 0) - halfWidth;
    const right = (player.locX || 0) + halfWidth;
    const top = (player.locY || 0) - halfHeight;
    const bottom = (player.locY || 0) + halfHeight;
    return entity.locX >= left && entity.locX <= right && entity.locY >= top && entity.locY <= bottom;
}

function drawOffscreenRealPlayerIndicators() {
    const others = players.filter(p => isRealOtherPlayer(p) && !isInView(p));
    if (others.length === 0) return;

    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const centerX = wWidth / 2;
    const centerY = wHeight / 2;
    const edgeRadius = Math.max(60, Math.min(wWidth, wHeight) * 0.45);

    others.forEach((target) => {
        const dx = target.locX - (player.locX || 0);
        const dy = target.locY - (player.locY || 0);
        const angle = Math.atan2(dy, dx);
        const arrowX = centerX + Math.cos(angle) * edgeRadius;
        const arrowY = centerY + Math.sin(angle) * edgeRadius;
        const arrowSize = 12;

        context.save();
        context.translate(arrowX, arrowY);
        context.rotate(angle);
        context.fillStyle = 'rgba(255, 70, 70, 0.95)';
        context.beginPath();
        context.moveTo(arrowSize, 0);
        context.lineTo(-arrowSize, -arrowSize * 0.7);
        context.lineTo(-arrowSize, arrowSize * 0.7);
        context.closePath();
        context.fill();
        context.restore();

        context.font = "bold 13px 'Orbitron', 'Exo 2', sans-serif";
        context.textAlign = "center";
        context.fillStyle = 'rgba(255, 90, 90, 0.98)';
        context.fillText(target.name || 'Player', arrowX, arrowY - 16);
    });
    context.restore();
}

function drawWorldBoundary(ctx) {
    const worldW = player.worldWidth;
    const worldH = player.worldHeight;
    if (!worldW || !worldH) return;

    const margin = 4000;
    const pulse = 0.55 + 0.15 * Math.sin(performance.now() * 0.0025);

    ctx.save();

    // Translucent neon-red fill for the inaccessible area outside the world.
    ctx.fillStyle = `rgba(255, 30, 50, ${0.18 * pulse + 0.05})`;
    ctx.fillRect(-margin, -margin, worldW + margin * 2, margin);
    ctx.fillRect(-margin, worldH, worldW + margin * 2, margin);
    ctx.fillRect(-margin, 0, margin, worldH);
    ctx.fillRect(worldW, 0, margin, worldH);

    // Edge glow gradients on each side, fading inward toward the playable area.
    const glowDepth = 90;

    const topGrad = ctx.createLinearGradient(0, 0, 0, glowDepth);
    topGrad.addColorStop(0, `rgba(255, 40, 60, ${0.55 * pulse})`);
    topGrad.addColorStop(1, 'rgba(255, 40, 60, 0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, worldW, glowDepth);

    const bottomGrad = ctx.createLinearGradient(0, worldH - glowDepth, 0, worldH);
    bottomGrad.addColorStop(0, 'rgba(255, 40, 60, 0)');
    bottomGrad.addColorStop(1, `rgba(255, 40, 60, ${0.55 * pulse})`);
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, worldH - glowDepth, worldW, glowDepth);

    const leftGrad = ctx.createLinearGradient(0, 0, glowDepth, 0);
    leftGrad.addColorStop(0, `rgba(255, 40, 60, ${0.55 * pulse})`);
    leftGrad.addColorStop(1, 'rgba(255, 40, 60, 0)');
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, glowDepth, worldH);

    const rightGrad = ctx.createLinearGradient(worldW - glowDepth, 0, worldW, 0);
    rightGrad.addColorStop(0, 'rgba(255, 40, 60, 0)');
    rightGrad.addColorStop(1, `rgba(255, 40, 60, ${0.55 * pulse})`);
    ctx.fillStyle = rightGrad;
    ctx.fillRect(worldW - glowDepth, 0, glowDepth, worldH);

    // Crisp neon outline.
    ctx.strokeStyle = `rgba(255, 70, 90, ${0.85 * pulse + 0.1})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(255, 30, 60, 0.85)';
    ctx.shadowBlur = 18;
    ctx.strokeRect(0, 0, worldW, worldH);

    ctx.restore();
}

function draw() {
    // Smooth all positions toward the latest server target before any
    // rendering happens. See interpolation.js for the full strategy.
    if (typeof applyInterpolation === 'function') applyInterpolation();

    updateEffects();
    updatePlayerTrails(players);

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, wWidth, wHeight);
    
    // Draw dark background
    context.fillStyle = '#050510';
    context.fillRect(0, 0, wWidth, wHeight);
    
    // Safety check for player position
    const playerX = player.locX || 0;
    const playerY = player.locY || 0;
    const playerZoom = player.zoom || 1;
    
    context.scale(playerZoom, playerZoom);
    
    // Apply screen shake
    const camX = -playerX + wWidth / (2 * playerZoom) + screenShake.x;
    const camy = -playerY + wHeight / (2 * playerZoom) + screenShake.y;
    context.translate(camX, camy);

    // Draw parallax starfield (behind everything)
    drawStarfield(context, camX, camy);

    // Draw the neon-red inaccessible area beyond the world boundary.
    drawWorldBoundary(context);

    // Draw player trails. The trail's stored color already follows the
    // player's effective (possibly boosted) color, so a fading boost
    // shows up as a colored ripple traveling backwards through the tail.
    drawPlayerTrails(context);

    // Draw effects layer
    drawEffects(context);

    // While dead, every bot gets a faint cyan "tap to take over" pulse,
    // and the bot under the cursor/finger gets a brighter halo. This is
    // the only visual hint the user has that bots are tappable.
    const realUidsSet = new Set(player.realPlayerUids || []);
    const hoverUid = (player.isSpectating && typeof spectatorHoverUid !== 'undefined') ? spectatorHoverUid : null;
    const spectPulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);

    // Draw players with enhanced visuals
    players.forEach(p => {
        // Skip if invalid data
        if (!p || !isFinite(p.locX) || !isFinite(p.locY) || !isFinite(p.radius) || p.radius <= 0) return;
        
        const px = p.locX;
        const py = p.locY;
        const pr = p.radius;
        // Color is authoritative on the server now (incl. boost recolor).
        const pcolor = getPlayerColor(p);
        const isLocalBoosted = (p.uid === player.uid)
            && Array.isArray(player.speedBoostStacks)
            && player.speedBoostStacks.some(s => (s.expiresAt || 0) > Date.now());
        const isTappableBot = player.isSpectating
            && p.uid !== player.uid
            && !realUidsSet.has(p.uid);
        const isHoveredBot = isTappableBot && p.uid === hoverUid;

        // Outer glow / aura. The extra extent beyond `pr` is CAPPED at
        // ~22 absolute pixels so huge endgame players don't bloom into
        // a ring of fuzzy aura that hides their tail. Small players
        // still get a proportional glow halo.
        const auraExtra = Math.min(pr * 0.5, 22);
        const glowOuter = pr + auraExtra;
        const glowGradient = context.createRadialGradient(px, py, pr * 0.6, px, py, glowOuter);
        glowGradient.addColorStop(0, pcolor);
        glowGradient.addColorStop(0.7, rgbToRgba(pcolor, 0.45));
        glowGradient.addColorStop(1, 'transparent');
        context.beginPath();
        context.fillStyle = glowGradient;
        context.arc(px, py, glowOuter, 0, Math.PI * 2);
        context.fill();
        
        // Main body
        context.beginPath();
        context.fillStyle = pcolor;
        context.arc(px, py, pr, 0, Math.PI * 2);
        context.fill();
        
        // Inner highlight
        const highlight = context.createRadialGradient(
            px - pr * 0.3, py - pr * 0.3, 0,
            px, py, pr
        );
        highlight.addColorStop(0, 'rgba(255,255,255,0.4)');
        highlight.addColorStop(0.5, 'rgba(255,255,255,0.1)');
        highlight.addColorStop(1, 'transparent');
        context.beginPath();
        context.fillStyle = highlight;
        context.arc(px, py, pr, 0, Math.PI * 2);
        context.fill();
        
        // Border - cyan glow (swapped to boost color while boosting so the
        // player visibly "becomes" the boost color end-to-end).
        if (isLocalBoosted) {
            const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.012);
            context.lineWidth = 2.6;
            context.strokeStyle = rgbToRgba(pcolor, 0.95);
            context.shadowColor = pcolor;
            context.shadowBlur = 16 + 10 * pulse;
        } else {
            context.lineWidth = 2;
            context.strokeStyle = "rgba(0, 255, 255, 0.8)";
            context.shadowColor = "rgba(0, 255, 255, 0.5)";
            context.shadowBlur = 10;
        }
        context.stroke();
        context.shadowBlur = 0;
        
        // Name - modern font with glow
        const fontSize = Math.max(12, Math.min(20, pr * 0.8));
        context.textAlign = "center";
        context.font = `bold ${fontSize}px 'Orbitron', 'Exo 2', sans-serif`;
        
        // Keep expensive text glow primarily for local player.
        const isLocalPlayer = p.uid === player.uid;
        context.shadowColor = pcolor;
        context.shadowBlur = isLocalPlayer ? 15 : 0;
        context.fillStyle = isRealOtherPlayer(p) ? "rgba(255, 90, 90, 0.98)" : "#fff";
        context.fillText(p.name || '', px, py - pr - 12);

        if (isLocalPlayer) {
            // Second pass for sharper local-player text only.
            context.shadowBlur = 0;
            context.fillText(p.name || '', px, py - pr - 12);
        }

        // Spectator tap-to-take-over affordance: outer ring around bots.
        if (isTappableBot) {
            context.save();
            context.lineWidth = isHoveredBot ? 3.5 : 2;
            const ringAlpha = isHoveredBot ? 0.95 : 0.35 + 0.25 * spectPulse;
            context.strokeStyle = isHoveredBot
                ? `rgba(0, 255, 220, ${ringAlpha})`
                : `rgba(0, 200, 255, ${ringAlpha})`;
            context.shadowColor = 'rgba(0, 220, 255, 0.85)';
            context.shadowBlur = isHoveredBot ? 22 : 8;
            context.beginPath();
            context.arc(px, py, pr + 6, 0, Math.PI * 2);
            context.stroke();
            context.restore();

            if (isHoveredBot) {
                context.save();
                context.textAlign = 'center';
                context.font = `bold ${Math.max(11, 14 / (player.zoom || 1))}px 'Orbitron', sans-serif`;
                context.fillStyle = 'rgba(0, 255, 220, 0.95)';
                context.shadowColor = 'rgba(0, 200, 255, 0.9)';
                context.shadowBlur = 12;
                context.fillText('TAP TO TAKE OVER', px, py + pr + 22 / (player.zoom || 1));
                context.restore();
            }
        }
    });

    // Draw orbs with glow effect
    orbs.forEach(orb => {
        // Skip if invalid data
        if (!orb || !isFinite(orb.locX) || !isFinite(orb.locY) || !isFinite(orb.radius) || orb.radius <= 0) return;

        if (orb.type === 'speedBoost') {
            drawSpeedBoostOrb(context, orb);
            return;
        }
        
        const ox = orb.locX;
        const oy = orb.locY;
        const or = orb.radius;
        const ocolor = orb.color || 'rgb(255, 100, 100)';
        
        // Outer glow
        const glowGradient = context.createRadialGradient(ox, oy, 0, ox, oy, or * 2.5);
        glowGradient.addColorStop(0, ocolor);
        glowGradient.addColorStop(0.4, rgbToRgba(ocolor, 0.4));
        glowGradient.addColorStop(1, 'transparent');
        context.beginPath();
        context.fillStyle = glowGradient;
        context.arc(ox, oy, or * 2.5, 0, Math.PI * 2);
        context.fill();
        
        // Core
        context.beginPath();
        context.fillStyle = ocolor;
        context.arc(ox, oy, or, 0, Math.PI * 2);
        context.fill();
        
        // Bright center
        context.beginPath();
        context.fillStyle = 'rgba(255,255,255,0.6)';
        context.arc(ox, oy, or * 0.4, 0, Math.PI * 2);
        context.fill();
    });

    // Draw off-screen direction arrows for other real players as final overlay.
    // Keeping this at the end ensures overlay bugs can't hide world rendering.
    drawOffscreenRealPlayerIndicators();

    requestAnimationFrame(draw);
}

// Tracks which bot the cursor / finger is currently over, only used in
// spectator mode to render a brighter "tap to take over" ring.
let spectatorHoverUid = null;

function updateSpectatorHover(clientX, clientY) {
    if (!player.isSpectating) {
        spectatorHoverUid = null;
        return;
    }
    if (typeof findBotAtScreen !== 'function') return;
    const bot = findBotAtScreen(clientX, clientY);
    spectatorHoverUid = bot ? bot.uid : null;
}

canvas.addEventListener('mousemove', (event) => {
    const mousePosition = {
        x: event.clientX,
        y: event.clientY
    };
    updateSpectatorHover(event.clientX, event.clientY);
    const angleDeg = Math.atan2(mousePosition.y - (wHeight / 2), mousePosition.x - (wWidth / 2)) * 180 / Math.PI;
    if (angleDeg >= 0 && angleDeg < 90) {
        xVector = 1 - (angleDeg / 90);
        yVector = -(angleDeg / 90);
    } else if (angleDeg >= 90 && angleDeg <= 180) {
        xVector = -(angleDeg - 90) / 90;
        yVector = -(1 - ((angleDeg - 90) / 90));
    } else if (angleDeg >= -180 && angleDeg < -90) {
        xVector = (angleDeg + 90) / 90;
        yVector = (1 + ((angleDeg + 90) / 90));
    } else if (angleDeg < 0 && angleDeg >= -90) {
        xVector = (angleDeg + 90) / 90;
        yVector = (1 - ((angleDeg + 90) / 90));
    }
    player.xVector = xVector;
    player.yVector = yVector;
})

canvas.addEventListener('touchmove', (event) => {
    const mousePosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
    };
    updateSpectatorHover(event.touches[0].clientX, event.touches[0].clientY);
    const angleDeg = Math.atan2(mousePosition.y - (wHeight / 2), mousePosition.x - (wWidth / 2)) * 180 / Math.PI;
    if (angleDeg >= 0 && angleDeg < 90) {
        xVector = 1 - (angleDeg / 90);
        yVector = -(angleDeg / 90);
    } else if (angleDeg >= 90 && angleDeg <= 180) {
        xVector = -(angleDeg - 90) / 90;
        yVector = -(1 - ((angleDeg - 90) / 90));
    } else if (angleDeg >= -180 && angleDeg < -90) {
        xVector = (angleDeg + 90) / 90;
        yVector = (1 + ((angleDeg + 90) / 90));
    } else if (angleDeg < 0 && angleDeg >= -90) {
        xVector = (angleDeg + 90) / 90;
        yVector = (1 - ((angleDeg + 90) / 90));
    }
    player.xVector = xVector;
    player.yVector = yVector;
})
