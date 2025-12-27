//database

const { Client } = require('pg');
const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/agar',
    // Only use SSL for Heroku/production (when DATABASE_URL contains 'heroku')
    ssl: process.env.DATABASE_URL?.includes('heroku') ? { rejectUnauthorized: false } : false
})
client.connect();
module.exports = client;