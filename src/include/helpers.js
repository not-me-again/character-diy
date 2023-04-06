const fs = require("fs");

const subModulesFolder = __dirname + "/helpers";

let subModules = {};

for (let subModule of fs.readdirSync(subModulesFolder))
    subModules[subModule] = require(`${subModulesFolder}/${subModule}`);

module.exports = subModules;