module.exports = {
    method: "POST",
    path: "/api/setUserOnboardingCompleted",
    async callback(req, res) {
        const { user } = req.auth;
        if (!user)
            return res.status(404).send({ success: false, error: "user_not_found" });

        const { isComplete } = req.body;
        await user.set("onboardingCompleted", !!isComplete);
        await user.save();

        res.status(200).send({ success: true });
    }
}