const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');

const DB_FILE = path.join(__dirname, 'loan-bot.db');

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
  await runAsync(`CREATE TABLE IF NOT EXISTS credit_scores (
    userId TEXT PRIMARY KEY,
    username TEXT,
    creditScore INTEGER,
    maxLoan REAL,
    totalLoans INTEGER,
    loansRepaid INTEGER,
    investmentAmount REAL,
    createdAt TEXT
  )`);

  await runAsync(`CREATE TABLE IF NOT EXISTS loans (
    loanId TEXT PRIMARY KEY,
    userId TEXT,
    username TEXT,
    amount REAL,
    termDays INTEGER,
    interestRate REAL,
    totalRepayment REAL,
    requestedAt TEXT,
    dueDate TEXT,
    status TEXT,
    handledBy TEXT,
    disbursedAt TEXT
  )`);

  await runAsync(`CREATE TABLE IF NOT EXISTS treasury (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    balance REAL,
    investments TEXT
  )`);

  // Settings table (single-row config for single-guild manager)
  await runAsync(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    maxLoans INTEGER DEFAULT 1,
    maxLoanMultiplier REAL DEFAULT 50,
    dividendPercent REAL DEFAULT 0.01,
    baseInterest REAL DEFAULT 5,
    interestPerDay REAL DEFAULT 2,
    maxLoanWeeks INTEGER DEFAULT 4
  )`);

  // Ensure a default settings row exists
  const settingsRow = await allAsync('SELECT id FROM settings WHERE id = 1');
  if (!settingsRow || settingsRow.length === 0) {
    await runAsync('INSERT INTO settings (id, maxLoans, maxLoanMultiplier, dividendPercent, baseInterest, interestPerDay, maxLoanWeeks) VALUES (1, 1, 50, 0.01, 5, 2, 4)');
  }

  const row = await allAsync('SELECT id FROM treasury WHERE id = 1');
  if (!row || row.length === 0) {
    await runAsync('INSERT INTO treasury (id, balance, investments) VALUES (1, 0, ?)', [JSON.stringify({})]);
  }
}

// initialize immediately
init().catch(err => console.error('DB init error:', err));

class BankManager {
  static async getCreditScores() {
    const rows = await allAsync('SELECT * FROM credit_scores');
    const out = {};
    rows.forEach(r => { out[r.userId] = { userId: r.userId, username: r.username, creditScore: r.creditScore, maxLoan: r.maxLoan, totalLoans: r.totalLoans, loansRepaid: r.loansRepaid, investmentAmount: r.investmentAmount, createdAt: r.createdAt }; });
    return out;
  }

  static async saveCreditScores(data) {
    const sql = `INSERT INTO credit_scores (userId, username, creditScore, maxLoan, totalLoans, loansRepaid, investmentAmount, createdAt)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(userId) DO UPDATE SET username=excluded.username, creditScore=excluded.creditScore, maxLoan=excluded.maxLoan, totalLoans=excluded.totalLoans, loansRepaid=excluded.loansRepaid, investmentAmount=excluded.investmentAmount, createdAt=excluded.createdAt`;
    const ops = [];
    for (const userId of Object.keys(data)) {
      const u = data[userId];
      ops.push(runAsync(sql, [u.userId || userId, u.username || '', u.creditScore || 0, u.maxLoan || 0, u.totalLoans || 0, u.loansRepaid || 0, u.investmentAmount || 0, u.createdAt || new Date().toISOString()]));
    }
    await Promise.all(ops);
  }

  static async getLoans() {
    const rows = await allAsync('SELECT * FROM loans');
    const out = {};
    rows.forEach(r => { out[r.loanId] = r; });
    return out;
  }

  static async saveLoans(data) {
    const sql = `INSERT INTO loans (loanId,userId,username,amount,termDays,interestRate,totalRepayment,requestedAt,dueDate,status,handledBy,disbursedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(loanId) DO UPDATE SET userId=excluded.userId, username=excluded.username, amount=excluded.amount, termDays=excluded.termDays, interestRate=excluded.interestRate, totalRepayment=excluded.totalRepayment, requestedAt=excluded.requestedAt, dueDate=excluded.dueDate, status=excluded.status, handledBy=excluded.handledBy, disbursedAt=excluded.disbursedAt`;
    const ops = [];
    for (const loanId of Object.keys(data)) {
      const l = data[loanId];
      ops.push(runAsync(sql, [l.loanId || loanId, l.userId || null, l.username || '', l.amount || 0, l.termDays || 0, l.interestRate || 0, l.totalRepayment || 0, l.requestedAt || new Date().toISOString(), l.dueDate || null, l.status || 'pending', l.handledBy || null, l.disbursedAt || null]));
    }
    await Promise.all(ops);
  }

  static async getTreasury() {
    const rows = await allAsync('SELECT * FROM treasury WHERE id = 1');
    const row = rows[0];
    return { balance: row.balance || 0, investments: JSON.parse(row.investments || '{}') };
  }

  static async saveTreasury(data) {
    await runAsync('UPDATE treasury SET balance = ?, investments = ? WHERE id = 1', [data.balance || 0, JSON.stringify(data.investments || {})]);
  }

  static async getPendingRequests() {
    const rows = await allAsync("SELECT * FROM loans WHERE status = 'pending'");
    const out = {};
    rows.forEach(r => { out[r.loanId] = r; });
    return out;
  }

  static async getSettings() {
    const rows = await allAsync('SELECT * FROM settings WHERE id = 1');
    if (!rows || rows.length === 0) {
      return {
        maxLoans: 1,
        maxLoanMultiplier: 50,
        dividendPercent: 0.01,
        baseInterest: 5,
        interestPerDay: 2,
        maxLoanWeeks: 4
      };
    }
    return rows[0];
  }

  static async saveSettings(settings) {
    const sql = `INSERT INTO settings (id, maxLoans, maxLoanMultiplier, dividendPercent, baseInterest, interestPerDay, maxLoanWeeks)
      VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET maxLoans=excluded.maxLoans, maxLoanMultiplier=excluded.maxLoanMultiplier, dividendPercent=excluded.dividendPercent, baseInterest=excluded.baseInterest, interestPerDay=excluded.interestPerDay, maxLoanWeeks=excluded.maxLoanWeeks`;
    await runAsync(sql, [settings.maxLoans || 1, settings.maxLoanMultiplier || 50, settings.dividendPercent || 0.01, settings.baseInterest || 5, settings.interestPerDay || 2, settings.maxLoanWeeks || 4]);
  }

  static async savePendingRequests(data) {
    await BankManager.saveLoans(data);
  }

  static calculateMaxLoan(userData, taxRevenue = 100000) {
    const score = userData.score || userData.creditScore || 0;
    // If a settings object is passed in, use its multiplier, otherwise fallback to default logic
    const settings = arguments.length > 2 ? arguments[2] : null;
    const maxLoanMultiplier = settings && settings.maxLoanMultiplier ? settings.maxLoanMultiplier : 50;
    if (score > 300000) return Number.MAX_SAFE_INTEGER;
    return taxRevenue * maxLoanMultiplier;
  }

  static calculateInterestRate(termDays, creditScore = 50) {
    // Accept optional settings as third argument
    const settings = arguments.length > 2 ? arguments[2] : null;
    const baseRate = settings && typeof settings.baseInterest === 'number' ? settings.baseInterest : 5;
    const perDay = settings && typeof settings.interestPerDay === 'number' ? settings.interestPerDay : 2;
    const termRate = termDays * perDay;
    let creditAdjustment = 0;
    if (creditScore >= 90) creditAdjustment = -3;
    else if (creditScore >= 75) creditAdjustment = -2;
    return baseRate + termRate + creditAdjustment;
  }

  static generateLoanId() {
    return `LOAN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = BankManager;
