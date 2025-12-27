//DEFAULT game settings, can be modified from heroku;

module.exports = {
    defaultOrbs: parseInt(process.env.DEFAULT_ORBS) || 25,
    defaultSpeed: parseFloat(process.env.BOT_SPEED) || 1,
    defaultSize: parseInt(process.env.BOT_SIZE) || 6,
    defaultZoom: parseInt(process.env.DEFAULT_ZOOM) || 2,
    worldWidth: parseInt(process.env.WORLD_WIDTH) || 1500,
    worldHeight: parseInt(process.env.WORLD_HEIGHT) || 1500,
    numBots: parseInt(process.env.NUM_BOTS) || 5,
    minSpeed: parseFloat(process.env.MIN_SPEED) || 0.05
}