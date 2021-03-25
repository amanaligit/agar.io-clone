const io = require('../servers').io;
const checkForOrbCollisions = require('./checkCollisions').checkForOrbCollisions;
const checkForPlayerCollisions = require('./checkCollisions').checkForPlayerCollisions;
//=====================classes======================
const Player = require('./classes/Player');
const PlayerConfig = require('./classes/PlayerConfig');
const PlayerData = require('./classes/PlayerData');
const Orb = require('./classes/Orb');


let orbs = [];
let players = [];

let settings = {
    defaultOrbs: 800,
    defaultSpeed: 4,
    defaultSize: 6,
    defaultZoom: 2,
    worldWidth: 5000,
    worldHeight: 5000
}

initGame()

//since the game runs at 30fps, we emit this event with all the player data.



io.sockets.on('connect', socket => {
    let player = {};
    socket.on('init', data => {
        socket.join('game');
        let playerConfig = new PlayerConfig(settings);
        let playerData = new PlayerData(data.playerName, settings);
        player = new Player(socket.id, playerConfig, playerData);
        setInterval(() => {
            // console.log(player.playerData);
            socket.emit('tock', {
                players,
                playerX: player.playerData.locX,
                playerY: player.playerData.locY,
                zoom: player.playerConfig.zoom
            });
            // console.log(player.playerConfig.zoom);
        }, 16);
        socket.emit('initReturn', { orbs, uid: player.playerData.uid });
        // console.log(player);
        players.push(playerData);
    })

    socket.on('tick', data => {
        // console.log(player);
        if (player.playerConfig && player.playerData.alive) {
            // console.log(player.playerData.name is )
            //==============M=============ove the player using the vector==============================
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
            let capturedOrb = checkForOrbCollisions(player.playerData, player.playerConfig, orbs, settings);
            capturedOrb.then(indices => {
                //if reolve happens then a collision happened!
                // console.log("Orb Collision", indices);
                const newOrbs = [];
                indices.forEach(i => {
                    newOrbs.push(orbs[i]);
                })
                //emit to all sockets the orb to be replaced
                const orbData = {
                    orbIndices: indices,
                    newOrbs
                }
                // console.log(orbData);
                //Updating the Leaderboard
                io.sockets.emit('updateLeaderBoard', getLeaderBoard());
                io.sockets.emit('orbSwitch', orbData);
            }).catch(() => {
                //catch runs if reject runs
            })
            // console.log(player.playerData);
            //Player collisions
            let playerDeath = checkForPlayerCollisions(player.playerData, player.playerConfig, players, player.playerData.uid);
            playerDeath.then(data => {
                //PlayerCollision!!
                console.log("player collision happened");
                io.sockets.emit('updateLeaderBoard', getLeaderBoard());
                io.sockets.emit('playerDeath', data);
            }).catch(() => {
                //No player collision
            })
        }
    })
    socket.on('disconnect', data => {
        // console.log(data);
        //find out who just left!
        if (player.playerData) {
            players.forEach((cp, i) => {
                if (cp.uid === player.playerData.uid)
                    players.splice(i, 1);
            })
        }
    })

})

function getLeaderBoard() {
    players.sort((a, b) => {
        return b.score - a.score;
    })
    let leaderBoard = players.map(curplayer => {
        return {
            name: curplayer.name,
            score: curplayer.score
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


module.exports = io;