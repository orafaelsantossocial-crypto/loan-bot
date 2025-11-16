const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BankManager = require('./bank-manager-multi-guild');

module.exports = (client) => {
    // ===== GUILD VALIDATION HELPER =====
    const checkGuildRegistered = async (interaction) => {
        const config = await BankManager.getGuildConfig(interaction.guildId);
        if (!config) {
            const emb = makeEmbed('❌ This guild is not registered as an alliance. Use `/registeralliance` to set up.' + LOANCMDS_TIP, 'Guild not registered', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return null;
        }
        return config;
    };

    const hasFinanceRole = async (interaction) => {
        const config = await BankManager.getGuildConfig(interaction.guildId);
        if (!config) return false;
        return interaction.member.roles.cache.has(config.financeRoleId);
    };

    const hasAdminRole = async (interaction) => {
        const config = await BankManager.getGuildConfig(interaction.guildId);
        if (!config) return false;
        return interaction.member.roles.cache.has(config.adminRoleId);
    };

    // Tip used in non-embed responses to point users to the command list
    const LOANCMDS_TIP = '\n\nTip: Use /cmds to see available commands and role info.';

    // Simple embed builder for standard replies
    const makeEmbed = (description, title = null, color = 0x2ECC71) => {
        const e = new EmbedBuilder()
            .setColor(color)
            .setTimestamp()
            .setFooter({ text: 'Use /cmds to view commands and role permissions' });
        if (title) e.setTitle(title);
        if (description) e.setDescription(description);
        return e;
    };

    // ===== SLASH COMMANDS =====
    const registerallianceCommand = new SlashCommandBuilder()
        .setName('registeralliance')
        .setDescription('Register this guild as an alliance bank (admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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

    // Payment receivers: one required primary user and up to two optional backups
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

    const creditscorenewCommand = new SlashCommandBuilder()
        .setName('creditscore')
        .setDescription('Check a user\'s credit score and loan eligibility')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check')
                .setRequired(true));

    const loanrequestCommand = new SlashCommandBuilder()
        .setName('loanrequest')
        .setDescription('Request a loan for a user')
        // Targets the invoking user (no explicit user option)
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Loan amount')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('term_weeks')
                .setDescription('Loan term in weeks (1, 2, 3, or 4)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('tax_revenue')
                .setDescription('User\'s daily tax revenue (optional)')
                .setRequired(false));

    const investmentCommand = new SlashCommandBuilder()
        .setName('invest')
        .setDescription('Record an investment in the bank')
        // Targets the invoking user (no explicit user option)
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Investment amount')
                .setRequired(true));

    const loansCommand = new SlashCommandBuilder()
        .setName('loans')
        .setDescription('View all active and pending loans in this guild');

    const requestsCommand = new SlashCommandBuilder()
        .setName('requests')
        .setDescription('View pending loan requests');

    const loanconfirmCommand = new SlashCommandBuilder()
        .setName('loanconfirm')
        .setDescription('Confirm and mark a loan as disbursed')
        .addStringOption(option =>
            option.setName('loanid')
                .setDescription('The loan ID')
                .setRequired(true));

    const loancancelCommand = new SlashCommandBuilder()
        .setName('loancancel')
        .setDescription('Delete a pending loan request')
        .addStringOption(option =>
            option.setName('loanid')
                .setDescription('The loan ID to cancel')
                .setRequired(true));

    const investmentsCommand = new SlashCommandBuilder()
        .setName('investments')
        .setDescription('View all investments in this guild');

    const investconfirmCommand = new SlashCommandBuilder()
        .setName('investconfirm')
        .setDescription('Confirm and mark a pending investment as received')
        .addStringOption(option =>
            option.setName('txnid')
                .setDescription('The investment transaction ID')
                .setRequired(true));

    const treasuryCommand = new SlashCommandBuilder()
        .setName('treasury')
        .setDescription('View the guild treasury balance and transaction history');

    const collectionCommand = new SlashCommandBuilder()
        .setName('collection')
        .setDescription('View overdue loans requiring collection');

    const loanpaymentCommand = new SlashCommandBuilder()
        .setName('loanpayment')
        .setDescription('Request loan payment from a user')
        .addStringOption(option =>
            option.setName('loanid')
                .setDescription('The loan ID')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Payment amount')
                .setRequired(true));

    const cmdsCommand = new SlashCommandBuilder()
        .setName('cmds')
        .setDescription('Show all bot commands and which roles are allowed to use them');

    const paymentconfirmCommand = new SlashCommandBuilder()
        .setName('paymentconfirm')
        .setDescription('Confirm a loan payment has been received')
        .addStringOption(option =>
            option.setName('loanid')
                .setDescription('The loan ID')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Payment amount')
                .setRequired(true));

    const investmentcancelCommand = new SlashCommandBuilder()
        .setName('investmentcancel')
        .setDescription('Cancel a pending investment transaction')
        .addStringOption(option =>
            option.setName('txnid')
                .setDescription('The investment transaction ID')
                .setRequired(true));

    const clearinvestmentsCommand = new SlashCommandBuilder()
        .setName('clearinvestments')
        .setDescription('Clear all investments (requires confirmation, admin/banker only)');

    const investmentwithdrawCommand = new SlashCommandBuilder()
        .setName('investmentwithdraw')
        .setDescription('Withdraw funds from a user\'s investment (banker only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to withdraw from')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to withdraw (omit to withdraw entire investment)')
                .setRequired(false));

    // Register commands
    client.commands = [
        registerallianceCommand,
        creditscorenewCommand,
        loanrequestCommand,
        investmentCommand,
        loansCommand,
        requestsCommand,
        loanconfirmCommand,
        loancancelCommand,
    investconfirmCommand,
        investmentwithdrawCommand,
        investmentsCommand,
        treasuryCommand,
        collectionCommand,
        loanpaymentCommand,
        paymentconfirmCommand,
        investmentcancelCommand,
        clearinvestmentsCommand,
        cmdsCommand
    ];

    // ===== INTERACTION HANDLER =====
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton()) {
            // Handle button interactions (confirmation dialogs)
            if (interaction.customId === 'clearinvest_confirm') {
                await handleClearInvestmentsConfirm(interaction);
            } else if (interaction.customId === 'clearinvest_cancel') {
                await interaction.reply({ content: '❌ Investment clear cancelled.', ephemeral: true });
            }
            return;
        }
        
        if (!interaction.isChatInputCommand()) return;

        try {
            switch (interaction.commandName) {
                case 'registeralliance':
                    await handleRegisterAlliance(interaction);
                    break;
                case 'creditscore':
                    await handleCreditScore(interaction);
                    break;
                case 'loanrequest':
                    await handleLoanRequest(interaction);
                    break;
                        case 'invest':
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
                case 'loanconfirm':
                    await handleLoanSent(interaction);
                    break;
                case 'investconfirm':
                    await handleInvestConfirm(interaction);
                    break;
                case 'investmentwithdraw':
                    await handleInvestmentWithdraw(interaction);
                    break;
                case 'investments':
                    await handleInvestments(interaction);
                    break;
                case 'treasury':
                    await handleTreasury(interaction);
                    break;
                case 'collection':
                    await handleCollection(interaction);
                    break;
                case 'loanpayment':
                    await handleLoanPayment(interaction);
                    break;
                case 'paymentconfirm':
                    await handlePaymentConfirm(interaction);
                    break;
                case 'loancancel':
                    await handleLoanCancel(interaction);
                    break;
                case 'investmentcancel':
                    await handleInvestmentCancel(interaction);
                    break;
                case 'clearinvestments':
                    await handleClearInvestments(interaction);
                    break;
                case 'cmds':
                    await handleCmds(interaction);
                    break;
            }
        } catch (error) {
            console.error('Error handling command:', error);
            const errContent = 'There was an error executing this command.' + LOANCMDS_TIP;
            const emb = makeEmbed(errContent, 'Command Error', 0xE74C3C);
            try {
                // Prefer to follow up or edit a deferred reply when possible. If the
                // interaction token is already expired (Unknown interaction), trying
                // to reply will fail. In that case, attempt to DM the user with the
                // error summary so they get feedback, otherwise just log.
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ embeds: [emb], ephemeral: true }).catch(() => {});
                } else {
                    // Try a direct reply first, but fall back to DM if the interaction
                    // is no longer valid (Discord API will throw 10062 in that case).
                    try {
                        await interaction.reply({ embeds: [emb], ephemeral: true });
                    } catch (replyErr) {
                        // If reply fails (likely Unknown interaction), attempt to DM the user
                        try { await interaction.user.send({ embeds: [emb] }); } catch (_) { /* ignore */ }
                    }
                }
            } catch (e) {
                console.error('Failed to notify user about error:', e);
            }
        }
    });

    async function handleCreditScore(interaction) {
        const config = await checkGuildRegistered(interaction);
        if (!config) return;

    // Target the invoking user
    const user = interaction.user;
        let creditScores = await BankManager.getCreditScores();

        // Initialize user if not exists and use returned profile to avoid stale map
        if (!creditScores[user.id]) {
            const created = await BankManager.initializeUserProfile(user.id, user.username);
            creditScores[user.id] = created;
        }

        const userData = creditScores[user.id];
        const userLoans = await BankManager.getAllLoansForUser(user.id);
        const activeLoans = userLoans.filter(l => l.status === 'active' || l.status === 'pending').length;
        const interestRate = BankManager.calculateInterestRate(7, userData.creditScore);

        const embed = new EmbedBuilder()
            .setTitle(`Credit Profile - ${user.username}`)
            .setColor(0x00AE86)
            .addFields(
                { name: 'Credit Score', value: userData.creditScore.toString(), inline: true },
                { name: 'Max Loan Amount', value: `$${BankManager.calculateMaxLoan(userData).toLocaleString()}`, inline: true },
                { name: 'Current Interest Rate (7-day)', value: `${interestRate}%`, inline: true },
                { name: 'Loans Repaid', value: userData.loansRepaid.toString(), inline: true },
                { name: 'Total Loans Taken', value: userData.totalLoans.toString(), inline: true },
                { name: 'Active Loans (All Guilds)', value: activeLoans.toString(), inline: true }
            )
            .setFooter({ text: 'Use /cmds to view commands and role permissions' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
        async function handleCreditScore(interaction) {
            const config = await checkGuildRegistered(interaction);
            if (!config) return;

            // Target the invoking user
            const user = interaction.user;

            // Get all guild-specific credit scores for this user
            const guildScores = await BankManager.getAllGuildCreditScores(user.id);
    
            // Initialize guild score if it doesn't exist
            if (!guildScores[interaction.guildId]) {
                guildScores[interaction.guildId] = await BankManager.initializeGuildCreditScore(user.id, interaction.guildId, user.username);
            }

            // Calculate total credit score across all guilds
            const totalCreditScore = BankManager.calculateTotalCreditScore(guildScores);
            const currentGuildScore = guildScores[interaction.guildId];

            // Get user's loans
            const userLoans = await BankManager.getAllLoansForUser(user.id);
            const activeLoans = userLoans.filter(l => l.status === 'active' || l.status === 'pending').length;
    
            // Calculate interest rate using current guild score
            const interestRate = BankManager.calculateInterestRate(7, currentGuildScore.creditScore || 50);

            // Build guild scores breakdown
            let guildBreakdown = '';
            for (const gId of Object.keys(guildScores)) {
                const score = guildScores[gId];
                const guildName = gId === interaction.guildId ? `${config.guildName} (this server)` : `Guild ${gId}`;
                guildBreakdown += `${guildName}: **${score.creditScore}** (${score.loansRepaid} repaid)\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`💳 Credit Profile - ${user.username}`)
                .setColor(0x00AE86)
                .addFields(
                    { name: '📊 Global Credit Score', value: totalCreditScore.toString(), inline: false },
                    { name: `📍 ${config.guildName} Score`, value: (currentGuildScore.creditScore || 50).toString(), inline: true },
                    { name: 'Loans Repaid (This Guild)', value: (currentGuildScore.loansRepaid || 0).toString(), inline: true },
                    { name: 'Current Interest Rate (7-day)', value: `${interestRate}%`, inline: true },
                    { name: 'Max Loan Amount', value: `$${BankManager.calculateMaxLoan({ creditScore: totalCreditScore }).toLocaleString()}`, inline: true },
                    { name: 'Active Loans (All Guilds)', value: activeLoans.toString(), inline: true },
                    { name: '🏛️ Credit Score by Guild', value: guildBreakdown || 'No guild scores yet', inline: false }
                )
                .setFooter({ text: 'Use /cmds to view commands. Credit scores are per-guild and combine for your total score.' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

    async function handleRegisterAlliance(interaction) {
        // Only admins can run this (enforced by command permissions as well)
        if (!(interaction.member && interaction.member.permissions && interaction.member.permissions.has && interaction.member.permissions.has(PermissionFlagsBits.Administrator))) {
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
            await BankManager.registerGuild(guildId, guildName, financeRole.id, adminRole.id, logsChannel.id, primaryReceiver.id, alt1 ? alt1.id : null, alt2 ? alt2.id : null);
            const successDesc = `✅ Alliance **${guildName}** registered successfully!\n\n**Finance Role**: ${financeRole}\n**Admin Role**: ${adminRole}\n**Logs Channel**: ${logsChannel}\n**Primary Payment Receiver**: <@${primaryReceiver.id}>${alt1 ? `\n**Alternate Receiver 1**: <@${alt1.id}>` : ''}${alt2 ? `\n**Alternate Receiver 2**: <@${alt2.id}>` : ''}\n\nYou can now use banking commands!`;
            const emb = makeEmbed(successDesc, 'Alliance Registered', 0x2ECC71);
            await interaction.reply({ embeds: [emb], ephemeral: true });
        } catch (error) {
            console.error('Error registering alliance:', error);
            const emb = makeEmbed('Failed to register alliance. Please try again.' + LOANCMDS_TIP, 'Registration Failed', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
        }
    }

    async function handleLoanRequest(interaction) {
        const config = await checkGuildRegistered(interaction);
        if (!config) return;

    // Target the invoking user
    const user = interaction.user;
    const amount = interaction.options.getInteger('amount');
    const termWeeks = interaction.options.getInteger('term_weeks');
    const taxRevenue = interaction.options.getInteger('tax_revenue') || 100000;
    const termDays = (termWeeks || 0) * 7;

        // Validate numeric inputs
        if (typeof amount === 'number' && amount <= 0) {
            const emb = makeEmbed('number must be positive' + LOANCMDS_TIP, 'Invalid number', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }
        if (typeof termWeeks === 'number' && termWeeks <= 0) {
            const emb = makeEmbed('number must be positive' + LOANCMDS_TIP, 'Invalid number', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }
        if (typeof taxRevenue === 'number' && taxRevenue <= 0) {
            const emb = makeEmbed('number must be positive' + LOANCMDS_TIP, 'Invalid number', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        // Enforce 4 week max and weekly terms
        if (termWeeks > 4) {
            const emb = makeEmbed('Loan term cannot exceed 4 weeks.' + LOANCMDS_TIP, 'Invalid term', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        if (![1,2,3,4].includes(termWeeks)) {
            const emb = makeEmbed('Loan term must be 1, 2, 3, or 4 weeks.' + LOANCMDS_TIP, 'Invalid term', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const creditScores = await BankManager.getCreditScores();
        if (!creditScores[user.id]) {
            await BankManager.initializeUserProfile(user.id, user.username);
        }

        // Ensure a per-guild credit score exists for this user
        await BankManager.initializeGuildCreditScore(user.id, interaction.guildId, user.username);

        const userData = creditScores[user.id];
        const maxLoan = BankManager.calculateMaxLoan(userData, taxRevenue);

        if (amount > maxLoan) {
            const emb = makeEmbed(`Loan amount exceeds maximum allowed. Maximum: $${maxLoan.toLocaleString()}` + LOANCMDS_TIP, 'Amount too large', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        // Check if user already has a loan from THIS guild
        const guildLoans = await BankManager.getLoans(interaction.guildId);
        const userLoanInGuild = Object.values(guildLoans).find(l => l.userId === user.id && (l.status === 'active' || l.status === 'pending'));
        if (userLoanInGuild) {
            const emb = makeEmbed(`${user.username} already has an active loan in this guild (${userLoanInGuild.loanId}).` + LOANCMDS_TIP, 'Loan exists', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const treasury = await BankManager.getTreasury(interaction.guildId);
        if (amount > treasury.balance) {
            const emb = makeEmbed(`Insufficient funds in treasury. Available: $${treasury.balance.toLocaleString()}` + LOANCMDS_TIP, 'Insufficient funds', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        // Calculate loan terms
        const interestRate = BankManager.calculateInterestRate(termDays, userData.creditScore);
        const totalRepayment = amount + (amount * (interestRate / 100));
    const numWeeks = termWeeks;
        const weeklyPayment = Math.ceil(totalRepayment / numWeeks);

        // Generate loan ID
        const loanId = await BankManager.generateLoanId();
    const loans = await BankManager.getLoans(interaction.guildId);

        loans[loanId] = {
            loanId,
            guildId: interaction.guildId,
            userId: user.id,
            username: user.username,
            amount,
            termDays,
            interestRate,
            totalRepayment,
            weeklyPayment,
            numWeeks,
            requestedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            dueDate: new Date(Date.now() + termDays * 24 * 60 * 60 * 1000).toISOString(),
            status: 'pending',
            handledBy: interaction.user.id,
            disbursedAt: null,
            collectionsPenaltyApplied: false
        };

    // Save data (treasury is NOT updated until loan is confirmed)
    await BankManager.saveLoans(interaction.guildId, loans);

        // Log to channel
        const logChannel = client.channels.cache.get(config.logsChannelId);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('📋 New Loan Request')
                .setColor(0x3498DB)
                .addFields(
                    { name: 'User', value: `<@${user.id}>`, inline: true },
                    { name: 'Amount', value: `$${amount.toLocaleString()}`, inline: true },
                    { name: 'Term', value: `${termDays} days`, inline: true },
                    { name: 'Interest Rate', value: `${interestRate}%`, inline: true },
                    { name: 'Weekly Payment', value: `$${weeklyPayment.toLocaleString()}`, inline: true },
                    { name: 'Loan ID', value: loanId, inline: true }
                )
                .setFooter({ text: 'Use /cmds to view commands and role permissions' })
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
        }

        // Send PM to borrower with loan ID
        try {
            const loanRequestDM = new EmbedBuilder()
                .setTitle('📋 Loan Request Submitted')
                .setColor(0x3498DB)
                .addFields(
                    { name: 'Loan ID', value: loanId, inline: false },
                    { name: 'Amount', value: `$${amount.toLocaleString()}`, inline: true },
                    { name: 'Weekly Payment', value: `$${weeklyPayment.toLocaleString()}`, inline: true },
                    { name: 'Term', value: `${termDays} days`, inline: true },
                    { name: 'Interest Rate', value: `${interestRate}%`, inline: true },
                    { name: 'Important', value: '**Please save your Loan ID!** You will need it to check your loan status and make payments.' }
                )
                .setFooter({ text: 'Use /cmds to view commands and role permissions' })
                .setTimestamp();
            await user.send({ embeds: [loanRequestDM] });
        } catch (e) {
            console.log(`Could not DM ${user.username}`);
        }

        const replyEmb = makeEmbed(`✅ Loan request created! ID: **${loanId}**\nWeekly payment: $${weeklyPayment.toLocaleString()} for ${numWeeks} weeks.` + LOANCMDS_TIP, 'Loan Request Created', 0x3498DB);
        await interaction.reply({ embeds: [replyEmb], ephemeral: true });
    }

    async function handleInvestment(interaction) {
        const config = await checkGuildRegistered(interaction);
        if (!config) return;

        if (!(await hasFinanceRole(interaction))) {
            const emb = makeEmbed('You do not have permission to use this command.' + LOANCMDS_TIP, 'Permission denied', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

    // Target invoking user
    const user = interaction.user;
        const amount = interaction.options.getInteger('amount');

        // Validate numeric input
        if (typeof amount === 'number' && amount <= 0) {
            const emb = makeEmbed('number must be positive' + LOANCMDS_TIP, 'Invalid number', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        // Create a pending investment transaction that bankers must confirm
        const txnId = await BankManager.generateInvestmentId(interaction.guildId);
        const pending = {
            txnId,
            userId: user.id,
            username: user.username,
            amount,
            requestedAt: new Date().toISOString(),
            handledBy: interaction.user.id
        };

        await BankManager.addPendingInvestment(interaction.guildId, txnId, pending);

        // Send DM to investor explaining it's pending and provide txnId
        const investDM = new EmbedBuilder()
            .setTitle('🤝 Investment Pending')
            .setColor(0xF1C40F)
            .addFields(
                { name: 'Transaction ID', value: txnId, inline: true },
                { name: 'Investment Amount', value: `$${amount.toLocaleString()}`, inline: true },
                { name: 'Status', value: 'Pending - a Banker must confirm receipt with /investconfirm', inline: false },
                { name: 'Instructions', value: (() => {
                    if (!config) return 'Please send funds to your guild bankers.';
                    const parts = [];
                    if (config.primaryPaymentUserId) parts.push(`<@${config.primaryPaymentUserId}>`);
                    if (config.altPaymentUserId1) parts.push(`<@${config.altPaymentUserId1}>`);
                    if (config.altPaymentUserId2) parts.push(`<@${config.altPaymentUserId2}>`);
                    if (parts.length > 0) return `Please send funds to: ${parts.join(' or ')}`;
                    return `Please send funds to the guild bankers (Banker Role: <@&${config.adminRoleId}>)`;
                })(), inline: false }
            )
            .setFooter({ text: 'Use /cmds to view commands and role permissions' })
            .setTimestamp();

        try { await user.send({ embeds: [investDM] }); } catch (e) { console.log(`Could not DM ${user.username}`); }

        // Log pending investment to channel for bankers
        const logChannel = client.channels.cache.get(config.logsChannelId);
        if (logChannel) {
        const logEmbed = new EmbedBuilder()
                .setTitle('💰 Pending Investment')
                .setColor(0xF1C40F)
                .addFields(
                    { name: 'Txn ID', value: txnId, inline: true },
                    { name: 'Investor', value: `<@${user.id}>`, inline: true },
                    { name: 'Amount', value: `$${amount.toLocaleString()}`, inline: true }
                )
            .setFooter({ text: 'Use /cmds to view commands and role permissions' })
                .setTimestamp();
            await logChannel.send({ content: `<@&${config.adminRoleId}> - Pending investment awaiting confirmation. Use /investconfirm ${txnId}`, embeds: [logEmbed] });
        }

        const replyEmb = makeEmbed(`✅ Investment pending. Transaction ID: **${txnId}** — a Banker must confirm receipt with /investconfirm ${txnId}.` + LOANCMDS_TIP, 'Investment Pending', 0xF1C40F);
        await interaction.reply({ embeds: [replyEmb], ephemeral: true });
    }

    async function handleLoans(interaction) {
        const config = await checkGuildRegistered(interaction);
        if (!config) return;

        if (!(await hasFinanceRole(interaction))) {
            const emb = makeEmbed('You do not have permission to use this command.' + LOANCMDS_TIP, 'Permission denied', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const loans = await BankManager.getLoans(interaction.guildId);
        const activeLoans = Object.values(loans).filter(l => l.status === 'active' || l.status === 'pending');

        if (activeLoans.length === 0) {
            const emb = makeEmbed('No active loans in this guild.' + LOANCMDS_TIP, 'No active loans', 0xE67E22);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        let loanList = '';
        activeLoans.forEach(loan => {
            loanList += `**${loan.loanId}** - <@${loan.userId}>\n` +
                       `Amount: $${loan.amount.toLocaleString()} | Rate: ${loan.interestRate}% | Status: ${loan.status}\n\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle('📊 Guild Loans')
            .setColor(0x9B59B6)
            .setDescription(loanList)
            .setFooter({ text: 'Use /cmds to view commands and role permissions' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async function handleRequests(interaction) {
        const config = await checkGuildRegistered(interaction);
        if (!config) return;

        if (!(await hasAdminRole(interaction))) {
            const emb = makeEmbed('You do not have permission to use this command.' + LOANCMDS_TIP, 'Permission denied', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const pendingRequests = await BankManager.getPendingRequests(interaction.guildId);

        if (Object.keys(pendingRequests).length === 0) {
            const emb = makeEmbed('No pending loan requests.' + LOANCMDS_TIP, 'No pending requests', 0xE67E22);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        let requestList = '';
        Object.values(pendingRequests).forEach(req => {
            requestList += `**${req.loanId}** - <@${req.userId}>\n` +
                          `Amount: $${req.amount.toLocaleString()} | Term: ${req.termDays} days\n\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle('⏳ Pending Requests')
            .setColor(0xE67E22)
            .setDescription(requestList)
            .setFooter({ text: 'Use /cmds to view commands and role permissions' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async function handleLoanSent(interaction) {
        const config = await checkGuildRegistered(interaction);
        if (!config) return;

        if (!(await hasAdminRole(interaction))) {
            const emb = makeEmbed('You do not have permission to use this command.' + LOANCMDS_TIP, 'Permission denied', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const loanId = interaction.options.getString('loanid');
        const loans = await BankManager.getLoans(interaction.guildId);

        if (!loans[loanId]) {
            const emb = makeEmbed('Loan ID not found in this guild.' + LOANCMDS_TIP, 'Loan not found', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        // Prevent double-confirmation/disbursal
        if (loans[loanId].disbursedAt) {
            const emb = makeEmbed(`Loan ${loanId} was already confirmed as disbursed.` + LOANCMDS_TIP, 'Already disbursed', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        loans[loanId].status = 'active';
        const nowISOString = new Date().toISOString();
        loans[loanId].disbursedAt = nowISOString;
        // When disbursed, make the first week's payment due immediately
        loans[loanId].nextPaymentDue = nowISOString;
        loans[loanId].paymentsMade = 0;
        loans[loanId].paymentsRemaining = loans[loanId].numWeeks;

        const creditScores = await BankManager.getCreditScores();
        // Only increment totalLoans once (if this is the first disbursal)
        if (creditScores[loans[loanId].userId] && !loans[loanId]._totalLoansIncremented) {
            creditScores[loans[loanId].userId].totalLoans += 1;
            loans[loanId]._totalLoansIncremented = true;
            await BankManager.saveCreditScores(creditScores);
        }

        // Ensure treasury has funds and deduct now that the loan is being disbursed
        const treasury = await BankManager.getTreasury(interaction.guildId);
        if ((treasury.balance || 0) < (loans[loanId].amount || 0)) {
            const emb = makeEmbed('Insufficient funds in treasury to disburse this loan.' + LOANCMDS_TIP, 'Insufficient funds', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }
        treasury.balance -= (loans[loanId].amount || 0);
        await BankManager.saveTreasury(interaction.guildId, treasury);

        await BankManager.saveLoans(interaction.guildId, loans);

        // Log
        const logChannel = client.channels.cache.get(config.logsChannelId);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('✅ Loan Disbursed')
                .setColor(0x27AE60)
                .addFields(
                    { name: 'Loan ID', value: loanId, inline: true },
                    { name: 'Borrower', value: `<@${loans[loanId].userId}>`, inline: true },
                    { name: 'Amount', value: `$${loans[loanId].amount.toLocaleString()}`, inline: true }
                )
                .setFooter({ text: 'Use /cmds to view commands and role permissions' })
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
        }

        const replyEmb = makeEmbed(`✅ Loan ${loanId} marked as active!` + LOANCMDS_TIP, 'Loan Disbursed', 0x27AE60);
        await interaction.reply({ embeds: [replyEmb], ephemeral: true });
    }

    async function handleInvestConfirm(interaction) {
        const config = await checkGuildRegistered(interaction);
        if (!config) return;

        if (!(await hasAdminRole(interaction))) {
            const emb = makeEmbed('You do not have permission to use this command.' + LOANCMDS_TIP, 'Permission denied', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const txnId = interaction.options.getString('txnid');
        const pending = await BankManager.getPendingInvestments(interaction.guildId);

        if (!pending || !pending[txnId]) {
            const emb = makeEmbed('Investment transaction ID not found.' + LOANCMDS_TIP, 'Not found', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const p = pending[txnId];
        const amount = p.amount || 0;

        // Update investors table
        const investors = await BankManager.getInvestors(interaction.guildId);
        if (!investors[p.userId]) {
            investors[p.userId] = { userId: p.userId, username: p.username || '', investmentAmount: 0 };
        }
        investors[p.userId].investmentAmount = (investors[p.userId].investmentAmount || 0) + amount;
        await BankManager.saveInvestors(interaction.guildId, investors);

        // Update treasury balance
        const treasury = await BankManager.getTreasury(interaction.guildId);
        treasury.balance = (treasury.balance || 0) + amount;
        await BankManager.saveTreasury(interaction.guildId, treasury);

        // Remove pending
        await BankManager.removePendingInvestment(interaction.guildId, txnId);

        // Log
        const logChannel = client.channels.cache.get(config.logsChannelId);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('✅ Investment Confirmed')
                .setColor(0x27AE60)
                .addFields(
                    { name: 'Txn ID', value: txnId, inline: true },
                    { name: 'Investor', value: `<@${p.userId}>`, inline: true },
                    { name: 'Amount', value: `$${amount.toLocaleString()}`, inline: true }
                )
                .setFooter({ text: 'Use /cmds to view commands and role permissions' })
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
        }

        const replyEmb = makeEmbed(`✅ Investment ${txnId} confirmed and funds added to treasury.`, 'Investment Confirmed', 0x27AE60);
        await interaction.reply({ embeds: [replyEmb], ephemeral: true });
    }

    async function handleInvestmentCancel(interaction) {
        const config = await checkGuildRegistered(interaction);
        if (!config) return;

        if (!(await hasAdminRole(interaction))) {
            const emb = makeEmbed('You do not have permission to use this command.' + LOANCMDS_TIP, 'Permission denied', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const txnId = interaction.options.getString('txnid');
        const pending = await BankManager.getPendingInvestments(interaction.guildId);
        if (!pending || !pending[txnId]) {
            const emb = makeEmbed('Investment transaction ID not found.' + LOANCMDS_TIP, 'Not found', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        await BankManager.removePendingInvestment(interaction.guildId, txnId);

        const logChannel = client.channels.cache.get(config.logsChannelId);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('🗑️ Investment Cancelled')
                .setColor(0xE67E22)
                .addFields(
                    { name: 'Txn ID', value: txnId, inline: true },
                    { name: 'Cancelled By', value: `<@${interaction.user.id}>`, inline: true }
                )
                .setFooter({ text: 'Use /cmds to view commands and role permissions' })
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
        }

        const replyEmb = makeEmbed(`✅ Investment ${txnId} has been cancelled and removed from pending.`, 'Investment Cancelled', 0xE67E22);
        await interaction.reply({ embeds: [replyEmb], ephemeral: true });
    }

    async function handleInvestmentWithdraw(interaction) {
        const config = await checkGuildRegistered(interaction);
        if (!config) return;

        if (!(await hasAdminRole(interaction))) {
            const emb = makeEmbed('You do not have permission to use this command.' + LOANCMDS_TIP, 'Permission denied', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const targetUser = interaction.options.getUser('user');
        let amount = interaction.options.getInteger('amount');

        const investors = await BankManager.getInvestors(interaction.guildId);
        const inv = investors[targetUser.id];
        if (!inv || !(inv.investmentAmount > 0)) {
            const emb = makeEmbed('User has no active investment in this guild.' + LOANCMDS_TIP, 'No investment found', 0xE67E22);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const investorBalance = inv.investmentAmount || 0;

        if (typeof amount === 'number') {
            if (amount <= 0) {
                const emb = makeEmbed('number must be positive' + LOANCMDS_TIP, 'Invalid number', 0xE74C3C);
                await interaction.reply({ embeds: [emb], ephemeral: true });
                return;
            }
            if (amount > investorBalance) {
                const emb = makeEmbed('Withdrawal amount exceeds the user\'s investment balance.' + LOANCMDS_TIP, 'Amount too large', 0xE74C3C);
                await interaction.reply({ embeds: [emb], ephemeral: true });
                return;
            }
        } else {
            amount = investorBalance; // withdraw full balance
        }

        // Check treasury funds
        const treasury = await BankManager.getTreasury(interaction.guildId);
        if ((treasury.balance || 0) < amount) {
            const emb = makeEmbed('Insufficient funds in treasury to perform the withdrawal.' + LOANCMDS_TIP, 'Insufficient funds', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        // Deduct from treasury
        treasury.balance -= amount;
        await BankManager.saveTreasury(interaction.guildId, treasury);

        // Update or remove investor
        if (amount >= investorBalance) {
            // remove investor record
            await BankManager.deleteInvestor(interaction.guildId, targetUser.id);
        } else {
            investors[targetUser.id].investmentAmount = investorBalance - amount;
            await BankManager.saveInvestors(interaction.guildId, investors);
        }

        // Log
        const logChannel = client.channels.cache.get(config.logsChannelId);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('💸 Investment Withdrawal')
                .setColor(0xF39C12)
                .addFields(
                    { name: 'Investor', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Amount Withdrawn', value: `$${amount.toLocaleString()}`, inline: true },
                    { name: 'Remaining Balance', value: `${(investors[targetUser.id] ? `$${investors[targetUser.id].investmentAmount.toLocaleString()}` : '$0')}`, inline: true }
                )
                .setFooter({ text: 'Use /cmds to view commands and role permissions' })
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
        }

        const replyEmb = makeEmbed(`✅ Withdrawn $${amount.toLocaleString()} from <@${targetUser.id}>'s investment.` + LOANCMDS_TIP, 'Withdrawal Complete', 0x27AE60);
        await interaction.reply({ embeds: [replyEmb], ephemeral: true });
    }

    async function handleLoanCancel(interaction) {
        const config = await checkGuildRegistered(interaction);
        if (!config) return;

        if (!(await hasAdminRole(interaction))) {
            const emb = makeEmbed('You do not have permission to use this command.' + LOANCMDS_TIP, 'Permission denied', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const loanId = interaction.options.getString('loanid');
        const loans = await BankManager.getLoans(interaction.guildId);
        if (!loans[loanId]) {
            const emb = makeEmbed('Loan ID not found in this guild.' + LOANCMDS_TIP, 'Not found', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        if (loans[loanId].status !== 'pending') {
            const emb = makeEmbed('Only pending loan requests can be cancelled.' + LOANCMDS_TIP, 'Cannot cancel', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        await BankManager.deleteLoan(interaction.guildId, loanId);

        const logChannel = client.channels.cache.get(config.logsChannelId);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('🗑️ Loan Request Cancelled')
                .setColor(0xE67E22)
                .addFields(
                    { name: 'Loan ID', value: loanId, inline: true },
                    { name: 'Cancelled By', value: `<@${interaction.user.id}>`, inline: true }
                )
                .setFooter({ text: 'Use /cmds to view commands and role permissions' })
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
        }

        const replyEmb = makeEmbed(`✅ Loan request ${loanId} has been cancelled and removed.`, 'Loan Cancelled', 0xE67E22);
        await interaction.reply({ embeds: [replyEmb], ephemeral: true });
    }

    async function handleClearInvestments(interaction) {
        const config = await checkGuildRegistered(interaction);
        if (!config) return;

        if (!(await hasAdminRole(interaction))) {
            const emb = makeEmbed('You do not have permission to use this command.' + LOANCMDS_TIP, 'Permission denied', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        // Get current investors to display in confirmation
        const investors = await BankManager.getInvestors(interaction.guildId);
        const investorList = Object.values(investors).filter(inv => inv.investmentAmount > 0);
        const totalAmount = investorList.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);

        if (investorList.length === 0) {
            const emb = makeEmbed('No active investments to clear.' + LOANCMDS_TIP, 'No investments', 0xE67E22);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        // Create confirmation embed with details
        const confirmEmbed = new EmbedBuilder()
            .setTitle('⚠️ Confirm Clear All Investments')
            .setColor(0xE74C3C)
            .setDescription('This will permanently clear all active investments and reset investor records.')
            .addFields(
                { name: 'Investors', value: investorList.length.toString(), inline: true },
                { name: 'Total Amount', value: `$${totalAmount.toLocaleString()}`, inline: true }
            )
            .setFooter({ text: 'This action cannot be undone.' })
            .setTimestamp();

        // Create action row with confirm/cancel buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('clearinvest_confirm')
                    .setLabel('Confirm')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('clearinvest_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });
    }

    async function handleClearInvestmentsConfirm(interaction) {
        const config = await BankManager.getGuildConfig(interaction.guildId);
        if (!config) {
            await interaction.reply({ content: 'Guild not registered.', ephemeral: true });
            return;
        }

        // Double-check permission
        if (!(await hasAdminRole(interaction))) {
            await interaction.reply({ content: 'Permission denied.', ephemeral: true });
            return;
        }

        // Clear all investors from the database (guild-scoped)
        await BankManager.clearInvestors(interaction.guildId);

        // Reset treasury balance for this guild only
        const treasury = await BankManager.getTreasury(interaction.guildId);
        treasury.balance = 0;
        treasury.investments = {};
        await BankManager.saveTreasury(interaction.guildId, treasury);

        // Log to channel
        const logChannel = client.channels.cache.get(config.logsChannelId);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('🗑️ All Investments & Treasury Cleared')
                .setColor(0xE74C3C)
                .addFields(
                    { name: 'Cleared By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Guild', value: interaction.guild.name, inline: true },
                    { name: 'Timestamp', value: new Date().toLocaleString(), inline: true }
                )
                .setFooter({ text: 'Use /cmds to view commands and role permissions' })
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
        }

        await interaction.reply({ content: '✅ All investments and treasury have been cleared for this server.', ephemeral: true });
    }

    async function handleInvestments(interaction) {
        const config = await checkGuildRegistered(interaction);
        if (!config) return;

        if (!(await hasFinanceRole(interaction))) {
            const emb = makeEmbed('You do not have permission to use this command.' + LOANCMDS_TIP, 'Permission denied', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const investors = await BankManager.getInvestors(interaction.guildId);
        const investorList = Object.values(investors).filter(inv => inv.investmentAmount > 0);
        const pending = await BankManager.getPendingInvestments(interaction.guildId);

        let sections = [];

        if (Object.keys(pending || {}).length > 0) {
            let pendingList = '';
            Object.values(pending).forEach(p => {
                pendingList += `**${p.txnId}** - <@${p.userId}> | Amount: $${p.amount.toLocaleString()} | Requested: ${new Date(p.requestedAt).toLocaleString()}\n`;
            });
            sections.push({ title: '⏳ Pending Investments', body: pendingList });
        }

        if (investorList.length > 0) {
            let investList = '';
            investorList.forEach(inv => {
                const weeklyDiv = Math.ceil(inv.investmentAmount * 0.01);
                investList += `<@${inv.userId}>: $${inv.investmentAmount.toLocaleString()} (Weekly: $${weeklyDiv.toLocaleString()})\n`;
            });
            sections.push({ title: '🏦 Active Investments', body: investList });
        }

        if (sections.length === 0) {
            const emb = makeEmbed('No active or pending investments.' + LOANCMDS_TIP, 'No investments', 0xE67E22);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('🏦 Guild Investments')
            .setColor(0xF1C40F)
            .setFooter({ text: 'Use /cmds to view commands and role permissions' })
            .setTimestamp();

        sections.forEach(s => embed.addFields({ name: s.title, value: s.body, inline: false }));

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async function handleTreasury(interaction) {
        const config = await checkGuildRegistered(interaction);
        if (!config) return;

        if (!(await hasFinanceRole(interaction))) {
            const emb = makeEmbed('You do not have permission to use this command.' + LOANCMDS_TIP, 'Permission denied', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        // Get treasury balance
        const treasury = await BankManager.getTreasury(interaction.guildId);

        // Calculate total invested by summing investors table (guild-scoped)
        const investors = await BankManager.getInvestors(interaction.guildId);
        const totalInvested = Object.values(investors).reduce((s, inv) => s + (inv.investmentAmount || 0), 0);

        // Calculate total loaned by summing remaining balance on active loans
        const loans = await BankManager.getLoans(interaction.guildId);
        const totalLoaned = Object.values(loans).filter(l => l.status === 'active').reduce((s, l) => s + ((l.totalRepayment || 0) - (l.amountPaid || 0)), 0);

        const embed = new EmbedBuilder()
            .setTitle('💰 Guild Treasury')
            .setColor(0x27AE60)
            .addFields(
                { name: 'Current Balance', value: `$${(treasury?.balance || 0).toLocaleString()}`, inline: true },
                { name: 'Total Invested', value: `$${(totalInvested || 0).toLocaleString()}`, inline: true },
                { name: 'Total Loaned', value: `$${(totalLoaned || 0).toLocaleString()}`, inline: true }
            )
            .setFooter({ text: 'Use /cmds to view commands and role permissions' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async function handleCollection(interaction) {
        const config = await checkGuildRegistered(interaction);
        if (!config) return;

        if (!(await hasFinanceRole(interaction))) {
            const emb = makeEmbed('You do not have permission to use this command.' + LOANCMDS_TIP, 'Permission denied', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const loans = await BankManager.getLoans(interaction.guildId);
        const overdueLoans = Object.values(loans).filter(l => {
            if (l.status !== 'active') return false;
            return new Date(l.dueDate) < new Date();
        });

        if (overdueLoans.length === 0) {
            const emb = makeEmbed('No overdue loans.' + LOANCMDS_TIP, 'No overdue loans', 0xE67E22);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        let overdueList = '';
        overdueLoans.forEach(loan => {
            const daysOverdue = Math.floor((new Date() - new Date(loan.dueDate)) / (1000 * 60 * 60 * 24));
            overdueList += `**${loan.loanId}** - <@${loan.userId}>\nDays Overdue: ${daysOverdue} | Total Due: $${loan.totalRepayment.toLocaleString()}\n\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle('🚨 Collections')
            .setColor(0xE74C3C)
            .setDescription(overdueList)
            .setFooter({ text: 'Use /cmds to view commands and role permissions' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async function handleLoanPayment(interaction) {
        // Defer the response immediately to avoid 3-second timeout on slow operations
        await interaction.deferReply({ ephemeral: true });

        const config = await checkGuildRegistered(interaction);
        if (!config) {
            await interaction.editReply({ content: 'Guild not registered.' + LOANCMDS_TIP });
            return;
        }

        const loanId = interaction.options.getString('loanid');
        const loans = await BankManager.getLoans(interaction.guildId);

        if (!loans[loanId]) {
            return await interaction.editReply({
                content: 'Loan not found.' + LOANCMDS_TIP
            });
        }

        const loan = loans[loanId];
        const isFinanceRole = await hasFinanceRole(interaction);
        const isBorrower = interaction.user.id === loan.userId;

        if (!isFinanceRole && !isBorrower) {
            return await interaction.editReply({
                content: 'You do not have permission to use this command.' + LOANCMDS_TIP
            });
        }

        const amount = interaction.options.getInteger('amount');
        // Validate payment amount
        if (typeof amount === 'number' && amount <= 0) {
            const emb = makeEmbed('number must be positive' + LOANCMDS_TIP, 'Invalid number', 0xE74C3C);
            await interaction.editReply({ embeds: [emb] });
            return;
        }
        const user = await interaction.guild.members.fetch(loan.userId).catch(() => null);

        if (!user) {
            const emb = makeEmbed('Borrower not found in guild.' + LOANCMDS_TIP, 'Borrower not found', 0xE74C3C);
            await interaction.editReply({ embeds: [emb] });
            return;
        }

        // Send DM
        const paymentDM = new EmbedBuilder()
            .setTitle('💳 Loan Payment Request')
            .setColor(0xE67E22)
            .addFields(
                { name: 'Loan ID', value: loanId, inline: true },
                { name: 'Amount Due', value: `$${amount.toLocaleString()}`, inline: true },
                { name: 'Instructions', value: (() => {
                    if (!config) return 'Send payment to your guild bankers.';
                    const parts = [];
                    if (config.primaryPaymentUserId) parts.push(`<@${config.primaryPaymentUserId}>`);
                    if (config.altPaymentUserId1) parts.push(`<@${config.altPaymentUserId1}>`);
                    if (config.altPaymentUserId2) parts.push(`<@${config.altPaymentUserId2}>`);
                    if (parts.length > 0) return `Send payment to: ${parts.join(' or ')}`;
                    return `Send payment to <@&${config.adminRoleId}>`;
                })(), inline: false }
            )
            .setFooter({ text: 'Use /cmds to view commands and role permissions' })
            .setTimestamp();
        const logChannel = client.channels.cache.get(config.logsChannelId);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('💳 Payment Request Sent')
                .setColor(0xE67E22)
                .addFields(
                    { name: 'Loan ID', value: loanId, inline: true },
                    { name: 'Borrower', value: `<@${loan.userId}>`, inline: true },
                    { name: 'Amount', value: `$${amount.toLocaleString()}`, inline: true }
                )
                .setFooter({ text: 'Use /cmds to view commands and role permissions' })
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
        }

        const replyEmb = makeEmbed(`✅ Payment request sent to <@${loan.userId}>!` + LOANCMDS_TIP, 'Payment Request Sent', 0xE67E22);
        await interaction.editReply({ embeds: [replyEmb] });
    }

    async function handlePaymentConfirm(interaction) {
        const config = await checkGuildRegistered(interaction);
        if (!config) return;

        if (!(await hasFinanceRole(interaction))) {
            return await interaction.reply({
                content: 'You do not have permission to use this command.' + LOANCMDS_TIP,
                ephemeral: true
            });
        }

        const loanId = interaction.options.getString('loanid');
        const amount = interaction.options.getInteger('amount');
        // Validate confirmation amount
        if (typeof amount === 'number' && amount <= 0) {
            return await interaction.reply({ content: 'number must be positive' + LOANCMDS_TIP, ephemeral: true });
        }
        const loans = await BankManager.getLoans(interaction.guildId);

        if (!loans[loanId]) {
            const emb = makeEmbed('Loan not found.' + LOANCMDS_TIP, 'Loan not found', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        const loan = loans[loanId];
        if (loan.status !== 'active') {
            const emb = makeEmbed(`Loan ${loanId} is not active.` + LOANCMDS_TIP, 'Invalid loan status', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        // Apply the confirmed amount to the loan balance and add funds to the treasury
        try {
            const treasury = await BankManager.getTreasury(interaction.guildId);
            treasury.balance = (treasury.balance || 0) + (amount || 0);
            await BankManager.saveTreasury(interaction.guildId, treasury);
        } catch (e) {
            console.error('Failed updating treasury on payment confirm', e);
            const emb = makeEmbed('Failed to update treasury. Payment not recorded.' + LOANCMDS_TIP, 'Error', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        // Re-fetch loan from DB to avoid stale data/race conditions (single source of truth)
        const freshLoans = await BankManager.getLoans(interaction.guildId);
        const freshLoan = freshLoans[loanId];
        if (!freshLoan) {
            const emb = makeEmbed('Loan not found after treasury update.' + LOANCMDS_TIP, 'Loan not found', 0xE74C3C);
            await interaction.reply({ embeds: [emb], ephemeral: true });
            return;
        }

        // Track amount paid on the loan (introduce amountPaid field)
        freshLoan.amountPaid = (freshLoan.amountPaid || 0) + amount;
        freshLoan.lastPaymentDate = new Date().toISOString();
        const remaining = (freshLoan.totalRepayment || 0) - (freshLoan.amountPaid || 0);

        // If loan fully repaid or overpaid, delete loan record
        if (remaining <= 0) {
            // Update credit scores
            const creditScores = await BankManager.getCreditScores();
            if (creditScores[freshLoan.userId]) {
                creditScores[freshLoan.userId].loansRepaid = (creditScores[freshLoan.userId].loansRepaid || 0) + 1;
                await BankManager.saveCreditScores(creditScores);
            }

            await BankManager.deleteLoan(interaction.guildId, loanId);
        } else {
            // Update loan fields to reflect partial payment
            freshLoan.paymentsMade = (freshLoan.paymentsMade || 0) + 1;
            freshLoan.paymentsRemaining = Math.max(0, Math.ceil(remaining / (freshLoan.weeklyPayment || 1)));
            freshLoans[loanId] = freshLoan;
            await BankManager.saveLoans(interaction.guildId, freshLoans);
        }

        // Log
        const logChannel = client.channels.cache.get(config.logsChannelId);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('💳 Payment Confirmed')
                .setColor(0x27AE60)
                .addFields(
                    { name: 'Loan ID', value: loanId, inline: true },
                    { name: 'Borrower', value: `<@${freshLoan.userId}>`, inline: true },
                    { name: 'Amount', value: `$${(amount || 0).toLocaleString()}`, inline: true },
                    { name: 'Status', value: remaining <= 0 ? '✅ Loan Repaid!' : `Remaining: $${remaining.toLocaleString()}`, inline: true }
                )
                .setFooter({ text: 'Use /cmds to view commands and role permissions' })
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
        }

        const replyMsg = remaining <= 0 ? `✅ Loan ${loanId} fully repaid and deleted!` : `✅ Payment of $${amount.toLocaleString()} confirmed. Remaining balance: $${remaining.toLocaleString()}`;
        const replyEmb = makeEmbed(replyMsg + LOANCMDS_TIP, 'Payment Confirmed', 0x27AE60);
        await interaction.reply({ embeds: [replyEmb], ephemeral: true });
    }

    async function handleCmds(interaction) {
        // Defer the response immediately since building the large embed and fetching config may take time
        await interaction.deferReply({ ephemeral: true });

        // Informational command listing commands and their required roles.
        const config = await BankManager.getGuildConfig(interaction.guildId);

        const adminRoleText = config ? `<@&${config.adminRoleId}> (Configured banker role)` : 'Server Administrator (or configured Banker Role after /registeralliance)';
        const financeRoleText = config ? `<@&${config.financeRoleId}> (Configured finance role)` : 'Finance Role (configured via /registeralliance)';


        const embed = new EmbedBuilder()
            .setTitle('📜 Bot Commands & Roles')
            .setColor(0x2ECC71)
            .setDescription('List of available commands and which role or user can use them')
            .addFields(
                { name: '                    ✨ GENERAL', value: `/registeralliance — Register this guild. Required: Server Administrator`, inline: false },
                { name: '/creditscore <user>', value: `View a user's credit profile. Available to any user`, inline: false },

                { name: '                  💼 INVESTMENTS', value: `/invest <amount> — Create a pending investment (Required: ${financeRoleText})`, inline: false },
                { name: '/investments', value: 'View guild investments and pending', inline: false },
                { name: '/investconfirm <txnid>', value: `Confirm a pending investment. Required: ${adminRoleText}`, inline: false },
                { name: '/investmentcancel <txnid>', value: `Cancel a pending investment. Required: ${adminRoleText}`, inline: false },
                { name: '/investmentwithdraw <user> [amount]', value: `Withdraw funds from a user's investment (Partial or full). Required: ${adminRoleText}`, inline: false },
                { name: '/clearinvestments', value: `Clear all active investments (requires confirmation). Required: ${adminRoleText}`, inline: false },
                { name: '/treasury', value: 'View the guild treasury balance and transaction history', inline: false },

                { name: '                     🏦 LOANS', value: `/loanrequest <amount> <term_weeks> — Create a loan request for yourself. Available to any user`, inline: false },
                { name: '/loanconfirm <loanid>', value: `Mark a loan as disbursed. Required: ${adminRoleText}`, inline: false },
                { name: '/loancancel <loanid>', value: `Cancel a pending loan request. Required: ${adminRoleText}`, inline: false },
                { name: '/loanpayment <loanid> <amount>', value: `Request payment from borrower. Allowed: Borrower (must provide Loan ID) or ${financeRoleText}`, inline: false },
                { name: '/paymentconfirm <loanid> <amount>', value: `Confirm a received payment and apply to the loan balance. Required: ${financeRoleText}`, inline: false },
                { name: '/loans', value: `View guild loans. Required: ${financeRoleText}`, inline: false },
                { name: '/requests', value: `View pending requests. Required: ${adminRoleText}`, inline: false },
                { name: '/collection', value: `View overdue loans. Required: ${financeRoleText}`, inline: false }
            )
            .setFooter({ text: 'Use /cmds to view commands and role permissions' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};

// Export for scheduled tasks
module.exports.processOverdueLoans = async function(client, BankManager) {
    // Process all guilds
    const guilds = await BankManager.getAllGuilds();
    for (const guild of guilds) {
        const loans = await BankManager.getLoans(guild.guildId);
        const creditScores = await BankManager.getCreditScores();
        let changed = false;

        const now = new Date();
        for (const loanId in loans) {
            const loan = loans[loanId];
            if (loan.status !== 'active' || !loan.disbursedAt) continue;

            // Use nextPaymentDue for weekly payments (first due was set at disbursal)
            const nextDue = loan.nextPaymentDue ? new Date(loan.nextPaymentDue) : (loan.disbursedAt ? new Date(loan.disbursedAt) : null);
            if (!nextDue) continue;

            // Days overdue for the current scheduled weekly payment
            const daysOverdue = Math.floor((now - nextDue) / (1000 * 60 * 60 * 24));
            const alreadyApplied = loan.overdueDaysApplied || 0;
            const newDaysToApply = Math.max(0, daysOverdue - alreadyApplied);

            if (newDaysToApply > 0 && creditScores[loan.userId]) {
                // Apply -1 per overdue day
                const decrement = newDaysToApply;
                creditScores[loan.userId].creditScore = Math.max(0, (creditScores[loan.userId].creditScore || 0) - decrement);
                loan.overdueDaysApplied = alreadyApplied + newDaysToApply;
                changed = true;
            }

            // If the loan has reached final repayment (paymentsRemaining === 0) and collections penalty not applied, apply one-time -10
            if ((loan.paymentsRemaining === 0 || (loan.numWeeks && loan.paymentsRemaining <= 0)) && !loan.collectionsPenaltyApplied && creditScores[loan.userId]) {
                creditScores[loan.userId].creditScore = Math.max(0, (creditScores[loan.userId].creditScore || 0) - 10);
                loan.collectionsPenaltyApplied = true;
                changed = true;
            }
        }

        if (changed) {
            await BankManager.saveCreditScores(creditScores);
            await BankManager.saveLoans(guild.guildId, loans);
        }
    }
};

module.exports.sendDividendReminders = async function(client, BankManager) {
    const guilds = await BankManager.getAllGuilds();
    for (const guild of guilds) {
        const investors = await BankManager.getInvestors(guild.guildId);
        const investorList = Object.values(investors).filter(inv => inv.investmentAmount > 0);

        if (investorList.length === 0) continue;

        let totalDividends = 0;
        let dividendList = [];

        investorList.forEach(inv => {
            const weeklyDiv = Math.ceil(inv.investmentAmount * 0.01);
            totalDividends += weeklyDiv;
            dividendList.push(`<@${inv.userId}>: $${weeklyDiv.toLocaleString()}`);
        });

        const config = await BankManager.getGuildConfig(guild.guildId);
        if (!config) continue;

        const logChannel = client.channels.cache.get(config.logsChannelId);
        if (!logChannel) continue;

        const dividendEmbed = new EmbedBuilder()
            .setTitle('💰 Weekly Dividend Payments Due')
            .setColor(0x27AE60)
            .addFields(
                { name: 'Total Due', value: `$${totalDividends.toLocaleString()}`, inline: false },
                { name: 'Breakdown', value: dividendList.join('\n'), inline: false }
            )
            .setFooter({ text: 'Use /loancmds to view commands and role permissions' })
            .setTimestamp();

        await logChannel.send({
            content: `<@&${config.financeRoleId}> - Distribute weekly dividends!`,
            embeds: [dividendEmbed]
        });
    }
};
