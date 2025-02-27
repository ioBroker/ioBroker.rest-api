const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const IO_BROKER_SWAGGER_URL = 'http://localhost:8093/';
const OWN_PORT = 5000;
const OWN_URL = `http://localhost:${OWN_PORT}/`;
const STATE_ID = 'system.adapter.admin.0.memHeapTotal'; // subscribe on this state
let connectInterval = null;

function processAxiosError(error) {
    if (error.response) {
        console.log(
            `Request error: ${error.response.data ? JSON.stringify(error.response.data, null, 2) : error.response.status}`,
        );
    } else {
        console.log(`Request error: ${error.message}`);
    }
}

async function initSubscribe() {
    try {
        const url = `${IO_BROKER_SWAGGER_URL}v1/state/${STATE_ID}/subscribe`;
        const response = await axios.post(url, { url: `${OWN_URL}api/updates` });
        console.log(`Subscribed on changes of ${STATE_ID}: ${JSON.stringify(response.data)}`);
        connectInterval && clearInterval(connectInterval);
        connectInterval = null;
    } catch (error) {
        processAxiosError(error);
    }
}

function startConnect(immediate) {
    if (!connectInterval) {
        connectInterval = setInterval(async () => initSubscribe(), 5000);
        immediate && initSubscribe().then(() => {});
    }
}

const app = express();
app.use(bodyParser.json());
app.post('/api/updates', async (req, res) => {
    // If ping, just answer with status 200
    if (req.body.test) {
        res.status(200).json({});
    } else if (req.body.disconnect) {
        console.log('ioBroker is down. Reconnect...');
        // ioBroker is down and all subscribes must be sent anew
        try {
            res.status(200).json({});
        } catch (error) {
            // ignore
        }

        startConnect();
    } else if (req.body.id) {
        if (req.body.obj) {
            console.log(`Object "${req.body.id}" changed: ${JSON.stringify(req.body.obj)}`);
            res.status(200).json({});
        } else if (req.body.state) {
            console.log(`State "${req.body.id}" changed: ${JSON.stringify(req.body.state)}`);
            res.status(200).json({});
        } else {
            res.status(200).json({});
            // unsubscribe from state
            setTimeout(async () => {
                try {
                    // object or state was deleted
                    await axios.delete(`${IO_BROKER_SWAGGER_URL}v1/api/object/${id}`, { url: OWN_URL });
                } catch (error) {
                    processAxiosError(error);
                }
            }, 300);
        }
    } else {
        res.status(422).json({ error: 'Cannot parse data' });
    }
});

app.listen(OWN_PORT, async () => {
    console.log(`HTTP Server started on port ${OWN_PORT}`);
    startConnect(true);
});
