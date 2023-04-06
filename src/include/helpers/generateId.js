const { v4: uuid } = require("uuid");

module.exports = function() {
    return Date.now() + "_" + uuid().replace(/\-/g, "_");
}