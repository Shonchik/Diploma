import {sendBpm} from './api.js';

const RESCAN_INTERVAL = 1000;
const DEFAULT_FPS = 30;
const LOW_BPM = 42;
const HIGH_BPM = 240;
const REL_MIN_FACE_SIZE = 0.4;
const SEC_PER_MIN = 60;
const MSEC_PER_SEC = 1000;
const MAX_CORNERS = 10;
const MIN_CORNERS = 5;
const QUALITY_LEVEL = 0.01;
const MIN_DISTANCE = 10;

export class Heartbeat {
  constructor(webcamId, canvasId, bpmOutputId, classifierPath, targetFps, windowSize, rppgInterval) {
    this.webcamId = webcamId;
    this.canvasId = canvasId;
    this.sessionId = undefined;
    this.bpmOutputId = bpmOutputId;
    this.classifierPath = classifierPath;
    this.streaming = false;
    this.faceValid = false;
    this.targetFps = targetFps;
    this.windowSize = windowSize;
    this.rppgInterval = rppgInterval;
    this.classifier = null;
  }

  setSessionId(sessionId) {
    this.sessionId = sessionId;
  }

  getSessionId() {
    return this.sessionId;
  }

  async startStreaming() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: {exact: this.webcamVideoElement.width},
          height: {exact: this.webcamVideoElement.height}
        },
        audio: false
      });
    } catch (e) {
      console.log(e);
    }
    if (!this.stream) {
      throw new Error('Could not obtain video from webcam.');
    }
    this.webcamVideoElement.srcObject = this.stream;
    this.webcamVideoElement.play();
    this.streaming = true;
    return new Promise(resolve => {
      this.webcamVideoElement.oncanplay = () => {
        resolve();
      };
    });
  }

  async createFileFromUrl(path, url) {
    let request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    request.send();
    return new Promise(resolve => {
      request.onload = () => {
        if (request.readyState === 4) {
          if (request.status === 200) {
            let data = new Uint8Array(request.response);
            cv.FS_createDataFile('/', path, data, true, false, false);
            resolve();
          } else {
            console.log('Failed to load ' + url + ' status: ' + request.status);
          }
        }
      };
    });
  }

  async init() {
    this.webcamVideoElement = document.getElementById(this.webcamId);
    try {
      await this.startStreaming();
      this.webcamVideoElement.width = this.webcamVideoElement.videoWidth;
      this.webcamVideoElement.height = this.webcamVideoElement.videoHeight;
      this.frameRGB = new cv.Mat(this.webcamVideoElement.height, this.webcamVideoElement.width, cv.CV_8UC4);
      this.lastFrameGray = new cv.Mat(this.webcamVideoElement.height, this.webcamVideoElement.width, cv.CV_8UC1);
      this.frameGray = new cv.Mat(this.webcamVideoElement.height, this.webcamVideoElement.width, cv.CV_8UC1);
      this.overlayMask = new cv.Mat(this.webcamVideoElement.height, this.webcamVideoElement.width, cv.CV_8UC1);
      this.cap = new cv.VideoCapture(this.webcamVideoElement);
      this.signal = [];
      this.timestamps = [];
      this.rescan = []; 
      this.face = new cv.Rect(); 
      if (!this.classifier) {
        this.classifier = new cv.CascadeClassifier();
        let faceCascadeFile = "haarcascade_frontalface_alt.xml";
        await this.createFileFromUrl(faceCascadeFile, this.classifierPath);
        this.classifier.load(faceCascadeFile)
      }
      this.scanTimer = setInterval(this.processFrame.bind(this),
        MSEC_PER_SEC/this.targetFps);
      this.rppgTimer = setInterval(this.rppg.bind(this), this.rppgInterval);
    } catch (e) {
      console.log(e);
    }
  }

  processFrame() {
    try {
      if (!this.frameGray.empty()) {
        this.frameGray.copyTo(this.lastFrameGray); 
      }
      this.cap.read(this.frameRGB); 
      let time = Date.now()
      let rescanFlag = false;
      cv.cvtColor(this.frameRGB, this.frameGray, cv.COLOR_RGBA2GRAY);
      if (!this.faceValid) {
        this.lastScanTime = time;
        this.detectFace(this.frameGray);
      }
      else if (time - this.lastScanTime >= RESCAN_INTERVAL) {
        this.lastScanTime = time
        this.detectFace(this.frameGray);
        rescanFlag = true;
      }
      else {
        //this.trackFace(this.lastFrameGray, this.frameGray);
      }
      if (this.faceValid) {
        while (this.signal.length > this.targetFps * this.windowSize) {
          this.signal.shift();
          this.timestamps.shift();
          this.rescan.shift();
        }
        let mask = new cv.Mat();
        mask = this.makeMask(this.frameGray, this.face);
        let means = cv.mean(this.frameRGB, mask);
        mask.delete();
        this.signal.push(means.slice(0, 3));
        this.timestamps.push(time);
        this.rescan.push(rescanFlag);
      }
      cv.rectangle(this.frameRGB, new cv.Point(this.face.x, this.face.y),
        new cv.Point(this.face.x+this.face.width, this.face.y+this.face.height),
        [0, 255, 0, 255]);
      this.frameRGB.setTo([255, 0, 0, 255], this.overlayMask);
      cv.imshow(this.canvasId, this.frameRGB);
    } catch (e) {
      console.log("Error capturing frame:");
      console.log(e);
    }
  }
  detectFace(gray) {
    let faces = new cv.RectVector();
    this.classifier.detectMultiScale(gray, faces, 1.1, 3, 0);
    if (faces.size() > 0) {
      this.face = faces.get(0);
      this.faceValid = true;
    } else {
      console.log("No faces");
      this.invalidateFace();
    }
    faces.delete();
  }

  makeMask(frameGray, face) {
    let result = cv.Mat.zeros(frameGray.rows, frameGray.cols, cv.CV_8UC1);
    let white = new cv.Scalar(255, 255, 255, 255);
    let pt1 = new cv.Point(Math.round(face.x + 0.3 * face.width),
      Math.round(face.y + 0.1 * face.height));
    let pt2 = new cv.Point(Math.round(face.x + 0.7 * face.width),
      Math.round(face.y + 0.25 * face.height));
    cv.rectangle(result, pt1, pt2, white, -1);
    return result;
  }

  invalidateFace() {
    this.signal = [];
    this.timestamps = [];
    this.rescan = [];
    this.overlayMask.setTo([0, 0, 0, 0]);
    this.face = new cv.Rect();
    this.faceValid = false;
    this.corners = [];
  }

  trackFace(lastFrameGray, frameGray) {
    let trackingMask = cv.Mat.zeros(frameGray.rows, frameGray.cols, cv.CV_8UC1);
    let squarePointData = new Uint8Array([
      this.face.x + 0.22 * this.face.width, this.face.y + 0.21 * this.face.height,
      this.face.x + 0.78 * this.face.width, this.face.y + 0.21 * this.face.height,
      this.face.x + 0.70 * this.face.width, this.face.y + 0.65 * this.face.height,
      this.face.x + 0.30 * this.face.width, this.face.y + 0.65 * this.face.height]);
    let squarePoints = cv.matFromArray(4, 1, cv.CV_32SC2, squarePointData);
    let pts = new cv.MatVector();
    let corners = new cv.Mat();
    pts.push_back(squarePoints);
    cv.fillPoly(trackingMask, pts, [255, 255, 255, 255]);
    cv.goodFeaturesToTrack(lastFrameGray, corners, MAX_CORNERS,
      QUALITY_LEVEL, MIN_DISTANCE, trackingMask, 3);
    trackingMask.delete(); squarePoints.delete(); pts.delete();

    let corners_1 = new cv.Mat();
    let st = new cv.Mat();
    let err = new cv.Mat();
    let winSize = new cv.Size(15, 15);
    let maxLevel = 2;
    let criteria = new cv.TermCriteria(
      cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT, 10, 0.03);
    cv.calcOpticalFlowPyrLK(lastFrameGray, frameGray, corners, corners_1,
      st, err, winSize, maxLevel, criteria);

    let corners_0 = new cv.Mat();
    cv.calcOpticalFlowPyrLK(frameGray, lastFrameGray, corners_1, corners_0,
      st, err, winSize, maxLevel, criteria);

    st.delete(); err.delete();

    if (corners_1.rows >= MIN_CORNERS) {
      const [s, tx, ty] = this.estimateAffineTransform(corners_0, corners_1);
      this.face = new cv.Rect(
        this.face.x * s + tx, this.face.y * s + ty,
        this.face.width * s, this.face.height * s);
    } else {
      this.invalidateFace();
    }

    corners.delete(); corners_1.delete(); corners_0.delete();
  }

  estimateAffineTransform(corners_0, corners_1) {
    let t_x = cv.matFromArray(corners_0.rows*2, 1, cv.CV_32FC1,
      Array.from(corners_0.data32F));
    let y = cv.matFromArray(corners_1.rows*2, 1, cv.CV_32FC1,
      Array.from(corners_1.data32F));
    let x = new cv.Mat(corners_0.rows*2, 3, cv.CV_32FC1);
    let t_10 = new cv.Mat(); let t_01 = new cv.Mat();
    cv.repeat(cv.matFromArray(2, 1, cv.CV_32FC1, [1, 0]), corners_0.rows, 1, t_10);
    cv.repeat(cv.matFromArray(2, 1, cv.CV_32FC1, [0, 1]), corners_0.rows, 1, t_01);
    t_x.copyTo(x.col(0));
    t_10.copyTo(x.col(1));
    t_01.copyTo(x.col(2));

    let res = cv.Mat.zeros(3, 1, cv.CV_32FC1);
    cv.solve(x, y, res, cv.DECOMP_SVD);

    t_01.delete(); t_10.delete(); x.delete(); t_x.delete(); y.delete();

    return [res.data32F[0], res.data32F[1], res.data32F[2]];
  }

  rppg() {
    let fps = this.getFps(this.timestamps);
    if (this.signal.length >= this.targetFps * this.windowSize) {
      let signal = cv.matFromArray(this.signal.length, 1, cv.CV_32FC3,
        [].concat.apply([], this.signal));
      this.denoise(signal, this.rescan);
      this.standardize(signal);
      this.detrend(signal, fps);
      this.movingAverage(signal, 3, Math.max(Math.floor(fps/6), 2));
      signal = this.selectGreen(signal);
      this.overlayMask.setTo([0, 0, 0, 0]);
      this.timeToFrequency(signal, true);
      let low = Math.floor(signal.rows * LOW_BPM / SEC_PER_MIN / fps);
      let high = Math.ceil(signal.rows * HIGH_BPM / SEC_PER_MIN / fps);
      if (!signal.empty()) {
        let bandMask = cv.matFromArray(signal.rows, 1, cv.CV_8U,
          new Array(signal.rows).fill(0).fill(1, low, high+1));
        let result = cv.minMaxLoc(signal, bandMask);
        bandMask.delete();
        let bpm = result.maxLoc.y * fps / signal.rows * SEC_PER_MIN;
        console.log(bpm);
        document.getElementById(this.bpmOutputId).value = bpm.toFixed(1);
        if (this.sessionId) {
          sendBpm(this.sessionId, bpm);
        };
      }
      signal.delete();
    } else {
      console.log("signal too small");
    }
  }

  getFps(timestamps, timeBase=1000) {
    if (Array.isArray(timestamps) && timestamps.length) {
      if (timestamps.length == 1) {
        return DEFAULT_FPS;
      } else {
        let diff = timestamps[timestamps.length-1] - timestamps[0];
        return timestamps.length/diff*timeBase;
      }
    } else {
      return DEFAULT_FPS;
    }
  }

  denoise(signal, rescan) {
    let diff = new cv.Mat();
    cv.subtract(signal.rowRange(1, signal.rows), signal.rowRange(0, signal.rows-1), diff);
    for (var i = 1; i < signal.rows; i++) {
      if (rescan[i] == true) {
        let adjV = new cv.MatVector();
        let adjR = cv.matFromArray(signal.rows, 1, cv.CV_32FC1,
          new Array(signal.rows).fill(0).fill(diff.data32F[(i-1)*3], i, signal.rows));
        let adjG = cv.matFromArray(signal.rows, 1, cv.CV_32FC1,
          new Array(signal.rows).fill(0).fill(diff.data32F[(i-1)*3+1], i, signal.rows));
        let adjB = cv.matFromArray(signal.rows, 1, cv.CV_32FC1,
          new Array(signal.rows).fill(0).fill(diff.data32F[(i-1)*3+2], i, signal.rows));
        adjV.push_back(adjR); adjV.push_back(adjG); adjV.push_back(adjB);
        let adj = new cv.Mat();
        cv.merge(adjV, adj);
        cv.subtract(signal, adj, signal);
        adjV.delete(); adjR.delete(); adjG.delete(); adjB.delete();
        adj.delete();
      }
    }
    diff.delete();
  }

  standardize(signal) {
    let mean = new cv.Mat();
    let stdDev = new cv.Mat();
    let t1 = new cv.Mat();
    cv.meanStdDev(signal, mean, stdDev, t1);
    let means_c3 = cv.matFromArray(1, 1, cv.CV_32FC3, [mean.data64F[0], mean.data64F[1], mean.data64F[2]]);
    let stdDev_c3 = cv.matFromArray(1, 1, cv.CV_32FC3, [stdDev.data64F[0], stdDev.data64F[1], stdDev.data64F[2]]);
    let means = new cv.Mat(signal.rows, 1, cv.CV_32FC3);
    let stdDevs = new cv.Mat(signal.rows, 1, cv.CV_32FC3);
    cv.repeat(means_c3, signal.rows, 1, means);
    cv.repeat(stdDev_c3, signal.rows, 1, stdDevs);
    cv.subtract(signal, means, signal, t1, -1);
    cv.divide(signal, stdDevs, signal, 1, -1);
    mean.delete(); stdDev.delete(); t1.delete();
    means_c3.delete(); stdDev_c3.delete();
    means.delete(); stdDevs.delete();
  }

  detrend(signal, lambda) {
    let h = cv.Mat.zeros(signal.rows-2, signal.rows, cv.CV_32FC1);
    let i = cv.Mat.eye(signal.rows, signal.rows, cv.CV_32FC1);
    let t1 = cv.Mat.ones(signal.rows-2, 1, cv.CV_32FC1)
    let t2 = cv.matFromArray(signal.rows-2, 1, cv.CV_32FC1,
      new Array(signal.rows-2).fill(-2));
    let t3 = new cv.Mat();
    t1.copyTo(h.diag(0)); t2.copyTo(h.diag(1)); t1.copyTo(h.diag(2));
    cv.gemm(h, h, lambda*lambda, t3, 0, h, cv.GEMM_1_T);
    cv.add(i, h, h, t3, -1);
    cv.invert(h, h, cv.DECOMP_LU);
    cv.subtract(i, h, h, t3, -1);
    let s = new cv.MatVector();
    cv.split(signal, s);
    cv.gemm(h, s.get(0), 1, t3, 0, s.get(0), 0);
    cv.gemm(h, s.get(1), 1, t3, 0, s.get(1), 0);
    cv.gemm(h, s.get(2), 1, t3, 0, s.get(2), 0);
    cv.merge(s, signal);
    h.delete(); i.delete();
    t1.delete(); t2.delete(); t3.delete();
    s.delete();
  }

  movingAverage(signal, n, kernelSize) {
    for (var i = 0; i < n; i++) {
      cv.blur(signal, signal, {height: kernelSize, width: 1});
    }
  }

  selectGreen(signal) {
    let rgb = new cv.MatVector();
    cv.split(signal, rgb);
    let result = rgb.get(1);
    rgb.delete();
    return result;
  }

  timeToFrequency(signal, magnitude) {
    let planes = new cv.MatVector();
    planes.push_back(signal);
    planes.push_back(new cv.Mat.zeros(signal.rows, 1, cv.CV_32F))
    let powerSpectrum = new cv.Mat();
    cv.merge(planes, signal);
    cv.dft(signal, signal, cv.DFT_COMPLEX_OUTPUT);
    if (magnitude) {
      cv.split(signal, planes);
      cv.magnitude(planes.get(0), planes.get(1), signal);
    }
  }
  
  stop() {
    clearInterval(this.rppgTimer);
    clearInterval(this.scanTimer);
    if (this.webcam) {
      this.webcamVideoElement.pause();
      this.webcamVideoElement.srcObject = null;
    }
    if (this.stream) {
      this.stream.getVideoTracks()[0].stop();
    }
    this.invalidateFace();
    this.streaming = false;
    this.frameRGB.delete();
    this.lastFrameGray.delete();
    this.frameGray.delete();
    this.overlayMask.delete();
  }
}
