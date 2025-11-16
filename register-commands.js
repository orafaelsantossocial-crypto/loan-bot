/**
 * register-commands.js
 *
 * Usage:
 *   BOT_TOKEN=... CLIENT_ID=... node register-commands.js
 *   BOT_TOKEN=... CLIENT_ID=... GUILD_ID=... node register-commands.js
 *
 * Always registers commands globally (available to all servers).
 * If GUILD_ID is provided, also registers to that guild (fast testing updates).
 */

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

const token = process.env.BOT_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // optional for fast guild-level testing

if (!token || !clientId) {
  console.error('Missing BOT_TOKEN or CLIENT_ID. Export as env vars and retry.');
  process.exit(1);
}

// Load banking-bot-multi and collect the command builders by invoking it with a fake client
const fakeClient = { on: () => {}, commands: [] };
const bankingBot = require('./banking-bot-multi.js');
bankingBot(fakeClient);

if (!fakeClient.commands || fakeClient.commands.length === 0) {
  console.error('No commands found on the fake client. Ensure banking-bot-multi.js defines commands as SlashCommandBuilder instances.');
  process.exit(1);
}

const commands = fakeClient.commands.map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

async function register() {
  try {
    if (guildId) {
      // If a GUILD_ID is provided, register only to that guild (fast testing mode).
      // This avoids registering both global and guild commands at the same time which
      // can cause duplicate command entries to appear in a guild's UI.
      console.log(`Registering ${commands.length} commands to guild ${guildId} (fast testing mode)...`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log('✅ Guild-level commands registered for fast testing.');
    } else {
      // Register globally when no GUILD_ID is provided
      console.log(`Registering ${commands.length} global commands...`);
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('✅ Global commands registered.');
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
}

register();
