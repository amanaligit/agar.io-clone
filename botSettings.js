//DEFAULT game settings, can be modified from heroku;

module.exports = {
    defaultOrbs: parseInt(process.env.DEFAULT_ORBS) || 10,
    defaultSpeed: parseInt(process.env.BOT_SPEED) || 2,
    defaultSize: parseInt(process.env.BOT_SIZE) || 6,
    defaultZoom: parseInt(process.env.DEFAULT_ZOOM) || 2,
    worldWidth: parseInt(process.env.WORLD_WIDTH) || 1000,
    worldHeight: parseInt(process.env.WORLD_HEIGHT) || 1000,
    numBots: parseInt(process.env.NUM_BOTS) || 10
}