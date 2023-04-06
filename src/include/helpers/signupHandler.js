const { Logger, colors } = require("../logging");
const { PoeAccount } = require("../poe");

const log = new Logger("AccountSetup");

module.exports = async function() {
    try {
        const accountSetup = new PoeAccount();
        log.info(`Creating new Poe account`);
        await accountSetup.init();
        log.info(`Sending verification email to: ${accountSetup.email}`);
        await accountSetup.sendVerificationEmail();
        log.info("Waiting for verification code...");
        const verificationCode = await accountSetup.waitForVerificationCode();
        log.info(`Got verification code: ${verificationCode}`);
        const authCookie = await accountSetup.submitVerificationCodeAndGetAuthCookie(verificationCode);
        log.info(`Got auth: ${authCookie}`);
        return authCookie;
    } catch(err) {
        log.error("Failure!\n", err);
        throw err;
    }
}