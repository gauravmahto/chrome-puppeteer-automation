const { writeFile: wf } = require('fs');
const { promisify, inspect } = require('util');
const { join } = require('path');
const { EOL } = require('os');

const puppeteer = require('puppeteer');
const yargs = require('yargs');
const shell = require('shelljs');

const { between, clearOutputDir } = require('./utility');
const {
  DEFAULT_DATA_DIR, DEFAULT_URL, MAX_HEIGHT, MAX_RESIZE_ATTEMPT, MAX_WIDTH,
  MIN_HEIGHT, MIN_WIDTH, SCREEN_CAPTURE_OUTPUT_DIR, SNAPSHOTS_OUTPUT_DIR
} = require('./constants');
const { logger } = require('./logger');

const writeFile = promisify(wf);

const argv = cliOptions();
// Create the snapshot output folder
shell.mkdir('-p', SNAPSHOTS_OUTPUT_DIR);
// Create the screen capture output folder
shell.mkdir('-p', SCREEN_CAPTURE_OUTPUT_DIR);

clearOutputDir(SNAPSHOTS_OUTPUT_DIR);

// $0.contentWindow.loneStar.Game.trigger(99)
// -94, -34
// let b = new MouseEvent('mousedown', {
//   bubbles: true,
//   cancelable: true,
//   view: $0.contentWindow,
//   clientX: 1111,
//   clientY: 720
//   })

module.exports.startAutomation = async function startAutomation() {

  let browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    userDataDir: argv.dataDir,
    headless: false,   // default is true
    defaultViewport: { height: 768, width: 1024 },
    args: [ '--disable-features=site-per-process' ]
  });

  const mainPage = await browser.newPage();
  let page;

  if (typeof argv.targetRemote !== 'undefined') {

    page = await openRemotePage(browser, mainPage, argv.targetRemote);

  } else {

    await mainPage.goto(argv.url);
    page = mainPage;

  }

  let windcreekFrame = page.frames().find(frame => frame.url() === 'https://windcreekcasinotest.com/game/1000');

  // await waitForInitialGameLoad(windcreekFrame || page.mainFrame());

  const dimensions = await getPageDimension(page);
  logger.info(`Initial dimensions: ${inspect(dimensions)}`);

  let snapshotNumber = 0;
  let cdpSession = await page.target().createCDPSession();

  const cleanup = async () => {

    logger.info('Performing cleanup.');

    if (null !== cdpSession) {

      try {

        await cdpSession.detach();

      } catch (error) {

        logger.error(`Fatal error: ${error}`);

      }

      cdpSession = null;

    }

    if (null !== browser) {

      try {

        await browser.close();

      } catch (error) {

        logger.error(`Fatal error: ${error}`);

      }

      browser = null;

    }

  };

  await takeSnapshot(`Heap${++snapshotNumber}.heapsnapshot`, cdpSession);

  if (argv.screenCapturePath) {

    const screenCaptureUpdatedPath = join(SCREEN_CAPTURE_OUTPUT_DIR, argv.screenCapturePath);
    shell.mkdir('-p', screenCaptureUpdatedPath);

    try {

      startScreenCapturing(cdpSession, screenCaptureUpdatedPath);

    } catch (err) {

      logger.error(`Screen capturing not supported. ${err}.` +
        `Make sure that you have downloaded FFMPEG encoder and is available to the system's path.` +
        `For more info refer: https://www.ffmpeg.org/download.html and https://en.wikibooks.org/wiki/FFMPEG_An_Intermediate_Guide`);

    }

  }

  logger.info(await getHeapStatus(cdpSession, true));

  let attempt = 0;
  let failedAttempt = 0;
  while (++attempt < MAX_RESIZE_ATTEMPT) {

    try {

      await resizeGame(page);
      // await page.waitForNavigation({
      //   waitUntil: 'networkidle2'
      // });
      await page.waitFor(5000);
      // await page.waitForFunction(
      //   `document.querySelector('iframe.game-frame') !== null`
      // );
      // await page.waitForFunction(
      //   `document.querySelector('iframe.game-frame').contentDocument.querySelector('iframe') !== null`
      // );
      // await page.waitForFunction(
      //   `console.log(document.querySelector('iframe.game-frame').contentDocument.querySelector('iframe'))`
      // );
      // await waitForGameToResize(windcreekFrame || page.mainFrame());

      // New
      const dimensions = await getPageDimension(page);

      // const frameElementHandle = await page.$('iframe');
      // const frame = await frameElementHandle.contentFrame();
      // const canvasElement = await frame.$('canvas');
      // const canvasBoundingBox = await canvasElement.boundingBox();

      // const frameElementHandle = await page.$('iframe.game-frame');
      // const frame = await frameElementHandle.contentFrame();
      // const frameElementHandle2 = await frame.$('iframe');
      // const frame2 = await frameElementHandle2.contentFrame();

      // const canvasElement = await frame2.$('canvas');
      // const canvasBoundingBox = await canvasElement.boundingBox();

      // const clickCoordinates = {
      //   x: (canvasBoundingBox.width) - 84,
      //   y: (canvasBoundingBox.height) - 34
      // };
      // await page.mouse.click(clickCoordinates.x, clickCoordinates.y);
      // await page.waitFor(5000);
      // await page.mouse.click(clickCoordinates.x, clickCoordinates.y);

      // New

      // await takeSnapshot(`Heap${++snapshotNumber}.heapsnapshot`, cdpSession);

      logger.info(`Updated dimensions for snapshot #${snapshotNumber}: ${inspect(dimensions)}`);

      logger.info(await getHeapStatus(cdpSession, true));

    } catch (err) {

      if (err.message.includes('Target closed')) {

        return cleanup;

      }

      logger.error(`Attempt: ${((--attempt) + (++failedAttempt))}. Error: ${err}`);

    }

  }

  return cleanup;

};

async function openRemotePage(browser, page, remote) {

  // const {
  //   DEFAULT_USERNAME, DEFAULT_PASSWORD,
  //   DEFAULT_REMOTE, HomePage
  // } = require('./private-page-objects/page-objects/winnabunch/homepage');

  const {
    DEFAULT_USERNAME, DEFAULT_PASSWORD,
    DEFAULT_REMOTE, HomePage
  } = require('./private-page-objects/page-objects/windcreek/homepage');

  const homePage = new HomePage(page, browser, (remote || DEFAULT_REMOTE));

  await homePage.open();
  await homePage.login(DEFAULT_USERNAME, DEFAULT_PASSWORD);

  return homePage.openGamePage();

}

async function waitForInitialGameLoad(frame) {

  await frame.waitForSelector('div#loadingElement');

  return frame.waitForSelector('div#loadingElement', { hidden: true });

}

/**
 * @returns {Promise}
 */
function waitForResizeToStart(frame) {

  return frame.waitForSelector('div#resizingGameMessage');

}

/**
 * @returns {Promise}
 */
function waitForResizeGameLoad(frame) {

  return frame.waitForSelector('div#resizingGameMessage', { hidden: true });

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

    newHeight = between(MIN_HEIGHT, MAX_HEIGHT);
    newWidth = between(MIN_WIDTH, MAX_WIDTH);

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

}

async function waitForGameToResize(frame) {

  await waitForResizeToStart(frame);

  await waitForResizeGameLoad(frame);

}

/**
 * For more info refer:
 * 1) https://www.ffmpeg.org/download.html
 * 2) https://en.wikibooks.org/wiki/FFMPEG_An_Intermediate_Guide
 */
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
      },
      '--target-remote': {
        description: 'Use remote environment',
        alias: 'R',
        type: 'string'
      }
    })
    .option('greet', {
      alias: 'g',
      description: 'Prints the greeting',
      type: 'string'
    })
    .help()
    .alias('help', 'h')
    .argv;

}
