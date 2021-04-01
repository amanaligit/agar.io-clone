
//DEFAULT game settings, can be modified from heroku;

module.exports = {
    defaultOrbs: parseInt(process.env.DEFAULT_ORBS) || 10,
    defaultSpeed: parseFloat(process.env.DEFAULT_SPEED) || 3,
    defaultSize: parseInt(process.env.DEFAULT_SIZE) || 6,
    defaultZoom: parseInt(process.env.DEFAULT_ZOOM) || 2,
    worldWidth: parseInt(process.env.WORLD_WIDTH) || 1000,
    worldHeight: parseInt(process.env.WORLD_HEIGHT) || 1000,
    numBots: parseInt(process.env.NUM_BOTS) || 20
}