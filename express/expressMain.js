const app = require('../servers').app;

const jwt = require('express-jwt');
const jwtAuthz = require('express-jwt-authz');
const jwksRsa = require('jwks-rsa');
const bodyParser = require('body-parser');

//Authentication credentials
const audience = "https://agario-clone-aman.herokuapp.com/";
const domain = "dev-earqz191.us.auth0.com";


const { PlayerInfo } = require('../sockets/socketMain');
const client = require('../database/database')

app.use(bodyParser.json());
const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
    }),
    audience: audience,
    issuer: `https://${domain}/`,
    algorithms: ['RS256'],
});

app.get('/leaderboard', async (req, res) => {
    try {
        const result = await client.query('SELECT name, score, players_killed, orbs_absorbed FROM leaderboard order by score desc');
        const results = { 'results': (result) ? result.rows : null };
        res.status(200).send(results);
    } catch (err) {
        console.error(err);
        res.send("Error " + err);
    }
})

// This route needs authentication
app.post('/login', checkJwt, function (req, res) {
    const player = PlayerInfo.get(req.body.socketId);
    player.sub = req.user?.sub;
    res.status(200).send();
});

app.get('/stats', checkJwt, async (req, res) => {
    try {
        console.log(req.user.sub);
        const result = await (await client.query(`select max(score) as "maxScore", sum(orbs_absorbed) as "sumOrbs" ,sum(players_killed) as "sumPlayers"  from leaderboard where sub ='${req.user.sub}'`)).rows?.[0];
        // console.log(result);
        res.status(200).send(result);
    } catch (err) {
        console.error(err);
        res.send("Error " + err);
    }
})



module.exports = app;