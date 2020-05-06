const { startAutomation } = require('./automation');
const { logger } = require('./logger');

startAutomation()
  .then((cleanupFn) => {

    return cleanupFn();

  })
  .catch((error) => {

    logger.error(`FATAL error: ${error}`);

  });
