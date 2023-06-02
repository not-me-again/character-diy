const { AVAILABLE_MODELS } = require("../../../config.json");

module.exports = {
    paths: [
        {
            path: "/api/characters/available-models.json",
            method: "GET"
        }
    ],
    async callback(req, res, next) {
        const { user } = req.auth;
        //const createdAt = await user.get("createdAt");
        
        let availableModels = { ...AVAILABLE_MODELS };

        /*for (let model of availableModels) {
            const { ACCOUNT_AGE_REQUIREMENT } = model;
            if ((typeof ACCOUNT_AGE_REQUIREMENT == "number") && (createdAt < ACCOUNT_AGE_REQUIREMENT))
                delete model;
        }*/

        res.status(200).send(availableModels);
    }
}