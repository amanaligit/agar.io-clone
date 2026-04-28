const settings = require('../botSettings');
const axios = require('axios');

//=====================classes======================
const Player = require('./classes/Player');
const PlayerConfig = require('./classes/PlayerConfig');
const PlayerData = require('./classes/PlayerData');
const namesFromAPI = axios.get(`https://randomuser.me/api/?results=${settings.numBots}`)
const BOT_DECISION_INTERVAL_MS = 120;

function getRandomBotSpawnSize() {
    const minSize = Math.max(1, Math.min(settings.botMinSize, settings.botMaxSize));
    const maxSize = Math.max(minSize, Math.max(settings.botMinSize, settings.botMaxSize));
    return minSize + Math.random() * (maxSize - minSize);
}


async function initiateBots(bots, players, playerInfo) {
    namesFromAPI.then(name_dat => {
        const name = name_dat.data.results;
        for (i = 0; i < settings.numBots; i++) {
            const bot = new Player(null);
            let botConfig = new PlayerConfig(settings);
            let botData = new PlayerData(name[i].login.username, settings);
            botData.radius = getRandomBotSpawnSize();
            botConfig.baseSpeed = settings.defaultSpeed;
            botConfig.baseSize = settings.defaultSize;
            bot.playerConfig = botConfig;
            bot.playerData = botData;
            players.push(botData);
            bots.push(bot);
            playerInfo.set(bot.playerData.uid, bot);
        }
    })
}

async function pushBot(bots, players, playerInfo) {
    namesFromAPI.then(name_dat => {
        const name = name_dat.data.results;
        const bot = new Player(null);
        let botConfig = new PlayerConfig(settings);
        let botData = new PlayerData(name[parseInt(Math.random() * (settings.numBots - 1))].login.username, settings);
        botData.radius = getRandomBotSpawnSize();
        botConfig.baseSpeed = settings.defaultSpeed;
        botConfig.baseSize = settings.defaultSize;
        bot.playerConfig = botConfig;
        bot.playerData = botData;
        players.push(botData);
        bots.push(bot);
        playerInfo.set(bot.playerData.uid, bot);
    })
}

function moveBots(bots, players, orbs) {
    //find the nearest orb
    bots.forEach(bot => {
        if (!bot.playerData || !bot.playerConfig) return;

        const now = Date.now();
        let minDist = settings.worldHeight * settings.worldWidth;
        let xVector = 0;
        let yVector = 0;
        let targetPosition = bot.targetPosition || {
            x: 1000,
            y: 1000
        };

        // Re-target at a slower cadence to avoid jittery frame-to-frame direction flips.
        if (!bot.nextDecisionAt || now >= bot.nextDecisionAt) {
            bot.nextDecisionAt = now + BOT_DECISION_INTERVAL_MS;
            let foundOrbTarget = false;

            orbs.forEach((orb) => {
                // Bots randomly ignore a subset of orbs to reduce perfect pathing.
                if (Math.random() < settings.botOrbBlindnessChance) {
                    return;
                }
                const dist =
                    Math.abs(bot.playerData.locX - orb.locX) +
                    Math.abs(bot.playerData.locY - orb.locY)
                if (dist <= minDist) {
                    minDist = dist;
                    foundOrbTarget = true;
                    targetPosition = {
                        x: orb.locX,
                        y: orb.locY
                    };
                }
            });

            // Safety fallback: if blindness filtered all orb candidates, pick nearest real orb.
            // This prevents bots from steering toward stale/off-map placeholder positions.
            if (!foundOrbTarget && orbs.length > 0) {
                orbs.forEach((orb) => {
                    const dist =
                        Math.abs(bot.playerData.locX - orb.locX) +
                        Math.abs(bot.playerData.locY - orb.locY);
                    if (dist <= minDist) {
                        minDist = dist;
                        targetPosition = {
                            x: orb.locX,
                            y: orb.locY
                        };
                    }
                });
            }

            // find the nearest smaller player (not blind to players)
            players.forEach((p) => {
                const dist =
                    Math.abs(bot.playerData.locX - p.locX) +
                    Math.abs(bot.playerData.locY - p.locY)
                if (dist <= minDist && p.radius < bot.playerData.radius) {
                    minDist = dist;
                    targetPosition = {
                        x: p.locX,
                        y: p.locY
                    };
                }
            });

            bot.targetPosition = targetPosition;
        }

        // now calculate the vector using stable target
        const angleDeg = Math.atan2(targetPosition.y - bot.playerData.locY, targetPosition.x - bot.playerData.locX) * 180 / Math.PI;
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
        bot.playerConfig.xVector = xVector;
        bot.playerConfig.yVector = yVector;

        //now move the bot
        speed = bot.playerConfig.speed;
        xV = bot.playerConfig.xVector;
        yV = bot.playerConfig.yVector;
        if ((bot.playerData.locX < 5 && xV < 0) || (bot.playerData.locX > settings.worldWidth) && (xV > 0)) {
            if (bot.playerData.locY > 5 && bot.playerData.locY < settings.worldHeight)
                bot.playerData.locY -= speed * yV;
        } else if ((bot.playerData.locY < 5 && yV > 0) || bot.playerData.locY > settings.worldHeight && yV < 0) {
            if (bot.playerData.locX > 5 && bot.playerData.locX < settings.worldWidth)
                bot.playerData.locX += speed * xV;
        } else {
            bot.playerData.locX += speed * xV;
            bot.playerData.locY -= speed * yV;
        }
    })
}

module.exports = { initiateBots, moveBots, pushBot };



