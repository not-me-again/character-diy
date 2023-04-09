const db = require("../include/db");
const { Poe } = require("../include/poe");
const { Logger } = require("../include/logging");

const POE_INSTANCE_IDLE_TIME = 5 * 60 * 1e3; // 5mins

const log = new Logger("Caching");

class Cache {
    constructor() {
        this.popularCharacterManager = db.getPopularCharacterManager();

        this.poeInstances = {};
        this.popularCharacters = [];

        setInterval(() => this._prunePoeInstances(), 5e3);
        
        setInterval(() => this._updatePopularCharacters(), 600e3); // 10 mins
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
        for (let [ idx, poeInstance ] of Object.entries(this.poeInstances)) {
            if ((!poeInstance.isConnected) || ((currentTime - poeInstance.lastUsed) > POE_INSTANCE_IDLE_TIME)) {
                log.debug("Clearing idle poeInstance: " + idx.toString());
                delete this.poeInstances[idx];
            }
        }
    }

    //////////////

    _sortPopularCharacters() {
        this.popularCharacters = this.popularCharacters.sort((a, b) => a.totalMessageCount - b.totalMessageCount);
    }

    async _updatePopularCharacters() {
        log.debug("Updating popular character list");

        this.popularCharacters = await this.popularCharacterManager.get("characters");
        this._sortPopularCharacters();

        await this.popularCharacterManager.save();
    }

    async getPopularCharacterById(charId) {
        return this.popularCharacters.find(c => c.id == charId);
    }

    async addToPopularCharacterList(characterData) {
        if (typeof characterData != "object")
            throw new Error("Expected argument #1 to be type object");
            
        this._sortPopularCharacters();
        
        const lastChar = this.popularCharacters[this.popularCharacters.length - 1];
        if (lastChar.totalMessageCount > characterData.totalMessageCount)
            return log.warn("Not appending popular character list as new entry does not meet minimum requirements");

        const { popularCharacters } = this;

        popularCharacters.unshift(characterData);

        if (popularCharacters.length > 100)
            popularCharacters.length = 100;

        await this.popularCharacterManager.set("characters", popularCharacters);
    }

    getPopularCharacters() {
        return this.popularCharacters;
    }
}

const CacheSingleton = new Cache();

module.exports = CacheSingleton;