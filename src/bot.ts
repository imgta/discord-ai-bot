import { Client, GatewayIntentBits, Message } from "discord.js";
import { OpenAI } from "openai";
import * as dotenv from "dotenv";

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Users must start all queries with '/ai' for bot to respond
const aiPrefix = "/ai"
const ignorePrefix = "!";
const serverChannels = [
    process.env.DISCORD_CHANNEL_1,
    process.env.DISCORD_CHANNEL_2
];

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY as string });

// TRACK BOT'S ONLINE STATUS
client.on("ready", () => { return console.log("Markov.ai online."); });

// EVENT LISTENER FOR AI PROMPTS IN MESSAGES
client.on("messageCreate", async (message: Message) => {
    // Ignore messages: from bot, have ignore prefixes, from outside serverChannels, with no bot ping
    if (
        message.author.bot ||
        message.content.startsWith(ignorePrefix) ||
        !message.content.startsWith(aiPrefix) ||
        (!serverChannels.includes(message.channelId) && !message.mentions.users.has(client.user!.id))
    ) return;

    // Remove the `/ai` prefix and any leading spaces from the message content
    const userContent = message.content.slice(aiPrefix.length).trim();

    // LOADER TO MOCK BOT TYPING/REPLYING
    await message.channel.sendTyping();
    const sendTypingInterval = setInterval(() => message.channel.sendTyping(), 2500);

    // FETCH CONVERSATION HISTORY
    const prevMessages = await message.channel.messages.fetch({ limit: 10 });
    const convoHistory: any = [
        { role: "system", content: "Markov.ai, a chatbot powered by ChatGPT." },
        ...prevMessages
            .reverse()
            // Username cleaning to replace spaces with underscores: OpenAI disallows special characters
            .filter(msg => !msg.content.startsWith(ignorePrefix) && !(msg.author.bot && msg.author.id !== client.user!.id))
            .map(msg => ({
                role: msg.author.id === client.user!.id ? 'assistant' : 'user',
                name: msg.author.username.replace(/\s+/g, "_").replace(/[^\w\s]/gi, ""),
                content: msg === message ? userContent : msg.content
            }))
    ];

    // OPENAI API REQUEST TO GENERATE RESPONSES
    try {
        const openAPI = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-0125", // 4096 token output limit
            messages: convoHistory,
            temperature: 0.3,   // [0-2] creativity, 0.2 -> 0.5 for academic questions
            max_tokens: 750, // limits response length
            top_p: 1, // [0-1, d=1], vocabulary, common -> diverse
            frequency_penalty: 0.5, // [0-2, d=0] penalizes repetition
            presence_penalty: 0.5, // [0-2, d=0] encourages new topics
            // stop: ["\n"], // sign-off text at the end of responses
        });

        clearInterval(sendTypingInterval);

        // BIG MESSAGE PARTITIONING: circumvent Discord's 2000-character message limit
        const replyMsg = openAPI.choices[0].message.content;
        if (!replyMsg) {
            message.reply("OpenAI API issue occured. Try again later.");
            return;
        }

        for (let i = 0; i < replyMsg!.length; i += 2000) {
            await message.reply(replyMsg.substring(i, i + 2000));
        }
    } catch (error) {
        clearInterval(sendTypingInterval);
        console.error("OpenAI Error:\n", error);
        await message.reply("OpenAI API issue occured. Try again later.");
    }
});

client.login(process.env.TOKEN);
