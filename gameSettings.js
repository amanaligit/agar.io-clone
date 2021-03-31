
//DEFAULT game settings, can be modified from heroku;

module.exports = {
    defaultOrbs: process.env.DEFAULT_ORBS || 200,
    defaultSpeed: process.env.DEFAULT_SPEED || 3,
    defaultSize: process.env.DEFAULT_SIZE || 6,
    defaultZoom: process.env.DEFAULT_ZOOM || 2,
    worldWidth: process.env.WORLD_WIDTH || 1000,
    worldHeight: process.env.WORLD_HEIGHT || 1000
}