//database

const { Client } = require('pg');
const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/agar',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false

})
client.connect();
module.exports = client;