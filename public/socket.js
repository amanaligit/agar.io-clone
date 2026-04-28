

let socket = io.connect('/')
var clock = null;
const PLAYER_SESSION_KEY = 'agar_player_session_id';
let playerSessionId = localStorage.getItem(PLAYER_SESSION_KEY);
if (!playerSessionId) {
    playerSessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(PLAYER_SESSION_KEY, playerSessionId);
}
player.speedBoostStacks = [];
player.speedBoostDurationMs = 10000;
player.realPlayerUids = [];
const LEADERBOARD_UPDATE_MS = 250;
const BOOST_HUD_UPDATE_MS = 100;
let lastLeaderboardUpdate = 0;
let lastBoostHudUpdate = 0;
const scoreEl = document.querySelector('.player-score');
const boostHudEl = document.getElementById('boost-hud');
const boostHudListEl = document.getElementById('boost-hud-list');
let lastBoostHudSignature = '';

// Server sends compact rows to save bytes: [uid,x,y,r,color,name,score,oa,pk]
function expandWirePlayers(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => ({
        uid: row[0],
        locX: row[1],
        locY: row[2],
        radius: row[3],
        color: row[4],
        name: row[5],
        score: row[6],
        orbsAbsorbed: row[7],
        playersKilled: row[8]
    }));
}

// Full snapshot (`f` + `p`), delta (`d` rows + `rm` uids), or legacy (`p` only).
function mergeWorldPlayers(data) {
    if (data.f === 1 && Array.isArray(data.p)) {
        return expandWirePlayers(data.p);
    }
    if (Array.isArray(data.d) || (data.rm && data.rm.length > 0)) {
        const map = new Map((players || []).filter(Boolean).map((p) => [p.uid, p]));
        for (const uid of data.rm || []) {
            map.delete(uid);
        }
        for (const row of data.d || []) {
            const o = expandWirePlayers([row])[0];
            if (o) map.set(o.uid, o);
        }
        return Array.from(map.values());
    }
    if (Array.isArray(data.p)) {
        return expandWirePlayers(data.p);
    }
    return Array.isArray(players) ? players : [];
}

function applyLeaderboardFromPlayers(now) {
    players.forEach((p) => {
        if (p.uid === player.uid) {
            scoreEl.innerHTML = p.score;
            player.orbsAbsorbed = p.orbsAbsorbed;
            player.playersKilled = p.playersKilled;
            player.score = p.score;
        }
    });
    if (now - lastLeaderboardUpdate >= LEADERBOARD_UPDATE_MS) {
        lb = players.slice();
        displayLB();
        lastLeaderboardUpdate = now;
    }
}

function renderBoostHud() {
    if (!boostHudEl || !boostHudListEl) return;

    const now = Date.now();
    const stacks = (player.speedBoostStacks || [])
        .map((stack) => (typeof stack === 'number'
            ? { expiresAt: stack, durationMs: player.speedBoostDurationMs || 10000 }
            : stack))
        .filter((stack) => stack.expiresAt > now)
        .sort((a, b) => a.expiresAt - b.expiresAt);
    player.speedBoostStacks = stacks;

    if (stacks.length === 0) {
        boostHudEl.style.display = 'none';
        boostHudListEl.innerHTML = '';
        lastBoostHudSignature = '';
        return;
    }

    boostHudEl.style.display = 'block';
    const signature = stacks.map((stack) => Math.ceil((stack.expiresAt - now) / 100)).join('|');
    if (signature === lastBoostHudSignature) {
        return;
    }
    lastBoostHudSignature = signature;

    boostHudListEl.innerHTML = stacks.map((stack, i) => {
        const remaining = Math.max(0, stack.expiresAt - now);
        const duration = Math.max(1, stack.durationMs || player.speedBoostDurationMs || 10000);
        const percent = Math.max(0, Math.min(100, (remaining / duration) * 100));
        return `
            <div class="boost-row">
                <div class="boost-label">Boost ${i + 1} - ${(remaining / 1000).toFixed(1)}s</div>
                <div class="boost-bar-track">
                    <div class="boost-bar-fill" style="width:${percent}%"></div>
                </div>
            </div>
        `;
    }).join('');
}


//called when user presses the start button
function init() {
    if (typeof resizeCanvasToViewport === 'function') {
        resizeCanvasToViewport();
    }

    if (typeof resetLocalPlayerState === 'function') {
        resetLocalPlayerState();
    } else if (typeof clearPlayerTrails === 'function') {
        clearPlayerTrails();
    }

    draw();
    socket.emit('init', {
        playerName: player.name,
        playerSessionId
    });
}

socket.on('initReturn', data => {
    orbs = data.orbs;
    player.uid = data.uid;
    if (data.worldWidth) player.worldWidth = data.worldWidth;
    if (data.worldHeight) player.worldHeight = data.worldHeight;
    if (typeof data.speedBoostDurationMs === 'number') {
        player.speedBoostDurationMs = data.speedBoostDurationMs;
    }
    if (Array.isArray(data.p)) {
        players = expandWirePlayers(data.p);
    }
    // CRITICAL: clear any previous tick interval before starting a new one.
    // Without this, every respawn leaks another setInterval emitting `tick`,
    // and the server applies movement on every tick. After N deaths the
    // player effectively moves at N x speed ("boost around like crazy").
    if (clock) {
        clearInterval(clock);
        clock = null;
    }
    clock = setInterval(() => {
        socket.emit('tick', {
            xVector: player.xVector,
            yVector: player.yVector
        })
    }, 16)
})

socket.on('goback', () => {
    socket.emit('init', {
        playerName: player.name,
        playerSessionId
    });
})

socket.on('worldTick', (data) => {
    const now = Date.now();
    players = mergeWorldPlayers(data);
    if (Array.isArray(data.ru)) {
        player.realPlayerUids = data.ru;
    }
    if (typeof recordTockSnapshots === 'function') {
        recordTockSnapshots(players, now);
    }
    applyLeaderboardFromPlayers(now);
});

socket.on('meTick', (data) => {
    const now = Date.now();
    if (typeof data.s === 'number') player.serverSpeed = data.s;
    player.speedBoostStacks = Array.isArray(data.st) ? data.st : [];

    if (player.isSpectating) {
        const worldW = player.worldWidth || 1500;
        const worldH = player.worldHeight || 1500;
        player.targetX = worldW / 2;
        player.targetY = worldH / 2;
        player.targetZoom = Math.max(0.05, Math.min(wWidth / worldW, wHeight / worldH) * 0.95);
    } else {
        const self = players.find((p) => p && p.uid === player.uid);
        if (self) {
            player.targetX = self.locX;
            player.targetY = self.locY;
        }
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
            const REFERENCE_WIDTH = 1600;
            const viewport = Math.min(window.innerWidth, window.innerHeight) * (window.innerWidth > window.innerHeight ? 1.6 : 1);
            const mobileZoomFactor = Math.max(0.45, Math.min(1.0, viewport / REFERENCE_WIDTH));
            player.targetZoom = mobileZoomFactor * (typeof data.z === 'number' ? data.z : (player.targetZoom || 2));
        } else {
            player.targetZoom = typeof data.z === 'number' ? data.z : (player.targetZoom || 2);
        }
    }

    if (now - lastBoostHudUpdate >= BOOST_HUD_UPDATE_MS) {
        renderBoostHud();
        lastBoostHudUpdate = now;
    }
});

socket.on('orbSwitch', data => {
    data.orbIndices.forEach((index, i) => {
        const oldOrb = orbs[index];
        
        // Find the player who absorbed it
        if (oldOrb && typeof spawnOrbAbsorption === 'function') {
            let absorber = null;
            let minDist = Infinity;
            
            players.forEach(p => {
                const dx = p.locX - oldOrb.locX;
                const dy = p.locY - oldOrb.locY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < p.radius + 20 && dist < minDist) {
                    minDist = dist;
                    absorber = p;
                }
            });
            
            // Spawn suction effect toward the absorber. Pass the uid so
            // the orb visually follows the player as they keep moving,
            // not the stale position they were at this instant.
            if (absorber) {
                spawnOrbAbsorption(
                    oldOrb.locX, oldOrb.locY, oldOrb.color, oldOrb.radius || 5,
                    absorber.uid, absorber.locX, absorber.locY, absorber.radius
                );
            }
        }
        
        orbs[index] = data.newOrbs[i];
    })
})


function displayLB() {
    let by = null;
    if (document.getElementById('sort-score').classList.contains('active')) {
        by = 'score';
    }
    else if (document.getElementById('sort-orbs').classList.contains('active')) {
        by = 'orbsAbsorbed';
    }
    else if (document.getElementById('sort-players').classList.contains('active')) {
        by = 'playersKilled';
    }
    let lb_element = document.querySelector('.leader-board');
    lb_element.innerHTML = "";
    lb.sort((a, b) => b[by] - a[by]);
    const topPlayers = lb.slice(0, 5);
    topPlayers.forEach(p => {
        lb_element.innerHTML += `<li class="leaderboard-player">${p.name} - ${p[by]}</li>`
    })
}

// Fired when any player's size is reset back to default after hitting
// the configured cap. Score is preserved server-side; the client just
// renders a visual "spit out orbs" burst at where they collapsed.
socket.on('playerSizeReset', data => {
    if (!data || typeof spawnOrbBurst !== 'function') return;
    spawnOrbBurst(
        data.x,
        data.y,
        data.color || 'rgb(255,255,255)',
        data.radius || 60
    );

    if (data.uid === player.uid) {
        // Snap the camera so the zoom-out from huge-to-small isn't a
        // slow lerp. Without this the next several frames feel laggy.
        player.snap = true;
        const msgEl = document.querySelector('#game-message');
        if (msgEl && typeof $ !== 'undefined') {
            msgEl.innerHTML = 'Reborn! Size reset, score kept.';
            $('#game-message').css({
                'background-color': '#00cc88',
                opacity: 1
            });
            $('#game-message').stop(true, true).show().delay(6500).fadeOut(1400);
        }
    }
});

socket.on('playerDeath', data => {
    // Spawn dramatic player absorption effect - sucked into killer.
    // Pass killer uid so the debris streams into them as they keep moving.
    if (typeof spawnPlayerAbsorption === 'function' && data.died && data.killedBy) {
        spawnPlayerAbsorption(
            data.died.locX,
            data.died.locY,
            data.died.color || '#ff0000',
            data.died.radius || 30,
            data.killedBy.uid,
            data.killedBy.locX,
            data.killedBy.locY,
            data.killedBy.radius || 30
        );
    }
    
    if (player.uid !== data.died.uid) {
        return;
    }

    // Local player died: enter spectator mode and play Dark Souls overlay.
    // Set camera *targets* only - applyInterpolation() smoothly zooms out
    // to the world-fitting view, which gives a nice cinematic pull-back.
    player.isSpectating = true;
    const worldW = player.worldWidth || 1500;
    const worldH = player.worldHeight || 1500;
    player.targetX = worldW / 2;
    player.targetY = worldH / 2;
    player.targetZoom = Math.max(0.05, Math.min(wWidth / worldW, wHeight / worldH) * 0.95);

    triggerDeathOverlay(data.killedBy.name);
})

// Pending setTimeout ids from the most recent triggerDeathOverlay() so we
// can cancel them when the player respawns or dies again. Without this,
// stale timers can re-show the "Tap any bot" hint AFTER the player has
// already respawned, which is what was making the dialog stick.
let deathOverlayTimers = [];
function clearDeathOverlayTimers() {
    for (const id of deathOverlayTimers) clearTimeout(id);
    deathOverlayTimers = [];
}

function triggerDeathOverlay(killerName) {
    const overlay = document.getElementById('death-overlay');
    const subtitle = document.getElementById('death-overlay-subtitle');
    const respawnBtn = document.getElementById('respawn-btn');
    if (!overlay || !subtitle || !respawnBtn) return;

    // Cancel any timers from a previous death so they can't fire later.
    clearDeathOverlayTimers();

    subtitle.innerHTML = killerName ? `Killed by ${killerName}` : '';

    overlay.classList.remove('show');
    void overlay.offsetWidth;
    overlay.classList.add('show');

    respawnBtn.hidden = false;
    respawnBtn.classList.remove('show');
    const hint = document.getElementById('respawn-hint');

    deathOverlayTimers.push(setTimeout(() => {
        respawnBtn.classList.add('show');
        if (hint) {
            hint.hidden = false;
            hint.classList.add('show');
        }
    }, 2200));

    deathOverlayTimers.push(setTimeout(() => {
        overlay.classList.remove('show');
    }, 5500));
}

// Convert a screen-pixel point to world-space coordinates using the
// current camera (player.locX/locY/zoom). Used during spectator mode to
// detect which bot the user tapped.
function screenToWorld(screenX, screenY) {
    const z = player.zoom || 1;
    const cx = player.locX || 0;
    const cy = player.locY || 0;
    return {
        x: cx + (screenX - wWidth / 2) / z,
        y: cy + (screenY - wHeight / 2) / z
    };
}

// Returns the bot under the given screen-pixel point, or null. Uses a
// small touch tolerance so small bots are still tappable on phones.
function findBotAtScreen(screenX, screenY) {
    if (!Array.isArray(players) || players.length === 0) return null;
    const w = screenToWorld(screenX, screenY);
    const realUids = new Set(player.realPlayerUids || []);
    let best = null;
    let bestDist = Infinity;
    for (const p of players) {
        if (!p || !p.uid) continue;
        if (p.uid === player.uid) continue;
        if (realUids.has(p.uid)) continue;
        const dx = w.x - p.locX;
        const dy = w.y - p.locY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // 24px touch tolerance scaled by zoom (so at zoomed-out spectator
        // view tiny bots are still tappable).
        const tol = Math.max(8, 24 / (player.zoom || 1));
        if (dist < (p.radius || 0) + tol && dist < bestDist) {
            best = p;
            bestDist = dist;
        }
    }
    return best;
}

function doRespawn(botUid) {
    // Kill any pending death-overlay setTimeouts so a stale one can't
    // re-show the hint or hide the death overlay later while the player
    // is already alive again.
    clearDeathOverlayTimers();

    const respawnBtn = document.getElementById('respawn-btn');
    const hint = document.getElementById('respawn-hint');
    const overlay = document.getElementById('death-overlay');
    if (respawnBtn) {
        respawnBtn.classList.remove('show');
        respawnBtn.hidden = true;
    }
    if (hint) {
        hint.classList.remove('show');
        hint.hidden = true;
    }
    if (overlay) overlay.classList.remove('show');
    player.isSpectating = false;
    resetLocalPlayerState();
    socket.emit('respawnAsBot', {
        playerName: player.name,
        playerSessionId,
        botUid: botUid || null
    });
}

function resetLocalPlayerState() {
    // CRITICAL (mobile-only bug): the server moves the player every tick using
    // the *last* xVector / yVector we sent. On desktop these are continuously
    // refreshed by `mousemove`, but on mobile `touchmove` only fires while a
    // finger is dragging - the moment the player lifts their finger, the
    // vectors freeze at whatever they were a frame before death. Without
    // zeroing them here, a freshly-respawned (small = fast) player would
    // auto-drift at full speed in the last touch direction, which is
    // exactly the "boost around like crazy after Play Again" symptom.
    player.xVector = 0;
    player.yVector = 0;
    player.serverSpeed = 0;
    player.speedBoostStacks = [];
    player.speedBoostDurationMs = 10000;
    player.score = 0;
    player.orbsAbsorbed = 0;
    player.playersKilled = 0;
    if (scoreEl) scoreEl.innerHTML = 0;
    if (boostHudEl) {
        boostHudEl.style.display = 'none';
    }
    if (boostHudListEl) boostHudListEl.innerHTML = '';
    lastBoostHudSignature = '';
    if (typeof clearPlayerTrails === 'function') {
        clearPlayerTrails();
    }
    if (typeof clearSnapshots === 'function') {
        clearSnapshots();
    }
    // Force the next tock to snap (rather than slowly lerp) the camera
    // to the new spawn position.
    player.snap = true;
    player.locX = undefined;
    player.locY = undefined;
    player.zoom = undefined;
    player.targetX = undefined;
    player.targetY = undefined;
    player.targetZoom = undefined;
}

document.addEventListener('DOMContentLoaded', () => {
    const respawnBtn = document.getElementById('respawn-btn');
    const canvasEl = document.getElementById('the-canvas');

    if (respawnBtn) {
        respawnBtn.addEventListener('click', () => doRespawn(null));
    }

    // Tap/click on a bot during spectator mode = take it over. We listen
    // on both pointer events (covers desktop click + mobile tap reliably,
    // sidesteps the 300ms click delay and avoids ghost clicks).
    if (canvasEl) {
        const tryBotTakeover = (clientX, clientY) => {
            if (!player.isSpectating) return false;
            const bot = findBotAtScreen(clientX, clientY);
            if (!bot) return false;
            doRespawn(bot.uid);
            return true;
        };

        // Pointer events fire for both mouse and touch on modern browsers.
        canvasEl.addEventListener('pointerup', (e) => {
            tryBotTakeover(e.clientX, e.clientY);
        });
        // Defensive fallback for browsers that don't fire pointerup.
        canvasEl.addEventListener('touchend', (e) => {
            if (!e.changedTouches || e.changedTouches.length === 0) return;
            const t = e.changedTouches[0];
            if (tryBotTakeover(t.clientX, t.clientY)) {
                e.preventDefault();
            }
        }, { passive: false });
    }
});