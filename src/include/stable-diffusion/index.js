const { Logger } = require("../logging");

const log = new Logger("StableDiffusion");

const WebSocket = require("ws");

class StableDiffusion {
    constructor() {
    }
    
    static generateImage(prompt, negativePrompt) {
        return new Promise((resolve, reject) => {
            let socket = new WebSocket("wss://stabilityai-stable-diffusion.hf.space/queue/join");
            let session_hash = (Math.random() * 1e16).toString(16).substring(0, 10);
            //this.socket = socket;
            socket.on("error", reject);
            socket.on("unexpected-response", reject);
            socket.on("message", rawData => {
                const data = JSON.parse(rawData);
                const { msg } = data;
                switch (msg) {
                    case "send_hash":
                        socket.send(JSON.stringify({ session_hash, fn_index: 3 }));
                        break;
                    case "send_data":
                        socket.send(JSON.stringify({
                            fn_index: 3,
                            data: [ prompt, negativePrompt, 7 /* guidance scale, 7 produces best results */ ],
                            session_hash
                        }));
                        break;
                    case "estimation":
                        log.info(`In queue position ${data.rank + 1}/${data.queue_size}. ETA: ${data.rank_eta}`);
                        break;
                    case "process_starts":
                        log.info(`Generation started`);
                        break;
                    case "process_generating":
                        // generation step
                        // TODO: send stream of data
                        break;
                    case "process_completed":
                        // generation finished
                        const output = data.output;
                        if (!data.success || (typeof data.output != "object")) {
                            log.error("Image generation failed:", data);
                            return reject(output.error || "Failed to generate");
                        }
                        
                        const responseList = output.data;
                        if (typeof responseList != "object")
                            return reject("Invalid response");
                        
                        const images = responseList[0];
                        
                        resolve({ images });
                        
                        break;
                    default:
                        break;
                }
            });
        });
    }
}

module.exports = StableDiffusion;