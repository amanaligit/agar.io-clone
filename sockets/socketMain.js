const io = require('../servers').io;
const Orb = require('./classes/Orb')

let orbs = [];

initGame()

io.sockets.on('connect', socket => {
    socket.emit('init', { orbs });
})



//run at the beginning of a new game
function initGame() {
    for (i = 0; i < 500; i++) {
        orbs.push(new Orb());
    }
}


module.exports = io;