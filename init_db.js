const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const initSchema = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // LEADS TABLE
      db.run(`CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        firstName TEXT,
        lastName TEXT,
        fullName TEXT,
        role TEXT,
        email TEXT,
        phone TEXT,
        company TEXT,
        segment TEXT,
        dealValue INTEGER,
        stage TEXT,
        source TEXT,
        closingDate TEXT,
        notes TEXT,
        heatScore INTEGER,
        owner TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        tags TEXT
      )`);

      // TASKS TABLE
      db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT,
        company TEXT,
        type TEXT,
        date TEXT,
        time TEXT,
        owner TEXT,
        status TEXT,
        leadId TEXT,
        notes TEXT
      )`);

      // SETTINGS TABLE (Key-Value)
      db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )`);

      // AUTOMATIONS TABLE
      db.run(`CREATE TABLE IF NOT EXISTS automations (
        id TEXT PRIMARY KEY,
        title TEXT,
        active INTEGER,
        steps TEXT
      )`);
      
      resolve();
    });
  });
};

const seedData = () => {
  return new Promise((resolve) => {
    db.get("SELECT COUNT(*) as count FROM leads", (err, row) => {
      if (row && row.count === 0) {
        console.log("Seeding initial leads...");
        const stmt = db.prepare(`INSERT INTO leads (id, firstName, lastName, fullName, role, email, phone, company, segment, dealValue, stage, source, closingDate, heatScore, owner, createdAt, updatedAt, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        
        const now = new Date().toISOString();
        stmt.run('l-1', 'Marcos', 'Silva', 'Marcos Silva', 'CEO', 'marcos@techcorp.com', '11999999999', 'TechCorp', 'SaaS', 15000, 'new', 'LinkedIn', null, 85, 'u1', now, now, JSON.stringify(['t1', 't3']));
        stmt.run('l-2', 'Ana', 'Costa', 'Ana Costa', 'Diretora de Vendas', 'ana@fintech.io', '11988888888', 'Fintech.io', 'Fintech', 45000, 'qualified', 'Indicação', null, 95, 'u2', now, now, JSON.stringify(['t2', 't3']));
        stmt.run('l-3', 'João', 'Souza', 'João Souza', 'Gerente de TI', 'joao@logistics.com', '11977777777', 'Logistics BR', 'Logística', 8000, 'proposal', 'Site Orgânico', null, 60, 'u1', now, now, JSON.stringify(['t4']));
        
        stmt.finalize();
        
        console.log("Seeding initial settings...");
        const stmt2 = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`);
        stmt2.run('theme', 'dark');
        stmt2.run('sidebarCollapsed', 'false');
        stmt2.finalize();
        
        console.log("Database seeded successfully!");
      } else {
        console.log("Database already has data. Skipping seed.");
      }
      resolve();
    });
  });
};

const run = async () => {
  console.log("Initializing database schema...");
  await initSchema();
  await seedData();
  db.close();
  console.log("Initialization complete.");
};

run();
