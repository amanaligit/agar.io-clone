

let socket = io.connect('/')
var clock = null;


//called when user presses the start button
function init() {
    var elem = document.documentElement;
    function zoomOutMobile() {
        var viewport = document.querySelector('meta[name="viewport"]');

        if (viewport) {
            viewport.content = "initial-scale=0.1";
            viewport.content = "width=1200";
        }
    }

    zoomOutMobile();
    canvas.width = $(window).width();
    canvas.height = $(window).height();
    draw();
    socket.emit('init', {
        playerName: player.name
    });
}


socket.on('initReturn', data => {
    orbs = data.orbs;
    player.uid = data.uid;
    clock = setInterval(() => {
        socket.emit('tick', {
            xVector: player.xVector,
            yVector: player.yVector
        })
    }, 16)
})

socket.on('goback', () => {
    socket.emit('init', {
        playerName: player.name
    });
})

socket.on('tock', data => {
    players = data.players;
    player.locX = data.playerX;

    player.locY = data.playerY;
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        // true for mobile device
        player.zoom = 2.4 * data.zoom;
    } else {
        // false for not mobile device
        player.zoom = data.zoom;
    }

})

socket.on('orbSwitch', data => {

    data.orbIndices.forEach((index, i) => {
        orbs[index] = data.newOrbs[i];
    })
})

socket.on('updateLeaderBoard', data => {
    lb = data;
    lb.forEach(p => {
        if (p.name === player.name) {
            document.querySelector('.player-score').innerHTML = player.score;
            player.orbsAbsorbed = p.orbsAbsorbed;
            player.playersKilled = p.playersKilled;
            player.score = p.score;
        }
    })
    lb = lb.slice(0, 5);
    displayLB();
})

function displayLB() {
    let by = null;
    if (document.getElementById('sort-score').classList.contains('active')) {
        by = 'score';
    }
    else if (document.getElementById('sort-orbs').classList.contains('active')) {
        by = 'orbsAbsorbed';
    }
    else if (document.getElementById('sort-players').classList.contains('active')) {
        by = 'playersKilled';
    }
    let lb_element = document.querySelector('.leader-board');
    lb_element.innerHTML = "";
    lb.sort((a, b) => b[by] - a[by]);
    lb.forEach(p => {
        lb_element.innerHTML += `<li class="leaderboard-player">${p.name} - ${p[by]}</li>`
    })
}

socket.on('playerDeath', data => {
    document.querySelector('#game-message').innerHTML = `${data.died.name} absorbed by ${data.killedBy.name}`
    $('#game-message').css({
        "background-color": "#00e6e6",
        "opacity": 1
    });
    $('#game-message').show();
    $('#game-message').fadeOut(5000);
    if (player.uid === data.died.uid) {
        // console.log(player);
        $('#game-over-modal').modal('show');
        document.querySelector('#killed-by-dialog').innerHTML = data.killedBy.name;
        document.querySelector('#score-dialog').innerHTML = document.querySelector('.player-score').innerHTML;
        document.querySelector('#players-dialog').innerHTML = player.playersKilled;
        document.querySelector('#orbs-dialog').innerHTML = player.orbsAbsorbed;
    }
})