const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.static(__dirname + "/public"));
const socketio = require('socket.io');
const expressServer = app.listen(80, '0.0.0.0');
const io = socketio(expressServer, {
    cors: {
        origin: '*',
    }
});


console.log("Express and socketIO are listening on port 80");

module.exports = {
    app, io
}