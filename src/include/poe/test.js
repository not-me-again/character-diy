const PoeClient = require('./poe-client');

async function test() {
    const client = new PoeClient();
    await client.init(process.argv[2]);

    //const newBot = await client.create_bot();
    //console.log(newBot);
    /*{
        defaultBotObject: {
            displayName: 'Bot81D4NNJOD',
            id: 'Qm90OjExNjI0NzM=',
            hasWelcomeTopics: false,
            deletionState: 'not_deleted',
            image: null,
            __isNode: 'Bot',
            creator: {
            profilePhotoUrl: null,
            fullName: 'Josephina Bobina',
            handle: 'josephinabobina',
            __isNode: 'PoeUser',
            id: 'UG9lVXNlcjoyMTc2NjUzMTkx'
            },
            description: 'Funny and chatty.',
            poweredBy: 'This bot uses a model that is powered by Anthropic',
            messageLimit: {
            numMessagesRemaining: null,
            shouldShowRemainingMessageCount: false,
            dailyLimit: null,
            resetTime: 1682726400000000,
            dailyBalance: null
            },
            nickname: 'bot81d4nnjod',
            hasSuggestedReplies: true,
            disclaimerText: null,
            isApiBot: false,
            contextClearWindowSecs: 2147483647,
            introduction: "Hi, I'm Sam.",
            model: 'a2',
            isSystemBot: false,
            isPrivateBot: false,
            viewerIsCreator: true,
            hasClearContext: true,
            isDown: false,
            handle: 'Bot81D4NNJOD',
            viewerIsFollower: true,
            isPromptPublic: false,
            promptPlaintext: 'You are a helpful assistant named Sam.',
            botId: 1162473,
            followerCount: 1
        },
        id: 'Q2hhdDoxMzU5NjU5OQ==',
        chatId: 13596599,
        shouldShowDisclaimer: false,
        __isNode: 'Chat',
        messagesConnection: {
            edges: [ [Object] ],
            pageInfo: { hasPreviousPage: false, startCursor: '529727527' },
            id: '13596599'
        }
    }*/
    
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

test();