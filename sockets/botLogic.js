const settings = require('../botSettings');
const axios = require('axios');

//=====================classes======================
const Player = require('./classes/Player');
const PlayerConfig = require('./classes/PlayerConfig');
const PlayerData = require('./classes/PlayerData');



async function initiateBots(bots, players, playerInfo) {
    const name_dat = await axios.get(`https://randomuser.me/api/?results=${settings.numBots}`)
    const name = name_dat.data.results;
    for (i = 0; i < settings.numBots; i++) {
        const bot = new Player(null);
        let botConfig = new PlayerConfig(settings);
        let botData = new PlayerData(name[i].login.username, settings);
        bot.playerConfig = botConfig;
        bot.playerData = botData;
        players.push(botData);
        bots.push(bot);
        playerInfo.set(bot.playerData.uid, bot);
    }
}

async function pushBot(bots, players, playerInfo) {
    // console.log("pushing bot")
    const name_dat = await axios.get(`https://randomuser.me/api/`)
    const name = name_dat.data.results;
    const bot = new Player(null);
    let botConfig = new PlayerConfig(settings);
    let botData = new PlayerData(name[0].login.username, settings);
    bot.playerConfig = botConfig;
    bot.playerData = botData;
    players.push(botData);
    bots.push(bot);
    playerInfo.set(bot.playerData.uid, bot);
}

function moveBots(bots, players, orbs) {
    //find the nearest orb
    bots.forEach(bot => {
        let minDist = settings.worldHeight * settings.worldWidth;
        let xVector = 0;
        let yVector = 0;
        let mousePosition = {
            x: 1000,
            y: 1000
        };
        orbs.forEach((orb, i) => {
            const dist =
                Math.abs(bot.playerData.locX - orb.locX) +
                Math.abs(bot.playerData.locY - orb.locY)
            if (dist <= minDist) {
                minDist = dist;
                mousePosition = {
                    x: orb.locX,
                    y: orb.locY
                };

            }
        })
        //find the nearest player smaller than the bot!
        players.forEach((p, i) => {
            const dist =
                Math.abs(bot.playerData.locX - p.locX) +
                Math.abs(bot.playerData.locY - p.locY)
            if (dist <= minDist && p.radius < bot.playerData.radius) {
                minDist = dist;
                mousePosition = {
                    x: p.locX,
                    y: p.locY
                };
            }
        })

        //now calculate the vector!
        const angleDeg = Math.atan2(mousePosition.y - bot.playerData.locY, mousePosition.x - bot.playerData.locX) * 180 / Math.PI;
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



