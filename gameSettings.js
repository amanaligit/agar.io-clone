
//DEFAULT game settings, can be modified from heroku;

module.exports = {
    defaultOrbs: 200 || process.env.DEFAULT_ORBS,
    defaultSpeed: 3 || process.env.DEFAULT_SPEED,
    defaultSize: 6 || process.env.DEFAULT_SIZE,
    defaultZoom: 2 || process.env.DEFAULT_ZOOM,
    worldWidth: 1000 || process.env.WORLD_WIDTH,
    worldHeight: 1000 || process.env.WORLD_HEIGHT
}