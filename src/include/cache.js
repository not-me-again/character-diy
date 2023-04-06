const db = require("../include/db");
const { Poe } = require("../include/poe");

class Cache {
    constructor() {
        this.poeInstances = {};
        this.popularCharacters = [];

        setInterval(this._prunePoeInstances, 5e3);
        
        setInterval(this._updatePopularCharacters, 7200e3); // 7200e3 = 2 hours
        this._updatePopularCharacters();
    }

    async getPoeInstance(userId) {
        const instance = this.poeInstances[userId];

        if (instance && !instance.isConnected)
            await instance.connectSocket();

        return instance;
    }

    async newPoeInstance(userId, authCookie, botType) {
        let poeInstance = new Poe(authCookie, botType);
        await poeInstance.init();

        this.poeInstances[userId] = poeInstance;
        
        return poeInstance;
    }

    _prunePoeInstances() {
        for (let idx in this.poeInstances) {
            const poeInstance = this.poeInstances[idx];
            if (!poeInstance.isConnected)
                delete this.poeInstances[idx];
        }

    }

    //////////////

    async _updatePopularCharacters() {
        const popularCharacterManager = db.getPopularCharacterManager();
        await popularCharacterManager.load();
        this.popularCharacters = popularCharacterManager.get("characters");
    }

    getPopularCharacters() {
        return this.popularCharacters;
    }
}

const CacheSingleton = new Cache();

module.exports = CacheSingleton;