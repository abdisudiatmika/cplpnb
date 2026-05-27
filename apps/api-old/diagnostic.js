const fs = require('fs');
const path = require('path');
const http = require('http');

const logPath = path.join(__dirname, 'passenger_debug.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logPath, line, 'utf8');
}

log('Passenger diagnostic script started');
log(`Node.js version: ${process.version}`);
log(`CWD: ${process.cwd()}`);
log(`__dirname: ${__dirname}`);
log(`ENV keys: ${Object.keys(process.env).join(', ')}`);
log(`DB_HOST: ${process.env.DB_HOST}`);
log(`DB_USER: ${process.env.DB_USER}`);
log(`DATABASE_URL: ${process.env.DATABASE_URL}`);
log(`PORT: ${process.env.PORT}`);

// Create a simple server to respond to requests and prevent Passenger from failing
const server = http.createServer((req, res) => {
  log(`Request received: ${req.method} ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'diagnostic_mode',
    nodeVersion: process.version,
    cwd: process.cwd(),
    apiDir: __dirname,
    envKeys: Object.keys(process.env),
    dbHost: process.env.DB_HOST,
    dbUser: process.env.DB_USER,
    databaseUrl: process.env.DATABASE_URL ? 'PRESENT' : 'MISSING',
    port: process.env.PORT
  }, null, 2));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  log(`Diagnostic server listening on ${PORT}`);
});
