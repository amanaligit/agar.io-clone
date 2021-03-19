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
    // console.log(player);
})

socket.on('orbSwitch', data => {
    // console.log(data)
    // console.log(orbs);
    // orbs.splice(data.orbIndex, 1, data.newOrb);
    data.orbIndices.forEach((index, i) => {
        orbs[index] = data.newOrbs[i];
    })
    // console.log(orbs);
})

socket.on('updateLeaderBoard', data => {
    // console.log(lb);
    let lb = document.querySelector('.leader-board');
    let pl = document.querySelector('.player-score');
    lb.innerHTML = "";
    data.forEach(p => {
        lb.innerHTML += `<li class="leaderboard-player">${p.name} - ${p.score}</li>`
        if (p.name === player.name)
            pl.innerHTML = p.score;
    })

})

socket.on('playerDeath', data => {
    console.log(data);
    document.querySelector('#game-message').innerHTML = `${data.died.name} absorbed by ${data.killedBy.name}`
    $('#game-message').css({
        "background-color": "#00e6e6",
        "opacity": 1
    });
    $('#game-message').show();
    $('#game-message').fadeOut(5000);
})