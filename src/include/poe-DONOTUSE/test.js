const PoeClient = require('./poe-client');

/*async function test() {
    const client = new PoeClient();
    await client.init(process.argv[2]);

    //const newBot = await client.create_bot();
    //console.log(newBot);
   
    const bots = client.get_bot_names();
    console.log(bots);

    //await client.purge_conversation('a2', -1);

    let reply;
    for await (const mes of client.send_message('a2', 'Who are you?', 13602062)) {
        reply = mes;
    }

    console.log(reply);
    client.disconnect_ws();
}

test();*/
const cookies = Buffer.from(process.argv[2], "base64").toString("utf-8").split("--;");
async function test() {
    for (const i in cookies) {
        const cookie = cookies[i];
        console.log(cookie);
        const client = new PoeClient();
        await client.init(cookie);

        try {
            const newBot = await client.create_bot();
            console.log(newBot);
        } catch(er) {
            console.log(er);
            delete cookies[i];
        }
    
        /*const bots = client.get_bot_names();
        console.log(bots);*/

        //await client.purge_conversation('a2', -1);

        /*let reply;
        for await (const mes of client.send_message('a2', 'Who are you?', 13602062)) {
            reply = mes;
        }*/

        //console.log(reply);
        client.disconnect_ws();
    }
    console.log(Buffer.from(cookies.join("--;")).toString("base64"));
}

test();