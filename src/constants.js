const { join } = require('path');

const { getDate } = require('./utility');

module.exports.ROOT_DIR = join(__dirname, '..');
module.exports.DEFAULT_DATA_DIR = 'C:\\Users\\GM103015\\AppData\\Local\\Google\\Chrome\\temp user data';
module.exports.DEFAULT_URL = 'file:///C:/Users/GM103015/AppData/Local/Google/Chrome/temp%20user%20data/aristocrat-iframe/launchgame.htm';
module.exports.OUTPUT_DIR = join(module.exports.ROOT_DIR, 'bin', getDate(), Date.now().toString());
module.exports.LOGS_OUTPUT_DIR = join(module.exports.OUTPUT_DIR, 'logs');
module.exports.SNAPSHOTS_OUTPUT_DIR = join(module.exports.OUTPUT_DIR, 'snapshots');
module.exports.SCREEN_CAPTURE_OUTPUT_DIR = join(module.exports.OUTPUT_DIR, 'screen-capture');
module.exports.MIN_HEIGHT = 200;
module.exports.MAX_HEIGHT = 768;
module.exports.MIN_WIDTH = 400;
module.exports.MAX_WIDTH = 1024;
module.exports.MAX_RESIZE_ATTEMPT = 200;
