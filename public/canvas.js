
//================================
//=============DRAW===============
//================================

var background = new Image();
background.src = "images/starfield.jpg";

function draw() {

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.scale(player.zoom, player.zoom);
    //reset the translation back to default
    //clamp the camera to the player
    const camX = -player.locX + canvas.width / (2 * player.zoom)
    const camy = -player.locY + canvas.height / (2 * player.zoom)
    context.translate(camX, camy);


    players.forEach(p => {
        context.beginPath();
        context.fillStyle = p.color;
        context.arc(p.locX, p.locY, p.radius, 0, Math.PI * 2)
        context.fill();
        context.linewidth = 3;
        context.strokeStyle = "rgb(0,255,0)"
        context.stroke();
        context.textAlign = "center";
        context.font = "20px Arial";
        context.fillText(p.name, p.locX, p.locY - p.radius - 10);
    })


    orbs.forEach(orb => {
        context.beginPath();
        context.fillStyle = orb.color;
        context.arc(orb.locX, orb.locY, orb.radius, 0, Math.PI * 2);
        context.fill();
    })
    requestAnimationFrame(draw);
}

canvas.addEventListener('mousemove', (event) => {
    // console.log(event)
    const mousePosition = {
        x: event.clientX,
        y: event.clientY
    };
    const angleDeg = Math.atan2(mousePosition.y - (canvas.height / 2), mousePosition.x - (canvas.width / 2)) * 180 / Math.PI;
    if (angleDeg >= 0 && angleDeg < 90) {
        xVector = 1 - (angleDeg / 90);
        yVector = -(angleDeg / 90);
    } else if (angleDeg >= 90 && angleDeg <= 180) {
        xVector = -(angleDeg - 90) / 90;
        yVector = -(1 - ((angleDeg - 90) / 90));
    } else if (angleDeg >= -180 && angleDeg < -90) {
        xVector = (angleDeg + 90) / 90;
        yVector = (1 + ((angleDeg + 90) / 90));
    } else if (angleDeg < 0 && angleDeg >= -90) {
        xVector = (angleDeg + 90) / 90;
        yVector = (1 - ((angleDeg + 90) / 90));
    }
    player.xVector = xVector;
    player.yVector = yVector;
})

canvas.addEventListener('touchmove', (event) => {
    // console.log(event)
    // event.preventDefault();
    const mousePosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
    };
    const angleDeg = Math.atan2(mousePosition.y - (canvas.height / 2), mousePosition.x - (canvas.width / 2)) * 180 / Math.PI;
    if (angleDeg >= 0 && angleDeg < 90) {
        xVector = 1 - (angleDeg / 90);
        yVector = -(angleDeg / 90);
    } else if (angleDeg >= 90 && angleDeg <= 180) {
        xVector = -(angleDeg - 90) / 90;
        yVector = -(1 - ((angleDeg - 90) / 90));
    } else if (angleDeg >= -180 && angleDeg < -90) {
        xVector = (angleDeg + 90) / 90;
        yVector = (1 + ((angleDeg + 90) / 90));
    } else if (angleDeg < 0 && angleDeg >= -90) {
        xVector = (angleDeg + 90) / 90;
        yVector = (1 - ((angleDeg + 90) / 90));
    }
    player.xVector = xVector;
    player.yVector = yVector;
})
