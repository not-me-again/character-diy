const resetChatContext = require("../../include/helpers/resetChatContext");
const { AGE_OF_MAJORITY_MS } = require("../../../config.json");

module.exports = {
    method: "POST",
    path: "/api/chats/:chatId/setFilterEnabled",
    async callback(req, res) {
        const { user } = req.auth;
        const chat = req.chat;

        const { enabled } = req.body;
        const doEnableFilter = enabled == "on";
        
        const userBirthdate = await user.get("birthdate");
        const canDisabledFilter = typeof userBirthdate == "number" && ((Date.now() - userBirthdate) >= AGE_OF_MAJORITY_MS);

        if (!canDisabledFilter && !doEnableFilter)
            return res.status(403).send({ success: false, error: "criteria_not_met" });
        
        await chat.set({
            updatedAt: Date.now(),
            isFilterEnabled: doEnableFilter
        });
        await chat.save();
        
        try {
            await resetChatContext(chat);
        } catch(err) {
            console.error(err);
            return res.status(500).send({ success: false, error: err.toString() });
        }

        res.status(200).send({ success: true });
    }
}