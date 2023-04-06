const axios = require("axios");
const WebSocket = require("ws");
const EventEmitter = require("events");

const base64 = require("../helpers/base64");
const DEFAULTS = require("./config");
const { Logger, colors } = require("../logging");
const { isBigInt64Array } = require("util/types");

const log = new Logger("Poe");

const BOT_TYPES = {
    "claude": {
        NAME: "claude",
        CODENAME: "a2"
    },
    "claude+": {
        NAME: "claude+",
        CODENAME: "a2_2"
    },
    "gpt-3.5-t-ml": {
        NAME: "sage",
        CODENAME: "capybara"
    },
    "gpt-3.5-t": {
        NAME: "chatgpt",
        CODENAME: "chinchilla"
    },
    "gpt-4": {
        NAME: "gpt-4",
        CODENAME: "beaver"
    },
    "gpt-3": {
        NAME: "dragonfly",
        CODENAME: "nutria"
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function httpRequest(...opts) {
    let result;
    let lastError;

    for (let retries = 0; retries < DEFAULTS.HTTP_MAX_RETRIES; retries++) {
        try {
            lastError = null;
            result = await axios(...opts);
            break;
        } catch(err) {
            lastError = err;
        }
    }

    if (lastError)
        throw lastError;

    return result;
}

class PoeAccount {
    constructor() {
        this.email = `${base64.encodeSafe(Math.random().toString())}@k1.gay`;
        this.headers = {
            ...DEFAULTS.HEADERS,
            origin: "https://poe.com",
            referer: "https://poe.com/login"
        }
        this.badVerificationCodes = [];
    }

    async init() {
        const init_req = await httpRequest({
            url: "https://poe.com/",
            headers: this.headers
        });

        const cookies = init_req.headers["set-cookie"];
        if ((typeof cookies != "object") || (cookies.length <= 0))
            throw new Error("Auth cookie not received");

        const cookie = cookies[0];
        const splitCookie = cookie.split(";");
        const authCookie = splitCookie[0].toString();
        if (!authCookie.startsWith("p-b="))
            throw new Error("Failed to get auth cookie");

        this.headers["cookie"] = authCookie;

        const settings_req = await httpRequest({
            url: "https://poe.com/api/settings",
            headers: this.headers
        });

        const settings = settings_req?.data;
        if (typeof settings != "object")
            throw new Error("Init failed");

        const { formkey, tchannelData } = settings;
        if (typeof formkey != "string")
            throw new Error("No form key sent");

        if (typeof tchannelData != "object")
            throw new Error("No channel data sent");

        const channelName = tchannelData.channel;
        if (typeof channelName != "string")
            throw new Error("Invalid channel name sent");
        
        this.headers["poe-formkey"] = formkey;
        this.headers["poe-tchannel"] = channelName;

        this.startTime = Date.now();

        return this;
    }

    async sendVerificationEmail() {
        const verify_req = await httpRequest({
            url: "https://poe.com/api/gql_POST",
            headers: this.headers,
            data: {
                "queryName": "MainSignupLoginSection_sendVerificationCodeMutation_Mutation",
                "variables": {
                    "emailAddress": this.email,
                    "phoneNumber": null
                },
                "query": DEFAULTS.GRAPHQL_QUERIES.SEND_VERIFICATION_EMAIL
            },
            method: "POST"
        });

        if (verify_req?.data?.data?.sendVerificationCode?.status != "user_with_confirmed_email_not_found")
            throw new Error("Failed to send verification email");
    }

    async waitForVerificationCode() {
        for (;;) {
            const mailbox_req = await httpRequest({
                url: "https://www.1secmail.com/api/v1/",
                params: {
                    action: "getMessages",
                    login: "k1jaxv0wv2d4wjd",
                    domain: "qiott.com"
                },
                method: "GET"
            });

            const messages = mailbox_req?.data;
            if (typeof messages != "object")
                throw new Error("Failed to fetch mailbox messages");

            for (let i = messages.length; i > 0; i--) {
                const { id, subject, from: sender } = messages[i - 1];
                if ((!subject.match(/your verification code/gmi)) || (sender.indexOf("bounces+") < 0))
                    continue;
                const message_req = await httpRequest({
                    url: "https://www.1secmail.com/api/v1/",
                    params: {
                        action: "readMessage",
                        login: "k1jaxv0wv2d4wjd",
                        domain: "qiott.com",
                        id
                    },
                    method: "GET"
                });

                const message = message_req?.data;
                if (typeof message != "object")
                    throw new Error("Error reading message");

                const date = message.date;
                if ((typeof date != "string"))
                    continue;

                //if ((this.startTime - new Date(`${date} UTC+2`)) > 0)
                //    continue;

                const body = message.body;
                if ((typeof body != "string") || (body.length <= 0))
                    continue;

                const verificationCode = body.match(/(?<=\>)\d{6}(?=\<)/gm).toString();
                if (Number(verificationCode) == NaN)
                    continue;

                if (this.badVerificationCodes.find(c => c == verificationCode))
                    continue;

                return verificationCode;
            }

            await sleep(DEFAULTS.MAILBOX_CHECK_DELAY);
        }
    }

    async submitVerificationCodeAndGetAuthCookie(verificationCode) {
        const submit_req = await httpRequest({
            url: "https://poe.com/api/gql_POST",
            headers: this.headers,
            data: {
                "queryName": "SignupOrLoginWithCodeSection_signupWithVerificationCodeMutation_Mutation",
                "variables": {
                    "emailAddress": this.email,
                    "phoneNumber": null,
                    "verificationCode": verificationCode.toString()
                },
                "query": DEFAULTS.GRAPHQL_QUERIES.SUBMIT_VERIFICATION_CODE
            },
            method: "POST"
        });

        const verificationStatus = submit_req?.data?.data?.signupWithVerificationCode?.status;
        if (typeof verificationStatus != "string")
            throw new Error("Failed to verify");

        if (verificationStatus == "invalid_verification_code") {
            this.badVerificationCodes.push(verificationCode);
            return await this.submitVerificationCodeAndGetAuthCookie(await this.waitForVerificationCode());
        }

        const headers = submit_req?.headers;
        if (typeof headers != "object")
            throw new Error("how");

        const cookies = submit_req.headers["set-cookie"];
        if ((typeof cookies != "object") || (cookies.length <= 0))
            throw new Error("Failed to verify with given code");

        const cookie = cookies[0];
        const splitCookie = cookie.split(";");
        const authCookie = splitCookie[0].toString();
        if (!authCookie.startsWith("p-b="))
            throw new Error("Failed to retrieve auth cookie");

        await httpRequest({
            url: "https://poe.com/",
            headers: this.headers,
            method: "GET"
        });

        return authCookie;
    }
}

class Poe {
    constructor(authCookie, botType) {
        if (typeof authCookie != "string")
            throw new Error("Argument #1 must be authCookie: string");

        if (typeof botType == "string")
            botType = BOT_TYPES[botType.toLowerCase()];

        if ((typeof botType != "object") || (typeof botType.CODENAME != "string") || (typeof botType.ID != "string"))
            botType = BOT_TYPES.claude;
        
        this.botType = botType;

        log.info(`BotType: ${botType.NAME}`);

        this.headers = {
            ...DEFAULTS.HEADERS,
            cookie: authCookie,
        }
        this.messageHistory = [];
        this.socketServer = "tch596472.tch.quora.com";
    }

    async getChannelSettings() {
        const req = await httpRequest({
            url: "https://poe.com/api/settings",
            headers: this.headers
        });
        const { tchannelData: channelData } = req.data;

        this.channelData = channelData;

        return { formKey: req.data.formkey, channelData };
    }

    connectSocket() {
        const channelData = this.channelData;
        if (!channelData)
            throw new Error("Channel not yet initialized");

        return new Promise((resolve, reject) => {
            const socket = new WebSocket(`wss://${this.socketServer}/up/${channelData.boxName}/updates?min_seq=${channelData.minSeq}&channel=${channelData.channel}&hash=${channelData.channelHash}`);
            
            let isResolved = false;
            socket.on("error", (err) => {
                this.isConnected = false;
                log.error("Websocket errror!\n", err);
                if (!isResolved) {
                    isResolved = true;
                    reject("Websocket errored");
                }
            });
            socket.on("open", () => {
                this.isConnected = true;
                log.info("Websocket connected");
                if (!isResolved) {
                    isResolved = true;
                    resolve(true);
                }
            });
            socket.on("close", () => {
                this.isConnected = false;
                if (!isResolved) {
                    isResolved = true;
                    reject("Websocket closed unexpectedly");
                }
            });

            this.socket = socket;
        });
    }

    async getBotId() {
        let botName = this.botType.NAME;
        if (botName == "claude")
            botName += "-instant";

        const info_req = await httpRequest({
            url: `https://poe.com/_next/data/${this.nextId}/${encodeURIComponent(botName)}.json`,
            headers: this.headers,
            method: "GET"
        });
        if (typeof info_req?.data != "object")
            throw new Error("Failed to get bot info for: " + this.botType.NAME);

        const botId = info_req.data?.pageProps?.payload?.chatOfBotDisplayName?.id;
        if ((typeof botId != "string") || (botId.length <= 0))
            throw new Error("Failed to get bot id for: " + this.botType.NAME);

        return botId;
    }

    async init() {
        const home_req = await httpRequest({
            url: "https://poe.com/",
            headers: this.headers,
            method: "GET"
        });
        if (typeof home_req?.data != "string")
            throw new Error("Failed to send home request");
        
        const nextId = home_req?.data?.match(/(?<=\"buildid\"\:\s*\").+?(?=\")/si)?.toString();
        if ((typeof nextId != "string") || (nextId.length <= 0))
            throw new Error("Failed to get next.js id");

        this.nextId = nextId;
        log.info(`NextId: ${nextId}`);
        
        const { formKey, channelData } = await this.getChannelSettings();
        log.info(`FormKey: ${formKey}`);
        log.info(`ChannelInfo: ${JSON.stringify(channelData, undefined, 2)}`);

        this.headers = {
            ...this.headers,
            "poe-formkey": formKey,
            "poe-tchannel": channelData.channel
        }

        const botId = await this.getBotId();
        this.botId = botId;
        log.info(`BotId: ${botId}`);

        this.chatId = Number(base64.decode(botId).match(/\d+$/));
        log.info(`Chat id: ${this.chatId}`);

        // send subscribe gql
        const subscribe_req = await httpRequest({
            url: "https://poe.com/api/gql_POST",
            headers: this.headers,
            data: {
                "queryName": "subscriptionsMutation",
                "variables": {
                    "subscriptions": [
                        {
                            "subscriptionName": "messageAdded",
                            "query": DEFAULTS.GRAPHQL_QUERIES.SUBSCRIBE.MESSAGE_ADDED
                        }
                    ]
                },
                "query": DEFAULTS.GRAPHQL_QUERIES.SUBSCRIBE.BASE
            },
            method: "POST"
        });

        if (!(subscribe_req?.data?.data?.autoSubscribe?.viewer?.id)) {
            log.error("Failed send subscribe request!\n", subscribe_req?.data);
            throw new Error("Failed to send subscribe request");
        }

        // connect to websocket
        await this.connectSocket();

        return this;
    }

    async deleteMessage(...ids) {
        log.info("Deleting messages with ids " + ids.join(", "));

        const delete_req = await httpRequest({
            url: "https://poe.com/api/gql_POST",
            headers: this.headers,
            data: {
                "queryName": "MessageDeleteConfirmationModal_deleteMessageMutation_Mutation",
                "variables": {
                    "connections": [
                        `client:${this.botId}:__ChatMessagesView_chat_messagesConnection_connection`
                    ],
                    "messageIds": ids
                },
                "query": DEFAULTS.GRAPHQL_QUERIES.DELETE_MESSAGE
            },
            method: "POST"
        });
        
        const deletedMessages = delete_req?.data?.data?.messagesDelete?.edgeIds;
        if ((typeof deletedMessages != "object") || (deletedMessages.length <= 0)) {
            log.error("Failed to delete message!\n", delete_req?.data);

            return false;
        }

        return true;
    }

    async resetChat() {
        log.info("Resetting chat context");

        const reset_req = await httpRequest({
            url: "https://poe.com/api/gql_POST",
            headers: this.headers,
            data: {
                "queryName": "chatHelpers_addMessageBreakEdgeMutation_Mutation",
                "variables": {
                    chatId: this.chatId,
                    "connections": [
                        `client:${this.botId}:__ChatMessagesView_chat_messagesConnection_connection`
                    ]
                },
                "query": DEFAULTS.GRAPHQL_QUERIES.CLEAR_CHAT
            },
            method: "POST"
        });
        
        if (!(reset_req?.data?.data?.messageBreakEdgeCreate)) {
            log.error("Failed to reset chat context!\n", reset_req?.data);

            throw new Error("Failed to reset chat context");
        }

        return true;
    }

    sendMessage(content, retryMessageId, ignoreOOC) {
        if (!this.isConnected)
            throw new Error("Websocket not connected!");

        let dataEvent = new EventEmitter();

        if (this.timeoutDaemon)
            clearTimeout(this.timeoutDaemon);

        if (retryMessageId)
            log.warn("Retrying message");

        if (this.isReplying) {
            dataEvent.emit("error", { message: "Already replying!", data: null });
            return;
        }
    
        let replyStart = Date.now();
        this.isReplying = true;
        this.timeoutDaemon = setTimeout(() => {
            if (!this.isReplying)
                return;
            this.isReplying = false;

            this.socket.removeEventListener("message");
            this.socket.removeEventListener("error");
            this.socket.removeEventListener("unexpected-response");

            return dataEvent.emit("error", { message: "Timed out", data: { delta: Date.now() - replyStart } });
        }, DEFAULTS.INFERENCE_TIMEOUT);
        
        let selfMessage = {};

        this.socket.once("unexpected-response", err => {
            this.isReplying = false;

            this.socket.removeEventListener("error");
            this.socket.removeEventListener("message");

            log.error("Failed to send message!\n", err);
            return dataEvent.emit("error", { message: "Failed to send message", data: err });
        });

        this.socket.once("error", err => {
            this.isReplying = false;

            this.socket.removeEventListener("unexpected-response");
            this.socket.removeEventListener("message");

            log.error("Failed to send message!\n", err);
            return dataEvent.emit("error", { message: "Failed to send message", data: err });
        });
    
        let currentMessageId;
        this.socket.on("message", data => {
            try {
                const parsed = JSON.parse(data);
                const messages = parsed.messages;

                if ((typeof messages != "object") || messages.length <= 0)
                    return;

                for (let rawMessage of messages) {
                    const parsedMessage = JSON.parse(rawMessage);
                    const { message_type: messageType, payload } = parsedMessage;

                    // BEGIN GUARD CLAUSES //
                    if (messageType != "subscriptionUpdate")
                        continue;

                    const { subscription_name: subscriptionType, data } = payload;

                    if (subscriptionType != "messageAdded")
                        continue;
                        
                    let messageData = data.messageAdded;

                    if (typeof messageData != "object")
                        continue;

                    let isFinal = messageData.state == "complete";

                    const messageId = messageData.messageId;

                    if (messageId == retryMessageId)
                        continue;

                    if (!currentMessageId)
                        currentMessageId = messageId;
                    else if (messageId != currentMessageId)
                        continue;
                    // END GUARD CLAUSES //
                    
                    let messageText = messageData.text;
                    if ((typeof messageText != "string") || (messageText.length <= 0))
                        continue;

                    // BEGIN MOOD EVALUATION //
                    let characterMoods = [];
                    const moodMatches = Array.from(messageText.matchAll(DEFAULTS.MOOD_CAPTURE_REGEX));
                    if (moodMatches.length >= 1)
                        for (let match of moodMatches)
                            if (match.length >= 3)
                                for (let mood of match[2].split(/,\s*/))
                                    characterMoods.push(mood.trim());
                    // END MOOD EVALUATION //
                    
                    // BEGIN MESSAGEDATA MODIFICATIONS //
                    messageData.text = messageText.replace(DEFAULTS.MOOD_CAPTURE_REGEX, "")/*.replace(/[ ]?(\*)[ ]?/, "$1")*/;
                    if (!isFinal)
                        messageData.text = messageData.text.replace(/(\(\s*\#mood\=)([a-zA-Z0-9\- ,]*)$/mi, "");
                    
                    messageData.linkifiedText = messageText.replace(DEFAULTS.MOOD_CAPTURE_REGEX, "")/*.replace(/[ ]?(\*)[ ]?/, "$1")*/;
                    if (!isFinal)
                        messageData.linkifiedText = messageData.linkifiedText.replace(/(\(\s*\#mood\=)([a-zA-Z0-9\- ,]*)$/mi, "");

                    messageData.currentMoods = characterMoods;
                    messageData.author = this.botType.NAME;
                    // END MESSAGEDATA MODIFICATIONS //

                    // BEGIN JAILBREAK STUFF //
                    const lowercaseMessage = messageData.text.toLowerCase();
                    const isMessageBreakingCharacter = lowercaseMessage.includes("anthropic, pbc")
                        || lowercaseMessage.includes("constitutional aI")
                        || lowercaseMessage.includes("ai assistant")
                        || lowercaseMessage.includes("chatgpt");

                    messageData.isBreakingCharacter = isMessageBreakingCharacter;
                    
                    if (!ignoreOOC && isFinal && ((characterMoods.length <= 0) || (characterMoods.find(m => m == "neutral") || isMessageBreakingCharacter))) {
                        this.isReplying = false;

                        clearTimeout(this.timeoutDaemon);
                        this.socket.removeEventListener("error");
                        this.socket.removeEventListener("unexpected-response");
                        this.socket.removeAllListeners("message");

                        if (!retryMessageId) {
                            return this.deleteMessage(messageData.messageId, selfMessage.messageId).then(() =>
                                dataEvent.emit("start-over",
                                    this.sendMessage(content, messageData.messageId)
                                )
                            ).catch(err => 
                                dataEvent.emit("error", { message: err.toString(), data: err })
                            );
                        } else {
                            return this.deleteMessage(messageData.messageId, selfMessage.messageId).finally(() => 
                                dataEvent.emit("error", { message: "No character reply", data: messageData })
                            );
                        }
                    }
                    // END JAILBREAK STUFF //

                    //const responseData = { selfMessage, aiMessage: messageData }

                    dataEvent.emit("messageUpdated", messageData);
                    
                    if (isFinal) {
                        this.isReplying = false;

                        clearTimeout(this.timeoutDaemon);
                        this.socket.removeEventListener("message");
                        this.socket.removeEventListener("unexpected-response");
                        this.socket.removeEventListener("error");

                        dataEvent.emit("messageComplete", messageData);
                    }
                    
                    break;
                }
            } catch(err) {
                this.isReplying = false;

                console.warn("Got:", Buffer.from(data).toString("utf-8"));

                clearTimeout(this.timeoutDaemon);
                this.socket.removeEventListener("error");
                this.socket.removeEventListener("unexpected-response");
                this.socket.removeAllListeners("message");

                dataEvent.emit("error", { message: err.toString(), data: err });
            }
        });
        
        try {
            let codename = this.botType.CODENAME;
            if ((codename == "a2_2") || (codename == "beaver"))
                log.warn("Paid model detected");

            if (retryMessageId)
                content = `Stay in character! And remember to add your mood!\n\n${content}`;

            httpRequest({
                url: "https://poe.com/api/gql_POST",
                headers: this.headers,
                data: {
                    "queryName": "chatHelpers_sendMessageMutation_Mutation",
                    "variables": {
                        "chatId": this.chatId,
                        "bot": codename,
                        "query": content,
                        "source": null,
                        "withChatBreak": false
                    },
                    "query": DEFAULTS.GRAPHQL_QUERIES.SEND_MESSAGE
                },
                method: "POST"
            }).then(req => {
                selfMessage = req?.data?.data?.messageEdgeCreate?.message?.node;
                
                if (typeof selfMessage != "object") {
                    this.isReplying = false;

                    this.socket.removeEventListener("message");
                    this.socket.removeEventListener("error");
                    this.socket.removeEventListener("unexpected-response");
                    clearTimeout(this.timeoutDaemon);

                    log.error("Failed to send message!\n", req.data);

                    dataEvent.emit("error", { message: "Failed to send message", data: req.data });
                } else {
                    dataEvent.emit("selfMessage", selfMessage);
                }
            }).catch(err => {
                this.isReplying = false;

                clearTimeout(this.timeoutDaemon);
                this.socket.removeEventListener("message");
                this.socket.removeEventListener("error");
                this.socket.removeEventListener("unexpected-response");

                dataEvent.emit("error", { message: err.toString(), data: err });
            });
        } catch(err) {
            this.isReplying = false;

            this.socket.removeEventListener("message");
            this.socket.removeEventListener("error");
            this.socket.removeEventListener("unexpected-response");
            clearTimeout(this.timeoutDaemon);

            dataEvent.emit("error", { message: err.toString(), data: err });
        }

        return dataEvent;
    }
}

module.exports = { Poe, PoeAccount, BOT_TYPES };