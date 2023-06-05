const { IMGUR_KEY } = process.env;

const USE_PUBLIC_ENDPOINT = true;

const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

function enc_img_id(id) {
    if (!id)
        return;
    let id_str = "";
    for (let i in id.split("")) {
        id_str += id.charCodeAt(i).toString(16).padStart(3, "0");
    }
    return id_str.replace(/^0/, "");
}
function denc_img_id(enc_id) {
    if (!enc_id)
        return;
    let id = "";
    enc_id = enc_id.replace(/\-/g, "");
    if (!enc_id)
        return;
    if (!enc_id.startsWith("0") && (enc_id.length % 3 != 0)) {
        enc_id = "0" + enc_id;
    }
    if (!enc_id)
        return;
    const matches = enc_id.match(/[0-9a-f]{3}/gi);
    if (!matches)
        return;
    try {
        for (let char of matches) {
            id += String.fromCharCode(parseInt(char, 16));
        }
    } catch(err) {
        return;
    }
    return id;
}

function handleImageRequest(encodedName, fileFormat, res) {
    const decodedName = denc_img_id(encodedName);
    const fileUrl = `https://i.imgur.com/${decodedName}.${fileFormat || "png"}`;
    axios({
        method: "GET",
        url: fileUrl,
        responseType: "stream",
        validateStatus: () => true
    }).then(responseStream => {
        res.writeHead(responseStream.status, responseStream.headers);
        responseStream.data.pipe(res);
    });
}

async function handleDataUriUpload(dataUri) {
    const imgData = Buffer.from(dataUri.match(/(?<=base64,).+/msi).toString(), "base64");
    const formData = new FormData();
    formData.append("image", imgData);
    formData.append("type", "file");
    const headers = USE_PUBLIC_ENDPOINT ? undefined : {
        Authorization: "Client-ID " + IMGUR_KEY
    }
    const req = await axios.post("https://api.imgur.com/3/" + (USE_PUBLIC_ENDPOINT ? "image?client_id=546c25a59c58ad7" : "upload"), formData, {
        headers,
        validateStatus: () => true
    }).catch(err => err.response);
    const { data } = req.data;
    if (!data)
        throw new Error("Upload failed / no data");

    const id = data?.id;
    if (!id) {
        console.error(data);
        throw new Error("Upload failed");
    }

    let format = data?.link?.match(/\.\w+$/)?.toString();
    if (!format)
        format = ".png";

    const encId = enc_img_id(id);
    return { id: encId, format, fileName: "/image/" + encId + format }
}

async function handleDataUpload(imgData) {
    fs.writeFileSync(__dirname + "/test.png", Buffer.from(imgData, "base64"));
    const formData = new FormData();
    formData.append("image", Buffer.from(imgData, "base64"));
    formData.append("type", "file");
    const headers = USE_PUBLIC_ENDPOINT ? undefined : {
        Authorization: "Client-ID " + IMGUR_KEY
    }
    const req = await axios.post("https://api.imgur.com/3/" + (USE_PUBLIC_ENDPOINT ? "image?client_id=546c25a59c58ad7" : "upload"), formData, {
        headers,
        validateStatus: () => true
    }).catch(err => err.response);
    const { data } = req.data;
    if (!data)
        throw new Error("Upload failed / no data");

    const id = data?.id;
    if (!id) {
        console.error(data);
        throw new Error("Upload failed");
    }

    let format = data?.link?.match(/\.\w+$/)?.toString();
    if (!format)
        format = ".png";

    const encId = enc_img_id(id);
    return { id: encId, format, fileName: "/image/" + encId + format }
}

async function handleImageUpload(fn) {
    const formData = new FormData();
    formData.append("image", fs.createReadStream(fn));
    formData.append("type", "file");
    const headers = USE_PUBLIC_ENDPOINT ? undefined : {
        Authorization: "Client-ID " + IMGUR_KEY
    }
    const req = await axios.post("https://api.imgur.com/3/" + (USE_PUBLIC_ENDPOINT ? "image?client_id=546c25a59c58ad7" : "upload"), formData, {
        headers,
        validateStatus: () => true
    }).catch(err => err.response);
    const { data } = req.data;
    if (!data)
        throw new Error("Upload failed / no data");

    const id = data?.id;
    if (!id) {
        console.error(data);
        throw new Error("Upload failed");
    }

    let format = data?.link?.match(/\.\w+$/)?.toString();
    if (!format)
        format = ".png";

    const encId = enc_img_id(id);
    return { id: encId, format, fileName: "/image/" + encId + format }
}

async function handleImageURLUpload(url) {
    const formData = new FormData();
    formData.append("image", url);
    formData.append("type", "url");
    const headers = USE_PUBLIC_ENDPOINT ? undefined : {
        Authorization: "Client-ID " + IMGUR_KEY
    }
    const req = await axios.post("https://api.imgur.com/3/" + (USE_PUBLIC_ENDPOINT ? "image?client_id=546c25a59c58ad7" : "upload"), formData, {
        headers,
        validateStatus: () => true
    }).catch(err => err.response);
    const { data } = req.data;
    if (!data) {
        console.error("upload failed:", req.data);
        return undefined;
    }

    const id = data?.id;
    if (!id) {
        console.error("upload failed:", data);
        return undefined;
    }

    let format = data?.link?.match(/\.\w+$/)?.toString();
    if (!format)
        format = ".png";

    const encId = enc_img_id(id);
    return { id: encId, format, fileName: "/image/" + encId + format }
}

module.exports = { handleImageRequest, handleImageUpload, handleImageURLUpload, handleDataUriUpload, handleDataUpload };