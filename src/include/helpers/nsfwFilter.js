const NSFW_MOODS = [
    "sensual",
    "aroused",
    "horny",
    "pleasure-seeking",
    "lustful",
    "seductive",
    "turned on",
    "lewd",
    "provocative",
    "submissive",
    "dominant",
    "orgasmic",
    "sexual",
    "erotic",
    "naughty", // false+ ?
    "pleasured",
    "lust"
];
const NSFW_CONTENT_REGEXS = [
    /(gonna|going to) cum/gmi,
    /(fucking|pounding|railing|breeding) me/gmi,
    /(fuck|pound|rail|breed) (me|my)/gmi
];

module.exports = function(messageData) {
    if (typeof messageData != "object")
        throw new Error("Expected argument #1 to be type object");
    
    const { currentMoods, text } = messageData;
    if ((typeof currentMoods != "object") || (currentMoods.length <= 0))
        return {
            isFiltered: false
        }

    const nsfwMood = currentMoods.find(m => NSFW_MOODS.find(n => m.toLowerCase().includes(n)));
    if (nsfwMood)
        return {
            isFiltered: true,
            caughtBy: `[Mood = ${nsfwMood}]`
        }
    
    const nsfwMatch = NSFW_CONTENT_REGEXS.find(r => text.match(r));
    if (nsfwMatch)
        return {
            isFiltered: true,
            caughtBy: `[TextMatch = ${nsfwMatch.toString()}`
        }

    return {
        isFiltered: false
    }
}