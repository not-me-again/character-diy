const base64 = {
    encode: text => Buffer.from(text, "utf8").toString("base64"),
    encodeSafe: text => Buffer.from(text, "utf8").toString("base64url"),
    decode: text => Buffer.from(text, "base64").toString("utf8"),
    decodeSafe: text => Buffer.from(text, "base64url").toString("utf8")
}

module.exports = base64;