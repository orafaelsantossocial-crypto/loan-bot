const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
let token;

// Try to load token from config.json if present, otherwise fall back to env var
if (fs.existsSync('./config.json')) {
    try {
        const cfg = require('./config.json');
        token = cfg.token || process.env.BOT_TOKEN;
    } catch (e) {
        token = process.env.BOT_TOKEN;
    }
} else {
    token = process.env.BOT_TOKEN;
}

if (!token) {
    console.error('Bot token not provided. Add a config.json with { "token": "..." } or set BOT_TOKEN env var.');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Load the multi-guild banking module
const cron = require('node-cron');
const bankingBot = require('./banking-bot-multi.js');
const BankManager = require('./bank-manager-multi-guild');

bankingBot(client);

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    console.log('Multi-guild banking system active.');
});

// Daily overdue loan processing (3 AM UTC)
cron.schedule('0 3 * * *', async () => {
    try {
        await bankingBot.processOverdueLoans(client, BankManager);
        console.log('✅ Daily overdue loan processing complete.');
    } catch (err) {
        console.error('❌ Error processing overdue loans:', err);
    }
});

// Weekly dividend reminders (Monday at 9 AM UTC)
cron.schedule('0 9 * * 1', async () => {
    try {
        await bankingBot.sendDividendReminders(client, BankManager);
        console.log('✅ Weekly dividend reminders sent.');
    } catch (err) {
        console.error('❌ Error sending dividend reminders:', err);
    }
});

client.login(token).catch(err => {
    console.error('Failed to login:', err);
});
