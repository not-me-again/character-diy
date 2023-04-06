// Imports
require("dotenv").config();
const bodyParser = require("body-parser");
const express = require("express");
const fs = require("fs");
const http = require("http");
const { rateLimit } = require("express-rate-limit");
// Modules
const { Logger, colors } = require("./src/include/logging");
const router = require("./src/router");
// Setup
const log = new Logger("Server");
const app = express();
const server = http.Server(app);
const clientFolder = __dirname + "/client";
// Middleware
app.use(express.static(clientFolder));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Setup rate-limiting
app.use(rateLimit({
	windowMs: 5 * 1000, // 5 seconds
	max: 7, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
}));
// Establish HTTPS routes
app.use((req, res, next) => {
    const path = `${clientFolder}/${req.path}.html`;
    if (fs.existsSync(path))
        res.sendFile(path);
    else
        next();
});
router.setup(app);
// Start server
const listener = server.listen(process.env.PORT || 8080, () =>
    log.info("Server is listening at " + colors.green(`0.0.0.0:${listener.address().port}`))
);
// Prod. error handling
if (!process.env.IS_DEV) {
    process.on("uncaughtException", console.error);
    process.on("unhandledRejection", console.error);
}