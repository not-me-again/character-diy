const axios = require("axios");

class VercelPlayground {
    constructor() {
        this.botPreventionToken = "";
        this.http = axios.create({
            baseURL: "https://play.vercel.ai",
            headers: {
                "Content-Type": "application/json",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36 OPR/98.0.0.0",
                "referer": "https://play.vercel.ai/",
                "origin": "https://play.vercel.ai",
                "accept-encoding": "gzip, deflate, br",
                "accept-language": "en-US,en;q=0.9",
                "accept": "*/*",
                "cookie": `user_session=${process.env.VERCEL_SESSION}`
            },
            validateStatus: () => true
        });
        this.lastQuery = 0;
        this.models = {
            "claude-instant-v1": "anthropic:claude-instant-v1",
            "claude-v1": "anthropic:claude-v1",
            "alpaca-7b": "replicate:alpaca-7b",
            "stablelm-tuned-alpha-7b": "replicate:stablelm-tuned-alpha-7b",
            "bloom": "huggingface:bloom",
            "bloomz": "huggingface:bloomz",
            "flan-t5-xxl": "huggingface:flan-t5-xxl",
            "flan-ul2": "huggingface:flan-ul2",
            "gpt-neox-20b": "huggingface:gpt-neox-20b",
            "oasst-sft-4-pythia-12b-epoch-3.5": "huggingface:oasst-sft-4-pythia-12b-epoch-3.5",
            "santacoder": "huggingface:santacoder",
            "command-medium-nightly": "cohere:command-medium-nightly",
            "command-xlarge-nightly": "cohere:command-xlarge-nightly",
            "gpt-4": "openai:gpt-4",
            "gpt-3.5-turbo": "openai:gpt-3.5-turbo",
            "text-ada-001": "openai:text-ada-001",
            "text-babbage-001": "openai:text-babbage-001",
            "text-curie-001": "openai:text-curie-001",
            "text-davinci-002": "openai:text-davinci-002",
            "text-davinci-003": "openai:text-davinci-003"
        };
    }
    
    getModels() {
        return this.models;
    }
    
    async login() {
        const req = await this.http.get("/");
        console.log(req);
    }
    
    async query(options) {
        if ((Date.now() - this.lastQuery) > 10e3) {
            await this.updateToken();
            this.lastQuery = Date.now();
        }
        this.http.defaults.headers["custom-encoding"] = this.botPreventionToken;
        return await this.http.post("/api/generate", options, { responseType: "stream" });
    }
    
    async updateToken() {
        try {
            let response = await this.http.get("/openai.jpeg")
              , data = JSON.parse(Buffer.from(response.data, "base64").toString("utf-8"))
              , ret = eval("(".concat(data.c, ")(data.a)"));
            this.botPreventionToken = Buffer.from(JSON.stringify({
                r: ret,
                t: data.t
            }), "utf-8").toString("base64")
        } catch(err) {
            console.error(err);
            return;
        }
    }
}

module.exports = VercelPlayground;