/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
/* jshint -W061 */
'use strict';

const SwaggerExpress = require('swagger-express-mw');
const swaggerUi      = require('swagger-ui-express');
const YAML           = require('yamljs');
const bodyParser     = require('body-parser');
const crypto         = require('crypto');
const axios          = require('axios');
const cors           = require('cors');

process.env.SUPPRESS_NO_CONFIG_WARNING = 'true';

function parseQuery(_url) {
    let url = decodeURI(_url);
    const pos = url.indexOf('?');
    const values = [];
    if (pos !== -1) {
        const arr = url.substring(pos + 1).split('&');
        url = url.substring(0, pos);

        for (let i = 0; i < arr.length; i++) {
            arr[i] = arr[i].split('=');
            values[arr[i][0].trim()] = arr[i][1] === undefined ? null : decodeURIComponent((arr[i][1] + '').replace(/\+/g, '%20'));
        }

        // Default value for wait
        if (values.timeout === null) {
            values.timeout = 2000;
        }
    }

    const parts = url.split('/');

    // Analyse system.adapter.socketio.0.uptime,system.adapter.history.0.memRss?value=78&timeout=300
    if (parts[2]) {
        const oId = parts[2].split(',');
        for (let j = oId.length - 1; j >= 0; j--) {
            oId[j] = oId[j].trim();
            if (!oId[j]) {
                oId.splice(j, 1);
            }
        }
    }

    return values;
}

/**
 * SwaggerUI class
 *
 * From settings used only secure, auth and crossDomain
 *
 * @class
 * @param {object} server http or https node.js object
 * @param {object} webSettings settings of the web server, like <pre><code>{secure: settings.secure, port: settings.port}</code></pre>
 * @param {object} adapter web adapter object
 * @param {object} instanceSettings instance object with common and native
 * @param {object} app express application
 * @param {function} callback called when the engine is initialized
 * @return {object} object instance
 */
function SwaggerUI(server, webSettings, adapter, instanceSettings, app, callback) {
    if (!(this instanceof SwaggerUI)) {
        return new SwaggerUI(server, webSettings, adapter, instanceSettings, app, callback);
    }

    if (typeof instanceSettings === 'function') {
        callback = instanceSettings;
        instanceSettings = null;
    }

    if (typeof app === 'function') {
        callback = app;
        app = null;
    }

    this.server     = server;
    this.app        = app || require('express')();
    this.adapter    = adapter;
    this.settings   = webSettings;
    this.config     = instanceSettings ? instanceSettings.native : {};
    this.namespace  = instanceSettings ? instanceSettings._id.substring('system.adapter.'.length) : 'swagger';
    this.subscribes = {};
    this.checkInterval = null;

    this.adapter.config.defaultUser = this.adapter.config.defaultUser || 'system.user.admin';

    this.adapter.config.checkInterval = this.adapter.config.checkInterval === undefined ? 20000 : parseInt(this.adapter.config.checkInterval, 10);
    if (this.adapter.config.checkInterval && this.adapter.config.checkInterval < 5000) {
        this.adapter.config.checkInterval = 5000;
    }

    this.adapter.config.hookTimeout = parseInt(this.adapter.config.hookTimeout, 10) || 3000;
    if (this.adapter.config.hookTimeout && this.adapter.config.hookTimeout < 50) {
        this.adapter.config.hookTimeout = 50;
    }

    if (this.adapter.config.onlyAllowWhenUserIsOwner === undefined) {
        this.adapter.config.onlyAllowWhenUserIsOwner = false;
    }

    if (!this.adapter.config.defaultUser.match(/^system\.user\./)) {
        this.adapter.config.defaultUser = 'system.user.' + this.adapter.config.defaultUser;
    }

    const swaggerDocument = YAML.load(__dirname + '/api/swagger/swagger.yaml');
    const that = this;

    this.app.use(cors());
    this.app.use(bodyParser.json());
    this.app.get('/api-docs/swagger.json', (req, res) =>
        res.json(swaggerDocument));
    // show WEB CSS and so on
    this.app.use('/api-doc/', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    this.app.get('/', (req, res) =>
        res.redirect('/api-doc/'));

    function isAuthenticated(req, res, callback) {
        if (that.adapter.config.auth) {
            let values = parseQuery(req.url);
            if (!values.user || !values.pass) {
                if (req.headers.authorization && req.headers.authorization.startsWith('Basic ')) {
                    const auth = Buffer.from(req.headers.authorization.substring(6), 'base64').toString('utf8');
                    const pos = auth.indexOf(':');
                    if (pos !== -1) {
                        values = {
                            user: auth.substring(0, pos),
                            pass: auth.substring(pos + 1)
                        };
                    }
                }
                if (!values.user || !values.pass) {
                    res.status(401).send({error: 'User is required'});
                    return;
                }
            }
            if (!values.user.match(/^system\.user\./)) {
                values.user = 'system.user.' + values.user;
            }

            that.adapter.checkPassword(values.user, values.pass, result => {
                if (result) {
                    req._user = values.user;
                    that.adapter.log.debug(`Logged in: ${values.user}`);
                    callback(true);
                } else {
                    callback = null;
                    that.adapter.log.warn(`Invalid password or user name: ${values.user}`);
                    res.status(401).send({error: `Invalid password or user name: ${values.user}`});
                }
            });
        } else if (callback) {
            req._user = that.adapter.config.defaultUser;
            callback();
        }
    }

    async function validateHook(item) {
        try {
            await axios.post(item.urlHook, {test: true}, {
                timeout: that.adapter.config.hookTimeout,
                validateStatus: status => status < 400
            });
        } catch (error) {
            if (error.response) {
                that.adapter.log.warn(`Cannot report to hook "${item.urlHook}": ${error.response.data || error.response.status}`);
            } else {
                that.adapter.log.warn(`Cannot report to hook "${item.urlHook}": ${JSON.stringify(error)}`);
            }
            item.errors = item.errors || 0;
            item.errors++;
            if (item.errors > 2) {
                that.adapter.log.warn(`3 errors by "${item.urlHook}": all subscriptions removed`);
                await that.unregisterSubscribe(item.urlHook, null, 'state');
                await that.unregisterSubscribe(item.urlHook, null, 'object');
            }

            return 'Cannot validate URL';
        }
    }

    async function reportChange(item, data) {
        if (item.polling) {
            if (that.polling[item.urlHook]) {
                that.polling[item.urlHook].resolve(JSON.stringify(data));
            } else {
                item.queue = item.queue || [];
                const now = Date.now();
                item.queue.push({data: JSON.stringify(data), ts: now});

                // delete too old entries
                for (let d = item.queue.length - 1; d >= 0; d--) {
                    if (now - item.queue[d].ts > 3000) {
                        that.adapter.log.debug(`Data update to ${item.urlHook} skipped, as no handler (${d + 1})`);
                        item.queue.splice(0, d);
                        break;
                    }
                }
            }
        } else {
            try {
                await axios.post(item.urlHook, data, {
                    timeout: that.adapter.config.hookTimeout,
                    validateStatus: status => status < 400
                });
            } catch (error) {
                if (error.response) {
                    that.adapter.log.warn(`Cannot report to hook "${item.urlHook}": ${error.response.data || error.response.status}`);
                } else {
                    that.adapter.log.warn(`Cannot report to hook "${item.urlHook}": ${JSON.stringify(error)}`);
                }
                item.errors = item.errors || 0;
                item.errors++;
                if (item.errors > 2) {
                    that.adapter.log.warn(`3 errors by "${item.urlHook}": all subscriptions removed`);
                    await that.unregisterSubscribe(item.urlHook, null, 'state');
                    await that.unregisterSubscribe(item.urlHook, null, 'object');
                }
            }
        }
    }

    this._checkHooks = async () => {
        const hooks = Object.keys(this.subscribes);
        for (let i = 0; i < hooks.length; i++) {
            if (!this.subscribes[hooks[i]].polling) {
                await validateHook(this.subscribes[hooks[i]]);
            }
        }
    }

    this.registerSubscribe = async (urlHook, id, type, user, method) => {
        const urlHash = crypto.createHash('md5').update(urlHook).digest('hex');
        if (!this.subscribes[urlHash]) {
            if (method !== 'polling') {
                const error = await validateHook({urlHook});
                if (error) {
                    return `No valid answer from URL hook: ${error}`;
                }
            }

            this.subscribes[urlHash] = {state: [], object: [], urlHook, polling: method === 'polling'};
        }
        if (!this.subscribes[urlHash][type].find(item => item.id === id && !method )) {
            this.subscribes[urlHash][type].push({id, method});
            if (type === 'state') {
                this.adapter.log.debug(`Subscribe on state "${id}"`);
                await this.adapter.subscribeForeignStatesAsync(id, {user});
            } else {
                this.adapter.log.debug(`Subscribe on object "${id}"`);
                await this.adapter.subscribeForeignObjectsAsync(id, {user});
            }
        }

        if (this.adapter.config.checkInterval) {
            if (this.checkInterval) {
                this.adapter.log.debug(`start checker`);
                this.checkInterval = setInterval(async () => await this._checkHooks(), this.adapter.config.checkInterval);
            }
        } else {
            this.adapter.log.warn('No check interval set! The connections are valid forever.');
        }

        return null; // success
    };

    this.unregisterSubscribe = async (urlHook, id, type, user, method) => {
        const urlHash = crypto.createHash('md5').update(urlHook).digest('hex');
        if (this.subscribes[urlHash]) {
            if (id) {
                let pos;
                do {
                    pos = this.subscribes[urlHash][type].findIndex(item => item.id === id);
                    if (pos !== -1) {
                        this.subscribes[urlHash][type].splice(pos, 1);
                        if (type === 'state') {
                            this.adapter.log.debug(`Unsubscribe from state "${id}"`);
                            await this.adapter.unsubscribeForeignStatesAsync(id, {user: user || 'system.user.admin'}); // allow unsubscribing always
                        } else {
                            this.adapter.log.debug(`Unsubscribe from object "${id}"`);
                            await this.adapter.unsubscribeForeignObjectsAsync(id, {user: user || 'system.user.admin'}); // allow unsubscribing always
                        }
                    } else {
                        break;
                    }
                } while (pos !== -1)
            } else {
                for (let i = 0; i < this.subscribes[urlHash][type].length; i++) {
                    if (type === 'state') {
                        await this.adapter.unsubscribeForeignStatesAsync(this.subscribes[urlHash][type][i].id, {user: user || 'system.user.admin'}); // allow unsubscribing always
                    } else {
                        await this.adapter.unsubscribeForeignObjectsAsync(this.subscribes[urlHash][type][i].id, {user: user || 'system.user.admin'}); // allow unsubscribing always
                    }
                }
                this.subscribes[urlHash][type] = [];
            }

            if (!this.subscribes[urlHash].state.length && !this.subscribes[urlHash].object.length) {
                delete this.subscribes[urlHash];

                if (!Object.keys(this.subscribes).length) {
                    this.adapter.log.debug(`Stop checker`);
                    this.checkInterval && clearInterval(this.checkInterval);
                    this.checkInterval = null;
                }
            }
        }

        return null; // success
    };

    this.stateChange = (id, state) => {
        if (state && state.ack) {
            for (let t = this._waitFor.length - 1; t >= 0; t++) {
                if (this._waitFor[t].id === id) {
                    const task = this._waitFor[t];
                    this._waitFor.splice(t, 1);
                    if (!Object.keys(this.subscribes).find(item => item.states.includes(id))) {
                        this.adapter.unsubscribeForeignStates(id);
                    }

                    clearTimeout(task.timer);

                    setImmediate((_task, _val) => {
                        state.id = id;
                        _task.res.json(state);
                    }, task, state);
                }
            }
        }

        Object.keys(this.subscribes).forEach(urlHash => {
            this.subscribes[urlHash].state.forEach(async item => {
                // check if id
                if (typeof item.id === 'string') {
                    await reportChange(this.subscribes[urlHash], {id: item.id, state});
                } else {
                    // todo
                }
            });
        });
    };

    this.objectChange = (id, obj) => {
        Object.keys(this.subscribes).forEach(urlHash => {
            this.subscribes[urlHash].object.forEach(async item => {
                // check if id
                if (typeof item.id === 'string') {
                    await reportChange(this.subscribes[urlHash].urlHook, {id: item.id, obj});
                } else {
                    // todo
                }
            });
        });
    };

    // wait for ack=true
    this._waitFor = [];
    this.adapter._addTimeout = async task => {
        this._waitFor.push(task);

        // if not already subscribed
        if (!Object.keys(this.subscribes).find(item => item.states.includes(task.id))) {
            await this.adapter.subscribeForeignStates(task.id);
        }

        task.timer = setTimeout(_task => {
            // remove this task from list
            const pos = this._waitFor.indexOf(_task);
            if (pos !== -1) {
                this._waitFor.splice(pos, 1);
            }

            if (!Object.keys(this.subscribes).find(item => item.states.includes(task.id))) {
                this.adapter.unsubscribeForeignStates(task.id);
            }
            _task.res.status(501).json({error: 'timeout', id: _task.id, val: _task.val});
            _task = null;
        }, task.timeout, task);
    };

    // authenticate
    this.app.use('/v1/*', (req, res, next) => {
        isAuthenticated(req, res, () => {
            req._adapter = this.adapter;
            req._swaggerObject = this;
            next();
        });
    });

    this.polling = {};

    this.app.get('/v1/polling', (req, res, next) => {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        res.writeHead(200, {'Content-Type': 'text/plain'});

        const urlHash = crypto.createHash('md5').update(ip).digest('hex');
        const item = this.subscribes[urlHash];

        // If some data wait to be sent
        if (item && item.queue && item.queue.length) {
            // delete too old entries
            const now = Date.now();
            for (let d = item.queue.length - 1; d >= 0; d--) {
                if (now - item.queue[d].ts > 3000) {
                    that.adapter.log.debug(`Data update to ${item.urlHook} skipped, as no handler (${d + 1})`);
                    item.queue.splice(0, d);
                    break;
                }
            }
            if (item.queue.length) {
                const chunk = item.queue.shift();
                res.end(chunk.data);
                return;
            }
        }

        new Promise(resolve => {
            this.polling[ip] = {resolve, ts: setTimeout(() => {
                this.polling[ip].ts = null;
                resolve();
            }, 10000)};
        })
            .then(data => {
                this.polling[ip].ts && clearTimeout(this.polling[ip].ts);
                this.polling[ip].ts = null;
                this.polling[ip].resolve = null;
                this.polling[ip] = null;
                res.end(data);
            });

        req.on('error', error => {
            this.polling[ip].ts && clearTimeout(this.polling[ip].ts);
            this.polling[ip].ts = null;
            this.polling[ip].resolve = null;
            this.polling[ip] = null;
        });
    });

    this.destroy = async () => {
        this.checkInterval && clearInterval(this.checkInterval);
        this.checkInterval = null;
        // send to all hooks, disconnect event

        const hooks = Object.keys(this.subscribes);
        for (let h = 0; h < hooks.length; h++) {
            await reportChange(this.subscribes[hooks[h]], {disconnect: true});
        }
        this.subscribes = {};
    }

    SwaggerExpress.create({appRoot: __dirname}, (err, swaggerExpress) => {
        if (err) {
            throw err;
        }

        this.swagger = swaggerExpress;

        // install middleware
        swaggerExpress.register(this.app);

        callback && callback(this.app);
    });

    /*this.restApiDelayed = {
        timer:        null,
        responseType: '',
        response:     null,
        waitId:       0
    };

    const that = this;
    // Cache
    this.users = {};

    const __construct = (function () {
        that.adapter.log.info((that.settings.secure ? 'Secure ' : '') + 'simpleAPI server listening on port ' + that.settings.port);
        that.adapter.config.defaultUser = that.adapter.config.defaultUser || 'system.user.admin';
        if (!that.adapter.config.defaultUser.match(/^system\.user\./)) {
            that.adapter.config.defaultUser = 'system.user.' + that.adapter.config.defaultUser;
        }
        if (that.adapter.config.onlyAllowWhenUserIsOwner === undefined) that.adapter.config.onlyAllowWhenUserIsOwner = false;
        adapter.log.info('Allow states only when user is owner: ' + that.adapter.config.onlyAllowWhenUserIsOwner);

        if (that.app) {
            adapter.log.info('Install extension on /' + that.namespace + '/');
            that.app.use('/' + that.namespace + '/', function (req, res, next) {
                that.restApi.call(that, req, res);
            });

            // let it be accessible under old address too
            for (const c in commandsPermissions) {
                (function (command) {
                    adapter.log.info('Install extension on /' + command + '/');
                    that.app.use('/' + command + '/', function (req, res, next) {
                        req.url = '/' + command + req.url;
                        that.restApi.call(that, req, res);
                    });
                })(c);
            }
        }
        // Subscribe on user changes to manage the permissions cache
        that.adapter.subscribeForeignObjects('system.group.*');
        that.adapter.subscribeForeignObjects('system.user.*');
    }.bind(this))();

    this.stateChange = function (id, state) {
        if (that.restApiDelayed.id === id && state && state.ack) {
            adapter.unsubscribeForeignStates(id);
            that.restApiDelayed.response = state;
            setTimeout(restApiDelayedAnswer, 0);
        }
    };

    this.userReg  = new RegExp('^system\.user\.');
    this.groupReg = new RegExp('^system\.group\.');

    // if user politics changes, clear cache
    this.objectChange = function (id, state) {
        if (this.userReg.test(id) || this.groupReg.test(id)) {
            this.users = {};
        }
    };

    function restApiPost(req, res, command, oId, values) {
        const responseType = 'json';
        const status       = 500;
        const headers      = {'Access-Control-Allow-Origin': '*'};

        const body = '';
        req.on('data', function (data) {
            body += data;
        });
        req.on('end', function () {
            switch (command) {
                case 'setBulk':
                    that.adapter.log.debug('POST-' + command + ': body = ' + body);
                    const arr = [];
                    if (body) {
                        arr = body.split('&');
                    }

                    for (const i = 0; i < arr.length; i++) {
                        arr[i] = arr[i].split('=');
                        values[arr[i][0].trim()] = (arr[i][1] === undefined) ? null : decodeURIComponent((arr[i][1]+'').replace(/\+/g, '%20'));
                    }

                    if (values.prettyPrint !== undefined) {
                        if (values.prettyPrint === 'false') values.prettyPrint = false;
                        if (values.prettyPrint === null)    values.prettyPrint = true;
                    }

                    const cnt = 0;
                    const response = [];
                    that.adapter.log.debug('POST-' + command + ': values = ' + JSON.stringify(values));
                    for (const _id in values) {
                        if (_id === 'prettyPrint' || _id === 'user' || _id === 'pass') continue;
                        cnt++;
                        that.adapter.log.debug('"' + _id + '"');
                        findState(_id, values.user, function (err, id, originId) {
                            if (err) {
                                doResponse(res, 'plain', 500, headers, 'error: ' + err, values.prettyPrint);
                                cnt = 0;
                            } else if (!id) {
                                response.push({error:  'error: datapoint "' + originId + '" not found'});
                                if (!--cnt) doResponse(res, responseType, status, headers, response, values.prettyPrint);
                            } else {
                                const usedId = (values[originId]?originId:id);
                                that.adapter.log.debug('POST-' + command + ' for id=' + id + ', oid=' + originId + ', used=' + usedId + ', value='+values[usedId]);
                                if (values[usedId] === 'true') {
                                    values[usedId] = true;
                                } else if (values[usedId] === 'false') {
                                    values[usedId] = false;
                                } else if (!isNaN(values[usedId]) && values[usedId] == parseFloat(values[usedId])) {
                                    values[usedId] = parseFloat(values[usedId]);
                                }

                                adapter.setForeignState(id, values[usedId], false, {user: values.user, limitToOwnerRights: that.adapter.config.onlyAllowWhenUserIsOwner}, function (err, id) {
                                    if (err) {
                                        doResponse(res, 'plain', 500, headers, 'error: ' + err, values.prettyPrint);
                                        cnt = 0;
                                    } else {
                                        status = 200;
                                        adapter.log.debug('Add to Response: ' + JSON.stringify({id:  id, val: values[usedId]}));
                                        response.push({id:  id, val: values[usedId]});
                                        if (!--cnt) doResponse(res, responseType, status, headers, response, values.prettyPrint);
                                    }
                                });
                            }
                        });
                    }
                    if (!cnt) doResponse(res, responseType, status, headers, response, values.prettyPrint);
                    break;

                case 'setValueFromBody':
                    //that.adapter.log.debug('POST-' + command + ': body = ' + JSON.stringify(body));					// "{0123456xx}"
                    //that.adapter.log.debug('POST-' + command + ': req.url = ' + JSON.stringify(req.url));		// "/setValueFromBody?javascript.0.Nuki.Devices.NukiSL1.NukiBridgeResponse&prettyPrint"
                    //that.adapter.log.debug('POST-' + command + ': valuesAA = ' + JSON.stringify(values));		// {"javascript.0.Nuki.Devices.NukiSL1.NukiBridgeResponse":null,"prettyPrint":true,"user":"system.user.admin"}

                    for (const _id2 in oId) {
                        values[oId[_id2]] = body;
                    }

                    if (values.prettyPrint !== undefined) {
                        if (values.prettyPrint === 'false') values.prettyPrint = false;
                        if (values.prettyPrint === null)    values.prettyPrint = true;
                    }

                    if (!oId.length || !oId[0]) {
                        doResponse(res, responseType, status, headers, {error: 'no object/datapoint given'}, values.prettyPrint);
                        break;
                    }


                    const response = [];
                    that.adapter.log.debug('POST-' + command + ': values = ' + JSON.stringify(values));
                    const cnt = oId.length;
                    for (const k = 0; k < oId.length; k++) {
                        that.adapter.log.debug('"' + oId[k] + '"');
                        findState(oId[k], values.user, function (err, id, originId) {
                            if (err) {
                                doResponse(res, 'plain', 500, headers, 'error: ' + err, values.prettyPrint);
                                cnt = 0;
                            } else if (!id) {
                                response.push({error:  'error: datapoint "' + originId + '" not found'});
                                if (!--cnt) doResponse(res, responseType, status, headers, response, values.prettyPrint);
                            } else {
                                const usedId = (values[originId]?originId:id);
                                that.adapter.log.debug('POST-' + command + ' for id=' + id + ', oid=' + originId + ', used=' + usedId + ', value='+values[usedId]);
                                if (values[usedId] === 'true') {
                                    values[usedId] = true;
                                } else if (values[usedId] === 'false') {
                                    values[usedId] = false;
                                } else if (!isNaN(values[usedId]) && values[usedId] == parseFloat(values[usedId])) {
                                    values[usedId] = parseFloat(values[usedId]);
                                }

                                adapter.setForeignState(id, values[usedId], false, {user: values.user, limitToOwnerRights: that.adapter.config.onlyAllowWhenUserIsOwner}, function (err, id) {
                                    if (err) {
                                        doResponse(res, 'plain', 500, headers, 'error: ' + err, values.prettyPrint);
                                        cnt = 0;
                                    } else {
                                        status = 200;
                                        adapter.log.debug('Add to Response: ' + JSON.stringify({id:  id, val: values[usedId]}));
                                        response.push({id:  id, val: values[usedId]});
                                        if (!--cnt) doResponse(res, responseType, status, headers, response, values.prettyPrint);
                                    }
                                });
                            }
                        });
                    }
                    if (!cnt) doResponse(res, responseType, status, headers, response, values.prettyPrint);
                    break;

                default:
                    doResponse(res, responseType, status, headers, {error: 'command ' + command + ' unknown'}, values.prettyPrint);
                    break;
            }
        });
    }

    function restApiDelayedAnswer() {
        if (that.restApiDelayed.timer) {
            clearTimeout(that.restApiDelayed.timer);
            that.restApiDelayed.timer = null;

            doResponse(that.restApiDelayed.res, that.restApiDelayed.responseType, 200, {'Access-Control-Allow-Origin': '*'},  that.restApiDelayed.response, that.restApiDelayed.prettyPrint);
            that.restApiDelayed.id          = null;
            that.restApiDelayed.res         = null;
            that.restApiDelayed.response    = null;
            that.restApiDelayed.prettyPrint = false;
        }
    }

    function doResponse(res, type, status, headers, content, pretty) {
        if (!headers) headers = {};

        status = parseInt(status, 10) || 200;

        if (pretty && typeof content === 'object') {
            type    = 'plain';
            content = JSON.stringify(content, null, 2);
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

        switch (type) {
            case 'json':
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = status;
                res.end(JSON.stringify(content), 'utf8');
                break;

            case 'plain':
                res.setHeader('Content-Type', 'text/plain');
                res.statusCode = status;
                if (typeof content === 'object') {
                    content = JSON.stringify(content);
                }

                res.end(content, 'utf8');
                break;
        }
    }

    this.restApi = function (req, res, isAuth, isChecked) {
        const values       = {};
        const oId          = [];
        const wait         = 0;
        const responseType = 'json';
        const status       = 500;
        const headers      = {'Access-Control-Allow-Origin': '*'};
        const response;

        const url = decodeURI(req.url);
        const pos = url.indexOf('?');
        if (pos !== -1) {
            const arr = url.substring(pos + 1).split('&');
            url = url.substring(0, pos);

            for (const i = 0; i < arr.length; i++) {
                arr[i] = arr[i].split('=');
                values[arr[i][0].trim()] = (arr[i][1] === undefined) ? null : decodeURIComponent((arr[i][1]+'').replace(/\+/g, '%20'));
            }
            if (values.prettyPrint !== undefined) {
                if (values.prettyPrint === 'false') values.prettyPrint = false;
                if (values.prettyPrint === null)    values.prettyPrint = true;
            }
            // Default value for wait
            if (values.wait === null) values.wait = 2000;
        }

        const parts        = url.split('/');
        const command      = parts[1];

        // Analyse system.adapter.socketio.0.uptime,system.adapter.history.0.memRss?value=78&wait=300
        if (parts[2]) {
            oId = parts[2].split(',');
            for (const j = oId.length - 1; j >= 0; j--) {
                oId[j] = oId[j].trim();
                if (!oId[j]) oId.splice(j, 1);
            }
        }

        // If authentication check is required
        if (that.settings.auth) {
            if (!isAuth) {
                this.isAuthenticated(values, function (isAuth) {
                    if (isAuth) {
                        that.restApi(req, res, true);
                    } else {
                        doResponse(res, 'plain', 401, headers, 'error: authentication failed. Please write "http' + (that.settings.secure ? 's' : '') + '://' + req.headers.host + '?user=UserName&pass=Password"');
                    }
                });
                return;
            } else
            if (!isChecked) {
                if (!values.user.match(/^system\.user\./)) values.user = 'system.user.' + values.user;
                that.checkPermissions(values.user, command, function (err) {
                    if (!err) {
                        that.restApi(req, res, true, true);
                    } else {
                        doResponse(res, 'plain', 401, headers, 'error: ' + err, values.prettyPrint);
                    }
                });
                return;
            }
        } else {
            req.user = req.user || that.adapter.config.defaultUser;
            values.user = req.user;
            if (!values.user.match(/^system\.user\./)) values.user = 'system.user.' + values.user;
            if (!isChecked && command) {
                that.checkPermissions(req.user || that.adapter.config.defaultUser, command, function (err) {
                    if (!err) {
                        that.restApi(req, res, true, true);
                    } else {
                        doResponse(res, 'plain', 401, headers, 'error: ' + err, values.prettyPrint);
                    }
                });
                return;
            }
        }
        if (!values.user.match(/^system\.user\./)) values.user = 'system.user.' + values.user;

        if (req.method === 'POST') {
            restApiPost(req, res, command, oId, values);
            return;
        }

        switch (command) {
            case 'getPlainValue':
                responseType = 'plain';
                if (!oId.length || !oId[0]) {
                    doResponse(res, 'plain', status, headers, 'error: no datapoint given', values.prettyPrint);
                    break;
                }

                const pcnt = oId.length;
                response = '';
                for (const g = 0; g < oId.length; g++) {
                    getState(oId[g], values.user, function (err, obj, id, originId) {
                        if (err) {
                            status = 500;
                            response = 'error: ' + err;
                            pcnt = 1;
                        } else if ((!id && originId) || obj === undefined) {
                            response += (response ? '\n' : '') + 'error: datapoint "' + originId + '" not found';
                        } else {
                            response += (response ? '\n' : '') + JSON.stringify(obj.val);
                            status = 200;
                        }
                        if (!--pcnt) doResponse(res, ((status === 500)?'plain':responseType), status, headers, response, values.prettyPrint);
                    });
                }
                break;

            case 'get':
                if (!oId.length || !oId[0]) {
                    doResponse(res, responseType, status, headers, {error: 'no object/datapoint given'}, values.prettyPrint);
                    break;
                }

                const gcnt = oId.length;
                for (const k = 0; k < oId.length; k++) {
                    getState(oId[k], values.user, function (err, state, id, originId) {
                        if (err) {
                            gcnt = 0;
                            doResponse(res, 'plain', 500, headers, 'error: ' + err, values.prettyPrint);
                        } else
                        if (!id && originId) {
                            if (!response || obj === undefined) {
                                response = 'error: datapoint "' + originId + '" not found';
                            } else {
                                if (typeof response !== 'object' || response.constructor !== Array) {
                                    response = [response];
                                }
                                response.push('error: datapoint "' + originId + '" not found');
                            }
                            if (!--gcnt) doResponse(res, responseType, status, headers, response, values.prettyPrint);
                        } else {
                            const vObj = state || {};
                            status = 200;
                            that.adapter.getForeignObject(id, function (err, obj) {
                                if (obj) {
                                    for (const attr in obj) {
                                        vObj[attr] = obj[attr];
                                    }
                                }

                                if (!response) {
                                    response = vObj;
                                } else {
                                    if (typeof response !== 'object' || response.constructor !== Array) response = [response];
                                    response.push(vObj);
                                }

                                if (!--gcnt) doResponse(res, responseType, status, headers, response, values.prettyPrint);
                            });
                        }
                    });
                }
                break;

            case 'getBulk':
                if (!oId.length || !oId[0]) {
                    doResponse(res, responseType, status, headers, {error: 'no datapoints given'}, values.prettyPrint);
                    break;
                }
                const bcnt = oId.length;
                response = [];
                for (const b = 0; b < oId.length; b++) {
                    getState(oId[b], values.user, function (err, state, id, originId) {
                        if (err) {
                            bcnt = 0;
                            doResponse(res, responseType, 500, headers, 'error: ' + err, values.prettyPrint);
                        } else {
                            if (id) status = 200;
                            state = state || {};
                            response.push({val: state.val, ts: state.ts});
                            if (!--bcnt) doResponse(res, responseType, status, headers, response, values.prettyPrint);
                        }
                    });
                }
                if (!bcnt) doResponse(res, responseType, status, headers, response, values.prettyPrint);
                break;

            case 'set':
                if (!oId.length || !oId[0]) {
                    doResponse(res, responseType, status, headers, {error: "object/datapoint not given"}, values.prettyPrint);
                    break;
                }
                if (values.value === undefined && values.val === undefined) {
                    doResponse(res, responseType, status, headers, 'error: no value found for "' + oId[0] + '". Use /set/id?value=1 or /set/id?value=1&wait=1000', values.prettyPrint);
                } else {
                    findState(oId[0], values.user, function (err, id, originId) {
                        if (err) {
                            wait = 0;
                            doResponse(res, 'plain', 500, headers, 'error: ' + err);
                        } else
                        if (id) {
                            wait = values.wait || 0;
                            if (wait) wait = parseInt(wait, 10);
                            if (values.val === undefined) values.val = values.value;

                            if (values.val === 'true') {
                                values.val = true;
                            } else if (values.val === 'false') {
                                values.val = false;
                            } else if (!isNaN(values.val)) {
                                values.val = parseFloat(values.val);
                            }

                            if (wait) adapter.subscribeForeignStates(id);

                            adapter.setForeignState(id, values.val, false, {user: values.user, limitToOwnerRights: that.adapter.config.onlyAllowWhenUserIsOwner}, function (err) {
                                if (err) {
                                    doResponse(res, 'plain', 500, headers, 'error: ' + err, values.prettyPrint);
                                    wait = 0;
                                } else
                                if (!wait) {
                                    status = 200;
                                    response = {id: id, value: values.val, val: values.val};
                                    doResponse(res, responseType, status, headers, response, values.prettyPrint);
                                }
                            });

                            if (wait) {
                                that.restApiDelayed.responseType = responseType;
                                that.restApiDelayed.response     = null;
                                that.restApiDelayed.id           = id;
                                that.restApiDelayed.res          = res;
                                that.restApiDelayed.prettyPrint  = values.prettyPrint;
                                that.restApiDelayed.timer        = setTimeout(restApiDelayedAnswer, wait);
                            }
                        } else {
                            doResponse(res, responseType, status, headers, 'error: datapoint "' + originId + '" not found', values.prettyPrint);
                        }
                    });
                }
                break;

            case 'toggle':
                if (!oId.length || !oId[0]) {
                    doResponse(res, responseType, status, headers, {error: "state not given"}, values.prettyPrint);
                    break;
                }

                findState(oId[0], values.user, function (err, id, originId) {
                    if (err) {
                        doResponse(res, 'plain', 500, headers, 'error: ' + err, values.prettyPrint);
                        wait = 0;
                    } else if (id) {
                        wait = values.wait || 0;
                        if (wait) wait = parseInt(wait, 10);

                        // Read type of object
                        adapter.getForeignObject(id, {user: values.user, checked: true}, function (err, obj) {
                            if (err) {
                                doResponse(res, 'plain', 500, headers, 'error: ' + err, values.prettyPrint);
                                wait = 0;
                            } else {
                                // Read actual value
                                adapter.getForeignState(id, {user: values.user, checked: true}, function (err, state) {
                                    if (err) {
                                        doResponse(res, 'plain', 500, headers, 'error: ' + err, values.prettyPrint);
                                        wait = 0;
                                    } else
                                    if (state) {
                                        if (obj && obj.common && obj.common.type) {
                                            if (obj.common.type === 'bool' || obj.common.type === 'boolean') {
                                                if (state.val === 'true') {
                                                    state.val = true;
                                                } else if (state.val === 'false') {
                                                    state.val = false;
                                                }
                                                state.val = !state.val;
                                            } else
                                            if (obj.common.type === 'number') {
                                                state.val = parseFloat(state.val);
                                                if (obj.common.max !== undefined) {
                                                    if (obj.common.min === undefined) obj.common.min = 0;
                                                    if (state.val > obj.common.max) state.val = obj.common.max;
                                                    if (state.val < obj.common.min) state.val = obj.common.min;
                                                    // Invert
                                                    state.val = obj.common.max + obj.common.min - state.val;
                                                } else {
                                                    // default number is from 0 to 100
                                                    if (state.val > 100) state.val = 100;
                                                    if (state.val < 0) state.val = 0;
                                                    state.val = 100 - state.val;
                                                }
                                            } else {
                                                if (state.val === 'true' || state.val === true) {
                                                    state.val = false;
                                                } else if (state.val === 'false' || state.val === false) {
                                                    state.val = true;
                                                } else if (parseInt(state.val, 10) == state.val) {
                                                    state.val = parseInt(state.val, 10) ? 0 : 1;
                                                } else {
                                                    doResponse(res, responseType, status, headers, {error: 'state is neither number nor boolean'}, values.prettyPrint);
                                                    return;
                                                }
                                            }
                                        } else {
                                            if (state.val === 'true') {
                                                state.val = true;
                                            } else if (state.val === 'false') {
                                                state.val = false;
                                            } else if (!isNaN(state.val)) {
                                                state.val = parseFloat(state.val);
                                            }

                                            if (state.val === true)  state.val = 1;
                                            if (state.val === false) state.val = 0;
                                            state.val = 1 - parseInt(state.val, 10);
                                        }

                                        if (wait) adapter.subscribeForeignStates(id);

                                        adapter.setForeignState(id, state.val, false, {user: values.user, limitToOwnerRights: that.adapter.config.onlyAllowWhenUserIsOwner}, function (err) {
                                            if (err) {
                                                doResponse(res, 'plain', 500, headers, 'error: ' + err, values.prettyPrint);
                                                wait = 0;
                                            } else
                                            if (!wait) {
                                                status = 200;
                                                doResponse(res, responseType, status, headers, {id: id, value: state.val, val: state.val}, values.prettyPrint);
                                            }
                                        });

                                        if (wait) {
                                            that.restApiDelayed.responseType = responseType;
                                            that.restApiDelayed.response     = null;
                                            that.restApiDelayed.id           = id;
                                            that.restApiDelayed.res          = res;
                                            that.restApiDelayed.prettyPrint  = values.prettyPrint;
                                            that.restApiDelayed.timer        = setTimeout(restApiDelayedAnswer, wait);
                                        }
                                    } else {
                                        doResponse(res, responseType, status, headers, {error: 'object has no state'}, values.prettyPrint);
                                    }
                                });
                            }
                        });
                    } else {
                        doResponse(res, responseType, status, headers, {error: 'error: datapoint "' + originId + '" not found'}, values.prettyPrint);
                    }
                });

                break;

            // /setBulk?BidCos-RF.FEQ1234567:1.LEVEL=0.7&Licht-Küche/LEVEL=0.7&Anwesenheit=0&950=1
            case 'setBulk':
                const cnt = 0;
                response = [];
                adapter.log.debug('Values: ' + JSON.stringify(values));
                for (const _id in values) {
                    if (_id === 'prettyPrint' || _id === 'user' || _id === 'pass') continue;
                    cnt++;
                    findState(_id, values.user, function (err, id, originId) {
                        // id is "name", originId is the ioBroker-ID of the datapoint
                        if (err) {
                            adapter.log.debug('Error on ID lookup: ' + err);
                            doResponse(res, 'plain', 500, headers, 'error: ' + err, values.prettyPrint);
                            cnt = 0;
                        } else if (!id) {
                            response.push({error:  'error: datapoint "' + originId + '" not found'});
                            if (!--cnt) doResponse(res, responseType, status, headers, response, values.prettyPrint);
                        } else {
                            const usedId = (values[originId]?originId:id);
                            that.adapter.log.debug('GET-' + command + ' for id=' + id + ', oid=' + originId + 'used=' + usedId + ', value=' + values[usedId]);
                            if (values[usedId] === 'true') {
                                values[usedId] = true;
                            } else if (values[usedId] === 'false') {
                                values[usedId] = false;
                            } else if (!isNaN(values[usedId]) && values[usedId] == parseFloat(values[usedId])) {
                                values[usedId] = parseFloat(values[usedId]);
                            }

                            adapter.setForeignState(id, values[usedId], false, {user: values.user, limitToOwnerRights: that.adapter.config.onlyAllowWhenUserIsOwner}, function (err, id) {
                                if (err) {
                                    doResponse(res, 'plain', 500, headers, 'error: ' + err, values.prettyPrint);
                                    cnt = 0;
                                } else {
                                    adapter.log.debug('Add to Response-Get: ' + JSON.stringify({id: id, val: values[usedId], value: values[usedId]}));
                                    response.push({id: id, val: values[usedId], value: values[usedId]});
                                    if (!--cnt) doResponse(res, responseType, status, headers, response, values.prettyPrint);
                                }
                            });
                        }
                    });
                }
                if (!cnt) doResponse(res, responseType, status, headers, response, values.prettyPrint);
                break;

            case 'getObjects':
            case 'objects':
                adapter.getForeignObjects(values.pattern || parts[2] || '*', values.type, {user: values.user, limitToOwnerRights: that.adapter.config.onlyAllowWhenUserIsOwner}, function (err, list) {
                    if (err) {
                        status = 500;
                        doResponse(res, responseType, status, headers, {error: JSON.stringify(err)}, values.prettyPrint);
                    } else {
                        status = 200;
                        doResponse(res, responseType, status, headers, list, values.prettyPrint);
                    }
                });
                break;

            case 'getStates':
            case 'states':
                adapter.getForeignStates(values.pattern || parts[2] || '*', {user: values.user, limitToOwnerRights: that.adapter.config.onlyAllowWhenUserIsOwner}, function (err, list) {
                    if (err) {
                        status = 500;
                        doResponse(res, responseType, status, headers, {error: JSON.stringify(err)}, values.prettyPrint);
                    } else {
                        status = 200;
                        doResponse(res, responseType, status, headers, list, values.prettyPrint);
                    }
                });
                break;

            case 'help':
                // is default behaviour too
            default:
                const obj =  (command === 'help') ? {} : {error: 'command ' + command + ' unknown'};
                const request = 'http' + (that.settings.secure ? 's' : '') + '://' + req.headers.host;
                if (this.app) request += '/' + this.namespace + '/';
                const auth = '';
                if (that.settings.auth) auth = 'user=UserName&pass=Password';
                obj.getPlainValue    = request + '/getPlainValue/stateID' + (auth ? '?' + auth : '');
                obj.get              = request + '/get/stateID/?prettyPrint' + (auth ? '&' + auth : '');
                obj.getBulk          = request + '/getBulk/stateID1,stateID2/?prettyPrint' + (auth ? '&' + auth : '');
                obj.set              = request + '/set/stateID?value=1&prettyPrint' + (auth ? '&' + auth : '');
                obj.toggle           = request + '/toggle/stateID&prettyPrint' + (auth ? '&' + auth : '');
                obj.setBulk          = request + '/setBulk?stateID1=0.7&stateID2=0&prettyPrint' + (auth ? '&' + auth : '');
                obj.setValueFromBody = request + '/setValueFromBody?stateID1' + (auth ? '&' + auth : '');
                obj.objects          = request + '/objects?pattern=system.adapter.admin.0*&prettyPrint' + (auth ? '&' + auth : '');
                obj.states           = request + '/states?pattern=system.adapter.admin.0*&prettyPrint' + (auth ? '&' + auth : '');

                doResponse(res, responseType, status, headers, obj, true);
                break;
        }
    };*/
}

module.exports = SwaggerUI;
