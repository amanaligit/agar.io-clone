
console.log("check");
let wHeight = $(window).height();
let wWidth = $(window).width();
let player = {};
let orbs = [];

let canvas = $('#the-canvas')[0];
let context = canvas.getContext('2d');
canvas.width = wWidth;
canvas.height = wHeight;

$(window).load(() => {
    $('#loginModal').modal('show');
})

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
    init();
})