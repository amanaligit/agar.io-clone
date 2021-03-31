class Player {
    constructor(socketId) {
        this.socketId = socketId;
        // this.playerConfig = playerConfig;
        // this.playerData = playerData;
        this.sub = null;
    }
}

module.exports = Player;