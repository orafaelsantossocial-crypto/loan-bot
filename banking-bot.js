const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, Routes, Collection } = require('discord.js');
const { REST } = require('@discordjs/rest');
const fs = require('fs');
const path = require('path');

// File paths for data storage (legacy JSON paths are kept for compatibility/migration)
const DATA_DIR = './data';
const CREDIT_SCORES_FILE = path.join(DATA_DIR, 'credit_scores.json');
const LOANS_FILE = path.join(DATA_DIR, 'loans.json');
const TREASURY_FILE = path.join(DATA_DIR, 'treasury.json');
const PENDING_REQUESTS_FILE = path.join(DATA_DIR, 'pending_requests.json');

// Ensure data directory exists (still used for migration/backups)
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// NOTE: Persistence is handled by SQLite via bank-manager-sqlite.js. The old JSON helpers remain as fallback/migration targets.

// Role IDs
const ALLOWED_ROLES = ['1437233672876068945', '1423553471919034389'];
const FINANCE_SPECIALIST_ROLE = '1170334657745793034'; // Adjust as needed
// Role to replace previous per-user permission (was KALDR_ID / JOHN_ID)
const LOAN_ADMIN_ROLE = '1437233445544656897';

// Channel IDs
const LOGS_CHANNEL_ID = '1437237506218266684';

// User IDs for special permissions
const KALDR_ID = '1313146046490345524';
const JOHN_ID = '660685470543642629';

// Use SQLite-backed BankManager (async API using sqlite3)
const BankManager = require('./bank-manager-sqlite-async');
const BankManagerMultiGuild = require('./bank-manager-multi-guild');

    // Simple embed builder for standard replies
    const makeEmbed = (description, title = null, color = 0x2ECC71) => {
        const e = new EmbedBuilder();
        e.setColor(color).setTimestamp();
        if (title) e.setTitle(title);
        if (description) e.setDescription(description);
        return e;
    };

module.exports = (client) => {
    // Global /registeralliance command (works for all guilds)
    const registerallianceCommand = new SlashCommandBuilder()
        .setName('registeralliance')
        .setDescription('Register this guild as an alliance bank')
        .addStringOption(option =>
            option.setName('guild_name')
                .setDescription('Name of your guild/alliance')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('finance_role')
                .setDescription('Role that can request loan payments')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('admin_role')
                .setDescription('Role that can manage loans')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('logs_channel')
                .setDescription('Channel for transaction logs')
                .setRequired(true));

    // Payment receivers: primary required user + two optional alternates
    registerallianceCommand.addUserOption(option =>
        option.setName('payment_receiver')
            .setDescription('Primary user to receive payments (investments & loan payments)')
            .setRequired(true));
    registerallianceCommand.addUserOption(option =>
        option.setName('payment_receiver_alt1')
            .setDescription('Optional alternate payment receiver'));
    registerallianceCommand.addUserOption(option =>
        option.setName('payment_receiver_alt2')
            .setDescription('Optional alternate payment receiver (2)'));

    const updaterolesCommand = new SlashCommandBuilder()
        .setName('updateroles')
        .setDescription('Update finance/banker roles, logs channel, and payment receivers (admin only)')
        .addRoleOption(option => option.setName('finance_role').setDescription('Finance role to update').setRequired(false))
        .addRoleOption(option => option.setName('admin_role').setDescription('Admin/Banker role to update').setRequired(false))
        .addChannelOption(option => option.setName('logs_channel').setDescription('Logs channel to update').setRequired(false))
        .addUserOption(option => option.setName('payment_receiver').setDescription('Primary payment receiver').setRequired(false))
        .addUserOption(option => option.setName('payment_receiver_alt1').setDescription('Alternate payment receiver 1').setRequired(false))
        .addUserOption(option => option.setName('payment_receiver_alt2').setDescription('Alternate payment receiver 2').setRequired(false));

    // Handler for registeralliance
    const handleRegisterAlliance = async (interaction) => {
        // Only guild owner or admin can register
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            const emb = makeEmbed('Only server administrators can register an alliance.', 'Permission denied', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const guildId = interaction.guildId;
        const guildName = interaction.options.getString('guild_name');
        const financeRole = interaction.options.getRole('finance_role');
        const adminRole = interaction.options.getRole('admin_role');
        const logsChannel = interaction.options.getChannel('logs_channel');

        const primaryReceiver = interaction.options.getUser('payment_receiver');
        const alt1 = interaction.options.getUser('payment_receiver_alt1');
        const alt2 = interaction.options.getUser('payment_receiver_alt2');

        try {
            await BankManagerMultiGuild.registerGuild(guildId, guildName, financeRole.id, adminRole.id, logsChannel.id, primaryReceiver.id, alt1 ? alt1.id : null, alt2 ? alt2.id : null);
            const successDesc = `✅ Alliance **${guildName}** registered successfully!\n\n**Finance Role**: ${financeRole}\n**Admin Role**: ${adminRole}\n**Logs Channel**: ${logsChannel}\n**Primary Payment Receiver**: <@${primaryReceiver.id}>${alt1 ? `\n**Alternate Receiver 1**: <@${alt1.id}>` : ''}${alt2 ? `\n**Alternate Receiver 2**: <@${alt2.id}>` : ''}\n\nYou can now use banking commands!`;
            const emb = makeEmbed(successDesc, 'Alliance Registered', 0x2ECC71);
            await interaction.reply({ embeds: [emb], ephemeral: true });
        } catch (error) {
            console.error('Error registering alliance:', error);
            const emb = makeEmbed('Failed to register alliance. Please try again.', 'Registration Failed', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
        }
    };
    // Helper function to check if user has required roles
    const hasRequiredRole = (interaction) => {
        return interaction.member.roles.cache.some(role => 
            ALLOWED_ROLES.includes(role.id)
        );
    };

    const isKaldrOrJohn = (interaction) => {
        // Replace previous user-only check with role-based check.
        // Return true if the invoking member has the LOAN_ADMIN_ROLE.
        try {
            return !!(interaction.member && interaction.member.roles && interaction.member.roles.cache && interaction.member.roles.cache.has(LOAN_ADMIN_ROLE));
        } catch (e) {
            return false;
        }
    };

    // Slash command: creditscore
    const creditscoreCommand = new SlashCommandBuilder()
        .setName('creditscore')
        .setDescription('Check a user\'s credit score and loan eligibility')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check')
                .setRequired(true));

    // Slash command: loanrequest
    const loanrequestCommand = new SlashCommandBuilder()
        .setName('loanrequest')
        .setDescription('Request a loan for a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user requesting the loan')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Loan amount')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('term_weeks')
                .setDescription('Loan term in weeks (1-4) or days (7,14,21,28)')
                .setRequired(true)
                .addChoices(
                    { name: '1 week', value: 1 },
                    { name: '2 weeks', value: 2 },
                    { name: '3 weeks', value: 3 },
                    { name: '4 weeks', value: 4 },
                    { name: '7 days', value: 7 },
                    { name: '14 days', value: 14 },
                    { name: '21 days', value: 21 },
                    { name: '28 days', value: 28 }
                ))
        .addIntegerOption(option =>
            option.setName('tax_revenue')
                .setDescription('User\'s daily tax revenue (optional)')
                .setRequired(false));

    // Slash command: investment
    const investmentCommand = new SlashCommandBuilder()
        .setName('investment')
        .setDescription('Make an investment in the bank')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The investor')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Investment amount')
                .setRequired(true));

    // Slash command: loans
    const loansCommand = new SlashCommandBuilder()
        .setName('loans')
        .setDescription('View all current loans');

    // Slash command: requests
    const requestsCommand = new SlashCommandBuilder()
        .setName('requests')
        .setDescription('View pending loan requests');

    // Slash command: loansent (Kaldr and John only)
    const loansentCommand = new SlashCommandBuilder()
        .setName('loansent')
        .setDescription('Confirm loan has been sent to user')
        .addStringOption(option =>
            option.setName('loanid')
                .setDescription('The loan ID')
                .setRequired(true));

    // Slash command: investments (Kaldr and John only)
    const investmentsCommand = new SlashCommandBuilder()
        .setName('investments')
        .setDescription('View all investments and dividends');

    const banksettingsCommand = new SlashCommandBuilder()
        .setName('banksettings')
        .setDescription('Manage bank settings (admin only)')
        .addSubcommand(sub => sub.setName('view').setDescription('View current bank settings'))
        .addSubcommand(sub => sub.setName('set').setDescription('Update bank settings')
            .addIntegerOption(opt => opt.setName('max_loans').setDescription('Max concurrent loans per user').setRequired(false))
            .addNumberOption(opt => opt.setName('max_loan_multiplier').setDescription('Multiplier used to calculate max loan from tax revenue').setRequired(false))
            .addNumberOption(opt => opt.setName('dividend_percent').setDescription('Dividend percentage (0.01 = 1%)').setRequired(false))
            .addNumberOption(opt => opt.setName('base_interest').setDescription('Base interest rate (flat)').setRequired(false))
            .addNumberOption(opt => opt.setName('interest_per_day').setDescription('Interest rate per day of term').setRequired(false))
            .addIntegerOption(opt => opt.setName('max_loan_weeks').setDescription('Maximum loan length in weeks').setRequired(false))
        );

    // Slash command: collection (Kaldr and John only)
    const collectionCommand = new SlashCommandBuilder()
        .setName('collection')
        .setDescription('View overdue loans');

    const waiveinterestCommand = new SlashCommandBuilder()
        .setName('waiveinterest')
        .setDescription('Waive interest on an active loan')
        .addStringOption(option =>
            option.setName('loanid')
                .setDescription('The loan ID')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('new_interest')
                .setDescription('New interest rate (0 to fully waive, or a different rate; omit to fully waive)')
                .setRequired(false));

    const forgivepaymentCommand = new SlashCommandBuilder()
        .setName('forgivepayment')
        .setDescription('Forgive remaining balance on a loan')
        .addStringOption(option =>
            option.setName('loanid')
                .setDescription('The loan ID')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to forgive (omit to forgive entire remaining balance)')
                .setRequired(false));

    const refinanceCommand = new SlashCommandBuilder()
        .setName('refinance')
        .setDescription('Refinance a loan with new terms')
        .addStringOption(option =>
            option.setName('loanid')
                .setDescription('The loan ID')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('new_term_weeks')
                .setDescription('New term in weeks (1-4 weeks or 7/14/21/28 days)')
                .setRequired(true));

    const dividendspaidCommand = new SlashCommandBuilder()
        .setName('dividendspaid')
        .setDescription('Pay dividends to all investors and reduce treasury balance')
        .addIntegerOption(option =>
            option.setName('total_amount')
                .setDescription('Total amount to distribute as dividends')
                .setRequired(true));

    const reinvestmenttoggleCommand = new SlashCommandBuilder()
        .setName('reinvestmenttoggle')
        .setDescription('Enable/disable automatic dividend reinvestment')
        .addBooleanOption(option =>
            option.setName('enable')
                .setDescription('Enable or disable reinvestment')
                .setRequired(true));

    const withdrawinvestmentCommand = new SlashCommandBuilder()
        .setName('withdrawinvestment')
        .setDescription('Withdraw your investment (full or partial)')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to withdraw (omit to withdraw entire investment)')
                .setRequired(false));

    const investmentsettingsCommand = new SlashCommandBuilder()
        .setName('investmentsettings')
        .setDescription('Manage investment settings')
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View current investment settings'))
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Set investment settings')
                .addIntegerOption(opt => opt.setName('max_amount').setDescription('Max investment amount per user (0 for unlimited)').setRequired(false))
                .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable/disable investments').setRequired(false)));

    // Register commands
    client.commands = [
        creditscoreCommand,
        loanrequestCommand,
        investmentCommand,
        loansCommand,
        requestsCommand,
        loansentCommand,
        investmentsCommand,
        collectionCommand,
        waiveinterestCommand,
        forgivepaymentCommand,
        refinanceCommand,
        dividendspaidCommand,
        reinvestmenttoggleCommand,
        withdrawinvestmentCommand,
        investmentsettingsCommand,
        registerallianceCommand,
        banksettingsCommand,
        updaterolesCommand
    ];

    // Command handlers
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        try {
            switch (interaction.commandName) {
                case 'creditscore':
                    await handleCreditScore(interaction);
                    break;
                case 'loanrequest':
                    await handleLoanRequest(interaction);
                    break;
                case 'banksettings':
                    await handleBankSettings(interaction);
                    break;
                case 'updateroles':
                    await handleUpdateRoles(interaction);
                    break;
                case 'investment':
                    await handleInvestment(interaction);
                    break;
                case 'loans':
                    await handleLoans(interaction);
                    break;
                case 'requests':
                    await handleRequests(interaction);
                    break;
                case 'loansent':
                    await handleLoanSent(interaction);
                    break;
                case 'investments':
                    await handleInvestments(interaction);
                    break;
                case 'collection':
                    await handleCollection(interaction);
                    break;
                case 'waiveinterest':
                    await handleWaiveInterest(interaction);
                    break;
                case 'forgivepayment':
                    await handleForgivePayment(interaction);
                    break;
                case 'refinance':
                    await handleRefinance(interaction);
                    break;
                case 'dividendspaid':
                    await handleDividendsPaid(interaction);
                    break;
                case 'reinvestmenttoggle':
                    await handleReinvestmentToggle(interaction);
                    break;
                case 'withdrawinvestment':
                    await handleWithdrawInvestment(interaction);
                    break;
                case 'investmentsettings':
                    await handleInvestmentSettings(interaction);
                    break;
            }
        } catch (error) {
            console.error('Error handling command:', error);
            await interaction.reply({ 
                content: 'There was an error executing this command.', 
                ephemeral: true 
            });
        }
    });

    // Command implementations
    async function handleCreditScore(interaction) {
        const user = interaction.options.getUser('user');
    const creditScores = await BankManager.getCreditScores();
        
        // Initialize user if not exists
        if (!creditScores[user.id]) {
            creditScores[user.id] = {
                userId: user.id,
                username: user.username,
                creditScore: 50,
                maxLoan: BankManager.calculateMaxLoan({ score: 0 }),
                totalLoans: 0,
                loansRepaid: 0,
                investmentAmount: 0,
                createdAt: new Date().toISOString()
            };
            await BankManager.saveCreditScores(creditScores);
        }

    const userData = creditScores[user.id];
    const treasury = await BankManager.getTreasury();
        const interestRate = BankManager.calculateInterestRate(7, userData.creditScore); // Default 7-day term

        const embed = new EmbedBuilder()
            .setTitle(`Credit Profile - ${user.username}`)
            .setColor(0x00AE86)
            .addFields(
                { name: 'Credit Score', value: userData.creditScore.toString(), inline: true },
                { name: 'Max Loan Amount', value: `$${userData.maxLoan.toLocaleString()}`, inline: true },
                { name: 'Current Interest Rate (7-day)', value: `${interestRate}%`, inline: true },
                { name: 'Loans Repaid', value: userData.loansRepaid.toString(), inline: true },
                { name: 'Total Loans Taken', value: userData.totalLoans.toString(), inline: true },
                { name: 'Current Investment', value: `$${userData.investmentAmount?.toLocaleString() || '0'}`, inline: true },
                { name: 'Treasury Balance', value: `$${treasury.balance.toLocaleString()}`, inline: false }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async function handleLoanRequest(interaction) {
        if (!hasRequiredRole(interaction)) {
            const emb = makeEmbed('You do not have permission to use this command.', 'Permission denied', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const termWeeksRaw = interaction.options.getInteger('term_weeks');
        const taxRevenue = interaction.options.getInteger('tax_revenue') || 100000;

        // Normalize input: accept week counts (1-4) or day counts (7,14,21,28)
        let termWeeks = termWeeksRaw;
        if ([7,14,21,28].includes(termWeeksRaw)) termWeeks = Math.floor(termWeeksRaw / 7);
        const termDays = (termWeeks || 0) * 7;

        // Load settings and enforce max weeks
        const settings = await BankManager.getSettings();
        const maxWeeksAllowed = settings && settings.maxLoanWeeks ? settings.maxLoanWeeks : 4;

    const creditScores = await BankManager.getCreditScores();
        
        // Initialize user if not exists
        if (!creditScores[user.id]) {
            creditScores[user.id] = {
                userId: user.id,
                username: user.username,
                creditScore: 50,
                maxLoan: BankManager.calculateMaxLoan({ score: 0 }, taxRevenue),
                totalLoans: 0,
                loansRepaid: 0,
                investmentAmount: 0,
                createdAt: new Date().toISOString()
            };
        }

    const userData = creditScores[user.id];
    const maxLoan = BankManager.calculateMaxLoan(userData, taxRevenue, settings);

        if (amount > maxLoan) {
            return await interaction.reply({ 
                content: `Loan amount exceeds maximum allowed. Maximum: $${maxLoan.toLocaleString()}`,
                ephemeral: true 
            });
        }

    const treasury = await BankManager.getTreasury();
        if (amount > treasury.balance) {
            return await interaction.reply({
                content: `Insufficient funds in treasury. Available: $${treasury.balance.toLocaleString()}`,
                ephemeral: true
            });
        }

        // Calculate interest
        const interestRate = BankManager.calculateInterestRate(termDays, userData.creditScore, settings);
        const totalRepayment = amount + (amount * (interestRate / 100));

        // Create loan record
    const loanId = BankManager.generateLoanId();
    const loans = await BankManager.getLoans();
        
        loans[loanId] = {
            loanId,
            userId: user.id,
            username: user.username,
            amount,
            termDays,
            interestRate,
            totalRepayment,
            requestedAt: new Date().toISOString(),
            dueDate: new Date(Date.now() + termDays * 24 * 60 * 60 * 1000).toISOString(),
            status: 'pending',
            handledBy: interaction.user.id
        };

        // Update pending requests
    const pendingRequests = await BankManager.getPendingRequests();
        pendingRequests[loanId] = loans[loanId];

        // Update treasury (reserve the funds)
        treasury.balance -= amount;

        // Save all data
    await BankManager.saveCreditScores(creditScores);
    await BankManager.saveLoans(loans);
    await BankManager.savePendingRequests(pendingRequests);
    await BankManager.saveTreasury(treasury);

        // Create log embed
        const logEmbed = new EmbedBuilder()
            .setTitle('📋 New Loan Request')
            .setColor(0x3498DB)
            .addFields(
                { name: 'User', value: `<@${user.id}>`, inline: true },
                { name: 'Amount', value: `$${amount.toLocaleString()}`, inline: true },
                { name: 'Term', value: `${termDays} days`, inline: true },
                { name: 'Interest Rate', value: `${interestRate}%`, inline: true },
                { name: 'Total Repayment', value: `$${totalRepayment.toLocaleString()}`, inline: true },
                { name: 'Loan ID', value: loanId, inline: true },
                { name: 'Due Date', value: new Date(loans[loanId].dueDate).toLocaleDateString(), inline: false }
            )
            .setTimestamp();

        const logChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
        if (logChannel) {
            await logChannel.send({ embeds: [logEmbed] });
        }

        const replyEmb = makeEmbed(`Loan request for <@${user.id}> created successfully! Loan ID: ${loanId}`, 'Loan Request Created', 0x3498DB);
        await interaction.reply({ embeds: [replyEmb], ephemeral: true });
    }

    async function handleBankSettings(interaction) {
        if (!isKaldrOrJohn(interaction)) {
            const emb = makeEmbed('You do not have permission to use this command.', 'Permission denied', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();
        if (sub === 'view') {
            const current = await BankManager.getSettings();
            const emb = makeEmbed('Current bank settings:', 'Bank Settings', 0x3498DB);
            emb.addFields(
                { name: 'Max Loans', value: `${current.maxLoans}`, inline: true },
                { name: 'Max Loan Multiplier', value: `${current.maxLoanMultiplier}`, inline: true },
                { name: 'Dividend %', value: `${current.dividendPercent}`, inline: true },
                { name: 'Base Interest', value: `${current.baseInterest}`, inline: true },
                { name: 'Interest / day', value: `${current.interestPerDay}`, inline: true },
                { name: 'Max Loan Weeks', value: `${current.maxLoanWeeks}`, inline: true }
            );
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        // set
        const maxLoans = interaction.options.getInteger('max_loans');
        const maxLoanMultiplier = interaction.options.getNumber('max_loan_multiplier');
        const dividendPercent = interaction.options.getNumber('dividend_percent');
        const baseInterest = interaction.options.getNumber('base_interest');
        const interestPerDay = interaction.options.getNumber('interest_per_day');
        const maxLoanWeeks = interaction.options.getInteger('max_loan_weeks');

        const current = await BankManager.getSettings();
        const newSettings = Object.assign({}, current);
        if (typeof maxLoans === 'number') newSettings.maxLoans = maxLoans;
        if (typeof maxLoanMultiplier === 'number') newSettings.maxLoanMultiplier = maxLoanMultiplier;
        if (typeof dividendPercent === 'number') newSettings.dividendPercent = dividendPercent;
        if (typeof baseInterest === 'number') newSettings.baseInterest = baseInterest;
        if (typeof interestPerDay === 'number') newSettings.interestPerDay = interestPerDay;
        if (typeof maxLoanWeeks === 'number') newSettings.maxLoanWeeks = maxLoanWeeks;

        await BankManager.saveSettings(newSettings);

        const emb = makeEmbed('✅ Bank settings updated.', 'Settings Saved', 0x2ECC71);
        emb.addFields(
            { name: 'Max Loans', value: `${newSettings.maxLoans}`, inline: true },
            { name: 'Max Loan Multiplier', value: `${newSettings.maxLoanMultiplier}`, inline: true },
            { name: 'Dividend %', value: `${newSettings.dividendPercent}`, inline: true },
            { name: 'Base Interest', value: `${newSettings.baseInterest}`, inline: true },
            { name: 'Interest / day', value: `${newSettings.interestPerDay}`, inline: true },
            { name: 'Max Loan Weeks', value: `${newSettings.maxLoanWeeks}`, inline: true }
        );
        await interaction.reply({ embeds: [emb], ephemeral: true });
    }

    async function handleUpdateRoles(interaction) {
        // Only allow designated admins (Kaldr/John or server admin)
        if (!isKaldrOrJohn(interaction) && !interaction.member.permissions.has('ADMINISTRATOR')) {
            const emb = makeEmbed('You do not have permission to use this command.', 'Permission denied', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        const financeRole = interaction.options.getRole('finance_role');
        const adminRole = interaction.options.getRole('admin_role');
        const logsChannel = interaction.options.getChannel('logs_channel');
        const primaryReceiver = interaction.options.getUser('payment_receiver');
        const alt1 = interaction.options.getUser('payment_receiver_alt1');
        const alt2 = interaction.options.getUser('payment_receiver_alt2');

        // Merge with existing config if present
        let currentCfg = null;
        try { currentCfg = await BankManagerMultiGuild.getGuildConfig(interaction.guildId); } catch (e) { currentCfg = null; }

        const guildName = currentCfg ? currentCfg.guildName : (interaction.guild ? interaction.guild.name : 'Guild');
        const newFinance = financeRole ? financeRole.id : (currentCfg ? currentCfg.financeRoleId : null);
        const newAdmin = adminRole ? adminRole.id : (currentCfg ? currentCfg.adminRoleId : null);
        const newLogs = logsChannel ? logsChannel.id : (currentCfg ? currentCfg.logsChannelId : null);
        const newPrimary = primaryReceiver ? primaryReceiver.id : (currentCfg ? currentCfg.primaryPaymentUserId : null);
        const newAlt1 = alt1 ? alt1.id : (currentCfg ? currentCfg.altPaymentUserId1 : null);
        const newAlt2 = alt2 ? alt2.id : (currentCfg ? currentCfg.altPaymentUserId2 : null);

        // Persist using registerGuild (upsert)
        await BankManagerMultiGuild.registerGuild(interaction.guildId, guildName, newFinance, newAdmin, newLogs, newPrimary, newAlt1, newAlt2);

        // Send log to logs channel if available
        try {
            const logCh = client.channels.cache.get(newLogs || LOGS_CHANNEL_ID);
            if (logCh) {
                const logEmbed = makeEmbed(`Guild settings updated by <@${interaction.user.id}>`, 'Guild Settings Updated', 0x3498DB);
                logEmbed.addFields(
                    { name: 'Finance Role', value: newFinance ? `<@&${newFinance}>` : '—', inline: true },
                    { name: 'Banker/Admin Role', value: newAdmin ? `<@&${newAdmin}>` : '—', inline: true },
                    { name: 'Primary Receiver', value: newPrimary ? `<@${newPrimary}>` : '—', inline: true }
                );
                await logCh.send({ embeds: [logEmbed] }).catch(() => {});
            }
        } catch (e) { /* ignore */ }

        const emb = makeEmbed('✅ Roles and receivers updated.', 'Updated', 0x2ECC71);
        emb.addFields(
            { name: 'Finance Role', value: newFinance ? `<@&${newFinance}>` : '—', inline: true },
            { name: 'Banker/Admin Role', value: newAdmin ? `<@&${newAdmin}>` : '—', inline: true },
            { name: 'Primary Receiver', value: newPrimary ? `<@${newPrimary}>` : '—', inline: true },
            { name: 'Alt Receiver 1', value: newAlt1 ? `<@${newAlt1}>` : '—', inline: true },
            { name: 'Alt Receiver 2', value: newAlt2 ? `<@${newAlt2}>` : '—', inline: true }
        );

        await interaction.reply({ embeds: [emb], ephemeral: true });
    }

    async function handleInvestment(interaction) {
        if (!hasRequiredRole(interaction)) {
            const emb = makeEmbed('You do not have permission to use this command.', 'Permission denied', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

    const creditScores = await BankManager.getCreditScores();
    const treasury = await BankManager.getTreasury();

        // Initialize user if not exists
        if (!creditScores[user.id]) {
            creditScores[user.id] = {
                userId: user.id,
                username: user.username,
                creditScore: 0,
                maxLoan: BankManager.calculateMaxLoan({ score: 0 }),
                totalLoans: 0,
                loansRepaid: 0,
                investmentAmount: 0,
                createdAt: new Date().toISOString()
            };
        }

        // Update investment
        creditScores[user.id].investmentAmount = (creditScores[user.id].investmentAmount || 0) + amount;
        treasury.balance += amount;
        treasury.investments[user.id] = (treasury.investments[user.id] || 0) + amount;

        // Save data
    await BankManager.saveCreditScores(creditScores);
    await BankManager.saveTreasury(treasury);

        // Create investor DM embed
        const investorEmbed = new EmbedBuilder()
            .setTitle('🤝 Investment Confirmation')
            .setColor(0x27AE60)
            .addFields(
                { name: 'Investment Amount', value: `$${amount.toLocaleString()}`, inline: true },
                { name: 'Total Investment', value: `$${creditScores[user.id].investmentAmount.toLocaleString()}`, inline: true },
                { name: 'Credit Score', value: creditScores[user.id].creditScore.toString(), inline: true },
                { name: 'Weekly Dividends', value: 'Calculated based on bank profitability', inline: false },
                { name: 'Instructions', value: `Please send the funds to <@${JOHN_ID}> or <@${KALDR_ID}>`, inline: false }
            )
            .setTimestamp();

        try {
            await user.send({ embeds: [investorEmbed] });
        } catch (error) {
            console.log(`Could not DM user ${user.username}`);
        }

        // Create log embed
        const logEmbed = new EmbedBuilder()
            .setTitle('💰 New Investment')
            .setColor(0xF1C40F)
            .addFields(
                { name: 'Investor', value: `<@${user.id}>`, inline: true },
                { name: 'Amount', value: `$${amount.toLocaleString()}`, inline: true },
                { name: 'Total Treasury', value: `$${treasury.balance.toLocaleString()}`, inline: true }
            )
            .setTimestamp();

        const logChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
        if (logChannel) {
            await logChannel.send({ 
                content: `<@${JOHN_ID}> <@${KALDR_ID}> - New investment requires funding!`,
                embeds: [logEmbed] 
            });
        }

        {
            const emb = makeEmbed(`Investment recorded for <@${user.id}>. They have been DM'd with instructions.`, 'Investment Recorded', 0x2ECC71);
            await interaction.reply({ embeds: [emb], ephemeral: true });
        }
    }

    async function handleLoans(interaction) {
        if (!hasRequiredRole(interaction)) {
            const emb = makeEmbed('You do not have permission to use this command.', 'Permission denied', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

    const loans = await BankManager.getLoans();
        const activeLoans = Object.values(loans).filter(loan => loan.status === 'active' || loan.status === 'pending');

        if (activeLoans.length === 0) {
            const emb = makeEmbed('No active loans found.', 'No loans', 0x95A5A6);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        let loanList = '';
        activeLoans.forEach(loan => {
            loanList += `**${loan.loanId}** - <@${loan.userId}>\n` +
                       `Amount: $${loan.amount.toLocaleString()} | Rate: ${loan.interestRate}% | Due: ${new Date(loan.dueDate).toLocaleDateString()}\n\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle('📊 Current Loans')
            .setColor(0x9B59B6)
            .setDescription(loanList)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async function handleRequests(interaction) {
        if (!hasRequiredRole(interaction)) {
            const emb = makeEmbed('You do not have permission to use this command.', 'Permission denied', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

    const pendingRequests = await BankManager.getPendingRequests();

        if (Object.keys(pendingRequests).length === 0) {
            const emb = makeEmbed('No pending loan requests.', 'No requests', 0x95A5A6);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        let requestList = '';
        Object.values(pendingRequests).forEach(request => {
            requestList += `**${request.loanId}** - <@${request.userId}>\n` +
                          `Amount: $${request.amount.toLocaleString()} | Term: ${request.termDays} days\n\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle('⏳ Pending Loan Requests')
            .setColor(0xE67E22)
            .setDescription(requestList)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async function handleLoanSent(interaction) {
        if (!isKaldrOrJohn(interaction)) {
            const emb = makeEmbed('You do not have permission to use this command.', 'Permission denied', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        const loanId = interaction.options.getString('loanid');
    const loans = await BankManager.getLoans();
    const pendingRequests = await BankManager.getPendingRequests();

        if (!loans[loanId]) {
            const emb = makeEmbed('Loan ID not found.', 'Not found', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        // LOCK INTEREST AT DISBURSAL TIME
        const creditScores = await BankManager.getCreditScores();
        const userData = creditScores[loans[loanId].userId] || { creditScore: 0 };
        const settings = await BankManager.getSettings();
        
        // Recalculate and finalize interest based on current credit score and settings
        const finalInterestRate = BankManager.calculateInterestRate(loans[loanId].termDays, userData.creditScore, settings);
        const finalTotalRepayment = loans[loanId].amount + (loans[loanId].amount * (finalInterestRate / 100));
        const finalWeeklyPayment = Math.ceil(finalTotalRepayment / loans[loanId].numWeeks);
        
        loans[loanId].interestRate = finalInterestRate;
        loans[loanId].totalRepayment = finalTotalRepayment;
        loans[loanId].weeklyPayment = finalWeeklyPayment;

        // Update loan status
        loans[loanId].status = 'active';
        const nowISOString = new Date().toISOString();
        loans[loanId].disbursedAt = nowISOString;
        loans[loanId].interestLockedAt = nowISOString;
        
        // Remove from pending requests
        delete pendingRequests[loanId];

    // Save data
    await BankManager.saveLoans(loans);
    await BankManager.savePendingRequests(pendingRequests);

    // Update user's total loans count
        const userId = loans[loanId].userId;
        if (creditScores[userId]) {
            creditScores[userId].totalLoans = (creditScores[userId].totalLoans || 0) + 1;
            await BankManager.saveCreditScores(creditScores);
        }

        const logEmbed = new EmbedBuilder()
            .setTitle('✅ Loan Disbursed')
            .setColor(0x27AE60)
            .addFields(
                { name: 'Loan ID', value: loanId, inline: true },
                { name: 'User', value: `<@${userId}>`, inline: true },
                { name: 'Amount', value: `$${loans[loanId].amount.toLocaleString()}`, inline: true },
                { name: 'Final Interest Rate', value: `${finalInterestRate}%`, inline: true },
                { name: 'Weekly Payment', value: `$${finalWeeklyPayment.toLocaleString()}`, inline: true },
                { name: 'Disbursed By', value: `<@${interaction.user.id}>`, inline: false }
            )
            .setTimestamp();

        const logChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
        if (logChannel) {
            await logChannel.send({ embeds: [logEmbed] });
        }

        {
            const emb = makeEmbed(`Loan ${loanId} has been marked as disbursed.\nFinal Interest Rate: ${finalInterestRate}% | Weekly Payment: $${finalWeeklyPayment.toLocaleString()}`, 'Loan Disbursed', 0x27AE60);
            await interaction.reply({ embeds: [emb], ephemeral: true });
        }
    }

    async function handleInvestments(interaction) {
        if (!isKaldrOrJohn(interaction)) {
            const emb = makeEmbed('You do not have permission to use this command.', 'Permission denied', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

    const creditScores = await BankManager.getCreditScores();
    const settings = await BankManager.getSettings();
    const dividendPercent = settings && typeof settings.dividendPercent === 'number' ? settings.dividendPercent : 0.01;
    const investors = Object.values(creditScores).filter(user => user.investmentAmount > 0);

        if (investors.length === 0) {
            const emb = makeEmbed('No active investments.', 'No investments', 0x95A5A6);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        let investmentList = '';
        investors.forEach(investor => {
            const weeklyDividend = investor.investmentAmount * dividendPercent; // use configured dividend percent
            investmentList += `<@${investor.userId}> - **$${investor.investmentAmount.toLocaleString()}**\n` +
                            `Weekly Dividend: $${weeklyDividend.toLocaleString()}\n\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle('🏦 Current Investments')
            .setColor(0xF1C40F)
            .setDescription(investmentList)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async function handleCollection(interaction) {
        if (!isKaldrOrJohn(interaction)) {
            const emb = makeEmbed('You do not have permission to use this command.', 'Permission denied', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

    const loans = await BankManager.getLoans();
        const overdueLoans = Object.values(loans).filter(loan => {
            if (loan.status !== 'active') return false;
            const dueDate = new Date(loan.dueDate);
            return dueDate < new Date();
        });

        if (overdueLoans.length === 0) {
            const emb = makeEmbed('No overdue loans.', 'No overdue loans', 0x95A5A6);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        let overdueList = '';
        overdueLoans.forEach(loan => {
            const daysOverdue = Math.floor((new Date() - new Date(loan.dueDate)) / (1000 * 60 * 60 * 24));
            overdueList += `**${loan.loanId}** - <@${loan.userId}>\n` +
                          `Amount: $${loan.amount.toLocaleString()} | Overdue: ${daysOverdue} days\n` +
                          `Total Due: $${loan.totalRepayment.toLocaleString()}\n\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle('🚨 Overdue Loans - Collections')
            .setColor(0xE74C3C)
            .setDescription(overdueList)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async function handleWaiveInterest(interaction) {
        if (!isKaldrOrJohn(interaction)) {
            const emb = makeEmbed('You do not have permission to use this command.', 'Permission denied', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        const loanId = interaction.options.getString('loanid');
        const newInterest = interaction.options.getInteger('new_interest');
        
        const loans = await BankManager.getLoans();

        if (!loans[loanId]) {
            const emb = makeEmbed('Loan ID not found.', 'Not found', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        // Check if loan is active
        if (loans[loanId].status !== 'active') {
            const emb = makeEmbed(`Loan ${loanId} is not active. Cannot waive interest.`, 'Invalid loan status', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        // Store old values for logging
        const oldInterestRate = loans[loanId].interestRate;
        const oldTotalRepayment = loans[loanId].totalRepayment;
        const oldWeeklyPayment = loans[loanId].weeklyPayment;

        // Set new interest rate (default to 0 if not provided)
        const finalInterest = newInterest !== null ? newInterest : 0;
        
        // Recalculate repayment amounts
        const newTotalRepayment = loans[loanId].amount + (loans[loanId].amount * (finalInterest / 100));
        const newWeeklyPayment = Math.ceil(newTotalRepayment / loans[loanId].numWeeks);

        // Update loan
        loans[loanId].interestRate = finalInterest;
        loans[loanId].totalRepayment = newTotalRepayment;
        loans[loanId].weeklyPayment = newWeeklyPayment;
        loans[loanId].interestWaivedAt = new Date().toISOString();
        loans[loanId].interestWaivedBy = interaction.user.id;

        await BankManager.saveLoans(loans);

        // Log to channel
        const logEmbed = new EmbedBuilder()
            .setTitle('⚠️ Loan Interest Waived')
            .setColor(0xF39C12)
            .addFields(
                { name: 'Loan ID', value: loanId, inline: true },
                { name: 'Borrower', value: `<@${loans[loanId].userId}>`, inline: true },
                { name: 'Waived By', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Old Interest Rate', value: `${oldInterestRate}%`, inline: true },
                { name: 'New Interest Rate', value: `${finalInterest}%`, inline: true },
                { name: 'Old Weekly Payment', value: `$${oldWeeklyPayment.toLocaleString()}`, inline: true },
                { name: 'New Weekly Payment', value: `$${newWeeklyPayment.toLocaleString()}`, inline: true }
            )
            .setTimestamp();

        const logChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
        if (logChannel) {
            await logChannel.send({ embeds: [logEmbed] });
        }

        const replyEmb = makeEmbed(`Interest on loan ${loanId} updated!\nOld: ${oldInterestRate}% | New: ${finalInterest}%\nOld Weekly: $${oldWeeklyPayment.toLocaleString()} | New Weekly: $${newWeeklyPayment.toLocaleString()}`, 'Interest Waived', 0x2ECC71);
        await interaction.reply({ embeds: [replyEmb], ephemeral: true });
    }

    async function handleForgivePayment(interaction) {
        if (!isKaldrOrJohn(interaction)) {
            const emb = makeEmbed('You do not have permission to use this command.', 'Permission denied', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        const loanId = interaction.options.getString('loanid');
        const forgiveAmount = interaction.options.getInteger('amount');
        
        const loans = await BankManager.getLoans();

        if (!loans[loanId]) {
            const emb = makeEmbed('Loan ID not found.', 'Not found', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        const loan = loans[loanId];

        // Check if loan is active
        if (loan.status !== 'active') {
            const emb = makeEmbed(`Loan ${loanId} is not active. Cannot forgive balance.`, 'Invalid loan status', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        // Calculate remaining balance
        const totalPaid = loan.paymentsMade * loan.weeklyPayment;
        const remainingBalance = Math.max(0, loan.totalRepayment - totalPaid);

        if (remainingBalance === 0) {
            const emb = makeEmbed(`Loan ${loanId} has already been fully paid.`, 'Loan fully paid', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        const amountForgiven = forgiveAmount && forgiveAmount > 0 ? Math.min(forgiveAmount, remainingBalance) : remainingBalance;
        const newTotalRepayment = loan.totalRepayment - amountForgiven;

        // Update loan
        loan.totalRepayment = newTotalRepayment;
        loan.paymentsForgiven = (loan.paymentsForgiven || 0) + amountForgiven;
        loan.paymentsForgiveenAt = new Date().toISOString();
        loan.paymentsForgievenBy = interaction.user.id;

        // If loan is now fully paid, mark as complete
        if (totalPaid >= newTotalRepayment) {
            loan.status = 'complete';
            loan.completedAt = new Date().toISOString();
        }

        await BankManager.saveLoans(loans);

        // Log to channel
        const logEmbed = new EmbedBuilder()
            .setTitle('💳 Payment Forgiven')
            .setColor(0xF39C12)
            .addFields(
                { name: 'Loan ID', value: loanId, inline: true },
                { name: 'Borrower', value: `<@${loan.userId}>`, inline: true },
                { name: 'Forgiven By', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Amount Forgiven', value: `$${amountForgiven.toLocaleString()}`, inline: true },
                { name: 'Remaining Balance', value: `$${(newTotalRepayment - totalPaid).toLocaleString()}`, inline: true }
            )
            .setTimestamp();

        const logChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
        if (logChannel) {
            await logChannel.send({ embeds: [logEmbed] });
        }

        const replyEmb = makeEmbed(`Payment forgiven!\nAmount: $${amountForgiven.toLocaleString()}\nNew Balance: $${Math.max(0, newTotalRepayment - totalPaid).toLocaleString()}`, 'Payment Forgiven', 0x2ECC71);
        await interaction.reply({ embeds: [replyEmb], ephemeral: true });
    }

    async function handleRefinance(interaction) {
        if (!isKaldrOrJohn(interaction)) {
            const emb = makeEmbed('You do not have permission to use this command.', 'Permission denied', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        const loanId = interaction.options.getString('loanid');
        const newTermInput = interaction.options.getInteger('new_term_weeks');
        
        const loans = await BankManager.getLoans();

        if (!loans[loanId]) {
            const emb = makeEmbed('Loan ID not found.', 'Not found', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        const loan = loans[loanId];

        // Check if loan is active
        if (loan.status !== 'active') {
            const emb = makeEmbed(`Loan ${loanId} is not active. Cannot refinance.`, 'Invalid loan status', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        // Normalize term (handle day inputs like 7, 14, 21, 28)
        let newTermWeeks = newTermInput;
        if (newTermInput === 7) newTermWeeks = 1;
        else if (newTermInput === 14) newTermWeeks = 2;
        else if (newTermInput === 21) newTermWeeks = 3;
        else if (newTermInput === 28) newTermWeeks = 4;
        else if (![1, 2, 3, 4].includes(newTermInput)) {
            const emb = makeEmbed('Invalid term. Use 1-4 weeks or 7/14/21/28 days.', 'Invalid term', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        // Calculate remaining balance
        const totalPaid = loan.paymentsMade * loan.weeklyPayment;
        const remainingBalance = Math.max(0, loan.totalRepayment - totalPaid);

        if (remainingBalance === 0) {
            const emb = makeEmbed(`Loan ${loanId} has already been fully paid. Nothing to refinance.`, 'Loan fully paid', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        // Get settings for new interest calculation
        const creditScores = await BankManager.getCreditScores();
        const settings = await BankManager.getSettings();
        const userData = creditScores[loan.userId] || { creditScore: 0 };

        // Recalculate interest on remaining balance
        const newTermDays = newTermWeeks * 7;
        const newInterestRate = BankManager.calculateInterestRate(newTermDays, userData.creditScore, settings);
        const newTotalRepayment = remainingBalance + (remainingBalance * (newInterestRate / 100));
        const newWeeklyPayment = Math.ceil(newTotalRepayment / newTermWeeks);

        // Store old values for logging
        const oldWeeklyPayment = loan.weeklyPayment;
        const oldNumWeeks = loan.paymentsRemaining;

        // Update loan
        loan.termDays = newTermDays;
        loan.numWeeks = newTermWeeks;
        loan.interestRate = newInterestRate;
        loan.totalRepayment = newTotalRepayment;
        loan.weeklyPayment = newWeeklyPayment;
        loan.paymentsRemaining = newTermWeeks;
        loan.paymentsMade = 0; // Reset payment counter for new term
        loan.nextPaymentDue = new Date().toISOString();
        loan.refinancedAt = new Date().toISOString();
        loan.refinancedBy = interaction.user.id;

        await BankManager.saveLoans(loans);

        // Log to channel
        const logEmbed = new EmbedBuilder()
            .setTitle('🔄 Loan Refinanced')
            .setColor(0x3498DB)
            .addFields(
                { name: 'Loan ID', value: loanId, inline: true },
                { name: 'Borrower', value: `<@${loan.userId}>`, inline: true },
                { name: 'Refinanced By', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Old Term', value: `${oldNumWeeks} weeks`, inline: true },
                { name: 'New Term', value: `${newTermWeeks} weeks`, inline: true },
                { name: 'Old Weekly Payment', value: `$${oldWeeklyPayment.toLocaleString()}`, inline: true },
                { name: 'New Weekly Payment', value: `$${newWeeklyPayment.toLocaleString()}`, inline: true },
                { name: 'New Interest Rate', value: `${newInterestRate}%`, inline: true }
            )
            .setTimestamp();

        const logChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
        if (logChannel) {
            await logChannel.send({ embeds: [logEmbed] });
        }

        const replyEmb = makeEmbed(`Loan refinanced!\nOld: ${oldNumWeeks} weeks @ $${oldWeeklyPayment.toLocaleString()}/week\nNew: ${newTermWeeks} weeks @ $${newWeeklyPayment.toLocaleString()}/week (${newInterestRate}% interest)`, 'Loan Refinanced', 0x3498DB);
        await interaction.reply({ embeds: [replyEmb], ephemeral: true });
    }

    async function handleDividendsPaid(interaction) {
        if (!isKaldrOrJohn(interaction)) {
            const emb = makeEmbed('You do not have permission to use this command.', 'Permission denied', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        const totalAmount = interaction.options.getInteger('total_amount');

        if (totalAmount <= 0) {
            const emb = makeEmbed('Dividend amount must be greater than 0.', 'Invalid amount', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        const creditScores = await BankManager.getCreditScores();
        const investorList = Object.values(creditScores).filter(inv => inv.investmentAmount > 0);

        if (investorList.length === 0) {
            const emb = makeEmbed('No active investors to pay dividends to.', 'No investors', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        const treasury = await BankManager.getTreasury();

        if (treasury.balance < totalAmount) {
            const emb = makeEmbed(`Insufficient treasury balance. Available: $${treasury.balance.toLocaleString()}`, 'Insufficient funds', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        // Calculate total investment
        const totalInvested = investorList.reduce((sum, inv) => sum + inv.investmentAmount, 0);

        // Distribute dividends proportionally
        let distributedTotal = 0;
        const distributionMap = {};

        for (const investor of investorList) {
            const proportion = investor.investmentAmount / totalInvested;
            const dividendAmount = Math.floor(totalAmount * proportion);
            distributionMap[investor.userId] = dividendAmount;
            distributedTotal += dividendAmount;
            
            // Update investor dividends
            investor.dividendsReceived = (investor.dividendsReceived || 0) + dividendAmount;
            investor.lastDividendDate = new Date().toISOString();

            // Check if reinvestment is enabled
            if (investor.reinvestmentEnabled) {
                investor.investmentAmount += dividendAmount;
            }
        }

        // Save updated credit scores
        await BankManager.saveCreditScores(creditScores);

        // Reduce treasury balance
        treasury.balance -= totalAmount;
        treasury.lastDividendsPaidDate = new Date().toISOString();
        await BankManager.saveTreasury(treasury);

        // Log to channel
        const logEmbed = new EmbedBuilder()
            .setTitle('💰 Dividends Paid')
            .setColor(0x27AE60)
            .addFields(
                { name: 'Total Distributed', value: `$${distributedTotal.toLocaleString()}`, inline: true },
                { name: 'Recipients', value: investorList.length.toString(), inline: true },
                { name: 'New Treasury Balance', value: `$${treasury.balance.toLocaleString()}`, inline: true }
            )
            .setTimestamp();

        const logChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
        if (logChannel) {
            await logChannel.send({ embeds: [logEmbed] });
        }

        const replyEmb = makeEmbed(`Dividends paid!\nTotal: $${distributedTotal.toLocaleString()}\nRecipients: ${investorList.length}\nTreasury reduced to: $${treasury.balance.toLocaleString()}`, 'Dividends Paid', 0x27AE60);
        await interaction.reply({ embeds: [replyEmb], ephemeral: true });
    }

    async function handleReinvestmentToggle(interaction) {
        const user = interaction.user;
        const enableReinvestment = interaction.options.getBoolean('enable');

        const creditScores = await BankManager.getCreditScores();

        if (!creditScores[user.id] || creditScores[user.id].investmentAmount === 0) {
            const emb = makeEmbed('You do not have an active investment.', 'No investment', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        creditScores[user.id].reinvestmentEnabled = enableReinvestment;
        await BankManager.saveCreditScores(creditScores);

        const status = enableReinvestment ? '✅ enabled' : '❌ disabled';
        const replyEmb = makeEmbed(`Automatic dividend reinvestment ${status}`, 'Reinvestment Toggled', enableReinvestment ? 0x27AE60 : 0x95A5A6);
        await interaction.reply({ embeds: [replyEmb], ephemeral: true });
    }

    async function handleWithdrawInvestment(interaction) {
        const user = interaction.user;
        const withdrawAmount = interaction.options.getInteger('amount');

        const creditScores = await BankManager.getCreditScores();

        if (!creditScores[user.id] || creditScores[user.id].investmentAmount === 0) {
            const emb = makeEmbed('You do not have an active investment.', 'No investment', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        const currentAmount = creditScores[user.id].investmentAmount;
        const amountToWithdraw = withdrawAmount && withdrawAmount > 0 ? Math.min(withdrawAmount, currentAmount) : currentAmount;

        // Reduce treasury balance
        const treasury = await BankManager.getTreasury();
        
        if (treasury.balance < amountToWithdraw) {
            const emb = makeEmbed(`Insufficient treasury balance to process withdrawal. Available: $${treasury.balance.toLocaleString()}`, 'Insufficient funds', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        // Update investment
        const newAmount = currentAmount - amountToWithdraw;
        creditScores[user.id].investmentAmount = newAmount;
        await BankManager.saveCreditScores(creditScores);

        // Reduce treasury
        treasury.balance -= amountToWithdraw;
        await BankManager.saveTreasury(treasury);

        // Log to channel
        const logEmbed = new EmbedBuilder()
            .setTitle('💸 Investment Withdrawal')
            .setColor(0x3498DB)
            .addFields(
                { name: 'Investor', value: `<@${user.id}>`, inline: true },
                { name: 'Amount Withdrawn', value: `$${amountToWithdraw.toLocaleString()}`, inline: true },
                { name: 'Remaining Investment', value: `$${newAmount.toLocaleString()}`, inline: true }
            )
            .setTimestamp();

        const logChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
        if (logChannel) {
            await logChannel.send({ embeds: [logEmbed] });
        }

        const replyEmb = makeEmbed(`Investment withdrawal processed!\nWithdrawn: $${amountToWithdraw.toLocaleString()}\nRemaining: $${newAmount.toLocaleString()}`, 'Withdrawal Complete', 0x3498DB);
        await interaction.reply({ embeds: [replyEmb], ephemeral: true });
    }

    async function handleInvestmentSettings(interaction) {
        if (!isKaldrOrJohn(interaction)) {
            const emb = makeEmbed('You do not have permission to use this command.', 'Permission denied', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        const settings = await BankManager.getSettings();

        if (subcommand === 'view') {
            const embed = new EmbedBuilder()
                .setTitle('🏦 Investment Settings')
                .setColor(0x3498DB)
                .addFields(
                    { name: 'Max Investment per User', value: settings.maxInvestmentAmount === 0 ? 'Unlimited' : `$${settings.maxInvestmentAmount.toLocaleString()}`, inline: true },
                    { name: 'Investments', value: settings.investmentsEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Dividend %', value: `${(settings.dividendPercent * 100).toFixed(2)}%`, inline: true }
                )
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else if (subcommand === 'set') {
            const maxAmount = interaction.options.getInteger('max_amount');
            const enabled = interaction.options.getBoolean('enabled');

            if (maxAmount !== null) settings.maxInvestmentAmount = Math.max(0, maxAmount);
            if (enabled !== null) settings.investmentsEnabled = enabled;

            await BankManager.saveSettings(settings);

            const embed = new EmbedBuilder()
                .setTitle('✅ Investment Settings Updated')
                .setColor(0x27AE60)
                .addFields(
                    { name: 'Max Investment per User', value: settings.maxInvestmentAmount === 0 ? 'Unlimited' : `$${settings.maxInvestmentAmount.toLocaleString()}`, inline: true },
                    { name: 'Investments', value: settings.investmentsEnabled ? '✅ Enabled' : '❌ Disabled', inline: true }
                )
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};

// Export BankManager for tests and external usage
module.exports.BankManager = BankManager;
