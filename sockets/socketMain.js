const io = require('../servers').io;

//=====================classes======================
const Player = require('./classes/Player');
const PlayerConfig = require('./classes/PlayerConfig');
const PlayerData = require('./classes/PlayerData');
const Orb = require('./classes/Orb');


let orbs = [];
let players = [];

let settings = {
    defaultOrbs: 500,
    defaultSpeed: 6,
    defaultSize: 6,
    defaultZoom: 1.5,
    worldWidth: 500,
    worldHeight: 500
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
                playerY: player.playerData.locY
            });
        }, 15);
        socket.emit('initReturn', { orbs });
        // console.log(player);
        players.push(playerData);
    })

    socket.on('tick', data => {
        // console.log(player);
        if (player.playerConfig) {

            speed = player.playerConfig.speed;
            // console.log("speed", speed);

            // console.log(data);
            xV = player.playerConfig.xVector = data.xVector;
            yV = player.playerConfig.yVector = data.yVector;
            if ((player.playerData.locX < 5 && xV < 0) || (player.playerData.locX > 500) && (xV > 0)) {
                player.playerData.locY -= speed * yV;
            } else if ((player.playerData.locY < 5 && yV > 0) || (player.playerData.locY > 500) && (yV > 0)) {
                player.playerData.locX += speed * xV;
            } else {
                player.playerData.locX += speed * xV;
                player.playerData.locY -= speed * yV;
            }
            // console.log(player.playerData);
        }
        else {
            socket.emit('reconnect');
        }

    })

})



//run at the beginning of a new game
function initGame() {
    for (i = 0; i < settings.defaultOrbs; i++) {
        orbs.push(new Orb(settings));
    }
}


module.exports = io;