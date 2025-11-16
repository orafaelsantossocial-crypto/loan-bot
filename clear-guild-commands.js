/**
 * clear-guild-commands.js
 *
 * Clears all guild-level command registrations for a specific guild.
 * Use this to remove duplicate commands and rely only on global commands.
 *
 * Usage:
 *   BOT_TOKEN=... CLIENT_ID=... GUILD_ID=... node clear-guild-commands.js
 */

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

const token = process.env.BOT_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('Missing BOT_TOKEN, CLIENT_ID, or GUILD_ID. Export as env vars and retry.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

async function clearGuildCommands() {
  try {
    console.log(`Clearing all guild-level commands from guild ${guildId}...`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
    console.log('✅ Guild-level commands cleared. Only global commands will be used.');
  } catch (err) {
    console.error('Failed to clear guild commands:', err);
    process.exit(1);
  }
}

clearGuildCommands();
