
// console.log("check");
let wHeight = $(window).height();
let wWidth = $(window).width();
let player = { xVector: 0, yVector: 0.1, zoom: 1.5 };
let orbs = [];
let players = [];

let canvas = $('#the-canvas')[0];
let context = canvas.getContext('2d');
canvas.width = wWidth;
canvas.height = wHeight;
let auth0 = null;


const configureClient = async () => {
    auth0 = await createAuth0Client({
        domain: 'dev-earqz191.us.auth0.com',
        client_id: 'DfDeOpjtFHdOpeQF54fqeZpM9aGwG1ap',
        audience: "https://agario-clone-aman.herokuapp.com/"
    });
};

window.onload = async () => {
    await configureClient();
    updateUI();

    const isAuthenticated = await auth0.isAuthenticated();

    if (isAuthenticated) {
        // show the gated content
        updateUI();
        return;
    }
    else {

        $('#loginModal').modal('show');
    }

    // NEW - check for the code and state parameters
    const query = window.location.search;
    if (query.includes("code=") && query.includes("state=")) {

        // Process the login state
        await auth0.handleRedirectCallback();

        updateUI();
        // Use replaceState to redirect the user away and remove the querystring parameters
        window.history.replaceState({}, document.title, "/");
    }
};



const logout = () => {
    auth0.logout({
        returnTo: window.location.origin
    });
};

const updateUI = async () => {
    const isAuthenticated = await auth0.isAuthenticated();

    // NEW - add logic to show/hide gated content after authentication
    if (isAuthenticated) {

        $('#loginModal').modal('hide');
        $("#spawnModal").modal('show');
        document.querySelector('#logout-btn').style.display = "block";
        document.querySelector('#show-stats').style.display = "block";
        const token = await auth0.getTokenSilently();
        const user = await auth0.getUser();

        player.name = user.name;
        document.querySelector(".player-name").innerHTML = player.name;
        $('#loginModal').modal('hide');
        $("#spawnModal").modal('show');

        // Make the call to the API, setting the token
        // in the Authorization header
        const response = await fetch("/login", {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ socketId: socket.id, name: user.name })
        });
    } else {
        //...
    }
};
const login = async () => {
    await auth0.loginWithRedirect({
        redirect_uri: window.location.origin
    });
};


window.addEventListener("resize", () => {
    let wHeight = $(window).height();
    let wWidth = $(window).width();
    canvas.width = wWidth;
    canvas.height = wHeight;
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
    console.log(stats);
    $('.modal').modal('hide');
    $('#stats-modal').modal('show');
    document.getElementById('stats-name').innerHTML = player.name;
    document.getElementById('stats-score').innerHTML = stats.maxScore;
    document.getElementById('stats-kills').innerHTML = stats.sumPlayers;
    document.getElementById('stats-orbs').innerHTML = stats.sumOrbs;

}