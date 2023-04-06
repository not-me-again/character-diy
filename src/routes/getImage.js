const { handleImageRequest } = require("../include/helpers/imageService");

module.exports = {
    method: "GET",
    path: "/image/:id",
    async callback(req, res) {
        const { id } = req.params;
        if (typeof id != "string")
            return res.status(400).end();

        const [ encodedName, fileExtension ] = id.split(".");
        if ((typeof encodedName != "string") || (encodedName.length <= 0) || (typeof fileExtension != "string") || (fileExtension.length <= 0))
            return res.status(400).end();

        handleImageRequest(encodedName, fileExtension, res);
    }
}