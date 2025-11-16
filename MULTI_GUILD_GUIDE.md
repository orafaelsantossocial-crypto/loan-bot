# Multi-Guild Banking Bot Setup Guide

## Overview
The UFP Banking Bot now supports **multiple guilds (alliances)** with their own independent treasuries, loans, and investments. Each guild must register to use the system.

## Key Features

✅ **Guild-Specific Data:**
- Independent treasuries per guild
- Guild-specific loans (max 1 loan per user per guild)
- Guild-specific investments and investor information
- Guild-specific logs channel

✅ **Global Data:**
- Credit scores (shared across all guilds)
- User profiles visible to all guilds
- All loans visible to all guilds (for credit assessment)

✅ **Guild Setup:**
- `/registeralliance` - Register a new guild with required roles and channels
- Auto-validation: Commands fail if guild is not registered

## Guild Registration

### Step 1: Run `/registeralliance`
Only **server administrators** can register a guild.

**Command Parameters:**
- `guild_name` - Name of your guild/alliance
- `finance_role` - Role that can request loan payments and manage dividends
- `banker_role` - Role that can manage loans and create new requests
- `logs_channel` - Channel where all transactions are logged
- `payment_receiver` (user) - Primary user who will receive investments and loan payments (required)
- `payment_receiver_alt1` (user) - Optional alternate payment receiver (backup)
- `payment_receiver_alt2` (user) - Optional alternate payment receiver (backup)

**Example:**
```
/registeralliance
  guild_name: "Dragon Slayers Guild"
  finance_role: @Finance
  banker_role: @Guild Banker
  logs_channel: #banking-logs
```

### Step 2: Start Using Commands

Once registered, members with the appropriate roles can use:
- `/loanrequest` - Request a loan (banker role)
- `/invest` - Invest in the guild's treasury (banker role)
- `/loans` - View all active loans (banker role)
- `/creditscore` - Check a user's credit (banker role)
- `/loanpayment` - Request payment from borrower (finance role)
- `/investments` - View all investments (banker role)
- `/collection` - View overdue loans (banker role)
- `/requests` - View pending loan requests (banker role)
- `/loansent` - Mark loan as disbursed (banker role)

## Loan System

### Loan Rules
- **Max Term:** 4 weeks (28 days)
- **Term Increments:** Must be 7, 14, 21, or 28 days (weekly payments)
- **Weekly Payments:** Total repayment ÷ weeks
- **Max Loans per User per Guild:** 1 active/pending loan at a time
- **Global Max Loans:** User can have 1 loan from each different guild

### Overdue Consequences
- **Daily Penalty:** -1 credit score per day for each overdue payment
- **Collections Penalty:** -10 credit score (one-time) when loan goes past final due date

### Weekly Payment Reminders
Every Monday at 9 AM UTC, the bot sends dividend reminders to the logs channel mentioning the finance role.

## Credit Score System

### Global Credit Scores
- All guilds see the same credit score for each user
- Starting score: 50
- Score cannot go below 0

### Credit Score Impact
- Good credit (75+): -2% interest rate
- Excellent credit (90+): -3% interest rate
- Overdue payments: -1 per day
- Collections entry: -10 (one-time)

### Interest Rate Calculation
```
Base Rate (5%) + Term Rate (2% per day) + Credit Adjustment
```

Example: 7-day loan, credit score 50
```
5 + (7 × 2) + 0 = 19%
```

## Investment & Dividend System

### Investments
- Investors deposit money into a guild's treasury
- Investments are **guild-specific** - only the guild receiving the investment knows who invested
- Weekly dividend payout: 1% of investment amount

### Dividend Reminders
- Sent every Monday at 9 AM UTC
- Sent to the guild's logs channel
- Mentions the finance role
- Includes total amount and breakdown by investor

## Multi-Guild Example Scenarios

### Scenario 1: User borrows from Guild A and Guild B
- **Guild A:** Gives loan L1234 ($50,000, 28 days)
- **Guild B:** Gives loan L5678 ($30,000, 14 days)
- **Result:** User can have both loans active simultaneously
- **Global Credit Score:** Shared across both guilds
- **Overdue Penalties:** Applied to global credit score regardless of which guild's loan is overdue

### Scenario 2: Guild Treasuries are Independent
- **Guild A Treasury:** $1,000,000
- **Guild B Treasury:** $500,000
- **Same User Loan Limit:** $1,000,000 from Guild A, $500,000 from Guild B
- **Investors:** Cannot see other guilds' investors; dividends sent to respective logs channels only

### Scenario 3: New Guild Joins System
- Admin runs `/registeralliance`
 - Admin runs `/registeralliance`
 - Sets their finance and banker roles
- Sets their logs channel
- Immediately ready to create loans and accept investments
- Can see all user credit scores and existing loans across system

## Data Persistence

- **Database:** `loan-bot-multi.db` (separate from old single-guild database)
- **Tables:**
  - `guild_configs` - Guild registrations
  - `credit_scores` - Global user profiles
  - `loans` - Guild-specific loans
  - `treasuries` - Guild-specific treasury balances
  - `investors` - Guild-specific investor information

## Scheduled Tasks

### Daily (3 AM UTC)
- Process overdue loans
- Apply credit score penalties for missed payments
- Apply collections penalty for past-due loans
- Send DMs to affected users

### Weekly (Monday 9 AM UTC)
- Calculate dividends for all active investments
- Send reminders to finance roles
- Include breakdown by investor

## Troubleshooting

**"This guild is not registered as an alliance"**
- Solution: Run `/registeralliance` (admin only)

**Commands not showing up**
- Solution: Re-register commands with `node -r dotenv/config register-commands.js`

**Investor can see other guild's investments**
- This should not happen. Investors are filtered by guild_id in the database.

**User has 2 loans in the same guild**
- Should not be possible. Check logs for errors. Max is 1 per guild.

## Admin Management

### To update a guild's configuration
- Re-run `/registeralliance` with new roles/channel
- The old config will be overwritten

### To view all registered guilds
- Query `guild_configs` table in database
- No in-game command exists yet

### To reset guild data (dangerous)
- Delete guild row from `guild_configs`
- Delete related loans and investors
- Requires direct database access

---

**Version:** Multi-Guild v1.0
**Last Updated:** November 10, 2025
