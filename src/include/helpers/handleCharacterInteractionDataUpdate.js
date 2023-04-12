const cache = require("../cache");
const db = require("../db");

module.exports = async function(characterId) {
    const char = db.getCharacter(characterId);
    if (!await char.exists())
        return;

    let totalMessages = await char.get("totalMessageCount");
    totalMessages++;
    await char.set("totalMessageCount", totalMessages);

    let isEligible = false;
    const popularCharacters = cache.getPopularCharacters();
    for (let charData of popularCharacters) {
        const { totalMessageCount } = charData;
        if ((typeof totalMessageCount == "number") && (totalMessageCount < totalMessages)) {
            isEligible = true;
            break;
        }
    }

    const isPublic = await char.get("isPublic");

    const authorId = await char.get("authorId");
    const user = db.getUser(authorId);

    if (isEligible && isPublic)
        await cache.addToPopularCharacterList({
            ...char.getObject(),
            cachedUserData: {
                displayName: await user.get("displayName"),
                profilePictureURL: await user.get("profilePictureURL")
            }
        });

    if ((totalMessages % 5) == 0)
        await char.save();
}