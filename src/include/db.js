const { MAX_CACHE_LENGTH, MAX_CHAT_HISTORY_LENGTH } = require("../../config.json");
const CHARACTER_PROPERTIES = [
    [ "views", 0 ],
    [ "totalMessageCount", 0 ],
    [ "monthlyActiveUsers", 0 ],
    [ "backend", "claude" ],
    [ "startMessage", "" ],
    [ "personalityPrompt", "" ],
    [ "blurb", "" ],
    [ "pronouns", { personal: "they", intensive: "them", possessive: "their" } ],
    [ "exampleConvo", "" ],
    [ "id", "" ],
    [ "authorId", "" ],
    [ "isPublic", false ],
    [ "avatarURL", "" ],
    [ "displayName", "" ],
    [ "tags", [] ],
    [ "createdAt", 0 ],
    [ "updatedAt", 0 ]
];
const POPULAR_CHARACTERS_PROPERTIES = [
    [ "updatedAt", 0 ],
    [ "characters", [] ]
];
const USER_PROPERTIES = [
    [ "createdAt", 0 ],
    [ "updatedAt", 0 ],
    [ "onboardingCompleted", false ],
    [ "hasCompletedSignup", false ],
    [ "birthdate", 0 ],
    [ "discordId", "" ],
    [ "membershipPlan", 0 ],
    /*  * 0 = basic/free tier
        * 1 = patron/donator
        * 3 = ???
        * todo */
    [ "id", "" ],
    [ "moderationActions", [] ], // not used yet
    [ "accountStanding", 5 ], // banned; 1-5 = good-bad
    [ "email", "" ], // user email (got from discord login)
    [ "displayName", "" ], // username from discord
    [ "username", "" ],
    [ "customChatContext", "" ],
    [ "profilePictureURL", "" ], // profile pic url
    [ "characters", [] ], // list of user-created character IDs
    [ "apiKeys", [] ], // list of active session IDs
    [ "chats", [] ] // list of chat ids
];
const CHAT_PROPERTIES = [
    [ "id", "" ],
    [ "ownerId", "" ],
    [ "messages", [] ],
    [ "messageCount", 0 ],
    [ "activeCharacterId", "" ],
    [ "poeCookie", "" ],
    [ "poeChatId", "" ],
    [ "isPublic", false ],
    [ "name", "" ],
    [ "thumbnailURL", "" ],
    [ "createdAt", 0 ],
    [ "updatedAt", 0 ],
    [ "lastMessageAt", 0 ],
    [ "isFilterEnabled", true ],
    [ "cachedCharacterData", {} ]
];
const API_KEY_PROPERTIES = [
    [ "id", "" ],
    [ "userId", "" ],
    [ "expiresAt", -1 ],
    [ "createdAt", 0 ],
    [ "updatedAt", 0 ]
];
const EMAIL_PROPERTIES = [
    [ "id", "" ],
    [ "ownerId", "" ]
];

const s3Root = process.env.AWS_S3_ROOT;
const s3UserAgent = process.env.AWS_S3_ACCESS_KEY;

const generateId = require("./helpers/generateId");
const { Logger, colors } = require("../include/logging");

const log = new Logger("Database");

const { v4: uuid } = require("uuid");
const axios = require("axios");

async function writeJSONToBucketPath(url, json) {
    log.debug(`Updating saved bucket object at ${url}`);

    await axios({
        method: "PUT",
        headers: {
            "User-Agent": s3UserAgent,
            "Content-Type": "application/json"
        },
        url: `${s3Root}/${url}`,
        data: json
    });
}

async function deleteBucketPath(url) {
    log.debug(`Deleting bucket object at ${url}`);

    await axios({
        method: "DELETE",
        headers: {
            "User-Agent": s3UserAgent
        },
        url: `${s3Root}/${url}`
    });
}

async function getJSONFromBucketPath(url) {
    log.debug(`Retrieving saved bucket object at ${url}`);

    const req = await axios({
        method: "GET",
        headers: {
            "User-Agent": s3UserAgent
        },
        url: `${s3Root}/${url}`
    }).catch((err) => {
        if (err.response.status == 404)
            return err.response;
        else
            throw err;
    });
    return req?.data;
}

class BaseDB {
    constructor(folderId, objectId, properties) {
        this.folderURL = `${folderId}/${objectId}.json`;
        this.id = objectId;
        this.object = {};
        this.properties = properties;
        this.isLoaded = false;
        this.isSaving = false;
        this.isDeleted = false;
        this.applyDefaults();
    }

    applyDefaults() {
        for (let def of this.properties) {
            const [ prop, val ] = def;
            if (this.object[prop] === undefined)
                this.object[prop] = val;
        }
    }

    json() {
        return JSON.stringify(this.getObject());
    }

    getObject() {
        return this.object;
    }

    async exists() {
        try {
            const id = await this.get("id");
            return typeof id == "string" ? ((id.length >= 1) && (id != "undefined")) : false;
        } catch(err) {
            return false;
        }
    }

    async save() {
        if (this.isSaving)
            return;

        if (!this.isLoaded)
            await this.load();

        this.isSaving = true;
        this.object.id = this.id;
        await writeJSONToBucketPath(this.folderURL, this.object);
        this.isSaving = false;
    }

    async delete() {
        await deleteBucketPath(this.folderURL);
        this.isDeleted = true;
    }

    async load() {
        const data = await getJSONFromBucketPath(this.folderURL);
        if (typeof data == "object")
            this.object = data;
        else
            this.applyDefaults();
        this.isLoaded = true;
    }

    precheck(property) {
        if (!this.properties.find(p => p[0] == property))
            throw new Error("Unknown property \"" + property + "\"");
    }

    getId() {
        return this.id;
    }

    async set(id, value) {
        if (this.isDeleted)
            throw new Error("Cannot access a deleted object");

        if (typeof id == "string") {
            this.precheck(id);
            this.object[id] = value;
        } else if (typeof id == "object")
            for (let entry of Object.entries(id)) {
                this.precheck(entry[0]);
                this.object[entry[0]] = entry[1];
            }
    }

    async get(id) {
        if (this.isDeleted)
            throw new Error("Cannot access a deleted object");

        if (!this.isLoaded)
            await this.load();

        this.precheck(id);
        return this.object[id];
    }
}

class Character extends BaseDB {
    constructor(id) {
        super("characters", id, CHARACTER_PROPERTIES);
    }
}

class PopularCharacters extends BaseDB {
    constructor() {
        super("characters", "_popular", POPULAR_CHARACTERS_PROPERTIES);
    }
}

class User extends BaseDB {
    constructor(id) {
        super("users", id, USER_PROPERTIES);
    }

    async newChat() {
        const chatId = generateId();
        const chat = new Chat(chatId);
        let chatList = await this.get("chats");
        if (typeof chatList != "object")
            chatList = [];
        chatList.push(chatId);
        await this.set("chats", chatList);
        chat.save();
        return chat;
    }

    async getOrCreateAPIKey() {
        let apiKeys = await this.get("apiKeys");
        if (typeof apiKeys != "object" || (apiKeys.length <= 0)) {
            const keyObj = new APIKey(uuid());

            apiKeys = [ keyObj.id ];

            await keyObj.set("userId", this.id);
            await keyObj.save();
        }
        await this.set("apiKeys", apiKeys);
        await this.save();

        return apiKeys[0];
    }
}

class Chat extends BaseDB {
    constructor(id) {
        super("chats", id, CHAT_PROPERTIES);
        this.maxLength = MAX_CHAT_HISTORY_LENGTH;
    }

    async getCharacterData() {
        return await this.get("cachedCharacterData");
    }

    async getMessages(count) {
        if ((typeof count != "number") || (count > this.maxLength))
            count = this.maxLength;

        const messages = await this.get("messages");
        return messages.slice(0, count);
    }

    async clearPastMessages() {
        return await this.set("messages", []);
    }

    /*
    {
        id: "<id of message>",
        poeId: "<id of message on poe.com>"
        authorType: "ai" or "user",
        authorId: "<user id or char id>",
        timestamp: "Date.now-ish stamp",
        isFiltered: <bool>,
        text: <message text string>,
        moods: []
    }
    */
    async addMessages(messagesToAdd, doClearHistory) {
        if ((typeof messagesToAdd != "object") || (messagesToAdd.length <= 0))
            throw new Error("Expected argument #1 to be object");
        
        let messages = doClearHistory ? [] : (await this.get("messages"));
        if (typeof messages != "object")
            messages = [];

        for (let messageData of messagesToAdd) {
            if (!messageData)
                throw new Error("Expected messageData");
            
            if (typeof messageData.authorType != "string")
                throw new Error("Missing: messageObject.authorType");
            const isBotMessage = messageData.authorType == "ai";

            if (typeof messageData.id != "string")
                throw new Error("Missing: messageObject.id");
            if (typeof messageData.poeId != "number")
                throw new Error("Missing: messageObject.poeId");
            if (typeof messageData.authorId != "string")
                throw new Error("Missing: messageObject.authorId");
            if (typeof messageData.timestamp != "number")
                throw new Error("Missing: messageObject.timestamp");
            if (typeof messageData.text != "string")
                throw new Error("Missing: messageObject.text");
            if (isBotMessage) {
                if (typeof messageData.moods != "object") {
                    throw new Error("Missing: messageObject.moods");
                }
            } else {
                messageData.moods = [];
            }

            messages.unshift(messageData);
        }

        if (messages.length > this.maxLength)
            messages.length = this.maxLength;

        await this.set({
            messages,
            messageCount: messages.length
        });
        await this.save();
    }
}

class APIKey extends BaseDB {
    constructor(id) {
        super("api-keys", id, API_KEY_PROPERTIES);
    }

    async getUser() {
        const uid = await this.get("userId");
        if (uid)
            return new User(uid);
    }
}

class Email extends BaseDB {
    constructor(id) {
        super("emails", id, EMAIL_PROPERTIES);
    }

    async getUser() {
        const uid = await this.get("ownerId");
        if (uid)
            return new User(uid);
    }
}

class DatabaseManager {
    constructor() {
        this.characters = [];
        this.users = [];
        this.emails = [];
        this.apikeys = [];
        this.chats = [];
        this.popularCharacterManager = new PopularCharacters();
    }

    _returnOrInstantiate(type, id) {
        const parentArray = this[type];
        let obj = parentArray.find(o => o?.id == id);
        
        if (!obj) {
            switch (type) {
                case "users":
                    obj = new User(id);
                    break;
                case "apikeys":
                    obj = new APIKey(id);
                    break;
                case "chats":
                    obj = new Chat(id);
                    break;
                case "characters":
                    obj = new Character(id);
                    break;
                case "emails":
                    obj = new Email(id);
                    break;
                default:
                    throw new Error("Can't instantiate unknown type \"" + type + "\"");
            }
            // automagically insert this at the top of the stack, then trim the bottom out
            parentArray.unshift(obj);
            // yes this is really how you do it in js
            if (parentArray.length > MAX_CACHE_LENGTH)
                parentArray.length = MAX_CACHE_LENGTH;
        }

        return obj;
    }

    getPopularCharacterManager() {
        return this.popularCharacterManager;
    }

    getUniqueId() {
        return generateId();
    }

    getUser(id) {
        return this._returnOrInstantiate("users", id);
    }

    getAPIKey(id) {
        return this._returnOrInstantiate("apikeys", id);
    }

    getChat(id) {
        return this._returnOrInstantiate("chats", id);
    }

    getCharacter(id) {
        return this._returnOrInstantiate("characters", id);
    }

    getEmail(email) {
        const id = email.replace(/(\@|\.|\-|\~|\=|\+)/gmi, "_").toString();
        return this._returnOrInstantiate("emails", id);
    }
}

const DBManagerSingleton = new DatabaseManager();

/*
const cm =DBManagerSingleton.getPopularCharacterManager()
cm.set("characters", []);
t[2] =553//*/

module.exports = DBManagerSingleton;