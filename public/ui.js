
let wHeight = $(window).height();
let wWidth = $(window).width();
let dpr = Math.max(1, window.devicePixelRatio || 1);
let player = { xVector: 0, yVector: 0.1, zoom: 1.5 };
let orbs = [];
let players = [];

let canvas = $('#the-canvas')[0];
let context = canvas.getContext('2d');

function resizeCanvasToViewport() {
    wWidth = $(window).width();
    wHeight = $(window).height();
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(wWidth * dpr);
    canvas.height = Math.round(wHeight * dpr);
    canvas.style.width = wWidth + 'px';
    canvas.style.height = wHeight + 'px';
}

resizeCanvasToViewport();

if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    document.body.classList.add('is-mobile');
}

let lb = [];
let gameStarted = false;
let askedFullscreenThisSession = false;

window.addEventListener("resize", resizeCanvasToViewport);
window.addEventListener("orientationchange", () => setTimeout(resizeCanvasToViewport, 50));
document.addEventListener("fullscreenchange", () => {
    setTimeout(resizeCanvasToViewport, 50);
    syncFullscreenButton();
});
document.addEventListener("webkitfullscreenchange", () => {
    setTimeout(resizeCanvasToViewport, 50);
    syncFullscreenButton();
});

function isInFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function syncFullscreenButton() {
    const btn = document.getElementById('fullscreen-btn');
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (isInFullscreen()) {
        btn.classList.add('is-fullscreen');
        if (icon) icon.className = 'fas fa-compress';
        btn.setAttribute('title', 'Exit fullscreen');
        btn.setAttribute('aria-label', 'Exit fullscreen');
    } else {
        btn.classList.remove('is-fullscreen');
        if (icon) icon.className = 'fas fa-expand';
        btn.setAttribute('title', 'Enter fullscreen');
        btn.setAttribute('aria-label', 'Enter fullscreen');
    }
}

function toggleFullscreen() {
    const root = document.documentElement;
    if (!isInFullscreen()) {
        if (root.requestFullscreen) {
            root.requestFullscreen().catch(() => { });
        } else if (root.webkitRequestFullscreen) {
            root.webkitRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => { });
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
}

function showEntryOverlay() {
    const overlay = document.getElementById('entry-overlay');
    if (!overlay) return;
    overlay.classList.remove('hide');
    overlay.style.display = 'flex';
    const input = document.getElementById('name-input');
    if (input) {
        setTimeout(() => input.focus(), 50);
    }
}

function hideEntryOverlay() {
    const overlay = document.getElementById('entry-overlay');
    if (!overlay) return;
    overlay.classList.add('hide');
    setTimeout(() => { overlay.style.display = 'none'; }, 480);
}

$(document).ready(() => {
    showEntryOverlay();
});

$('.entry-form').on('submit', (event) => {
    event.preventDefault();
    const enteredName = document.querySelector('#name-input').value.trim();
    if (!enteredName) return;
    player.name = enteredName;
    document.querySelectorAll('.player-name').forEach(el => { el.innerHTML = player.name; });
    startGame();
});

function startGame() {
    if (!askedFullscreenThisSession && !document.fullscreenElement) {
        askedFullscreenThisSession = true;
        const shouldFullscreen = window.confirm('Go fullscreen for better gameplay?');
        if (shouldFullscreen) {
            const root = document.documentElement;
            if (root.requestFullscreen) {
                root.requestFullscreen().catch(() => { });
            } else if (root.webkitRequestFullscreen) {
                root.webkitRequestFullscreen();
            }
        }
    }

    hideEntryOverlay();
    $('.modal').modal('hide');
    $('.hiddenOnStart').removeAttr('hidden');
    clearInterval(clock);
    gameStarted = true;
    init();
}

async function showLeaderboard() {
    hideEntryOverlay();
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
    if (!gameStarted) {
        showEntryOverlay();
    }
}

function quit() {
    location.reload();
}

function toggleLeaderboard() {
    const isOpen = document.body.classList.toggle('lb-open');
    const btn = document.getElementById('lb-toggle-btn');
    if (btn) btn.classList.toggle('active', isOpen);
}

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
