class Orb {
    constructor(settings, forcedType = null, players = null) {
        this.type = forcedType || (Math.random() < settings.speedBoostOrbChance ? 'speedBoost' : 'normal');
        this.radius = this.type === 'speedBoost' ? 8 : 5;
        this.boostLevel = this.type === 'speedBoost'
            ? (Math.floor(Math.random() * settings.speedBoostLevels) + 1)
            : 0;
        this.color = this.type === 'speedBoost'
            ? this.getBoostColorByLevel(this.boostLevel)
            : this.getRandomColor();
        this.locX = 0;
        this.locY = 0;
        this.relocateAwayFromPlayers(settings, players);
    }

    overlapsAnyPlayer(players) {
        if (!Array.isArray(players) || players.length === 0) return false;
        const or = this.radius;
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            if (!p || p.alive === false) continue;
            if (!isFinite(p.locX) || !isFinite(p.locY)) continue;
            const pr = Math.max(0, p.radius || 0);
            const dx = this.locX - p.locX;
            const dy = this.locY - p.locY;
            if (dx * dx + dy * dy < (pr + or) * (pr + or)) return true;
        }
        return false;
    }

    relocateAwayFromPlayers(settings, players) {
        const w = settings.worldWidth;
        const h = settings.worldHeight;
        const maxAttempts = Math.max(64, (Array.isArray(players) ? players.length : 0) * 10);
        for (let a = 0; a < maxAttempts; a++) {
            this.locX = Math.floor(Math.random() * w);
            this.locY = Math.floor(Math.random() * h);
            if (!this.overlapsAnyPlayer(players)) return;
        }
        // Map almost filled by whales — last attempt is still random; avoids
        // wedging the server loop if we insisted on a perfect spot forever.
    }
    getBoostColorByLevel(level) {
        const boostPalette = [
            'rgb(0, 255, 255)',   // 1
            'rgb(80, 220, 255)',  // 2
            'rgb(120, 255, 160)', // 3
            'rgb(255, 255, 100)', // 4
            'rgb(255, 190, 90)',  // 5
            'rgb(255, 120, 120)', // 6
            'rgb(255, 110, 220)', // 7
            'rgb(180, 120, 255)'  // 8
        ];
        const idx = Math.max(1, Math.min(8, level || 1)) - 1;
        return boostPalette[idx];
    }
    getRandomColor() {
        const r = Math.floor(Math.random() * 200 + 50);
        const g = Math.floor(Math.random() * 200 + 50);
        const b = Math.floor(Math.random() * 200 + 50);
        return `rgb(${r}, ${g}, ${b})`
    }
}

module.exports = Orb;