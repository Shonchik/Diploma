const serverUrl = 'https://heartbeat-d415bc7a.ru/api';

export async function createSession() {
    const response = await fetch(`${serverUrl}/new_session`);
    console.log(response);
    const sessionId = await response.json();
    console.log(sessionId);
    return sessionId;
}

export async function closeSession(sessionId) {
    const response = await fetch(`${serverUrl}/close_session/${sessionId}`);
    console.log(response);
    const result = await response.json();
    console.log(result);
    return result;
}

export async function sendBpm(sessionId, bpm) {
    const data = {bpm};
    const options = {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data),
    };
    const res = await fetch(`${serverUrl}/send_bpm/${sessionId}`, options);
    console.log(res);
    return res;
}
