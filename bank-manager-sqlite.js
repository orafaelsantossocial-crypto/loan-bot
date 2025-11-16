const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_FILE = path.join(__dirname, 'loan-bot.db');

// Ensure db file exists (better-sqlite3 will create it automatically on open)
const db = new Database(DB_FILE);

// Initialize schema
db.pragma('journal_mode = WAL');
db.prepare(`CREATE TABLE IF NOT EXISTS credit_scores (
  userId TEXT PRIMARY KEY,
  username TEXT,
  creditScore INTEGER,
  maxLoan REAL,
  totalLoans INTEGER,
  loansRepaid INTEGER,
  investmentAmount REAL,
  createdAt TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS loans (
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
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS treasury (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  balance REAL,
  investments TEXT
)`).run();

// Ensure single treasury row exists
const treasuryRow = db.prepare('SELECT id FROM treasury WHERE id = 1').get();
if (!treasuryRow) {
  db.prepare('INSERT INTO treasury (id, balance, investments) VALUES (1, 0, ?)').run(JSON.stringify({}));
}

class BankManager {
  // Credit scores stored as rows; these helpers return plain objects matching old API
  static getCreditScores() {
    const rows = db.prepare('SELECT * FROM credit_scores').all();
    const out = {};
    rows.forEach(r => {
      out[r.userId] = {
        userId: r.userId,
        username: r.username,
        creditScore: r.creditScore,
        maxLoan: r.maxLoan,
        totalLoans: r.totalLoans,
        loansRepaid: r.loansRepaid,
        investmentAmount: r.investmentAmount,
        createdAt: r.createdAt
      };
    });
    return out;
  }

  static saveCreditScores(data) {
    const insert = db.prepare(`INSERT INTO credit_scores (userId, username, creditScore, maxLoan, totalLoans, loansRepaid, investmentAmount, createdAt)
      VALUES (@userId,@username,@creditScore,@maxLoan,@totalLoans,@loansRepaid,@investmentAmount,@createdAt)
      ON CONFLICT(userId) DO UPDATE SET
        username=excluded.username,
        creditScore=excluded.creditScore,
        maxLoan=excluded.maxLoan,
        totalLoans=excluded.totalLoans,
        loansRepaid=excluded.loansRepaid,
        investmentAmount=excluded.investmentAmount,
        createdAt=excluded.createdAt
    `);
    const stmt = db.transaction((rows) => {
      for (const userId of Object.keys(rows)) {
        const u = rows[userId];
        insert.run({
          userId: u.userId || userId,
          username: u.username || '',
          creditScore: u.creditScore || 0,
          maxLoan: u.maxLoan || 0,
          totalLoans: u.totalLoans || 0,
          loansRepaid: u.loansRepaid || 0,
          investmentAmount: u.investmentAmount || 0,
          createdAt: u.createdAt || new Date().toISOString()
        });
      }
    });
    stmt(data);
  }

  static getLoans() {
    const rows = db.prepare('SELECT * FROM loans').all();
    const out = {};
    rows.forEach(r => {
      out[r.loanId] = {
        loanId: r.loanId,
        userId: r.userId,
        username: r.username,
        amount: r.amount,
        termDays: r.termDays,
        interestRate: r.interestRate,
        totalRepayment: r.totalRepayment,
        requestedAt: r.requestedAt,
        dueDate: r.dueDate,
        status: r.status,
        handledBy: r.handledBy,
        disbursedAt: r.disbursedAt
      };
    });
    return out;
  }

  static saveLoans(data) {
    const insert = db.prepare(`INSERT INTO loans (loanId,userId,username,amount,termDays,interestRate,totalRepayment,requestedAt,dueDate,status,handledBy,disbursedAt)
      VALUES (@loanId,@userId,@username,@amount,@termDays,@interestRate,@totalRepayment,@requestedAt,@dueDate,@status,@handledBy,@disbursedAt)
      ON CONFLICT(loanId) DO UPDATE SET
        userId=excluded.userId,
        username=excluded.username,
        amount=excluded.amount,
        termDays=excluded.termDays,
        interestRate=excluded.interestRate,
        totalRepayment=excluded.totalRepayment,
        requestedAt=excluded.requestedAt,
        dueDate=excluded.dueDate,
        status=excluded.status,
        handledBy=excluded.handledBy,
        disbursedAt=excluded.disbursedAt
    `);

    const stmt = db.transaction((rows) => {
      for (const loanId of Object.keys(rows)) {
        const l = rows[loanId];
        insert.run({
          loanId: l.loanId || loanId,
          userId: l.userId || null,
          username: l.username || '',
          amount: l.amount || 0,
          termDays: l.termDays || 0,
          interestRate: l.interestRate || 0,
          totalRepayment: l.totalRepayment || 0,
          requestedAt: l.requestedAt || new Date().toISOString(),
          dueDate: l.dueDate || null,
          status: l.status || 'pending',
          handledBy: l.handledBy || null,
          disbursedAt: l.disbursedAt || null
        });
      }
    });
    stmt(data);
  }

  static getTreasury() {
    const row = db.prepare('SELECT * FROM treasury WHERE id = 1').get();
    return {
      balance: row.balance || 0,
      investments: JSON.parse(row.investments || '{}')
    };
  }

  static saveTreasury(data) {
    db.prepare('UPDATE treasury SET balance = ?, investments = ? WHERE id = 1').run(data.balance || 0, JSON.stringify(data.investments || {}));
  }

  static getPendingRequests() {
    const rows = db.prepare("SELECT * FROM loans WHERE status = 'pending'").all();
    const out = {};
    rows.forEach(r => { out[r.loanId] = {
      loanId: r.loanId,
      userId: r.userId,
      username: r.username,
      amount: r.amount,
      termDays: r.termDays,
      interestRate: r.interestRate,
      totalRepayment: r.totalRepayment,
      requestedAt: r.requestedAt,
      dueDate: r.dueDate,
      status: r.status,
      handledBy: r.handledBy
    }; });
    return out;
  }

  static savePendingRequests(data) {
    // data is an object mapping loanId -> loan. We'll upsert into loans table
    this.saveLoans(data);
  }

  static calculateMaxLoan(userData, taxRevenue = 100000) {
    const score = userData.score || userData.creditScore || 0;
    let hoursMultiplier = 50;

    if (score >= 10000 && score <= 300000) {
      hoursMultiplier = 60;
    } else if (score > 300000) {
      return Number.MAX_SAFE_INTEGER;
    }

    return taxRevenue * hoursMultiplier;
  }

  static calculateInterestRate(termDays, creditScore = 50) {
    const baseRate = 5;
    const termRate = termDays * 2;
    let creditAdjustment = 0;
    if (creditScore >= 75) creditAdjustment = -2;
    else if (creditScore >= 90) creditAdjustment = -3;
    return baseRate + termRate + creditAdjustment;
  }

  static generateLoanId() {
    return `LOAN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = BankManager;
