const { IS_DEV } = process.env;
const OAUTH_URL = IS_DEV
    ? //"https://discord.com/api/oauth2/authorize?client_id=1089265249582071899&redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fpawthorize&response_type=code&scope=identify%20email%20guilds.join"
    "https://discord.com/api/oauth2/authorize?client_id=1089265249582071899&redirect_uri=http%3A%2F%2F192.168.20.21%3A8080%2Fpawthorize&response_type=code&scope=identify%20email%20guilds.join"
    : "https://discord.com/api/oauth2/authorize?client_id=1089265249582071899&redirect_uri=https%3A%2F%2Fk1.chat%2Fpawthorize&response_type=code&scope=identify%20email%20guilds.join";

const { DISCORD_BOT_TOKEN } = process.env;
const { DISCORD_SERVER_ID } = require("../../../config.json");

const axios = require("axios");
const qs = require("qs");

const { Logger, colors } = require("../logging");
const log = new Logger("DiscordOAuth");

async function getIDFromOAuth(temp_code) {
    try {
        const oresponse = await axios.post("https://discord.com/api/v10/oauth2/token", qs.stringify({
            client_id: process.env.DISCORD_OAUTH_APP_ID,
            client_secret: process.env.DISCORD_OAUTH_APP_SECRET,
            grant_type: "authorization_code",
            code: temp_code,
            redirect_uri: IS_DEV ? "http://192.168.20.21:8080/pawthorize" : "https://k1.chat/pawthorize",
            validateStatus: () => { return true; }
        }));

        if (!oresponse.data) {
            console.log(oresponse);
            throw new Error("No response data!");
        }

        const accessToken = oresponse?.data?.access_token;
        if (!accessToken) {
            console.log(oresponse.data);
            throw new Error("No accessToken!");
        }

        const uresponse = await axios.get("https://discord.com/api/v10/users/@me", {
            headers: { authorization: "Bearer " + accessToken },
            validateStatus: () => { return true; }
        });

        if (!uresponse.data) {
            console.log(uresponse);
            throw new Error("No user response data!");
        }
            
        return { userData: uresponse.data, accessToken };
    } catch(err) {
        console.error(err);
        return undefined;
    }
}

async function joinUserToDiscordWithCode(accessToken, userId) {
    try {
        await axios("https://discord.com/api/v10/guilds/" + DISCORD_SERVER_ID + "/members/" + userId, {
            data: {
                access_token: accessToken
            },
            headers: {
                authorization: "Bot " + DISCORD_BOT_TOKEN
            },
            method: "PUT"
        });
    } catch(err) {
        console.error("guild add failed:", err);
    }
}

module.exports = { OAUTH_URL, getIDFromOAuth, joinUserToDiscordWithCode }