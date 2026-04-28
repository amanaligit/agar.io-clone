
//DEFAULT game settings, can be modified from heroku;

module.exports = {
    defaultOrbs: parseInt(process.env.DEFAULT_ORBS) || 25,
    defaultSpeed: parseFloat(process.env.DEFAULT_SPEED) || 1.5,
    defaultSize: parseInt(process.env.DEFAULT_SIZE) || 6,
    defaultZoom: parseInt(process.env.DEFAULT_ZOOM) || 2,
    worldWidth: parseInt(process.env.WORLD_WIDTH) || 1500,
    worldHeight: parseInt(process.env.WORLD_HEIGHT) || 1500,
    numBots: parseInt(process.env.NUM_BOTS) || 0,
    minSpeed: parseFloat(process.env.MIN_SPEED) || 0.05,
    speedSlowdownFactor: parseFloat(process.env.SPEED_SLOWDOWN_FACTOR) || 0.15,
    speedBoostOrbChance: parseFloat(process.env.SPEED_BOOST_ORB_CHANCE) || 0.08,
    speedBoostMultiplier: parseFloat(process.env.SPEED_BOOST_MULTIPLIER) || 3,
    speedBoostDurationMs: parseInt(process.env.SPEED_BOOST_DURATION_MS) || 10000,
    speedBoostFadeoutMs: parseInt(process.env.SPEED_BOOST_FADEOUT_MS) || 1500,
    speedBoostMaxStacks: parseInt(process.env.SPEED_BOOST_MAX_STACKS) || 2,
    speedBoostLevels: Math.max(1, Math.min(8, parseInt(process.env.SPEED_BOOST_LEVELS) || 4)),
    // Size cap: when player *radius* (same units as defaultSize) is >= this,
    // radius snaps back to defaultSize. Triggered only on grow events (orbs / eats).
    // Score is never part of this check — only blob size.
    maxRadiusBeforeReset: parseInt(process.env.MAX_RADIUS_BEFORE_RESET, 10) || 1500,
    // How often (in world ticks) a full player snapshot is broadcast so
    // clients can resync if they diverged. Between keyframes only rows
    // that changed (after quantization) and removals are sent.
    worldKeyframeEvery: Math.max(1, parseInt(process.env.WORLD_KEYFRAME_EVERY, 10) || 20),
    // How often authoritative world state is broadcast (ms). ~30Hz default.
    worldTickMs: parseInt(process.env.WORLD_TICK_MS, 10) || 33
}