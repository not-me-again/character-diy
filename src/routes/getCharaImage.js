const axios = require("axios");

module.exports = {
    method: "GET",
    path: "/image/chara/:id",
    async callback(req, res) {
        const { id } = req.params;
        if (typeof id != "string")
            return res.status(400).end();

        const [ fileName, fileExtension ] = id.split(".");

        axios({
            method: "GET",
            url: `https://tavernai.net/cards/${fileName}.${fileExtension || "webp"}`,
            responseType: "stream",
            validateStatus: () => true
        }).then(responseStream => {
            const { status, headers, data } = responseStream;
            if (status != 404) {
                res.writeHead(status, headers);
                data.pipe(res);
            } else {
                res.status(404).send("Not found");
            }
        });
    }
}