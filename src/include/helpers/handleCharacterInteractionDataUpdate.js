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
    if (isEligible) {
        await cache.addToPopularCharacterList(char.getObject());
    }

    if ((totalMessages % 10) == 0)
        await char.save();
}