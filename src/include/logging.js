const colors = require("colors");

class Logger {
    constructor(prefix) {
        this.prefix = prefix;
    }

    _getTimestamp() {
        return new Date().toLocaleTimeString("en-GB");
    }

    _getSection(text, color) {
        if (typeof color != "string")
            color = "grey";

        return colors.white("[") + colors[color](text) + colors.white("]");
    }

    _getPrefix(status, color) {
        return this._getSection(this._getTimestamp()) + this._getSection(this.prefix) + this._getSection(status, color) + ":";
    }

    _parseData(data) {
        return data;
    }

    info(...data) {
        console.log(this._getPrefix("info", "cyan"), ...this._parseData(data));
    }

    success(...data) {
        console.log(this._getPrefix(" ok ", "green"), ...this._parseData(data));
    }

    warn(...data) {
        console.log(this._getPrefix("warn", "yellow"), ...this._parseData(data));
    }

    error(...data) {
        console.log(this._getPrefix("error", "red"), ...this._parseData(data));
    }

    debug(...data) {
        console.log(this._getPrefix("debug", "magenta"), ...this._parseData(data));
    }
}

module.exports = { Logger, colors };