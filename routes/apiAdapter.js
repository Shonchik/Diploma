var express = require('express');
var router = express.Router();
const fetch = require("node-fetch");

const pythonUrl = 'http://localhost:5003';

async function closeSession(sessionId) {
  const response = await fetch(`${pythonUrl}/close_session/${sessionId}`);
  console.log(response);
  const result = await response.json();
  console.log(result);
  return result;
}

async function sendBpm(sessionId, bpm) {
  const data = {bpm};
  const options = {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  };
  const res = await fetch(`${pythonUrl}/send_bpm/${sessionId}`, options);
  console.log(res);
  return res;
}


/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get("/new_session", async function(req, res) {
  console.log("new_session");
  const response = await fetch(`${pythonUrl}/new_session`);
  console.log(response);
  const sessionId = await response.json();
  console.log(sessionId);
  res.json(sessionId);
});

router.post("/send_bpm/:sessionId", express.json(), async function(req, res) {
  const sessionId = req.params.sessionId;
  console.log("send_bpm session", sessionId);
  const bpm = req.body.bpm;
  console.log("send_bpm", bpm);
  const options = {
     method: 'POST',
     headers: new fetch.Headers({ 'Content-Type': 'application/json' }),
     body: JSON.stringify({bpm}),
  };
  const response = await fetch(`${pythonUrl}/send_bpm/${sessionId}`, options);
  const responseText = await response.json();
  console.log(responseText);
  res.json(responseText);
});

router.get("/close_session/:sessionId", async function(req, res) {
  const sessionId = req.params.sessionId;
  console.log("close_session", sessionId);
  const response = await fetch(`${pythonUrl}/close_session/${sessionId}`);
  const responseText = await response.json();
  console.log(responseText);
  res.json(responseText);
});


module.exports = router;
