const { startAutomation } = require('./automation');
const { logger } = require('./logger');
const { INVALID_SEQUENCE } = require('./constants');

startAutomation()
  .then((cleanupFn) => {

    return cleanupFn();

  })
  .catch((error) => {

    logger.error(`FATAL error: ${error.stack}`);
    process.exit(INVALID_SEQUENCE);

  });
