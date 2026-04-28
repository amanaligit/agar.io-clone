const Orb = require('./classes/Orb')
const io = require('../servers').io;
const { pushBot } = require('./botLogic')
const settings = require('../gameSettings');

function getBaseSpeedForRadius(radius, pConfig) {
    const safeRadius = Math.max(radius, 1);
    const slowdownExponent = Math.max(0.1, settings.speedSlowdownFactor);
    const baseSize = pConfig?.baseSize || settings.defaultSize;
    const baseSpeedSetting = pConfig?.baseSpeed || settings.defaultSpeed;
    const inverseRatio = baseSize / safeRadius;
    return Math.max(
        settings.minSpeed,
        baseSpeedSetting * Math.pow(inverseRatio, slowdownExponent)
    );
}

function getActiveBoostStacks(pConfig) {
    const now = Date.now();
    const stacks = Array.isArray(pConfig.speedBoostStacks) ? pConfig.speedBoostStacks : [];
    pConfig.speedBoostStacks = stacks
        .map(stack => (typeof stack === 'number'
            ? { expiresAt: stack, durationMs: settings.speedBoostDurationMs }
            : stack))
        .filter(stack => stack.expiresAt > now);
    return pConfig.speedBoostStacks;
}

function getBoostMultiplier(stacks) {
    // See identical fix in socketMain.js: stacking must *compound*, not
    // multiply by count. 3 stacks at 1.2 -> 1.728x, not 3.6x.
    const count = Array.isArray(stacks) ? stacks.length : stacks;
    if (count <= 0) return 1;
    return Math.pow(settings.speedBoostMultiplier, count);
}

function getEffectiveBoostMultiplier(pConfig, activeStacks) {
    const now = Date.now();
    const activeMultiplier = getBoostMultiplier(activeStacks);
    if (activeStacks.length > 0) {
        pConfig.boostDecayFrom = activeMultiplier;
        pConfig.boostDecayStartAt = null;
        return activeMultiplier;
    }

    if (!pConfig.boostDecayStartAt && pConfig.boostDecayFrom && pConfig.boostDecayFrom > 1) {
        pConfig.boostDecayStartAt = now;
    }

    if (pConfig.boostDecayStartAt) {
        const elapsed = now - pConfig.boostDecayStartAt;
        const fade = Math.max(1, settings.speedBoostFadeoutMs);
        if (elapsed < fade) {
            const ratio = 1 - (elapsed / fade);
            return 1 + ((pConfig.boostDecayFrom - 1) * ratio);
        }
    }

    pConfig.boostDecayFrom = 1;
    pConfig.boostDecayStartAt = null;
    return 1;
}

function updateEffectiveSpeed(pData, pConfig) {
    const baseSpeed = getBaseSpeedForRadius(pData.radius, pConfig);
    const activeStacks = getActiveBoostStacks(pConfig);
    const effectiveBoostMultiplier = getEffectiveBoostMultiplier(pConfig, activeStacks);
    pConfig.speed = baseSpeed * effectiveBoostMultiplier;
}

// If a player has grown past the configured threshold, snap their size
// back down to the default. Score and identity are preserved so they
// keep playing - we just emit a visual "rebirth" burst event so the
// client can render an explosion of orbs flying outward.
function maybeResetPlayerSize(pData, pConfig, settings) {
    const cap = settings.maxRadiusBeforeReset;
    if (!cap || pData.radius < cap) return false;

    io.sockets.emit('playerSizeReset', {
        uid: pData.uid,
        x: pData.locX,
        y: pData.locY,
        radius: pData.radius,
        color: pData.color
    });

    pData.radius = settings.defaultSize;
    if (pConfig) {
        pConfig.zoom = settings.defaultZoom;
        // Recompute speed since radius drives base speed.
        updateEffectiveSpeed(pData, pConfig);
    }
    return true;
}

// Synchronous collision check.
// Returns an array of orb indices that were absorbed (empty array = none).
// Was previously a Promise that resolve()'d on hit and reject()'d on miss.
// Per server tick we ran 11+ entities through this; constructing 11+ Promises
// and immediately rejecting most of them produced enough GC pressure on a
// Raspberry Pi to be visible as periodic freeze spikes. Sync return is much
// cheaper and behaviorally identical.
function checkForOrbCollisions(pData, pConfig, orbs, settings, players) {
    const collisions = [];
    for (let i = 0; i < orbs.length; i++) {
        const orb = orbs[i];
        // AABB Test(square)  - Axis-aligned bounding boxes
        if (pData.locX + pData.radius + orb.radius > orb.locX
            && pData.locX < orb.locX + pData.radius + orb.radius
            && pData.locY + pData.radius + orb.radius > orb.locY
            && pData.locY < orb.locY + pData.radius + orb.radius) {
            // Pythagoras test(circle)
            const dx = pData.locX - orb.locX;
            const dy = pData.locY - orb.locY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < pData.radius + orb.radius) {
                pData.score += 1;
                pData.orbsAbsorbed += 1;
                if (pConfig.zoom > 1) {
                    pConfig.zoom -= .008;
                }
                pData.radius += 0.25;

                if (orb.type === 'speedBoost') {
                    if (!Array.isArray(pConfig.speedBoostStacks)) {
                        pConfig.speedBoostStacks = [];
                    }
                    const now = Date.now();
                    const level = Math.max(1, Math.min(settings.speedBoostLevels, orb.boostLevel || 1));
                    const durationMs = settings.speedBoostDurationMs * level;
                    pConfig.speedBoostStacks = pConfig.speedBoostStacks
                        .map(stack => (typeof stack === 'number'
                            ? { expiresAt: stack, durationMs: settings.speedBoostDurationMs }
                            : stack))
                        .filter(stack => stack.expiresAt > now)
                        .sort((a, b) => a.expiresAt - b.expiresAt);
                    while (pConfig.speedBoostStacks.length >= settings.speedBoostMaxStacks) {
                        pConfig.speedBoostStacks.shift();
                    }
                    pConfig.speedBoostStacks.push({
                        expiresAt: now + durationMs,
                        durationMs
                    });
                    pConfig.boostDecayFrom = null;
                    pConfig.boostDecayStartAt = null;
                    // Player visually adopts the color of the last boost
                    // they ate. Persists past boost expiry until they eat
                    // another boost orb.
                    if (orb.color) pData.color = orb.color;
                }

                updateEffectiveSpeed(pData, pConfig);
                maybeResetPlayerSize(pData, pConfig, settings);

                const respawnType = orb.type === 'speedBoost' ? 'speedBoost' : 'normal';
                // Pass live player list so respawns don't appear inside blobs.
                orbs[i] = new Orb(settings, respawnType, players);
                collisions.push(i);
            }
        }
    }
    return collisions;
}

// Synchronous: returns the collision data { died, killedBy } if pData
// killed someone this tick, otherwise null. (Used to be Promise-based.)
function checkForPlayerCollisions(pData, pConfig, players, playerId, bots, playerInfo) {
    for (let i = 0; i < players.length; i++) {
        const curPlayer = players[i];
        if (curPlayer.uid === playerId) continue;
        const pLocx = curPlayer.locX;
        const pLocy = curPlayer.locY;
        const pR = curPlayer.radius;
        if (pData.locX + pData.radius + pR > pLocx
            && pData.locX < pLocx + pData.radius + pR
            && pData.locY + pData.radius + pR > pLocy
            && pData.locY < pLocy + pData.radius + pR) {
            const dx = pData.locX - pLocx;
            const dy = pData.locY - pLocy;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < pData.radius + pR && pData.radius > pR) {
                const collisionData = updateScores(pData, curPlayer);
                if (pConfig.zoom > 1) {
                    pConfig.zoom -= (pR * 0.25) * .008;
                }
                updateEffectiveSpeed(pData, pConfig);
                maybeResetPlayerSize(pData, pConfig, settings);
                curPlayer.alive = false;
                let del = null;
                if (playerInfo.delete(players[i].uid)) {
                    for (let j = 0; j < bots.length; j++) {
                        if (bots[j].playerData.uid === players[i].uid) {
                            del = j;
                            break;
                        }
                    }
                    if (del != null) {
                        bots.splice(del, 1);
                        pushBot(bots, players, playerInfo);
                    }
                }
                players.splice(i, 1);
                return collisionData;
            }
        }
    }
    return null;
}

function updateScores(killer, killed) {
    killer.score += (killed.score + 10);
    killer.playersKilled++;
    killed.alive = false;
    killer.radius += (killed.radius * 0.25)
    return {
        died: killed,
        killedBy: killer,
    }
}

module.exports = { checkForOrbCollisions, checkForPlayerCollisions }