/**
 * list-commands.js
 *
 * Usage:
 *   BOT_TOKEN=... CLIENT_ID=... GUILD_ID=... node list-commands.js
 *
 * If GUILD_ID is provided the script will list commands for that guild, otherwise global commands.
 */

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

const token = process.env.BOT_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // optional

if (!token || !clientId) {
  console.error('Missing BOT_TOKEN or CLIENT_ID. Export as env vars and retry.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    if (guildId) {
      const res = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
      console.log(`Guild (${guildId}) commands (${res.length}):`);
      console.dir(res, { depth: 2 });
    } else {
      const res = await rest.get(Routes.applicationCommands(clientId));
      console.log(`Global commands (${res.length}):`);
      console.dir(res, { depth: 2 });
    }
  } catch (err) {
    console.error('Failed to list commands:', err);
    process.exit(1);
  }
})();
