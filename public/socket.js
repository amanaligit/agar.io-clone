let socket = io.connect('http://localhost:8080')

//called when user presses the start button
function init() {
    draw();
    socket.emit('init', {
        playerName: player.name
    });
}

socket.on('initReturn', data => {
    // console.log(data.orbs);
    orbs = data.orbs;
    setInterval(() => {
        // console.log("tick");
        socket.emit('tick', {
            xVector: player.xVector,
            yVector: player.yVector
        })
    }, 15)
})

socket.on('reconnect', () => {
    // console.log(data.orbs);
    socket.emit('init', {
        playerName: player.name
    });
})

socket.on('tock', data => {
    // console.log(data);
    players = data.players;
    player.locX = data.playerX;
    player.locY = data.playerY;
    console.log(player);
})