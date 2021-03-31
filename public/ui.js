
let wHeight = $(window).height();
let wWidth = $(window).width();
let player = { xVector: 0, yVector: 0.1, zoom: 1.5 };
let orbs = [];
let players = [];

let canvas = $('#the-canvas')[0];
let context = canvas.getContext('2d');
canvas.width = wWidth;
canvas.height = wHeight;

let lb = [];




window.addEventListener("resize", () => {
    let wHeight = $(window).height();
    let wWidth = $(window).width();
    canvas.width = wWidth;
    canvas.height = wHeight;
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        // true for mobile device
        document.getElementById('leader-heading').style.fontSize = '4rem';
        document.getElementById('leader-board').style.fontSize = '3rem';
        document.getElementById('sort-wrapper').style.fontSize = '3rem';
        document.getElementById('sort-wrapper').style.fontSize = '3rem';
        document.getElementById('score-wrapper').style.fontSize = '4rem';
        document.getElementById('quit-btn').style.fontSize = '4rem';
    }
});

$(".name-form").submit((event) => {
    event.preventDefault();
    player.name = document.querySelector('#name-input').value;
    $('#loginModal').modal('hide');
    $("#spawnModal").modal('show');
    document.querySelector(".player-name").innerHTML = player.name;
})

$('.start-game').click(event => {
    $(".modal").modal('hide');
    $('.hiddenOnStart').removeAttr('hidden');
    clearInterval(clock);
    init();
})

async function showLeaderboard() {
    $('.modal').modal('hide');
    $('#leaderboard-modal').modal('show');

    //API call for leaderboard
    const response = await fetch("/leaderboard");
    const lb = (await response.json()).results;

    document.getElementById('by-orbs').addEventListener('click', function () {
        renderLB('orbs_absorbed', lb);
    })

    document.getElementById('by-score').addEventListener('click', function () {
        renderLB('score', lb);
    })
    document.getElementById('by-players').addEventListener('click', function () {
        renderLB('players_killed', lb);
    })

    renderLB('score', lb);

}

function renderLB(by, lb) {
    lb.sort((a, b) => b[by] - a[by])
    const lbBody = document.getElementById("lb-body");
    lbBody.innerHTML = "";
    lb.forEach((record, i) => {
        lbBody.innerHTML +=
            `<tr>
			<th scope="row">${i + 1}</th>
            <th scope="row">${record.name}</td>
            <td>${record.score}</td>
            <td>${record.orbs_absorbed}</td>
            <td>${record.players_killed}</td>
        </tr>`
    })
}

function back() {
    $('.modal').modal('hide');
    $('#spawnModal').modal('show');
}

async function showStats() {
    const token = await auth0.getTokenSilently();
    const response = await fetch("/stats", {
        headers: {
            Authorization: `Bearer ${token}`,
        }
    });
    const stats = await response.json();
    $('.modal').modal('hide');
    $('#stats-modal').modal('show');
    document.getElementById('stats-name').innerHTML = player.name;
    document.getElementById('stats-score').innerHTML = stats.maxScore;
    document.getElementById('stats-kills').innerHTML = stats.sumPlayers;
    document.getElementById('stats-orbs').innerHTML = stats.sumOrbs;
}

document.getElementById('quit-btn').addEventListener("click", () => {
    location.reload();

})

document.getElementById('sort-score').addEventListener('click', function () {
    document.getElementById('sort-orbs').classList.remove('active');
    document.getElementById('sort-players').classList.remove('active');
    document.getElementById('sort-score').classList.add('active');
    displayLB();
})

document.getElementById('sort-orbs').addEventListener('click', function () {
    document.getElementById('sort-score').classList.remove('active');
    document.getElementById('sort-players').classList.remove('active');
    document.getElementById('sort-orbs').classList.add('active');
    displayLB();
})

document.getElementById('sort-players').addEventListener('click', function () {
    document.getElementById('sort-orbs').classList.remove('active');
    document.getElementById('sort-score').classList.remove('active');
    document.getElementById('sort-players').classList.add('active');
    displayLB();
})