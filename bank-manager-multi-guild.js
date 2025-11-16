const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_FILE = path.join(__dirname, 'loan-bot-multi.db');

// Ensure directory exists
try { fs.closeSync(fs.openSync(DB_FILE, 'a')); } catch (e) { /* ignore */ }

const db = new sqlite3.Database(DB_FILE);

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err); else resolve(this);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

async function init() {
  // Global credit scores (shared across all guilds)
  await runAsync(`CREATE TABLE IF NOT EXISTS credit_scores (
    userId TEXT PRIMARY KEY,
    username TEXT,
    creditScore INTEGER,
    totalLoans INTEGER,
    loansRepaid INTEGER,
    createdAt TEXT
  )`);

    // Guild-specific credit scores (each guild has separate score per user)
    await runAsync(`CREATE TABLE IF NOT EXISTS guild_credit_scores (
      userId TEXT,
      guildId TEXT,
      username TEXT,
      creditScore INTEGER DEFAULT 50,
      totalLoans INTEGER DEFAULT 0,
      loansRepaid INTEGER DEFAULT 0,
      pendingOverduePenalty INTEGER DEFAULT 0,
      lastPaymentDate TEXT,
      lastPenaltyDate TEXT,
      createdAt TEXT,
      PRIMARY KEY (userId, guildId)
    )`);

  // Guild configurations (alliance registry)
  await runAsync(`CREATE TABLE IF NOT EXISTS guild_configs (
    guildId TEXT PRIMARY KEY,
    guildName TEXT,
    financeRoleId TEXT,
    adminRoleId TEXT,
    logsChannelId TEXT,
    primaryPaymentUserId TEXT,
    altPaymentUserId1 TEXT,
    altPaymentUserId2 TEXT,
    createdAt TEXT
  )`);

  // Guild-specific loans
  await runAsync(`CREATE TABLE IF NOT EXISTS loans (
    loanId TEXT PRIMARY KEY,
    guildId TEXT,
    userId TEXT,
    username TEXT,
    amount REAL,
    termDays INTEGER,
    interestRate REAL,
    totalRepayment REAL,
    weeklyPayment REAL,
    numWeeks INTEGER,
    requestedAt TEXT,
    dueDate TEXT,
    status TEXT,
    handledBy TEXT,
    disbursedAt TEXT,
      nextPaymentDue TEXT,
      nextPaymentDueDate TEXT,
      lastPaymentDate TEXT,
      paymentsMade INTEGER DEFAULT 0,
      paymentsRemaining INTEGER,
      confirmedPayments TEXT,
      overdueDaysApplied INTEGER DEFAULT 0,
      collectionsPenaltyApplied INTEGER DEFAULT 0,
      amountPaid REAL DEFAULT 0,
      createdAt TEXT,
    UNIQUE(guildId, userId, loanId)
  )`);

  // Guild-specific treasuries and investments
  await runAsync(`CREATE TABLE IF NOT EXISTS treasuries (
    guildId TEXT PRIMARY KEY,
    balance REAL,
    investments TEXT
  )`);

  // Guild-specific investor information
  await runAsync(`CREATE TABLE IF NOT EXISTS investors (
    guildId TEXT,
    userId TEXT,
    username TEXT,
    investmentAmount REAL,
    PRIMARY KEY (guildId, userId)
  )`);

  // Pending investments stored inside treasuries.investments JSON under 'pending'
}

// Initialize immediately
init().catch(err => console.error('DB init error:', err));

// Backfill: attempt to add new columns if they don't exist (safe to run repeatedly)
(async function ensureColumns() {
  try {
    await runAsync("ALTER TABLE guild_configs ADD COLUMN primaryPaymentUserId TEXT");
  } catch (e) { /* ignore if column exists */ }
  try {
    await runAsync("ALTER TABLE guild_configs ADD COLUMN altPaymentUserId1 TEXT");
  } catch (e) { /* ignore if column exists */ }
  try {
    await runAsync("ALTER TABLE guild_configs ADD COLUMN altPaymentUserId2 TEXT");
  } catch (e) { /* ignore if column exists */ }

  // Loans schema migrations (add columns if older DB lacks them)
  try {
    await runAsync("ALTER TABLE loans ADD COLUMN nextPaymentDue TEXT");
  } catch (e) { /* ignore if column exists */ }
  try {
    await runAsync("ALTER TABLE loans ADD COLUMN nextPaymentDueDate TEXT");
  } catch (e) { /* ignore if column exists */ }
  try {
    await runAsync("ALTER TABLE loans ADD COLUMN lastPaymentDate TEXT");
  } catch (e) { /* ignore if column exists */ }
  try {
    await runAsync("ALTER TABLE loans ADD COLUMN createdAt TEXT");
  } catch (e) { /* ignore if column exists */ }
  try {
    await runAsync("ALTER TABLE loans ADD COLUMN amountPaid REAL DEFAULT 0");
  } catch (e) { /* ignore if column exists */ }
  try {
    await runAsync("ALTER TABLE loans ADD COLUMN confirmedPayments TEXT");
  } catch (e) { /* ignore if column exists */ }
  try {
    await runAsync("ALTER TABLE loans ADD COLUMN paymentsMade INTEGER DEFAULT 0");
  } catch (e) { /* ignore if column exists */ }
  try {
    await runAsync("ALTER TABLE loans ADD COLUMN paymentsRemaining INTEGER");
  } catch (e) { /* ignore if column exists */ }
  try {
    await runAsync("ALTER TABLE loans ADD COLUMN overdueDaysApplied INTEGER DEFAULT 0");
  } catch (e) { /* ignore if column exists */ }
  try {
    await runAsync("ALTER TABLE loans ADD COLUMN collectionsPenaltyApplied INTEGER DEFAULT 0");
  } catch (e) { /* ignore if column exists */ }

})().catch(()=>{});

class BankManager {
  // ===== GUILD CONFIGURATION =====
  static async registerGuild(guildId, guildName, financeRoleId, adminRoleId, logsChannelId, primaryPaymentUserId = null, altPaymentUserId1 = null, altPaymentUserId2 = null) {
    const sql = `INSERT INTO guild_configs (guildId, guildName, financeRoleId, adminRoleId, logsChannelId, primaryPaymentUserId, altPaymentUserId1, altPaymentUserId2, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guildId) DO UPDATE SET guildName=excluded.guildName, financeRoleId=excluded.financeRoleId, adminRoleId=excluded.adminRoleId, logsChannelId=excluded.logsChannelId, primaryPaymentUserId=excluded.primaryPaymentUserId, altPaymentUserId1=excluded.altPaymentUserId1, altPaymentUserId2=excluded.altPaymentUserId2`;
    await runAsync(sql, [guildId, guildName, financeRoleId, adminRoleId, logsChannelId, primaryPaymentUserId, altPaymentUserId1, altPaymentUserId2, new Date().toISOString()]);
  }

  static async getGuildConfig(guildId) {
    const rows = await allAsync('SELECT * FROM guild_configs WHERE guildId = ?', [guildId]);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  static async getAllGuilds() {
    return await allAsync('SELECT * FROM guild_configs');
  }

  // ===== GLOBAL CREDIT SCORES =====
  static async getCreditScores() {
    const rows = await allAsync('SELECT * FROM credit_scores');
    const out = {};
    rows.forEach(r => {
      out[r.userId] = {
        userId: r.userId,
        username: r.username,
        creditScore: r.creditScore,
        totalLoans: r.totalLoans,
        loansRepaid: r.loansRepaid,
        createdAt: r.createdAt
      };
    });
    return out;
  }

  static async saveCreditScores(data) {
    const sql = `INSERT INTO credit_scores (userId, username, creditScore, totalLoans, loansRepaid, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(userId) DO UPDATE SET username=excluded.username, creditScore=excluded.creditScore, totalLoans=excluded.totalLoans, loansRepaid=excluded.loansRepaid, createdAt=excluded.createdAt`;
    const ops = [];
    for (const userId of Object.keys(data)) {
      const u = data[userId];
      ops.push(runAsync(sql, [u.userId || userId, u.username || '', u.creditScore || 0, u.totalLoans || 0, u.loansRepaid || 0, u.createdAt || new Date().toISOString()]));
    }
    await Promise.all(ops);
  }

  static async initializeUserProfile(userId, username) {
    const creditScores = await this.getCreditScores();
    if (!creditScores[userId]) {
      creditScores[userId] = {
        userId,
        username,
        creditScore: 50,
        totalLoans: 0,
        loansRepaid: 0,
        createdAt: new Date().toISOString()
      };
      await this.saveCreditScores(creditScores);
    }
    return creditScores[userId];
  }

  // ===== GUILD-SPECIFIC LOANS =====
  static async getLoans(guildId) {
    const rows = await allAsync('SELECT * FROM loans WHERE guildId = ?', [guildId]);
    const out = {};
    rows.forEach(r => {
      // Parse possible JSON fields
      try { r.confirmedPayments = r.confirmedPayments ? JSON.parse(r.confirmedPayments) : []; } catch (e) { r.confirmedPayments = []; }
      r.paymentsMade = r.paymentsMade || 0;
      r.paymentsRemaining = typeof r.paymentsRemaining === 'number' ? r.paymentsRemaining : (r.numWeeks || null);
      r.overdueDaysApplied = r.overdueDaysApplied || 0;
      out[r.loanId] = r;
    });
    return out;
  }

  static async getAllLoansForUser(userId) {
    // Get all loans for a user across all guilds (for credit checking)
    const rows = await allAsync('SELECT * FROM loans WHERE userId = ?', [userId]);
    return rows || [];
  }

  static async saveLoans(guildId, data) {
    const sql = `INSERT INTO loans (loanId, guildId, userId, username, amount, termDays, interestRate, totalRepayment, weeklyPayment, numWeeks, requestedAt, dueDate, status, handledBy, disbursedAt, nextPaymentDue, paymentsMade, paymentsRemaining, confirmedPayments, overdueDaysApplied, collectionsPenaltyApplied, amountPaid, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(loanId) DO UPDATE SET userId=excluded.userId, username=excluded.username, amount=excluded.amount, termDays=excluded.termDays, interestRate=excluded.interestRate, totalRepayment=excluded.totalRepayment, weeklyPayment=excluded.weeklyPayment, numWeeks=excluded.numWeeks, requestedAt=excluded.requestedAt, dueDate=excluded.dueDate, status=excluded.status, handledBy=excluded.handledBy, disbursedAt=excluded.disbursedAt, nextPaymentDue=excluded.nextPaymentDue, paymentsMade=excluded.paymentsMade, paymentsRemaining=excluded.paymentsRemaining, confirmedPayments=excluded.confirmedPayments, overdueDaysApplied=excluded.overdueDaysApplied, collectionsPenaltyApplied=excluded.collectionsPenaltyApplied, amountPaid=excluded.amountPaid, createdAt=excluded.createdAt`;
    const ops = [];
    for (const loanId of Object.keys(data)) {
      const l = data[loanId];
      ops.push(runAsync(sql, [
        l.loanId || loanId, guildId, l.userId || null, l.username || '', l.amount || 0, l.termDays || 0, l.interestRate || 0,
        l.totalRepayment || 0, l.weeklyPayment || 0, l.numWeeks || 0, l.requestedAt || new Date().toISOString(), l.dueDate || null,
        l.status || 'pending', l.handledBy || null, l.disbursedAt || null, l.nextPaymentDue || null, l.paymentsMade || 0, l.paymentsRemaining || null, JSON.stringify(l.confirmedPayments || []), l.overdueDaysApplied || 0, l.collectionsPenaltyApplied ? 1 : 0, l.amountPaid || 0, l.createdAt || new Date().toISOString()
      ]));
    }
    await Promise.all(ops);
  }

  static async getPendingRequests(guildId) {
    const rows = await allAsync("SELECT * FROM loans WHERE guildId = ? AND status = 'pending'", [guildId]);
    const out = {};
    rows.forEach(r => {
      try { r.confirmedPayments = r.confirmedPayments ? JSON.parse(r.confirmedPayments) : []; } catch (e) { r.confirmedPayments = []; }
      r.paymentsMade = r.paymentsMade || 0;
      r.paymentsRemaining = typeof r.paymentsRemaining === 'number' ? r.paymentsRemaining : (r.numWeeks || null);
      r.overdueDaysApplied = r.overdueDaysApplied || 0;
      out[r.loanId] = r;
    });
    return out;
  }

  // ===== GUILD-SPECIFIC TREASURY =====
  static async getTreasury(guildId) {
    const rows = await allAsync('SELECT * FROM treasuries WHERE guildId = ?', [guildId]);
    if (!rows || rows.length === 0) {
      await runAsync('INSERT INTO treasuries (guildId, balance, investments) VALUES (?, ?, ?)', [guildId, 0, JSON.stringify({})]);
      return { balance: 0, investments: {} };
    }
    const row = rows[0];
    return { balance: row.balance || 0, investments: JSON.parse(row.investments || '{}') };
  }

  static async saveTreasury(guildId, data) {
    await runAsync('INSERT INTO treasuries (guildId, balance, investments) VALUES (?, ?, ?) ON CONFLICT(guildId) DO UPDATE SET balance=excluded.balance, investments=excluded.investments', [guildId, data.balance || 0, JSON.stringify(data.investments || {})]);
  }

  // ===== GUILD-SPECIFIC INVESTMENTS =====
  static async getInvestors(guildId) {
    const rows = await allAsync('SELECT * FROM investors WHERE guildId = ?', [guildId]);
    const out = {};
    rows.forEach(r => {
      out[r.userId] = {
        userId: r.userId,
        username: r.username,
        investmentAmount: r.investmentAmount || 0
      };
    });
    return out;
  }

  static async saveInvestors(guildId, data) {
    const sql = `INSERT INTO investors (guildId, userId, username, investmentAmount) VALUES (?, ?, ?, ?)
      ON CONFLICT(guildId, userId) DO UPDATE SET username=excluded.username, investmentAmount=excluded.investmentAmount`;
    const ops = [];
    for (const userId of Object.keys(data)) {
      const inv = data[userId];
      ops.push(runAsync(sql, [guildId, userId, inv.username || '', inv.investmentAmount || 0]));
    }
    await Promise.all(ops);
  }

  // Clear all investors for a guild
  static async clearInvestors(guildId) {
    await runAsync('DELETE FROM investors WHERE guildId = ?', [guildId]);
  }

  // Delete a single investor record
  static async deleteInvestor(guildId, userId) {
    await runAsync('DELETE FROM investors WHERE guildId = ? AND userId = ?', [guildId, userId]);
  }

  // ===== UTILITY FUNCTIONS =====
    static async getGuildCreditScore(userId, guildId) {
      // Get credit score for a user in a specific guild
      const rows = await allAsync('SELECT * FROM guild_credit_scores WHERE userId = ? AND guildId = ?', [userId, guildId]);
      if (!rows || rows.length === 0) {
        return null;
      }
      const row = rows[0];
      return {
        userId: row.userId,
        guildId: row.guildId,
        username: row.username,
        creditScore: row.creditScore || 50,
        totalLoans: row.totalLoans || 0,
        loansRepaid: row.loansRepaid || 0,
        pendingOverduePenalty: row.pendingOverduePenalty || 0,
        lastPaymentDate: row.lastPaymentDate,
        lastPenaltyDate: row.lastPenaltyDate,
        createdAt: row.createdAt
      };
    }

    static async getAllGuildCreditScores(userId) {
      // Get all guild-specific credit scores for a user
      const rows = await allAsync('SELECT * FROM guild_credit_scores WHERE userId = ?', [userId]);
      const out = {};
      rows.forEach(r => {
        out[r.guildId] = {
          userId: r.userId,
          guildId: r.guildId,
          username: r.username,
          creditScore: r.creditScore || 50,
          totalLoans: r.totalLoans || 0,
          loansRepaid: r.loansRepaid || 0,
          pendingOverduePenalty: r.pendingOverduePenalty || 0,
          lastPaymentDate: r.lastPaymentDate,
          lastPenaltyDate: r.lastPenaltyDate,
          createdAt: r.createdAt
        };
      });
      return out;
    }

    static async saveGuildCreditScore(userId, guildId, username, data) {
      // Upsert guild-specific credit score
      const sql = `INSERT INTO guild_credit_scores (userId, guildId, username, creditScore, totalLoans, loansRepaid, pendingOverduePenalty, lastPaymentDate, lastPenaltyDate, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(userId, guildId) DO UPDATE SET username=excluded.username, creditScore=excluded.creditScore, totalLoans=excluded.totalLoans, loansRepaid=excluded.loansRepaid, pendingOverduePenalty=excluded.pendingOverduePenalty, lastPaymentDate=excluded.lastPaymentDate, lastPenaltyDate=excluded.lastPenaltyDate`;
      await runAsync(sql, [
        userId,
        guildId,
        username,
        data.creditScore || 50,
        data.totalLoans || 0,
        data.loansRepaid || 0,
        data.pendingOverduePenalty || 0,
        data.lastPaymentDate || null,
        data.lastPenaltyDate || null,
        data.createdAt || new Date().toISOString()
      ]);
    }

    static async initializeGuildCreditScore(userId, guildId, username) {
      // Initialize a user's credit score in a guild if it doesn't exist
      let creditScore = await this.getGuildCreditScore(userId, guildId);
      if (!creditScore) {
        creditScore = {
          userId,
          guildId,
          username,
          creditScore: 50,
          totalLoans: 0,
          loansRepaid: 0,
          pendingOverduePenalty: 0,
          lastPaymentDate: null,
          lastPenaltyDate: null,
          createdAt: new Date().toISOString()
        };
        await this.saveGuildCreditScore(userId, guildId, username, creditScore);
      }
      return creditScore;
    }

    static calculateTotalCreditScore(allGuildScores) {
      // Sum all guild-specific credit scores for a total
      let total = 0;
      for (const guildId of Object.keys(allGuildScores)) {
        total += allGuildScores[guildId].creditScore || 50;
      }
      return total;
    }

    // ===== UTILITY FUNCTIONS =====
    static calculateMaxLoan(userData, taxRevenue = 100000) {
    const score = userData.score || userData.creditScore || 0;
    let hoursMultiplier = 50;
    if (score >= 10000 && score <= 300000) hoursMultiplier = 60;
    else if (score > 300000) return Number.MAX_SAFE_INTEGER;
    return taxRevenue * hoursMultiplier;
  }

    // ===== GUILD-SPECIFIC CREDIT SCORES =====
    static async getGuildCreditScore(userId, guildId) {
      // Get credit score for a user in a specific guild
      const rows = await allAsync('SELECT * FROM guild_credit_scores WHERE userId = ? AND guildId = ?', [userId, guildId]);
      if (!rows || rows.length === 0) {
        return null;
      }
      const row = rows[0];
      return {
        userId: row.userId,
        guildId: row.guildId,
        username: row.username,
        creditScore: row.creditScore || 50,
        totalLoans: row.totalLoans || 0,
        loansRepaid: row.loansRepaid || 0,
        pendingOverduePenalty: row.pendingOverduePenalty || 0,
        lastPaymentDate: row.lastPaymentDate,
        lastPenaltyDate: row.lastPenaltyDate,
        createdAt: row.createdAt
      };
    }

    static async getAllGuildCreditScores(userId) {
      // Get all guild-specific credit scores for a user
      const rows = await allAsync('SELECT * FROM guild_credit_scores WHERE userId = ?', [userId]);
      const out = {};
      rows.forEach(r => {
        out[r.guildId] = {
          userId: r.userId,
          guildId: r.guildId,
          username: r.username,
          creditScore: r.creditScore || 50,
          totalLoans: r.totalLoans || 0,
          loansRepaid: r.loansRepaid || 0,
          pendingOverduePenalty: r.pendingOverduePenalty || 0,
          lastPaymentDate: r.lastPaymentDate,
          lastPenaltyDate: r.lastPenaltyDate,
          createdAt: r.createdAt
        };
      });
      return out;
    }

    static async saveGuildCreditScore(userId, guildId, username, data) {
      // Upsert guild-specific credit score
      const sql = `INSERT INTO guild_credit_scores (userId, guildId, username, creditScore, totalLoans, loansRepaid, pendingOverduePenalty, lastPaymentDate, lastPenaltyDate, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(userId, guildId) DO UPDATE SET username=excluded.username, creditScore=excluded.creditScore, totalLoans=excluded.totalLoans, loansRepaid=excluded.loansRepaid, pendingOverduePenalty=excluded.pendingOverduePenalty, lastPaymentDate=excluded.lastPaymentDate, lastPenaltyDate=excluded.lastPenaltyDate`;
      await runAsync(sql, [
        userId,
        guildId,
        username,
        data.creditScore || 50,
        data.totalLoans || 0,
        data.loansRepaid || 0,
        data.pendingOverduePenalty || 0,
        data.lastPaymentDate || null,
        data.lastPenaltyDate || null,
        data.createdAt || new Date().toISOString()
      ]);
    }

    static async initializeGuildCreditScore(userId, guildId, username) {
      // Initialize a user's credit score in a guild if it doesn't exist
      let creditScore = await this.getGuildCreditScore(userId, guildId);
      if (!creditScore) {
        creditScore = {
          userId,
          guildId,
          username,
          creditScore: 50,
          totalLoans: 0,
          loansRepaid: 0,
          pendingOverduePenalty: 0,
          lastPaymentDate: null,
          lastPenaltyDate: null,
          createdAt: new Date().toISOString()
        };
        await this.saveGuildCreditScore(userId, guildId, username, creditScore);
      }
      return creditScore;
    }

    static calculateTotalCreditScore(allGuildScores) {
      // Sum all guild-specific credit scores for a total
      let total = 0;
      for (const guildId of Object.keys(allGuildScores)) {
        total += allGuildScores[guildId].creditScore || 50;
      }
      return total;
    }

  static calculateInterestRate(termDays, creditScore = 50) {
    const baseRate = 5;
    const termRate = termDays * 2;
    let creditAdjustment = 0;
    if (creditScore >= 75) creditAdjustment = -2;
    else if (creditScore >= 90) creditAdjustment = -3;
    return baseRate + termRate + creditAdjustment;
  }

  static async generateLoanId() {
    let id;
    let exists = true;
    while (exists) {
      id = 'L' + Math.floor(1000 + Math.random() * 9000);
      const rows = await allAsync('SELECT loanId FROM loans WHERE loanId = ?', [id]);
      exists = rows && rows.length > 0;
    }
    return id;
  }

  // Generate a unique pending investment ID
  static async generateInvestmentId(guildId) {
    let id;
    let exists = true;
    while (exists) {
      id = 'I' + Math.floor(1000 + Math.random() * 9000);
      const treasury = await this.getTreasury(guildId);
      const pending = (treasury.investments && treasury.investments.pending) ? treasury.investments.pending : {};
      exists = !!pending[id];
    }
    return id;
  }

  // Pending investments helpers (stored inside treasuries.investments.pending)
  static async addPendingInvestment(guildId, txnId, data) {
    const treasury = await this.getTreasury(guildId);
    treasury.investments = treasury.investments || {};
    treasury.investments.pending = treasury.investments.pending || {};
    treasury.investments.pending[txnId] = data;
    await this.saveTreasury(guildId, treasury);
  }

  static async getPendingInvestments(guildId) {
    const treasury = await this.getTreasury(guildId);
    return (treasury.investments && treasury.investments.pending) ? treasury.investments.pending : {};
  }

  static async removePendingInvestment(guildId, txnId) {
    const treasury = await this.getTreasury(guildId);
    if (treasury.investments && treasury.investments.pending && treasury.investments.pending[txnId]) {
      delete treasury.investments.pending[txnId];
      await this.saveTreasury(guildId, treasury);
    }
  }

  // Delete a loan by loanId for a guild
  static async deleteLoan(guildId, loanId) {
    await runAsync('DELETE FROM loans WHERE guildId = ? AND loanId = ?', [guildId, loanId]);
  }
}

module.exports = BankManager;
