const app = require('../servers').app;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
const SALT_ROUNDS = 10;

const { playerInfo } = require('../sockets/socketMain');
const client = require('../database/database');

app.use(bodyParser.json());

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Register new user
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        if (username.length < 3 || username.length > 50) {
            return res.status(400).json({ error: 'Username must be between 3 and 50 characters' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if user already exists
        const existingUser = await client.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        // Hash password and create user
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const result = await client.query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
            [username, passwordHash]
        );

        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({ token, user: { id: user.id, username: user.username } });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login user
app.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Find user
        const result = await client.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const user = result.rows[0];

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ token, user: { id: user.id, username: user.username } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get leaderboard (public endpoint)
app.get('/leaderboard', async (req, res) => {
    try {
        const result = await client.query('SELECT name, score, players_killed, orbs_absorbed FROM leaderboard ORDER BY score DESC LIMIT 20');
        const results = { 'results': result ? result.rows : null };
        res.status(200).send(results);
    } catch (err) {
        console.error(err);
        res.send("Error " + err);
    }
});

// Associate socket with logged-in user
app.post('/login', authenticateToken, function (req, res) {
    const player = playerInfo.get(req.body.socketId);
    if (player) {
        player.sub = `user:${req.user.id}`;
    }
    res.status(200).send();
});

// Get user stats (authenticated endpoint)
app.get('/stats', authenticateToken, async (req, res) => {
    try {
        const userSub = `user:${req.user.id}`;
        const result = await client.query(
            `SELECT MAX(score) as "maxScore", SUM(orbs_absorbed) as "sumOrbs", SUM(players_killed) as "sumPlayers" FROM leaderboard WHERE sub = $1`,
            [userSub]
        );
        res.status(200).send(result.rows?.[0] || { maxScore: 0, sumOrbs: 0, sumPlayers: 0 });
    } catch (err) {
        console.error(err);
        res.send("Error " + err);
    }
});

module.exports = app;
