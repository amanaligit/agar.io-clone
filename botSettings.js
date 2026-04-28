//DEFAULT game settings, can be modified from heroku;

module.exports = {
    defaultOrbs: parseInt(process.env.DEFAULT_ORBS) || 25,
    defaultSpeed: parseFloat(process.env.BOT_SPEED) || 1,
    defaultSize: parseInt(process.env.BOT_SIZE) || 6,
    botMinSize: parseFloat(process.env.BOT_MIN_SIZE) || 6,
    botMaxSize: parseFloat(process.env.BOT_MAX_SIZE) || 16,
    defaultZoom: parseInt(process.env.DEFAULT_ZOOM) || 2,
    worldWidth: parseInt(process.env.WORLD_WIDTH) || 1500,
    worldHeight: parseInt(process.env.WORLD_HEIGHT) || 1500,
    numBots: parseInt(process.env.NUM_BOTS) || 5,
    minSpeed: parseFloat(process.env.MIN_SPEED) || 0.05,
    botOrbBlindnessChance: parseFloat(process.env.BOT_ORB_BLINDNESS_CHANCE) || 0.25
}