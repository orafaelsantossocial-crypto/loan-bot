# Multi-Guild Banking Bot - Implementation Summary

## ✅ Complete Refactor Done

The bot has been **fully rewritten** from single-guild to multi-guild architecture. All code changes maintain backward compatibility with scheduled tasks and implement the exact requirements you specified.

## What Changed

### Database Layer (`bank-manager-multi-guild.js`)
- **New Tables:**
  - `guild_configs` - Stores guild ID, name, role IDs, logs channel, etc.
  - `credit_scores` - **Global** user profiles (shared across all guilds)
  - `loans` - **Guild-specific** loans with `guildId` foreign key
  - `treasuries` - **Guild-specific** treasury balances
  - `investors` - **Guild-specific** investor records

- **Key Methods:**
  - `registerGuild(guildId, name, financeRoleId, adminRoleId, logsChannelId)` - Register new guild
  - `getGuildConfig(guildId)` - Retrieve guild settings
  - `getLoans(guildId)` - Get loans for specific guild
  - `getAllLoansForUser(userId)` - Get all loans across all guilds (for credit checks)
  - `getTreasury(guildId)` - Get guild's treasury
  - `getInvestors(guildId)` - Get guild's investors (not visible to other guilds)
  - `getAllGuilds()` - List all registered guilds

### Command Bot (`banking-bot-multi.js`)
- **New Command:** `/registeralliance` - Guild admin only, sets up new guild
- **All Commands Updated:**
  - Check if guild is registered before executing
  - Pass `guildId` to all BankManager calls
  - Use guild-specific roles for permissions
  - Log to guild-specific logs channel

- **Permission Model:**
  - Admin Role: Can create loans, view loans, manage requests, disburse funds
  - Finance Role: Can request loan payments, view investments
  - Both roles: Admin role is superset of finance role capabilities

### Main Entrypoint (`main.js`)
- Now loads `banking-bot-multi.js` instead of `banking-bot.js`
- Uses `bank-manager-multi-guild` instead of old BankManager
- Cron jobs updated to iterate through all guilds
- Scheduled tasks:
  - **Daily (3 AM UTC):** Process overdue loans across all guilds
  - **Weekly (Monday 9 AM UTC):** Send dividend reminders per guild

### Command Registration (`register-commands.js`)
- Updated to use new multi-guild bot
- Registers 10 commands (added `/registeralliance` and `/loanpayment`)

## System Architecture

```
┌─ Discord User/Guild ─────────────────────────────┐
│                                                  │
│  /registeralliance (first time only)             │
│        ↓                                          │
│  Stores: [guildId, roleIds, logsChannelId]       │
│        ↓                                          │
│  /loanrequest, /investment, etc.                 │
│        ↓                                          │
│  All commands check: Is guild registered?        │
│        ↓                                          │
│  All commands use guild-scoped data              │
│                                                  │
└──────────────────────────────────────────────────┘
            ↓
     ┌─ Multi-Guild DB ─┐
     │                  │
     ├─ guild_configs   │ ← One entry per guild
     ├─ credit_scores   │ ← Global (shared)
     ├─ loans           │ ← Scoped to guildId
     ├─ treasuries      │ ← One per guild
     └─ investors       │ ← Scoped to guildId
     
```

## Key Differences from Single-Guild

| Feature | Old (Single-Guild) | New (Multi-Guild) |
|---------|-------------------|------------------|
| Database | `loan-bot.db` | `loan-bot-multi.db` |
| Guild Registration | Hardcoded constants | `/registeralliance` command |
| Credit Scores | Guild-specific | **Global (shared)** |
| Treasuries | Single (global) | **Per-guild** |
| Loans | Global | **Per-guild** |
| Investments | Global | **Per-guild** |
| Max Loans per User | 1 (global) | **1 per guild** (can have multiple across guilds) |
| Investor Privacy | See all investors | **Only see own guild's investors** |
| Dividend Reminders | Single channel | **Per guild's logs channel** |
| Permission Model | Hardcoded role IDs | **Set during registration** |

## Implementation of Your Requirements

✅ **"System would not work in other servers unless they have set up their guild with the bot"**
   - Added guild registration check: `const config = await checkGuildRegistered(interaction)`
   - Error message: "❌ This guild is not registered as an alliance. Use `/registeralliance` to set up."

✅ **"Loans specific to the guild they got the loan from"**
   - Loans table has `guildId` column
   - `getLoans(guildId)` returns only that guild's loans
   - `getAllLoansForUser(userId)` returns loans across all guilds (for credit assessment)

✅ **"Each guild can create max 1 loan per user, ignoring other guilds' max amounts"**
   - Check: `const userLoanInGuild = Object.values(guildLoans).find(l => l.userId === user.id && l.status !== 'repaid')`
   - Error if already exists: "user already has an active loan in this guild"
   - Different guilds can independently give same user a loan

✅ **"Guild has a max loan amount they can give"**
   - Treasury balance is guild-specific: `await BankManager.getTreasury(guildId)`
   - Error if insufficient: "Insufficient funds in treasury"

✅ **"Treasury independent, no alliance can see another alliance's treasury"**
   - `getTreasury(guildId)` returns only that guild's data
   - No global treasury command; each guild manages independently

✅ **"During setup, set the two roles required for commands"**
   - `/registeralliance` takes: `finance_role` and `admin_role`
   - Stored in `guild_configs` table
   - Commands check: `hasFinanceRole()` or `hasAdminRole()` using stored roleIds

✅ **"Loan recipient profiles carry over between all guilds"**
   - Credit scores are in global `credit_scores` table (not scoped to guild)
   - All guilds see same score for same user

✅ **"All guilds able to see loans already given to the user"**
   - `getAllLoansForUser(userId)` query: `SELECT * FROM loans WHERE userId = ?` (no guild filter)
   - All loans shown regardless of guild

✅ **"Credit score is global"**
   - Single `credit_scores` table with userId as primary key
   - No `guildId` in this table

✅ **"Investments individual to guild"**
   - `investors` table has `(guildId, userId)` composite primary key
   - `getInvestors(guildId)` returns only that guild's investors

✅ **"Investor information only shown to guild they invested in"**
   - `/investments` command returns `getInvestors(interaction.guildId)`
   - Other guilds cannot call this for different guild (would fail guild registration check)

✅ **"Dividend reminders only sent to guild logs channel that received investment"**
   - `sendDividendReminders()` iterates `getAllGuilds()`
   - For each guild, calculates dividends from `getInvestors(guildId)`
   - Sends to `config.logsChannelId` specific to that guild
   - Mentions `config.financeRoleId` of that guild

## Files Added/Modified

**New Files:**
- `bank-manager-multi-guild.js` - Complete multi-guild database layer
- `banking-bot-multi.js` - Complete rewrite of bot with all 10 commands
- `MULTI_GUILD_GUIDE.md` - User-facing documentation

**Modified Files:**
- `main.js` - Updated to load multi-guild bot and cron jobs
- `register-commands.js` - Updated to register multi-guild commands
- `package.json` - Ensured node-cron is included

**Old Files (kept for reference):**
- `banking-bot.js` - Original single-guild version
- `bank-manager-sqlite-async.js` - Original single-guild database layer

## Testing the New System

### 1. Start the Bot
```bash
pm2 restart loan-bot
pm2 logs loan-bot
```

### 2. Register Your Guild
In Discord, run:
```
/registeralliance
guild_name: "My Guild"
finance_role: @Finance Members
admin_role: @Guild Admin
logs_channel: #banking-logs
```

### 3. Create a Test Loan
```
/loanrequest
user: @TestUser
amount: 100000
term_days: 7
```

### 4. Check Logs
Logs appear in the channel you configured during registration.

### 5. Test Multi-Guild
- Create a new server/channel
- Register it with different roles
- Create a loan for the same user in the new guild
- Verify user has loans in both guilds

## Database Inspection

To inspect the new multi-guild database:
```bash
# List all registered guilds
sqlite3 loan-bot-multi.db "SELECT guildId, guildName FROM guild_configs;"

# List all loans for a user across all guilds
sqlite3 loan-bot-multi.db "SELECT guildId, loanId, amount FROM loans WHERE userId = '123456789';"

# Check a specific guild's treasury
sqlite3 loan-bot-multi.db "SELECT balance FROM treasuries WHERE guildId = '1423552988617904180';"
```

## Next Steps (Optional)

1. **Migrate Old Data** (if needed):
   - Export data from `loan-bot.db`
   - Register your original guild with `/registeralliance`
   - Import data into `loan-bot-multi.db`

2. **Add More Commands** (future):
   - `/guildinfo` - Show guild configuration
   - `/myloans` - Show loans for invoking user
   - `/loanrepay` - Mark payment as received (manual)
   - `/settreasury` - Admin command to set initial balance

3. **Webhook Integration**:
   - Send Discord DMs when payments are overdue (already implemented)
   - Send embeds to logs channel with formatted data (already implemented)

## Summary

The banking bot is now a fully functional **multi-guild system** that:
- ✅ Maintains global credit scores
- ✅ Isolates treasuries, loans, and investments per guild
- ✅ Enforces guild-specific role permissions
- ✅ Sends logs and reminders to guild-specific channels
- ✅ Allows users to have loans from multiple guilds simultaneously
- ✅ Processes overdue loans and dividends across all guilds automatically

**Status:** Ready for deployment and testing! 🚀

---

**Implementation Date:** November 10, 2025
**Bot Version:** Multi-Guild v1.0
