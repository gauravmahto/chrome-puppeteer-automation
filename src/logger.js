const { join } = require('path');

const { createLogger, format, transports } = require('winston');

const { LOGS_OUTPUT_DIR } = require('./constants');

module.exports.logger = createLogger({
  level: 'silly',
  format: format.json(),
  transports: [
    new transports.File({ filename: join(LOGS_OUTPUT_DIR, 'automatiom.log') }),
    new transports.Console()
  ]
});
