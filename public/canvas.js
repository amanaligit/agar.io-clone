
//================================
//=============EFFECTS============
//================================

// Effect arrays
const absorptions = [];
const suctionParticles = [];
const pulseEffects = [];
let screenShake = { x: 0, y: 0, intensity: 0 };

// Player trail system
const playerTrails = new Map(); // Map of player uid -> trail points
const TRAIL_LENGTH = 20; // Number of trail points to keep
const TRAIL_SPACING = 2; // Only add point every N frames

let trailFrameCounter = 0;

// Helper to convert rgb() to rgba()
function rgbToRgba(color, alpha) {
    if (!color) return `rgba(255,255,255,${alpha})`;
    if (color.startsWith('rgba')) return color;
    if (color.startsWith('rgb(')) {
        return color.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
    }
    return color;
}

// Update player trails
function updatePlayerTrails(playersArray) {
    trailFrameCounter++;
    
    if (trailFrameCounter % TRAIL_SPACING !== 0) return;
    
    // Track which players are still active
    const activeIds = new Set();
    
    playersArray.forEach(p => {
        if (!p.uid) return;
        activeIds.add(p.uid);
        
        // Get or create trail for this player
        if (!playerTrails.has(p.uid)) {
            playerTrails.set(p.uid, []);
        }
        
        const trail = playerTrails.get(p.uid);
        
        // Add current position to trail
        trail.unshift({
            x: p.locX,
            y: p.locY,
            radius: p.radius,
            color: p.color
        });
        
        // Keep trail at max length
        while (trail.length > TRAIL_LENGTH) {
            trail.pop();
        }
    });
    
    // Clean up trails for players that no longer exist
    for (const uid of playerTrails.keys()) {
        if (!activeIds.has(uid)) {
            playerTrails.delete(uid);
        }
    }
}

// Draw player trails
function drawPlayerTrails(ctx) {
    playerTrails.forEach((trail, uid) => {
        if (!trail || trail.length < 2) return;
        
        // Draw connecting line for smoother trail
        if (trail.length > 2) {
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            for (let i = trail.length - 1; i >= 1; i--) {
                const point = trail[i];
                const nextPoint = trail[i - 1];
                if (!point || !nextPoint || !isFinite(point.x) || !isFinite(point.radius)) continue;
                
                const progress = 1 - (i / trail.length);
                const alpha = progress * 0.6;
                const lineWidth = point.radius * (0.5 + progress * 0.8);
                
                ctx.beginPath();
                ctx.strokeStyle = rgbToRgba(point.color, alpha);
                ctx.lineWidth = lineWidth;
                ctx.moveTo(point.x, point.y);
                ctx.lineTo(nextPoint.x, nextPoint.y);
                ctx.stroke();
            }
            ctx.restore();
        }
        
        // Draw trail orbs from oldest to newest
        for (let i = trail.length - 1; i >= 1; i--) {
            const point = trail[i];
            if (!point || !isFinite(point.x) || !isFinite(point.y) || !isFinite(point.radius) || point.radius <= 0) continue;
            
            const progress = 1 - (i / trail.length); // 0 = oldest, 1 = newest
            const alpha = progress * 0.7;
            const scale = 0.4 + progress * 0.6;
            const pcolor = point.color || 'rgb(100, 100, 255)';
            
            ctx.save();
            ctx.globalAlpha = alpha;
            
            // Simplified glow (better performance)
            ctx.beginPath();
            ctx.fillStyle = rgbToRgba(pcolor, 0.4);
            ctx.arc(point.x, point.y, point.radius * scale * 1.5, 0, Math.PI * 2);
            ctx.fill();
            
            // Core orb
            ctx.beginPath();
            ctx.fillStyle = pcolor;
            ctx.arc(point.x, point.y, point.radius * scale, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
    });
}

// Absorption effect - shows orb being sucked into player
class AbsorptionEffect {
    constructor(startX, startY, targetX, targetY, color, radius) {
        this.x = startX;
        this.y = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.color = color;
        this.radius = radius;
        this.originalRadius = radius;
        this.progress = 0;
        this.speed = 0.08;
        this.trail = [];
    }

    update() {
        this.progress += this.speed;
        
        // Ease-in curve for acceleration toward target
        const easeProgress = this.progress * this.progress;
        
        // Move toward target
        this.x = this.x + (this.targetX - this.x) * (0.1 + easeProgress * 0.2);
        this.y = this.y + (this.targetY - this.y) * (0.1 + easeProgress * 0.2);
        
        // Shrink as it approaches
        this.radius = this.originalRadius * (1 - easeProgress * 0.9);
        
        // Add trail points
        if (this.progress < 0.8) {
            this.trail.push({
                x: this.x,
                y: this.y,
                radius: this.radius * 0.6,
                alpha: 1 - this.progress
            });
        }
        
        // Fade out old trail points
        this.trail = this.trail.filter(t => {
            t.alpha -= 0.08;
            t.radius *= 0.95;
            return t.alpha > 0;
        });
    }

    draw(ctx) {
        // Draw trail
        this.trail.forEach(t => {
            ctx.save();
            ctx.globalAlpha = t.alpha * 0.5;
            ctx.beginPath();
            ctx.fillStyle = this.color;
            ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
        
        // Draw main orb being absorbed
        if (this.radius > 0.5) {
            const alpha = 1 - this.progress;
            ctx.save();
            ctx.globalAlpha = alpha;
            
            // Stretching effect toward target
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const angle = Math.atan2(dy, dx);
            const stretch = 1 + this.progress * 0.5;
            
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.scale(stretch, 1 / stretch);
            
            // Glow
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 2);
            gradient.addColorStop(0, this.color);
            gradient.addColorStop(0.5, rgbToRgba(this.color, 0.5));
            gradient.addColorStop(1, 'transparent');
            ctx.beginPath();
            ctx.fillStyle = gradient;
            ctx.arc(0, 0, this.radius * 2, 0, Math.PI * 2);
            ctx.fill();
            
            // Core
            ctx.beginPath();
            ctx.fillStyle = this.color;
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
    }

    isDead() {
        return this.progress >= 1;
    }
}

// Suction particle - gets pulled toward the absorber
class SuctionParticle {
    constructor(x, y, targetX, targetY, color) {
        this.x = x;
        this.y = y;
        this.targetX = targetX;
        this.targetY = targetY;
        this.color = color;
        this.size = 2 + Math.random() * 3;
        this.life = 1;
        this.speed = 0.05 + Math.random() * 0.05;
        
        // Start with slight outward velocity, then curve inward
        const angle = Math.random() * Math.PI * 2;
        this.offsetX = Math.cos(angle) * (10 + Math.random() * 15);
        this.offsetY = Math.sin(angle) * (10 + Math.random() * 15);
    }

    update() {
        // Spiral inward
        this.offsetX *= 0.9;
        this.offsetY *= 0.9;
        
        // Move toward target
        this.x += (this.targetX + this.offsetX - this.x) * this.speed;
        this.y += (this.targetY + this.offsetY - this.y) * this.speed;
        
        this.speed += 0.01; // Accelerate
        this.life -= 0.03;
        this.size *= 0.98;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life;
        
        // Glowing particle
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
        return this.life <= 0 || this.size < 0.3;
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

// Spawn absorption effect for orbs
function spawnOrbAbsorption(orbX, orbY, orbColor, orbRadius, absorberX, absorberY, absorberRadius) {
    // Main absorption animation
    absorptions.push(new AbsorptionEffect(orbX, orbY, absorberX, absorberY, orbColor, orbRadius));
    
    // Suction particles spiraling in
    for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 / 8) * i;
        const dist = orbRadius + 5;
        const px = orbX + Math.cos(angle) * dist;
        const py = orbY + Math.sin(angle) * dist;
        suctionParticles.push(new SuctionParticle(px, py, absorberX, absorberY, orbColor));
    }
    
    // Delayed pulse when absorbed
    setTimeout(() => {
        pulseEffects.push(new PulseEffect(absorberX, absorberY, orbColor, absorberRadius + 10));
    }, 150);
}

// Spawn effects for player absorption (bigger, more dramatic)
function spawnPlayerAbsorption(killedX, killedY, killedColor, killedRadius, killerX, killerY, killerRadius) {
    // Main absorption animation
    absorptions.push(new AbsorptionEffect(killedX, killedY, killerX, killerY, killedColor, killedRadius));
    
    // Lots of suction particles
    for (let i = 0; i < 20; i++) {
        const angle = (Math.PI * 2 / 20) * i + Math.random() * 0.3;
        const dist = killedRadius * (0.5 + Math.random() * 0.8);
        const px = killedX + Math.cos(angle) * dist;
        const py = killedY + Math.sin(angle) * dist;
        suctionParticles.push(new SuctionParticle(px, py, killerX, killerY, killedColor));
    }
    
    // Big pulse when absorbed
    setTimeout(() => {
        pulseEffects.push(new PulseEffect(killerX, killerY, killedColor, killerRadius + killedRadius * 0.5));
        triggerScreenShake(5);
    }, 200);
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
    
    updateScreenShake();
}

// Draw all effects
function drawEffects(ctx) {
    // Draw pulse effects (behind)
    pulseEffects.forEach(p => p.draw(ctx));
    
    // Draw absorptions
    absorptions.forEach(a => a.draw(ctx));
    
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
const STARS_PER_LAYER = [200, 100, 40]; // Lots of stars!
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
            if (star.size > 1.5) {
                ctx.globalAlpha = alpha * 0.3;
                ctx.beginPath();
                ctx.arc(px, py, star.size * 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        ctx.restore();
    }
}

function draw() {
    updateEffects();
    updatePlayerTrails(players);

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw dark background
    context.fillStyle = '#050510';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Safety check for player position
    const playerX = player.locX || 0;
    const playerY = player.locY || 0;
    const playerZoom = player.zoom || 1;
    
    context.scale(playerZoom, playerZoom);
    
    // Apply screen shake
    const camX = -playerX + canvas.width / (2 * playerZoom) + screenShake.x;
    const camy = -playerY + canvas.height / (2 * playerZoom) + screenShake.y;
    context.translate(camX, camy);

    // Draw parallax starfield (behind everything)
    drawStarfield(context, camX, camy);

    // Draw player trails
    drawPlayerTrails(context);

    // Draw effects layer
    drawEffects(context);

    // Draw players with enhanced visuals
    players.forEach(p => {
        // Skip if invalid data
        if (!p || !isFinite(p.locX) || !isFinite(p.locY) || !isFinite(p.radius) || p.radius <= 0) return;
        
        const px = p.locX;
        const py = p.locY;
        const pr = p.radius;
        const pcolor = p.color || 'rgb(100, 100, 255)';
        
        // Outer glow
        const glowGradient = context.createRadialGradient(px, py, pr * 0.5, px, py, pr * 1.5);
        glowGradient.addColorStop(0, pcolor);
        glowGradient.addColorStop(0.7, rgbToRgba(pcolor, 0.5));
        glowGradient.addColorStop(1, 'transparent');
        context.beginPath();
        context.fillStyle = glowGradient;
        context.arc(px, py, pr * 1.5, 0, Math.PI * 2);
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
        
        // Border - cyan glow
        context.lineWidth = 2;
        context.strokeStyle = "rgba(0, 255, 255, 0.8)";
        context.shadowColor = "rgba(0, 255, 255, 0.5)";
        context.shadowBlur = 10;
        context.stroke();
        context.shadowBlur = 0;
        
        // Name - modern font with glow
        const fontSize = Math.max(12, Math.min(20, pr * 0.8));
        context.textAlign = "center";
        context.font = `bold ${fontSize}px 'Orbitron', 'Exo 2', sans-serif`;
        
        // Text glow effect
        context.shadowColor = pcolor;
        context.shadowBlur = 15;
        context.fillStyle = "#fff";
        context.fillText(p.name || '', px, py - pr - 12);
        
        // Second pass for sharper text
        context.shadowBlur = 0;
        context.fillText(p.name || '', px, py - pr - 12);
    });

    // Draw orbs with glow effect
    orbs.forEach(orb => {
        // Skip if invalid data
        if (!orb || !isFinite(orb.locX) || !isFinite(orb.locY) || !isFinite(orb.radius) || orb.radius <= 0) return;
        
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

    requestAnimationFrame(draw);
}

canvas.addEventListener('mousemove', (event) => {
    const mousePosition = {
        x: event.clientX,
        y: event.clientY
    };
    const angleDeg = Math.atan2(mousePosition.y - (canvas.height / 2), mousePosition.x - (canvas.width / 2)) * 180 / Math.PI;
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
    const angleDeg = Math.atan2(mousePosition.y - (canvas.height / 2), mousePosition.x - (canvas.width / 2)) * 180 / Math.PI;
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
