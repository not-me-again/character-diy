const axios = require("axios");

class BloomChat {
    constructor(api_key) {
        this.options = {
            "max_tokens": 512,
            "stop": [
                "<bot>",
                "<human>",
                "</s>"
            ],
            "top_p": 1,
            "top_k": 40,
            "repetition_penalty": 1,
            "temperature": 0.6,
            "model": "sambanovasystems/BLOOMChat-176B-v1",
            //"safety_model": "gpt-jt-safety-6b-hf",
            "stream_tokens": true,
            "repetitive_penalty": 1
        }
        this.http = axios.create({
            baseURL: "https://api.together.xyz",
            validateStatus: () => true,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36 OPR/98.0.0.0",
                "referer": "https://api.together.xyz/bloom-chat?preview=1",
                "accept": "application/json, text/plain, */*",
                "accept-encoding": "gzip, deflate, br",
                "accept-language": "en-US,en;q=0.9"
            }
        });
        this.api_key = api_key;
    }

    async _get_api_key() {
        const req = await this.http.get("/bloom-chat", { params: { preview: "1" } });
        if (req.status != 200)
            throw new Error("Failed to get api key");

        const headers = req.headers;
        if (typeof headers != "object")
            throw new Error("No headers returned");
        const setCookies = headers["set-cookie"];
        if ((typeof setCookies != "object") || (setCookies.length <= 0))
            throw new Error("Did not receive cookies");
        const sessionCookie = setCookies.find(c => c.startsWith("together.session-token"));
        if (typeof sessionCookie != "string")
            throw new Error("No session token sent");

        this.api_key = sessionCookie.split(";")[0];
        this.http.defaults.headers.cookie = this.api_key;
    }

    async init() {
        if ((typeof this.api_key != "string") || (this.api_key.length <= 0))
            await this._get_api_key();
        this.didInit = true;
    }

    _handleChunk(stream) {
        return new Promise((resolve, reject) => {
            stream.removeAllListeners();
            stream.once("data", d => resolve(Buffer.from(d).toString("utf-8")));
            stream.once("error", err => reject(err));
            stream.once("end", () => resolve("data: [DONE]"));
        });
    }
    
    async *sendMessage(prompt, options) {
        if (!this.didInit)
            await this.init();
        const req = await this.http.post("/inference", {
            ...this.options,
            ...options,
            prompt
        }, { responseType: "stream" });
        if (req.status == 403) {
            await this.init();
            for await (const chunk of this.sendMessage(prompt, options))
                yield chunk;
            return;
        } else if (req.status != 200) {
            throw new Error("Inference failed with status code " + req.status);
        }
        const stream = req.data;
        let str = "";
        if (options?.model?.startsWith("vicuna-")) {
            while (true) {
                const dataChunk = await this._handleChunk(stream);
                if (dataChunk == "data: [DONE]")
                    break;
                if ((!dataChunk.startsWith("{")) || (!dataChunk.endsWith("}")))
                    return undefined;
                const data = JSON.parse(dataChunk);
                if (typeof data != "object")
                    return undefined;
                const { output, status } = data;
                if (typeof output != "object")
                    continue;
                const { choices } = output;
                if (typeof choices != "object")
                    continue;
                const [ finalMessage ] = choices;
                if (typeof finalMessage != "object")
                    continue;
                const { text } = finalMessage;
                if (typeof text != "string")
                    continue;
                yield text;
                if (status == "finished")
                    break;
            }
        } else {
            while (true) {
                try {
                    const rawChunk = await this._handleChunk(stream);
                    if (!rawChunk.startsWith("data: "))
                        continue;
                    const [, messyChunk] = rawChunk.split("data: ");
                    if (typeof messyChunk != "string")
                        continue;
                    const chunk = messyChunk.trim();
                    if (chunk == "[DONE]")
                        break;
                    if ((!chunk.startsWith("{")) || (!chunk.endsWith("}")))
                        continue;
                    const data = JSON.parse(chunk);
                    if (typeof data != "object")
                        continue;
                    const { choices } = data;
                    if (typeof choices != "object")
                        continue;
                    const [ finalMessage ] = choices;
                    if (typeof finalMessage != "object")
                        continue;
                    const { text } = finalMessage;
                    if (typeof text != "string")
                        continue;
                    str += text;
                } finally {}
                yield str;
            }
        }
    }
}

module.exports = BloomChat;