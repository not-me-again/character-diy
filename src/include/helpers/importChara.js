const extract = require("png-chunks-extract");
const PNGtext = require("png-chunk-text");
const ExifReader = require("exifreader");
const axios = require("axios");

async function downloadImg(url) {
    const req = await axios({
        url,
        responseType: "arraybuffer",
        validateStatus: () => true
    });
    if (req.status == 200)
        return req.data;
    else
        return null;
}

async function charaRead(img_url){
    const buffer = await downloadImg(img_url);
    if (!buffer)
        return;
    
    let data;
    let format = (img_url.indexOf(".webp") !== -1) ? "webp" : "png";
    switch (format) {
        case "webp":
            const exif_data = await ExifReader.load(buffer);
            const char_data = exif_data["UserComment"]["description"];
            if (char_data === "Undefined" && exif_data["UserComment"].value && exif_data["UserComment"].value.length === 1)
                data = exif_data["UserComment"].value[0];
            else
                data = char_data;
            break;
        case "png":
            const chunks = extract(buffer);
            const textChunks = chunks.filter(chunk => chunk.name === "tEXt").map(chunk => PNGtext.decode(chunk.data));
            data = Buffer.from(textChunks[0].text, "base64").toString("utf8");
        default:
            return;
    }

    if (!data)
        return;

    return JSON.parse(data);
}

function parseCharaFields(rawData) {
    let fields = {};
    rawData.replace(/([^\[{\n\r]*?)\((\".*?\")\)/gm, (_, field, values) =>
        fields[field.toLowerCase().replaceAll(" ", "_")] = values
            .split(/\s*\+\s*/)
            .map(v => v.replaceAll(/(\"|\')/g, ""))
            .join(", ")
    );
    return fields;
}

module.exports = { charaRead, parseCharaFields };