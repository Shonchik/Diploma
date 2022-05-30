import {Heartbeat} from './heartbeat.js';
import {createSession, closeSession} from './api.js';

const OPENCV_URI = "https://docs.opencv.org/master/opencv.js";
const HAARCASCADE_URI = "./scripts/haarcascade_frontalface_alt.xml"

let demo = undefined;

let buttonStartStop = document.getElementById('startstop');
let bpmOutputElem = document.getElementById('bpm');
let sessionIdElem = document.getElementById('sessionid');

function fillCanvasWithColor(clr) {
  let canvas = document.getElementById("canvas");
  let ctx = canvas.getContext("2d");
  ctx.fillStyle = clr;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Load opencv when needed
async function loadOpenCv(uri) {
  return new Promise(function(resolve, reject) {
    console.log("starting to load opencv");
    var tag = document.createElement('script');
    tag.src = uri;
    tag.async = true;
    tag.type = 'text/javascript'
    tag.onload = () => {
      cv['onRuntimeInitialized'] = () => {
        console.log("opencv ready");
        resolve();
      }
    };
    tag.onerror = () => {
      throw new URIError("opencv didn't load correctly.");
    };
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  });
}

function getSessionIdFromCookie() {
  const sessionIdCookie = document.cookie.split(';').filter((item) => item.trim().startsWith('sessionid='));
  if (sessionIdCookie.length) {
    const sessionId = sessionIdCookie[0].split('=')[1];
    return sessionId;
  } else {
    return undefined;
  }
}

async function getSessionId() {
  const sessionId = getSessionIdFromCookie();
  if (sessionId) {
    sessionIdElem.value = sessionId;
    return sessionId;
  } else {
    const sessionId = await createSession();
    document.cookie = `sessionid=${sessionId}`;
    sessionIdElem.value = sessionId;
    return sessionId;
  }
}

async function destroySession(sessionId) {
  document.cookie = 'sessionid=; expires = Thu, 01 Jan 1970 00:00:00 GMT;';
  await closeSession(sessionId);
}

async function onBnClickedStart() {
  buttonStartStop.disabled = true;

  const sessionId = await getSessionId();
  demo.setSessionId(sessionId);

  await demo.init();

  buttonStartStop.onclick = onBnClickedStop;
  buttonStartStop.innerText = 'Stop';
  buttonStartStop.disabled = false;
}

async function onBnClickedStop() {
  buttonStartStop.disabled = true;
  demo.stop();

  const currentSession = demo.getSessionId();
  if (currentSession) {
    await destroySession(currentSession);
    demo.setSessionId(undefined);
    sessionIdElem.value = '-';
  }

  bpmOutputElem.value = '-';
  fillCanvasWithColor('gray');

  buttonStartStop.onclick = onBnClickedStart;
  buttonStartStop.innerText = 'Start';
  buttonStartStop.disabled = false;
}

buttonStartStop.onclick = onBnClickedStart;
fillCanvasWithColor('gray');

var ready = loadOpenCv(OPENCV_URI);

async function initHB() {
  demo = new Heartbeat("webcam", "canvas", "bpm", HAARCASCADE_URI, 30, 6, 250);
  const sessionId = getSessionIdFromCookie();
  if (sessionId) {
    await onBnClickedStart();
  } else {
    buttonStartStop.disabled = false;
  }
}

ready.then(function() {
  initHB();
});
