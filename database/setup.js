// Database setup script - run with: npm run db:setup
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/agar',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function setup() {
    try {
        await client.connect();
        console.log('Connected to database');

        // Create users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✓ Users table created');

        // Create leaderboard table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                sub VARCHAR(255),
                name VARCHAR(100),
                orbs_absorbed INTEGER DEFAULT 0,
                players_killed INTEGER DEFAULT 0,
                score INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✓ Leaderboard table created');

        console.log('\n✅ Database setup complete!');
    } catch (err) {
        console.error('Database setup error:', err);
    } finally {
        await client.end();
    }
}

setup();

