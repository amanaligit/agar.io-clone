const express = require('express');
const app = express();
// Serve static assets with short, revalidate-required caching so that hot-fix
// deploys (especially on flaky mobile browsers behind Cloudflare's default
// 4-hour edge cache) pick up updated JS within a single page reload instead
// of hours later. We tell browsers/CF to always revalidate JS/HTML/CSS.
app.use(express.static(__dirname + "/public", {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        if (/\.(?:js|html|css)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        }
    }
}));
const socketio = require('socket.io');
const PORT = process.env.PORT || '5000'
const expressServer = app.listen(PORT, () => console.log("Express and socketIO are listening on port ", PORT));
const io = socketio(expressServer, {
    // Compress large JSON frames (world snapshots) when the client supports it.
    perMessageDeflate: {
        zlibDeflateOptions: { chunkSize: 1024, memLevel: 7, level: 3 },
        zlibInflateOptions: { chunkSize: 10 * 1024 },
        threshold: 256
    }
});
const helmet = require('helmet');
app.use(helmet());
module.exports = {
    app, io
}