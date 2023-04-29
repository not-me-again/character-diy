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
        return this.poeInstances[chatId];
    }

    async newPoeInstance(chatId, authCookie, botType, poeChatId) {
        log.debug("Launching new poeInstance for chat", chatId);

        let poeInstance = new Poe(authCookie, botType, poeChatId);
        await poeInstance.init();

        this.poeInstances[chatId] = poeInstance;
        
        return poeInstance;
    }

    _prunePoeInstances() {
        const currentTime = Date.now();
        for (let [ idx, poeInstance ] of Object.entries(this.poeInstances)) {
            if (((currentTime - poeInstance.lastUsed) > POE_INSTANCE_IDLE_TIME)) {
                log.debug("Clearing idle poeInstance: " + idx.toString());
                delete this.poeInstances[idx];
            }
        }
    }

    //////////////

    _sortPopularCharacters() {
        this.popularCharacters = this.popularCharacters.sort((a, b) => {
            let amc = a?.totalMessageCount;
            if (typeof amc != "number")
                amc = -1;
            let bmc = b?.totalMessageCount;
            if (typeof bmc != "number")
                bmc = -1;
            return amc - bmc;
        });
    }

    _removeDuplicateCharacters() {
        let addedIds = {};
        for (const idx in this.popularCharacters) {
            const char = this.popularCharacters[idx];
            const id = char?.id;
            if (typeof id != "string") {
                this.popularCharacters.splice(idx, 1);
                addedIds[id] = true;
                continue;
            }
            if (addedIds[id])
                this.popularCharacters.splice(idx, 1);
            else
                addedIds[id] = true;
        }
        return Object.keys(addedIds);
    }

    async _updatePopularCharacters() {
        log.debug("Updating popular character list");

        this.popularCharacters = await this.popularCharacterManager.get("characters");
        this._sortPopularCharacters();
        this._removeDuplicateCharacters();

        for (const i in this.popularCharacters) {
            const characterData = this.popularCharacters[i];
            const char = db.getCharacter(characterData.id);
            if (!await char.exists()) {
                delete this.popularCharacters[i];
                log.debug("Removing nonexistent character " + characterData.id);
            }
        }

        await this.popularCharacterManager.set("characters", this.popularCharacters);
        await this.popularCharacterManager.save();
    }

    async removePopularCharacterById(charId) {
        const idx = this.popularCharacters.find(c => c.id == charId);
        if ((typeof idx == "number") && (idx != NaN) && (idx >= 0))
            delete this.popularCharacters[idx];
        else
            return;

        await this.popularCharacterManager.set("characters", this.popularCharacters);
        await this.popularCharacterManager.save();
    }

    async getPopularCharacterById(charId) {
        return this.popularCharacters.find(c => c.id == charId);
    }

    async addToPopularCharacterList(characterData) {
        if (typeof characterData != "object")
            throw new Error("Expected argument #1 to be type object");
            
        this._sortPopularCharacters();

        for (const idx in this.popularCharacters)
            if (this.popularCharacters[idx].id == characterData.id)
                this.popularCharacters.splice(idx, 1); // delete duplicates

        if (this.popularCharacters.length >= 100) {
            const lastChar = this.popularCharacters[this.popularCharacters.length - 1];
            if (lastChar.totalMessageCount > characterData.totalMessageCount)
                return log.warn("Not appending popular character list as new entry does not meet minimum requirements");
        }

        this.popularCharacters.unshift(characterData);

        if (this.popularCharacters.length > 100)
            this.popularCharacters.length = 100;

        await this.popularCharacterManager.set("characters", this.popularCharacters);
    }

    getPopularCharacters() {
        const removedDuplicates = this._removeDuplicateCharacters();
        if ((typeof removedDuplicates == "object") && (removedDuplicates.length >= 1)) {
            log.debug("Removed duplicate characters with IDs: " + removedDuplicates.join(", "));
            this._updatePopularCharacters();
        }

        return this.popularCharacters;
    }
}

const CacheSingleton = new Cache();

module.exports = CacheSingleton;