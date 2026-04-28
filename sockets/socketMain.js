const io = require('../servers').io;
const checkForOrbCollisions = require('./checkCollisions').checkForOrbCollisions;
const checkForPlayerCollisions = require('./checkCollisions').checkForPlayerCollisions;
const settings = require('../gameSettings');

//=====================classes======================
const Player = require('./classes/Player');
const PlayerConfig = require('./classes/PlayerConfig');
const PlayerData = require('./classes/PlayerData');
const Orb = require('./classes/Orb')

//Database stuff
const client = require('../database/database');
const updateQuery = 'INSERT INTO leaderboard(sub, name, orbs_absorbed, players_killed, score) VALUES($1, $2, $3, $4, $5) returning *';
const { initiateBots, moveBots, pushBot } = require('./botLogic');

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
    // BUG FIX: original formula was `speedBoostMultiplier * count`, which is
    // wrong - with multiplier=1.2 it gave 1.2x / 2.4x / 3.6x for 1/2/3 stacks.
    // That made bots that had collected a few boost orbs literally faster
    // than fresh players ("huge bots insanely fast"). Stacking should
    // *compound*: each stack multiplies on top of the previous, so 1.2 -> 1.44
    // -> 1.728. Capped naturally by speedBoostMaxStacks.
    const count = Array.isArray(stacks) ? stacks.length : stacks;
    if (count <= 0) return 1;
    return Math.pow(settings.speedBoostMultiplier, count);
}

function getOverviewCamera() {
    return {
        x: settings.worldWidth / 2,
        y: settings.worldHeight / 2,
        zoom: 0.45
    };
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

//In memory data
let orbs = [];
let players = [];
let bots = [];
let numPlayers = 0;

//initialize the game with the above settings
initGame()

let playerInfo = new Map();

function hardResetGameState() {
    // Full world reset when no real players remain connected.
    bots = [];
    players = [];
    playerInfo = new Map();
    orbs = [];
    resetWorldDeltaBaseline();
    lastRealPlayerUidsKey = '';
    initGame();
    console.log('Hard reset: no real players connected');
}

function hasOtherRealPlayers(excludedSessionId) {
    for (let [, connectedPlayer] of playerInfo) {
        if (!connectedPlayer.socketId) continue;
        if (connectedPlayer.sessionId && connectedPlayer.sessionId !== excludedSessionId) {
            return true;
        }
    }
    return false;
}

function getRealPlayerUids() {
    const uids = [];
    for (let [, connectedPlayer] of playerInfo) {
        if (connectedPlayer.socketId && connectedPlayer.playerData?.uid) {
            uids.push(connectedPlayer.playerData.uid);
        }
    }
    return uids;
}

// Wire format: each player is a fixed-order array (no JSON keys per row).
// [ uid, locX, locY, radius, color, name, score, orbsAbsorbed, playersKilled ]
function buildCompactPlayers(list) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const pl = list[i];
        if (!pl) continue;
        out.push([
            pl.uid,
            Math.round(pl.locX),
            Math.round(pl.locY),
            Math.round(pl.radius * 10) / 10,
            pl.color,
            pl.name,
            pl.score,
            pl.orbsAbsorbed,
            pl.playersKilled
        ]);
    }
    return out;
}

let lastRealPlayerUidsKey = '';
let worldTickInterval = null;
// Delta snapshot baseline: last compact row JSON string per uid on the wire.
let lastCompactByUid = new Map();
let worldTickCount = 0;

function resetWorldDeltaBaseline() {
    lastCompactByUid.clear();
    worldTickCount = 0;
}

// One shared world snapshot broadcast to the whole room (not repeated per
// socket). Per-socket meTick carries only what differs: speed, zoom, boosts.
// Most ticks send only changed player rows (`d`) + removed uids (`rm`); every
// worldKeyframeEvery ticks a full list (`f`, `p`) resynchronizes everyone.
function broadcastWorldAndMe() {
    worldTickCount++;
    const keyframeEvery = settings.worldKeyframeEvery;
    const current = buildCompactPlayers(players);
    const currentUids = new Set(current.map(r => r[0]));
    const isKeyframe = (worldTickCount % keyframeEvery === 0) || lastCompactByUid.size === 0;

    let payload;
    if (isKeyframe) {
        lastCompactByUid.clear();
        for (const r of current) lastCompactByUid.set(r[0], JSON.stringify(r));
        payload = { f: 1, p: current, t: Date.now() };
    } else {
        const d = [];
        for (const r of current) {
            const id = r[0];
            const s = JSON.stringify(r);
            if (lastCompactByUid.get(id) !== s) {
                d.push(r);
                lastCompactByUid.set(id, s);
            }
        }
        const rm = [];
        for (const uid of Array.from(lastCompactByUid.keys())) {
            if (!currentUids.has(uid)) {
                rm.push(uid);
                lastCompactByUid.delete(uid);
            }
        }
        payload = { d, rm, t: Date.now() };
    }

    const ru = getRealPlayerUids();
    const ruKey = ru.join(',');
    if (ruKey !== lastRealPlayerUidsKey) {
        lastRealPlayerUidsKey = ruKey;
        payload.ru = ru;
    }
    io.to('game').emit('worldTick', payload);

    for (const [, pl] of playerInfo) {
        if (!pl.socketId) continue;
        const sock = io.sockets.sockets.get(pl.socketId);
        if (!sock || !sock.connected) continue;
        if (!pl.joinedGame) continue;
        if (pl.playerData && pl.playerConfig) {
            sock.emit('meTick', {
                s: pl.playerConfig.speed || 0,
                z: pl.playerConfig.zoom,
                st: pl.playerConfig.speedBoostStacks || []
            });
        } else {
            const z = (typeof pl.cameraZoom === 'number')
                ? pl.cameraZoom
                : settings.defaultZoom;
            sock.emit('meTick', { s: 0, z, st: [] });
        }
    }
}

function ensureWorldTickLoop() {
    if (worldTickInterval) return;
    worldTickInterval = setInterval(broadcastWorldAndMe, settings.worldTickMs);
}

function updatePlayerSpeedWithBoost(player) {
    if (!player?.playerData || !player?.playerConfig) return;
    const baseSpeed = getBaseSpeedForRadius(player.playerData.radius, player.playerConfig);
    const activeStacks = getActiveBoostStacks(player.playerConfig);
    const effectiveBoostMultiplier = getEffectiveBoostMultiplier(player.playerConfig, activeStacks);
    player.playerConfig.speed = baseSpeed * effectiveBoostMultiplier;
}

//internal clock of the server, every 16ms, do this!
setInterval(() => {
    // Expire boost stacks by wall-clock time for everyone (humans and bots),
    // independent of new collisions.
    for (let [, player] of playerInfo) {
        updatePlayerSpeedWithBoost(player);
    }

    moveBots(bots, players, orbs);
    for (let [id, player] of playerInfo) {
        if (player.playerData) {
            // Orb collisions (sync; previously Promise-based which thrashed GC).
            const indices = checkForOrbCollisions(player.playerData, player.playerConfig, orbs, settings, players);
            if (indices.length > 0) {
                const newOrbs = indices.map(i => orbs[i]);
                io.sockets.emit('orbSwitch', { orbIndices: indices, newOrbs });
            }

            // Player collisions (sync).
            const data = checkForPlayerCollisions(player.playerData, player.playerConfig, players, player.playerData.uid, bots, playerInfo);
            if (data) {
                for (let [, deadPlayer] of playerInfo) {
                    if (deadPlayer.playerData?.uid === data.died.uid) {
                        const values = [deadPlayer.sub, deadPlayer.playerData.name, deadPlayer.playerData.orbsAbsorbed, deadPlayer.playerData.playersKilled, deadPlayer.playerData.score];
                        updateLeaderBoard(values);
                        const overview = getOverviewCamera();
                        deadPlayer.cameraX = overview.x;
                        deadPlayer.cameraY = overview.y;
                        deadPlayer.cameraZoom = overview.zoom;
                        deadPlayer.spectatorTargetUid = null;
                        deadPlayer.playerData = null;
                        deadPlayer.playerConfig = null;
                    }
                }
                io.sockets.emit('playerDeath', data);
            }

            //remove bots that have gotten too big!
            //if this is true, player is a bot!
            if (playerInfo.get(player.playerData.uid) && player.playerData.score > (parseInt(process.env.MAX_BOT_SCORE) || 5000)) {
                //delete the bot from the memory
                playerInfo.delete(player.playerData.uid);
                bots.forEach((bot, j) => {
                    if (bot.playerData.uid === player.playerData.uid) {
                        bots.splice(j, 1);
                    }
                })
                //replace the bot
                pushBot(bots, players, playerInfo);
                players.forEach((p, j) => {
                    if (p.uid === player.playerData.uid) {
                        players.splice(j, 1);
                    }
                })
            }
        }
    }
}, 16);



//since the game runs at 30fps, we emit this event with all the player data.

io.sockets.on('connect', socket => {
    if (numPlayers === 0) {
        initiateBots(bots, players, playerInfo);
    }
    numPlayers++;
    let player = {};
    player = new Player(socket.id);
    player.cameraX = settings.worldWidth / 2;
    player.cameraY = settings.worldHeight / 2;
    player.cameraZoom = settings.defaultZoom;
    player.spectatorTargetUid = null;
    playerInfo.set(socket.id, player);

    // Network: one global world snapshot for the `game` room plus a tiny
    // per-socket meTick (speed/zoom/boost). See broadcastWorldAndMe().
    function startTockLoop() {
        ensureWorldTickLoop();
    }

    socket.on('init', data => {
        socket.join('game');
        player.joinedGame = true;
        // Defensive cleanup: if the same socket re-inits (respawn) without
        // disconnecting, scrub any prior playerData entry from the live
        // `players` array so we never have two live entries for one socket.
        if (player.playerData) {
            const staleUid = player.playerData.uid;
            for (let i = players.length - 1; i >= 0; i--) {
                if (players[i].uid === staleUid) players.splice(i, 1);
            }
        }
        let playerConfig = new PlayerConfig(settings);
        let playerData = new PlayerData(data.playerName, settings);
        playerConfig.baseSpeed = settings.defaultSpeed;
        playerConfig.baseSize = settings.defaultSize;
        player.playerConfig = playerConfig;
        player.playerData = playerData;
        player.sessionId = data.playerSessionId || null;
        player.playerConfig.speedBoostStacks = [];
        player.playerConfig.boostDecayFrom = 1;
        player.playerConfig.boostDecayStartAt = null;
        player.spectatorTargetUid = null;
        player.cameraX = playerData.locX;
        player.cameraY = playerData.locY;
        player.cameraZoom = playerConfig.zoom;
        players.push(playerData);
        startTockLoop();
        socket.emit('initReturn', {
            orbs,
            uid: player.playerData.uid,
            worldWidth: settings.worldWidth,
            worldHeight: settings.worldHeight,
            speedBoostDurationMs: settings.speedBoostDurationMs,
            worldTickMs: settings.worldTickMs,
            p: buildCompactPlayers(players)
        });
    })

    // Player respawns by *taking over a bot*. If `botUid` is supplied the
    // caller picked a specific target by tapping it; otherwise we pick
    // randomly. Inheriting the bot means you keep its size, position and
    // score - so picking a fat bot is a high-reward gamble. A replacement
    // bot is spawned so the room population stays stable.
    socket.on('respawnAsBot', data => {
        socket.join('game');
        player.joinedGame = true;

        if (player.playerData) {
            const staleUid = player.playerData.uid;
            for (let i = players.length - 1; i >= 0; i--) {
                if (players[i].uid === staleUid) players.splice(i, 1);
            }
        }

        let targetBot = null;
        if (data && data.botUid) {
            targetBot = bots.find(b => b.playerData?.uid === data.botUid);
        }
        if (!targetBot && bots.length > 0) {
            targetBot = bots[Math.floor(Math.random() * bots.length)];
        }

        if (!targetBot || !targetBot.playerData) {
            // No bots in play - fall back to a fresh spawn so the player
            // is never stuck on the death screen.
            const playerConfig = new PlayerConfig(settings);
            const playerData = new PlayerData((data && data.playerName) || 'Player', settings);
            playerConfig.baseSpeed = settings.defaultSpeed;
            playerConfig.baseSize = settings.defaultSize;
            player.playerConfig = playerConfig;
            player.playerData = playerData;
            player.sessionId = (data && data.playerSessionId) || null;
            player.playerConfig.speedBoostStacks = [];
            player.playerConfig.boostDecayFrom = 1;
            player.playerConfig.boostDecayStartAt = null;
            player.cameraX = playerData.locX;
            player.cameraY = playerData.locY;
            player.cameraZoom = playerConfig.zoom;
            players.push(playerData);
            startTockLoop();
            socket.emit('initReturn', {
                orbs,
                uid: player.playerData.uid,
                worldWidth: settings.worldWidth,
                worldHeight: settings.worldHeight,
                speedBoostDurationMs: settings.speedBoostDurationMs,
                worldTickMs: settings.worldTickMs,
                p: buildCompactPlayers(players)
            });
        }

        // Steal the bot's identity. The bot's playerData is already in the
        // `players` array (added when the bot was created), so we don't push
        // again - we just hand its pointer to the human's playerInfo entry.
        const oldBotUid = targetBot.playerData.uid;
        targetBot.playerData.name = (data && data.playerName) || targetBot.playerData.name;
        targetBot.playerData.alive = true;

        player.playerConfig = targetBot.playerConfig;
        player.playerData = targetBot.playerData;
        player.sessionId = (data && data.playerSessionId) || null;
        // Reset boost state on takeover - inheriting a 3-stack boosted bot
        // would feel like cheesing.
        player.playerConfig.speedBoostStacks = [];
        player.playerConfig.boostDecayFrom = 1;
        player.playerConfig.boostDecayStartAt = null;
        player.spectatorTargetUid = null;
        player.cameraX = targetBot.playerData.locX;
        player.cameraY = targetBot.playerData.locY;
        player.cameraZoom = targetBot.playerConfig.zoom;

        // Detach the old bot.
        const botIdx = bots.indexOf(targetBot);
        if (botIdx !== -1) bots.splice(botIdx, 1);
        playerInfo.delete(oldBotUid);

        // Replace the bot so room population stays the same.
        pushBot(bots, players, playerInfo);

        startTockLoop();
        socket.emit('initReturn', {
            orbs,
            uid: player.playerData.uid,
            worldWidth: settings.worldWidth,
            worldHeight: settings.worldHeight,
            speedBoostDurationMs: settings.speedBoostDurationMs,
            worldTickMs: settings.worldTickMs,
            p: buildCompactPlayers(players)
        });
    })

    socket.on('tick', data => {
        if (player.playerConfig && player.playerData?.alive) {
            //===========================move the player using the vector==============================
            speed = player.playerConfig.speed;
            xV = player.playerConfig.xVector = data.xVector;
            yV = player.playerConfig.yVector = data.yVector;
            if ((player.playerData.locX < 5 && xV < 0) || (player.playerData.locX > settings.worldWidth) && (xV > 0)) {
                if (player.playerData.locY > 5 && player.playerData.locY < settings.worldHeight)
                    player.playerData.locY -= speed * yV;
            } else if ((player.playerData.locY < 5 && yV > 0) || player.playerData.locY > settings.worldHeight && yV < 0) {
                if (player.playerData.locX > 5 && player.playerData.locX < settings.worldWidth)
                    player.playerData.locX += speed * xV;
            } else {
                player.playerData.locX += speed * xV;
                player.playerData.locY -= speed * yV;
            }

        }
    })
    socket.on('disconnect', data => {
        numPlayers--;
        const disconnectedSessionId = player.sessionId || null;
        if (player.playerData) {
            players.forEach((cp, i) => {
                if (cp.uid === player.playerData.uid)
                    players.splice(i, 1);
            })
            //Update database
            const values = [player.sub, player.playerData.name, player.playerData.orbsAbsorbed, player.playerData.playersKilled, player.playerData.score];
            updateLeaderBoard(values);
        }
        // Always cleanup socket entry, even if player was already dead.
        playerInfo.delete(socket.id);

        // Hard reset when no OTHER real player is active.
        // This handles fast reloads of the same player session.
        if (!hasOtherRealPlayers(disconnectedSessionId)) {
            numPlayers = 0;
            hardResetGameState();
        }
    })

})

//run query
async function updateLeaderBoard(values) {
    await client.query(updateQuery, values, (err, res) => {
        if (err) {
            console.log(err.stack)
        }
    });
}



//run at the beginning of a new game
function initGame() {
    for (i = 0; i < settings.defaultOrbs; i++) {
        orbs.push(new Orb(settings, null, players));
    }
}


module.exports = { io, playerInfo };