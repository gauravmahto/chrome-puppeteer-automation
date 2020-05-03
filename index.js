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
const OUTPUT_DIR = join(__dirname, 'bin', utility.getDate(), Date.now().toString());
const SNAPSHOTS_OUTPUT_DIR = join(OUTPUT_DIR, 'snapshots');
const SCREEN_CAPTURE_OUTPUT_DIR = join(OUTPUT_DIR, 'screen-capture');
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 768;
const MIN_WIDTH = 400;
const MAX_WIDTH = 1024;
const MAX_RESIZE_ATTEMPT = 200;

const argv = cliOptions();
// Create the snapshot output folder
shell.mkdir('-p', SNAPSHOTS_OUTPUT_DIR);
// Create the screen capture output folder
shell.mkdir('-p', SCREEN_CAPTURE_OUTPUT_DIR);

utility.clearOutputDir(SNAPSHOTS_OUTPUT_DIR);

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

  if (argv.screenCapturePath) {

    const screenCaptureUpdatedPath = join(SCREEN_CAPTURE_OUTPUT_DIR, argv.screenCapturePath);
    shell.mkdir('-p', screenCaptureUpdatedPath);

    startScreenCapturing(cdpSession, screenCaptureUpdatedPath);

  }

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
function waitForInitialGameLoad(page) {

  return page.mainFrame()
    .waitForSelector('div#loadingElement', { hidden: true });

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

function startScreenCapturing(cdpSession, path) {

  let imageSeq = 0;

  cdpSession.on('Page.screencastFrame', ({ data }) => {
    writeFile(join(path, `capture-${++imageSeq}.png`), Buffer.from(data, 'base64'));
  });

  cdpSession.send('Page.startScreencast', {
    format: 'png',
    quality: 15
  });

}

/**
 * @returns {Promise<{usedSize: number, totalSize: number}>}
 */
async function getHeapStatus(cdpSession, writeToFile) {

  const heapStats = await cdpSession.send('Runtime.getHeapUsage');

  heapStats.usedSize = (heapStats.usedSize / (1024 * 1024));
  heapStats.totalSize = (heapStats.totalSize / (1024 * 1024));

  if (writeToFile) {

    writeFile(join(SNAPSHOTS_OUTPUT_DIR, 'heap-status.txt'), (JSON.stringify(heapStats) + EOL), { flag: 'a' });

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

  return writeFile(join(SNAPSHOTS_OUTPUT_DIR, fileName), snapShotData, { flag: 'w' });

}

function cliOptions() {

  return yargs
    .usage('Usages: $0 -url="https://www.google.com"')
    .options({
      '--url': {
        description: 'The URL to open',
        alias: 'U',
        type: 'string',
        default: DEFAULT_URL,
        requiresArg: true
      },
      '--data-dir': {
        description: 'The user data directory',
        alias: 'D',
        type: 'string',
        default: DEFAULT_DATA_DIR,
        requiresArg: true
      },
      '--screen-capture-path': {
        description: 'Use screen capture',
        alias: 'S',
        type: 'string',
        default: '',
        requiresArg: true,
        normalize: true
      }
    })
    // .option('--screen-capture', {
    //   description: 'Use screen capture',
    //   alias: 'S',
    //   type: 'boolean',
    //   default: false,
    //   requiresArg: true,
    //   demandOption: true,
    //   normalize: true
    // })
    .option('greet', {
      alias: 'g',
      description: 'Prints the greeting',
      type: 'string'
    })
    .help()
    .alias('help', 'h')
    .argv;

}
