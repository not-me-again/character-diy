const { QUOTAS } = require("../../../config.json");

const db = require("../db");

async function getQuotasForUserId(userId) {
    const user = db.getUser(userId);
    
    if (!await user.exists())
        return QUOTAS.FREE_TIER;

    const userMembershipType = await user.get("membershipPlan");

    switch (userMembershipType) {
        case 0:
            return QUOTAS.FREE_TIER;
        case 1:
            return QUOTAS.PAID_TIER;
        case 2:
            return QUOTAS.POWER_USER
        default:
            return QUOTAS.FREE_TIER;
    }
}

module.exports = { getQuotasForUserId };