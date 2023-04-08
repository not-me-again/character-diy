const db = require("../include/db");
const { Poe } = require("../include/poe");
const { Logger } = require("../include/logging");

const POE_INSTANCE_IDLE_TIME = 5 * 60 * 1e3; // 5mins

const log = new Logger("Caching");

class Cache {
    constructor() {
        this.poeInstances = {};
        this.popularCharacters = [];

        setInterval(this._prunePoeInstances, 5e3);
        
        setInterval(this._updatePopularCharacters, 7200e3); // 7200e3 = 2 hours
        this._updatePopularCharacters();
    }

    async getPoeInstance(chatId) {
        const instance = this.poeInstances[chatId];

        if (instance && !instance.isConnected)
            await instance.connectSocket();

        return instance;
    }

    async newPoeInstance(chatId, authCookie, botType) {
        log.debug("Launching new poeInstance for chat", chatId);

        let poeInstance = new Poe(authCookie, botType);
        await poeInstance.init();

        this.poeInstances[chatId] = poeInstance;
        
        return poeInstance;
    }

    _prunePoeInstances() {
        const currentTime = Date.now();
        for (let idx in this.poeInstances) {
            const poeInstance = this.poeInstances[idx];
            if ((!poeInstance.isConnected) || ((currentTime - poeInstance.lastUsed) > POE_INSTANCE_IDLE_TIME)) {
                log.debug("Clearing idle poeInstance: " + idx.toString());
                delete this.poeInstances[idx];
            }
        }
    }

    //////////////

    async _updatePopularCharacters() {
        log.debug("Updating popular character list");

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