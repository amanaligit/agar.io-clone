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

//In memory data
let orbs = [];
let players = [];
let bots = [];
let numPlayers = 0;

//initialize the game with the above settings
initGame()

let playerInfo = new Map();


//internal clock of the server, every 16ms, do this!
setInterval(() => {
    moveBots(bots, players, orbs);
    for (let [id, player] of playerInfo) {
        if (player.playerData) {
            let capturedOrb = checkForOrbCollisions(player.playerData, player.playerConfig, orbs, settings);
            capturedOrb.then(indices => {
                //if reolve happens then a collision happened!
                const newOrbs = [];
                indices.forEach(i => {
                    newOrbs.push(orbs[i]);
                })

                //emit to all sockets the orbs to be replaced
                const orbData = {
                    orbIndices: indices,
                    newOrbs
                }

                //Updating the Leaderboard
                io.sockets.emit('updateLeaderBoard', getLeaderBoard());
                io.sockets.emit('orbSwitch', orbData);
            }).catch(() => {
                //catch runs if reject runs
            })
            //Player collisions
            let playerDeath = checkForPlayerCollisions(player.playerData, player.playerConfig, players, player.playerData.uid, bots, playerInfo);
            playerDeath.then(data => {
                //PlayerCollision!!
                for (let [id, player] of playerInfo) {
                    if (player.playerData?.uid === data.died.uid) {
                        const values = [player.sub, player.playerData.name, player.playerData.orbsAbsorbed, player.playerData.playersKilled, player.playerData.score];
                        updateLeaderBoard(values);
                        player.playerData = null;
                        player.PlayerConfig = null;
                    }
                }
                io.sockets.emit('updateLeaderBoard', getLeaderBoard());
                io.sockets.emit('playerDeath', data);

            }).catch(() => {
                //No player collision
            })

            //remove bots that have gotten too big!
            //if this is true, player is a bot!
            if (playerInfo.get(player.playerData.uid) && player.playerData.score > (process.env.MAX_BOT_SCORE || 5000)) {
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
    playerInfo.set(socket.id, player);
    socket.on('init', data => {
        socket.join('game');
        let playerConfig = new PlayerConfig(settings);
        let playerData = new PlayerData(data.playerName, settings);
        player.playerConfig = playerConfig;
        player.playerData = playerData;
        setInterval(() => {
            if (player.playerData) {
                socket.emit('tock', {
                    players,
                    playerX: player.playerData.locX,
                    playerY: player.playerData.locY,
                    zoom: player.playerConfig.zoom
                });
            }
        }, 16);
        socket.emit('initReturn', { orbs, uid: player.playerData.uid });
        players.push(playerData);
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
        if (numPlayers == 0) {
            //reset all data to save computational power on server
            console.log('resetting');

            //delete all bots
            bots.forEach(bot => {
                playerInfo.delete(bot.playerData.uid);
            })
            bots = [];

            //reset all players
            players = [];
        }
        if (player.playerData) {
            players.forEach((cp, i) => {
                if (cp.uid === player.playerData.uid)
                    players.splice(i, 1);
            })
            //Update database
            const values = [player.sub, player.playerData.name, player.playerData.orbsAbsorbed, player.playerData.playersKilled, player.playerData.score];
            updateLeaderBoard(values);
            //cleanup
            playerInfo.delete(socket.id);
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




function getLeaderBoard() {
    players.sort((a, b) => {
        return b.score - a.score;
    })
    let leaderBoard = players.map(curplayer => {
        return {
            name: curplayer.name,
            score: curplayer.score,
            playersKilled: curplayer.playersKilled,
            orbsAbsorbed: curplayer.orbsAbsorbed
        }
    })
    return leaderBoard;
}

//run at the beginning of a new game
function initGame() {
    for (i = 0; i < settings.defaultOrbs; i++) {
        orbs.push(new Orb(settings));
    }
}


module.exports = { io, playerInfo };