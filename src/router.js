const { preAuthMiddleware, authRequiredHandler } = require("./include/helpers/preAuthMiddleware");
const notFoundMiddleware = require("./include/helpers/notFoundMiddleware");
const { Logger, colors }  = require("./include/logging");
const log = new Logger("Router");
const fs = require("fs");

const routeFolder = __dirname + "/routes";
const preRouteFolder = __dirname + "/preRoutes";

function applyRoute(app, moduleName) {
    const routeData = require(moduleName);

    if ((!routeData.path && !routeData.paths) || !routeData.callback || (!routeData.paths && !routeData.method))
        return log.warn("Invalid route setup: " + colors.cyan(`\'${moduleName}\'`));

    const routeCallback = routeData.callback;
    let customCallback;
    if (typeof routeCallback == "function")
        customCallback = (req, res, ...args) => {
            try {
                routeCallback(req, res, ...args).catch(err => { throw err; });
            } catch(err) {
                res.status(500).end();
                log.error("Error invoking callback for route " + colors.cyan(`\'${moduleName}\'`));
                log.error(err);
            }
        }

    let callbacks = [ customCallback ];
    if (routeData.requiresAuth)
        callbacks.splice(0, 0, authRequiredHandler);

    let paths = routeData.path ? [ { path: routeData.path, method: routeData.method } ] : routeData.paths;
    for (let path of paths) {
        const method = (typeof path == "object") ? path.method : "ANY";
        const rawPath = (typeof path == "string") ? path : path.path;
        switch (method.toLowerCase()) {
            case "get":
                app.get(rawPath, ...callbacks);
                break;
            case "post":
                app.post(rawPath, ...callbacks);
                break;
            case "put":
                app.put(rawPath, ...callbacks);
                break;
            case "patch":
                app.patch(rawPath, ...callbacks);
                break;
            case "delete":
                app.delete(rawPath, ...callbacks);
                break;
            case "head":
                app.head(rawPath, ...callbacks);
                break;
            default:
                app.use(rawPath, ...callbacks);
                break;
        }
    }
}

function init(app, startFolder, i) {
    if (typeof i != "number")
        i = 0;

    for (let routeModule of fs.readdirSync(startFolder)) {
        i++;
        let path = `${startFolder}/${routeModule}`;
        if (fs.statSync(path).isDirectory())
            init(app, path, i);
        else
            applyRoute(app, path);
    }

    return i;
}

function setup(app, startFolder) {
    if (!startFolder)
        startFolder = routeFolder;

    app.use((req, res, next) => {
        log.info(`${req.method} ${req.url}`);
        next();
    });
    app.use(preAuthMiddleware);
    
    for (let preRouteModule of fs.readdirSync(preRouteFolder))
        applyRoute(app, `${preRouteFolder}/${preRouteModule}`);

    const numRoutes = init(app, startFolder);
    log.info(`Serving ${numRoutes} routes`);
    
    app.use(notFoundMiddleware);
}

module.exports = { setup }