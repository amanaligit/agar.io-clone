/* ================================
 * Client-side prediction + interpolation
 * --------------------------------
 * Two complementary techniques:
 *
 *   1. PREDICTION (local player only): the moment the user moves the
 *      mouse / drags a finger we update player.xVector / yVector.
 *      Each frame we advance player.locX / locY ourselves at the same
 *      speed the server is using, so the local player and camera react
 *      *instantly* to direction changes. When a tock arrives we gently
 *      reconcile the predicted position toward the authoritative one.
 *
 *   2. INTERPOLATION (everyone else): we buffer recent server snapshots
 *      and render each remote player at (now - INTERP_DELAY_MS) by
 *      linearly interpolating between the two snapshots straddling that
 *      time. Standard "render slightly in the past" trick: hides
 *      network jitter at the cost of ~100ms of perceived staleness.
 *
 * Without prediction (only interpolation), even the local player has to
 * round-trip the server before a direction change becomes visible -
 * that's typically 150-300ms over a Cloudflare Tunnel and feels awful.
 * ================================ */

const playerSnapshots = new Map(); // uid -> [{ t, x, y, r }]

const INTERP_DELAY_MS = 100;       // remote players: render this far in the past
const MAX_SNAPSHOTS = 12;
const RECONCILE_LERP = 0.12;       // how aggressively predicted pos is pulled toward server
const RECONCILE_SNAP_PX = 250;     // bigger than this = teleport (respawn / tab unfocus)
const ZOOM_LERP = 0.18;
const SERVER_TICK_MS = 16;         // server physics tick - prediction speed unit

let lastFrameAt = 0;

function recordTockSnapshots(tockPlayers, t) {
    if (!Array.isArray(tockPlayers)) return;
    const aliveUids = new Set();
    for (const p of tockPlayers) {
        if (!p || !p.uid) continue;
        aliveUids.add(p.uid);
        let buf = playerSnapshots.get(p.uid);
        if (!buf) {
            buf = [];
            playerSnapshots.set(p.uid, buf);
        }
        buf.push({ t, x: p.locX, y: p.locY, r: p.radius });
        if (buf.length > MAX_SNAPSHOTS) buf.shift();
    }
    for (const uid of playerSnapshots.keys()) {
        if (!aliveUids.has(uid)) playerSnapshots.delete(uid);
    }
}

function clearSnapshots() {
    playerSnapshots.clear();
    lastFrameAt = 0;
}

function lerp(from, to, t) {
    return from + (to - from) * t;
}

function applyInterpolation() {
    if (typeof player === 'undefined') return;
    const now = Date.now();
    const dt = lastFrameAt === 0 ? SERVER_TICK_MS : Math.min(100, now - lastFrameAt);
    lastFrameAt = now;
    const renderTime = now - INTERP_DELAY_MS;

    // ============================================================
    // LOCAL PLAYER (camera + own blob): prediction + reconciliation
    // ============================================================
    if (player.snap) {
        if (player.targetX !== undefined) player.locX = player.targetX;
        if (player.targetY !== undefined) player.locY = player.targetY;
        if (player.targetZoom !== undefined) player.zoom = player.targetZoom;
        player.snap = false;
    } else if (player.isSpectating) {
        // No prediction while dead - just smoothly fly the camera to its
        // overview target so the death pull-back stays cinematic.
        if (player.targetX !== undefined) {
            player.locX = (player.locX === undefined) ? player.targetX
                : lerp(player.locX, player.targetX, 0.18);
        }
        if (player.targetY !== undefined) {
            player.locY = (player.locY === undefined) ? player.targetY
                : lerp(player.locY, player.targetY, 0.18);
        }
        if (player.targetZoom !== undefined) {
            player.zoom = (player.zoom === undefined) ? player.targetZoom
                : lerp(player.zoom, player.targetZoom, ZOOM_LERP);
        }
    } else {
        // 1. PREDICT: advance position from current input vectors at
        //    server-known speed. dt is normalized into "server ticks"
        //    so prediction matches whatever rate the server runs at.
        const speed = player.serverSpeed || 0;
        const xV = player.xVector || 0;
        const yV = player.yVector || 0;
        if (player.locX !== undefined && speed > 0) {
            const stepFactor = dt / SERVER_TICK_MS;
            player.locX += speed * xV * stepFactor;
            player.locY -= speed * yV * stepFactor;
            // Soft clamp to world (matches server's hard boundary so we
            // don't predict ourselves into invalid space and then snap).
            const w = player.worldWidth || 1500;
            const h = player.worldHeight || 1500;
            if (player.locX < 5) player.locX = 5;
            if (player.locY < 5) player.locY = 5;
            if (player.locX > w) player.locX = w;
            if (player.locY > h) player.locY = h;
        }

        // 2. RECONCILE: nudge predicted position toward authoritative.
        //    If we're way off (respawn / tab regained focus), snap.
        if (player.targetX !== undefined) {
            if (player.locX === undefined) {
                player.locX = player.targetX;
            } else {
                const dx = player.targetX - player.locX;
                if (Math.abs(dx) > RECONCILE_SNAP_PX) player.locX = player.targetX;
                else player.locX += dx * RECONCILE_LERP;
            }
        }
        if (player.targetY !== undefined) {
            if (player.locY === undefined) {
                player.locY = player.targetY;
            } else {
                const dy = player.targetY - player.locY;
                if (Math.abs(dy) > RECONCILE_SNAP_PX) player.locY = player.targetY;
                else player.locY += dy * RECONCILE_LERP;
            }
        }
        if (player.targetZoom !== undefined) {
            player.zoom = (player.zoom === undefined)
                ? player.targetZoom
                : lerp(player.zoom, player.targetZoom, ZOOM_LERP);
        }
    }

    // ============================================================
    // REMOTE PLAYERS: snapshot interpolation in the past
    // LOCAL PLAYER's entry in `players` array: overwrite with
    // predicted position so the rendered blob matches the camera.
    // ============================================================
    if (!Array.isArray(players)) return;
    for (const p of players) {
        if (!p || !p.uid) continue;

        // Local player: render at predicted (camera) position.
        if (p.uid === player.uid) {
            if (player.locX !== undefined) p.locX = player.locX;
            if (player.locY !== undefined) p.locY = player.locY;
            continue;
        }

        const buf = playerSnapshots.get(p.uid);
        if (!buf || buf.length === 0) continue;

        if (buf.length === 1) {
            p.locX = buf[0].x;
            p.locY = buf[0].y;
            p.radius = buf[0].r;
            continue;
        }

        // Find the latest snapshot at-or-before renderTime.
        let i = buf.length - 1;
        while (i > 0 && buf[i].t > renderTime) i--;
        const a = buf[i];
        const b = buf[i + 1];

        if (!b) {
            // renderTime is past every snapshot we have - hold the
            // latest position rather than extrapolate.
            p.locX = a.x;
            p.locY = a.y;
            p.radius = a.r;
            continue;
        }

        const span = b.t - a.t;
        const tt = span > 0 ? Math.max(0, Math.min(1, (renderTime - a.t) / span)) : 0;
        p.locX = lerp(a.x, b.x, tt);
        p.locY = lerp(a.y, b.y, tt);
        p.radius = lerp(a.r, b.r, tt);
    }
}
