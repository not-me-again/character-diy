const { handleImageURLUpload } = require("../include/helpers/imageService");
const { getIDFromOAuth, joinUserToDiscordWithCode } = require("../include/helpers/discordAuth");
const db = require("../include/db");

module.exports = {
    method: "GET",
    path: "/pawthorize",
    async callback(req, res) {
        const { code } = req.query;
        // sanity check
        if (typeof code == "string") {
            // probe discord for user info from OAuth token we got
            const discReqResponse = await getIDFromOAuth(code);
            if (!discReqResponse)
                return res.status(500).send("<h1>Internal server error</h1>");

            const { userData, accessToken } = discReqResponse;
            if (typeof userData == "object") {
                const emailAddress = userData.email;
                if ((typeof emailAddress != "string") || (emailAddress.length <= 0))
                    return res.status(400).send("<h1>You must have a verified email address linked to your Discord account</h1>");
                if (!userData.verified)
                    return res.status(400).send("<h1>Your email is not verified</h1>");
                // get email from db
                const email = db.getEmail(emailAddress);
                // get user
                let user;
                if (await email.exists())
                    user = await email.getUser();
                else
                    //user = db.getUser(db.getUniqueId());
                    return res.status(403).send("<h1>New user registration has been closed indefinitely</h1>");
                // discord id
                const discordId = userData.id;
                //
                if (user) {
                    const userId = user.id || db.getUniqueId();
                    // add the session to the user obj
                    const apiKey = await user.getOrCreateAPIKey();
                    // check if account is setup or not
                    const hasCompletedSetup = await user.get("hasCompletedSignup");
                    if (!hasCompletedSetup) {
                        // associate email with user
                        await email.set("ownerId", userId);
                        await email.save();
                        // upload avatar
                        const avatarURL = "https://cdn.discordapp.com/avatars/" + discordId + "/" + userData.avatar + ".png?size=512";
                        const avatarUpload = await handleImageURLUpload(avatarURL);
                        if (typeof avatarUpload == "object")
                            await user.set("profilePictureURL", avatarUpload.fileName);
                        // setup basic user things
                        await user.set({
                            id: userId,
                            birthdate: Date.now(),
                            discordId,
                            displayName: userData.username,
                            email: emailAddress,
                            hasCompletedSignup: true,
                            createdAt: Date.now()
                        });
                        // save everything we just did
                        await user.save();
                    }
                    // join the user to the community discord server
                    joinUserToDiscordWithCode(accessToken, userData.id);
                    // redirect back to home page
                    return res.redirect(302, `/?apiKey=${apiKey}`);
                }
            }
        }
        // sanity check FAILED
        res.status(503).send("<h1>Service unavailable</h1>");
    }
}