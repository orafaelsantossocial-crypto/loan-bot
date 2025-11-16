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
                .setDescription('Loan term in weeks')
                .setRequired(true))
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

    // Slash command: collection (Kaldr and John only)
    const collectionCommand = new SlashCommandBuilder()
        .setName('collection')
        .setDescription('View overdue loans');

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
        registerallianceCommand
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
        const termDays = interaction.options.getInteger('term_weeks');
        const taxRevenue = interaction.options.getInteger('tax_revenue') || 100000;

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
    const maxLoan = BankManager.calculateMaxLoan(userData, taxRevenue);

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
        const interestRate = BankManager.calculateInterestRate(termDays, userData.creditScore);
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
                creditScore: 50,
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

        // Update loan status
        loans[loanId].status = 'active';
        loans[loanId].disbursedAt = new Date().toISOString();
        
        // Remove from pending requests
        delete pendingRequests[loanId];

    // Save data
    await BankManager.saveLoans(loans);
    await BankManager.savePendingRequests(pendingRequests);

    // Update user's total loans count
    const creditScores = await BankManager.getCreditScores();
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
                { name: 'Disbursed By', value: `<@${interaction.user.id}>`, inline: false }
            )
            .setTimestamp();

        const logChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
        if (logChannel) {
            await logChannel.send({ embeds: [logEmbed] });
        }

        {
            const emb = makeEmbed(`Loan ${loanId} has been marked as disbursed.`, 'Loan Disbursed', 0x27AE60);
            await interaction.reply({ embeds: [emb], ephemeral: true });
        }
    }

    async function handleInvestments(interaction) {
        if (!isKaldrOrJohn(interaction)) {
            const emb = makeEmbed('You do not have permission to use this command.', 'Permission denied', 0xE74C3C);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

    const creditScores = await BankManager.getCreditScores();
    const investors = Object.values(creditScores).filter(user => user.investmentAmount > 0);

        if (investors.length === 0) {
            const emb = makeEmbed('No active investments.', 'No investments', 0x95A5A6);
            return await interaction.reply({ embeds: [emb], ephemeral: true });
        }

        let investmentList = '';
        investors.forEach(investor => {
            const weeklyDividend = investor.investmentAmount * 0.01; // Example: 1% weekly
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
};

// Export BankManager for tests and external usage
module.exports.BankManager = BankManager;
