const { writeFile: wf, readdir, unlink } = require('fs');
const { promisify } = require('util');
const { join } = require('path');
const { EOL } = require('os');

const puppeteer = require('puppeteer');
const yargs = require('yargs');
const shell = require('shelljs');

const utility = {
  between(min, max) {

    return Math.floor(
      Math.random() * (max - min) + min
    );

  },
  clearOutputDir(dir) {

    readdir(dir, (err, files) => {

      if (err) {
        throw err;
      };

      for (const file of files) {

        unlink(join(dir, file), err => {
          if (err) {
            throw err;
          };
        });

      }

    });

  },
  getDate() {
    const dtFormatter = new Intl.DateTimeFormat('en-IN',);
    return (dtFormatter.format(Date.now()).replace(/\//g, '-'));
  }
};

const writeFile = promisify(wf);

const DEFAULT_DATA_DIR = 'C:\\Users\\GM103015\\AppData\\Local\\Google\\Chrome\\temp user data';
const DEFAULT_URL = 'file:///C:/Users/GM103015/AppData/Local/Google/Chrome/temp%20user%20data/aristocrat-iframe/launchgame.htm';
const OUTPUT_DIR = join(__dirname, 'snapshots', utility.getDate(), Date.now().toString());
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 768;
const MIN_WIDTH = 400;
const MAX_WIDTH = 1024;
const MAX_RESIZE_ATTEMPT = 200;

const argv = cliOptions();
// Create the output folder
shell.mkdir('-p', OUTPUT_DIR);

utility.clearOutputDir(OUTPUT_DIR);

(async () => {

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    userDataDir: argv.dataDir,
    headless: false,   // default is true
    defaultViewport: { height: 768, width: 1024 }
  });

  const page = await browser.newPage();
  await page.goto(argv.url);

  await waitForInitialGameLoad(page);

  const dimensions = await getPageDimension(page);
  console.log('Dimensions:', dimensions);

  let snapshotNumber = 0;
  const cdpSession = await page.target().createCDPSession();
  await takeSnapshot(`Heap${++snapshotNumber}.heapsnapshot`, cdpSession);

  console.log(await getHeapStatus(cdpSession, true));

  let attempt = 0;
  while (++attempt < MAX_RESIZE_ATTEMPT) {

    try {

      await resizeGame(page);

      await takeSnapshot(`Heap${++snapshotNumber}.heapsnapshot`, cdpSession);

      console.log(await getHeapStatus(cdpSession, true));

    } catch (err) {

      console.log(`Attempt: ${attempt}. Error: ${err}`);

    }

  }

  await cdpSession.detach();
  await browser.close();

})();

/**
 * @returns {Promise}
 */
async function waitForInitialGameLoad(page) {

  await page.mainFrame()
    .waitForSelector('div#loadingElement', { hidden: true });

  if (typeof argv.dataDir === 'undefined') {
    await waitForResizeToStart(page);

    await waitForResizeGameLoad(page);
  }

}

/**
 * @returns {Promise}
 */
function waitForResizeToStart(page) {

  return page.mainFrame()
    .waitForSelector('div#resizingGameMessage');

}

/**
 * @returns {Promise}
 */
function waitForResizeGameLoad(page) {

  return page.mainFrame()
    .waitForSelector('div#resizingGameMessage', { hidden: true });

}

/**
 * @returns {Promise}
 */
function getPageDimension(page) {

  // Get the "viewport" of the page, as reported by the page.
  return page.evaluate(() => {
    return {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      deviceScaleFactor: window.devicePixelRatio
    };
  });

}

function getNewResizeDimension(currentDimension) {

  let newHeight;
  let newWidth;

  do {

    newHeight = utility.between(MIN_HEIGHT, MAX_HEIGHT);
    newWidth = utility.between(MIN_WIDTH, MAX_WIDTH);

  } while ((currentDimension.height === newHeight) || (currentDimension.width === newWidth));

  return {
    width: newWidth,
    height: newHeight
  };

}

async function resizeGame(page) {

  const dimensions = await getPageDimension(page);

  const newDimensions = getNewResizeDimension(dimensions);

  await page.setViewport({ height: newDimensions.height, width: newDimensions.width });

  await waitForResizeToStart(page);

  await waitForResizeGameLoad(page);

}

/**
 * @returns {Promise<{usedSize: number, totalSize: number}>}
 */
async function getHeapStatus(cdpSession, writeToFile) {

  const heapStats = await cdpSession.send('Runtime.getHeapUsage');

  heapStats.usedSize = (heapStats.usedSize / (1024 * 1024));
  heapStats.totalSize = (heapStats.totalSize / (1024 * 1024));

  if (writeToFile) {

    writeFile(join(OUTPUT_DIR, 'heap-status.txt'), (JSON.stringify(heapStats) + EOL), { flag: 'a' });

  }

  return heapStats;

}

async function takeSnapshot(fileName, cdpSession) {

  let snapShotData = '';

  const addHeapSnapshotChunkhandler = (data) => {
    snapShotData += data.chunk;
  };
  cdpSession.on('HeapProfiler.addHeapSnapshotChunk', addHeapSnapshotChunkhandler);

  await cdpSession.send('HeapProfiler.takeHeapSnapshot', {
    reportProgress: false
  });

  cdpSession.off('HeapProfiler.addHeapSnapshotChunk', addHeapSnapshotChunkhandler);

  return writeFile(join(OUTPUT_DIR, fileName), snapShotData, { flag: 'w' });

}

function cliOptions() {

  return yargs
    .usage('Usages: $0 -url="https://www.google.com"')
    .command('--url', 'The URL to open')
    .command('--data-dir', 'The user data directory')
    .default('url', DEFAULT_URL)
    .default('data-dir', DEFAULT_DATA_DIR)
    .option('greet', {
      alias: 'g',
      description: 'Prints the greeting',
      type: 'string'
    })
    .help()
    .alias('help', 'h')
    .argv;

}
