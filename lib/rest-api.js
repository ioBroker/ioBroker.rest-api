/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
/* jshint -W061 */
'use strict';

const SwaggerRunner = require('swagger-node-runner-fork');
const swaggerUi     = require('swagger-ui-express');
const YAML          = require('yamljs');
const bodyParser    = require('body-parser');
const crypto        = require('crypto');
const axios         = require('axios');
const cors          = require('cors');
const fs            = require('fs');
const path          = require('path');
const multer = require('multer');
const utils         = require('@iobroker/adapter-core'); // Get common adapter utils
const pattern2RegEx = utils.commonTools.pattern2RegEx;
const CommandsAdmin = require('@iobroker/socket-classes').SocketCommandsAdmin;
const CommandsCommon = require('@iobroker/socket-classes').SocketCommands;
const common        = require('./common');

process.env.SUPPRESS_NO_CONFIG_WARNING = 'true';

const WEB_EXTENSION_PREFIX = 'rest-api/';

/*const memStore = { };

// Writable memory stream
class WMStrm extends Writable {
    constructor(key, options) {
        super(options); // init super
        this.key = key; // save key
        this.data = Buffer.from(''); // empty
    }

    _write(chunk, enc, cb) {
        // our memory store stores things in buffers
        const buffer = (Buffer.isBuffer(chunk)) ? chunk : Buffer.from(chunk, enc);

        // concat to the buffer already there
        this.data = Buffer.concat([this.data, buffer]);
        cb();
    }
}
*/
function parseQuery(_url) {
    let url = decodeURI(_url);
    const pos = url.indexOf('?');
    const values = {};
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

// copied from here: https://github.com/component/escape-html/blob/master/index.js
const matchHtmlRegExp = /["'&<>]/;
function escapeHtml(string) {
    const str = '' + string;
    const match = matchHtmlRegExp.exec(str);

    if (!match) {
        return str;
    }

    let escape;
    let html = '';
    let index = 0;
    let lastIndex = 0;

    for (index = match.index; index < str.length; index++) {
        switch (str.charCodeAt(index)) {
            case 34: // "
                escape = '&quot;';
                break;
            case 38: // &
                escape = '&amp;';
                break;
            case 39: // '
                escape = '&#39;';
                break;
            case 60: // <
                escape = '&lt;';
                break;
            case 62: // >
                escape = '&gt;';
                break;
            default:
                continue;
        }

        if (lastIndex !== index) {
            html += str.substring(lastIndex, index);
        }

        lastIndex = index + 1;
        html += escape;
    }

    return lastIndex !== index
        ? html + str.substring(lastIndex, index)
        : html;
}

function decorateLogFile(filename, text) {
    const prefix = '<html><head>' +
        '<style>\n' +
        '   table {' +
        '       font-family: monospace;\n' +
        '       font-size: 14px;\n' +
        '   }\n' +
        '   .info {\n' +
        '       background: white;' +
        '   }\n' +
        '   .type {\n' +
        '       font-weight: bold;' +
        '   }\n' +
        '   .silly {\n' +
        '       background: #b3b3b3;' +
        '   }\n' +
        '   .debug {\n' +
        '       background: lightgray;' +
        '   }\n' +
        '   .warn {\n' +
        '       background: #ffdb75;' +
        '       color: white;' +
        '   }\n' +
        '   .error {\n' +
        '       background: #ff6a5b;' +
        '   }\n' +
        '</style>\n' +
        '<script>\n' +
        'function decorate (line) {\n' +
        '   var className = "info";\n' +
        '   line = line.replace(/\\x1B\\[39m/g, "</span>");\n' +
        '   if (line.indexOf("[32m") !== -1) {\n' +
        '       className = "info";\n'+
        '       line = line.replace(/\\x1B\\[32m/g, "<span class=\\"type\\">");\n' +
        '   } else \n' +
        '   if (line.indexOf("[34m") !== -1) {\n' +
        '       className = "debug";\n'+
        '       line = line.replace(/\\x1B\\[34m/g, "<span class=\\"type\\">");\n' +
        '   } else \n' +
        '   if (line.indexOf("[33m") !== -1) {\n' +
        '       className = "warn";\n'+
        '       line = line.replace(/\\x1B\\[33m/g, "<span class=\\"type\\">");\n' +
        '   } else \n' +
        '   if (line.indexOf("[31m") !== -1) {\n' +
        '       className = "error";\n'+
        '       line = line.replace(/\\x1B\\[31m/g, "<span class=\\"type\\">");\n' +
        '   } else \n' +
        '   if (line.indexOf("[35m") !== -1) {\n' +
        '       className = "silly";\n'+
        '       line = line.replace(/\\x1B\\[35m/g, "<span class=\\"type\\">");\n' +
        '   } else {\n' +
        '   }\n' +
        '   return "<tr class=\\"" + className + "\\"><td>" + line + "</td></tr>";\n'+
        '}\n' +
        'document.addEventListener("DOMContentLoaded", function () { \n' +
        '  var text = document.body.innerHTML;\n' +
        '  var lines = text.split("\\n");\n' +
        '  text = "<table>";\n' +
        '  for (var i = 0; i < lines.length; i++) {\n' +
        '       if (lines[i]) text += decorate(lines[i]);\n' +
        '  }\n' +
        '  text += "</table>";\n' +
        '  document.body.innerHTML = text;\n' +
        '  window.scrollTo(0,document.body.scrollHeight);\n' +
        '});\n' +
        '</script>\n</head>\n<body>\n';
    const suffix = '</body></html>';
    const log = text || fs.readFileSync(filename).toString();
    return prefix + log + suffix;
}

function removeTextFromFile(fileName, start, end) {
    let file = fs.readFileSync(fileName).toString('utf8').split('\n');
    // find <!-- START -->
    let newFile = [];
    let foundStart = false;
    let foundEnd = false;
    for (let f = 0; f < file.length; f++) {
        if (!foundStart && file[f].includes(start)) {
            foundStart = true;
            continue;
        } else
        if (file[f].includes(end)) {
            foundEnd = true;
            continue;
        }
        if (!foundStart || foundEnd) {
            newFile.push(file[f]);
        }
    }
    return newFile.join('\n');
}

/**
 * SwaggerUI class
 *
 * From settings used only secure, auth and crossDomain
 *
 * @class
 * @param {object} _ignore not used in this web extension
 * @param {object} webSettings settings of the web server, like <pre><code>{secure: settings.secure, port: settings.port}</code></pre>
 * @param {object} adapter web adapter object
 * @param {object} instanceSettings instance object with common and native
 * @param {object} app express application
 * @param {function} callback called when the engine is initialized
 * @return {object} object instance
 */
function SwaggerUI(_ignore, webSettings, adapter, instanceSettings, app, callback) {
    if (!(this instanceof SwaggerUI)) {
        return new SwaggerUI(_ignore, webSettings, adapter, instanceSettings, app, callback);
    }

    if (typeof instanceSettings === 'function') {
        callback = instanceSettings;
        instanceSettings = null;
    }

    this.app        = app || require('express')();
    this.adapter    = adapter;
    this.settings   = webSettings;
    this.config     = instanceSettings ? instanceSettings.native : adapter.config;
    this.namespace  = instanceSettings ? instanceSettings._id.substring('system.adapter.'.length) : this.adapter.namespace;
    this.subscribes = {};
    this.checkInterval = null;
    this.extension  = !!instanceSettings;
    this.routerPrefix = this.extension ? `/${WEB_EXTENSION_PREFIX}` : '/';
    this.gcInterval = null;
    this.commands   = this.adapter.config.noAdminCommands ? new CommandsCommon(adapter) : new CommandsAdmin(adapter);

    this.config.defaultUser = this.extension ? this.config.defaultUser : this.config.defaultUser || 'system.user.admin';

    this.config.checkInterval = this.config.checkInterval === undefined ? 20000 : parseInt(this.config.checkInterval, 10);
    if (this.config.checkInterval && this.config.checkInterval < 5000) {
        this.config.checkInterval = 5000;
    }

    this.config.hookTimeout = parseInt(this.config.hookTimeout, 10) || 3000;
    if (this.config.hookTimeout && this.config.hookTimeout < 50) {
        this.config.hookTimeout = 50;
    }

    if (this.config.onlyAllowWhenUserIsOwner === undefined) {
        this.config.onlyAllowWhenUserIsOwner = false;
    }

    if (!this.config.defaultUser.match(/^system\.user\./)) {
        this.config.defaultUser = 'system.user.' + this.config.defaultUser;
    }

    // enable cors only if standalone
    !instanceSettings && this.app.use(cors());
    const jsonParser = bodyParser.json({
        limit: '100mb',
    });
    const rawParser = bodyParser.raw({
        limit: '100mb',
    });

    this.app.use((req, res, next) => {
        if (req.method !== 'GET' && req.url.startsWith('/v1/binary/')) {
            rawParser(req, res, next);
        } else {
            jsonParser(req, res, next);
        }
    });
    /*this.app.use(bodyParser.json({
        limit: '100mb',
    }));
    this.app.use(bodyParser.urlencoded({
        extended: true,
        parameterLimit: 100000,
        limit: '100mb',
    }));*/

    const _options = {
        appRoot: __dirname,
    };

    // prepare yaml
    _options.swaggerFile = `${__dirname}/api/swagger/swagger.yaml`;
    if (this.adapter.config.noCommands) {
        const newText = removeTextFromFile(_options.swaggerFile, '# commands start', '# commands stop');

        _options.swaggerFile = `${__dirname}/api/swagger/swaggerEdited.yaml`;
        if (!fs.existsSync(_options.swaggerFile) || fs.readFileSync(_options.swaggerFile).toString('utf8') !== newText) {
            fs.writeFileSync(_options.swaggerFile, newText);
        }
    } else if (this.adapter.config.noAdminCommands) {
        const newText = removeTextFromFile(_options.swaggerFile, '# admin commands start', '# admin commands end');
        _options.swaggerFile = `${__dirname}/api/swagger/swaggerEdited.yaml`;
        if (!fs.existsSync(_options.swaggerFile) || fs.readFileSync(_options.swaggerFile).toString('utf8') !== newText) {
            fs.writeFileSync(_options.swaggerFile, newText);
        }
    }

    // create swagger.yaml copy with changed basePath
    if (this.extension) {
        let file = fs.readFileSync(_options.swaggerFile).toString('utf8')
        file = file.replace('basePath: "/v1"', `basePath: "/${WEB_EXTENSION_PREFIX}v1"`);

        _options.swaggerFile = `${__dirname}/api/swagger/swagger_extension.yaml`;

        if (!fs.existsSync(_options.swaggerFile) || fs.readFileSync(_options.swaggerFile).toString('utf8') !== file) {
            fs.writeFileSync(_options.swaggerFile, file);
        }
    }

    let swaggerDocument = YAML.load(_options.swaggerFile);
    if (this.extension) {
        swaggerDocument.basePath = `/${WEB_EXTENSION_PREFIX}v1`;
    }
    const that = this;


    if (!this.config.noUI) {
        this.app.get(`${this.routerPrefix}api-docs/swagger.json`, (req, res) =>
            res.json(swaggerDocument));

        const options = {
            customCss: '.swagger-ui .topbar { background-color: #4dabf5; }',
        };
        // show WEB CSS and so on
        this.app.use(`${this.routerPrefix}api-doc/`, swaggerUi.serve, swaggerUi.setup(swaggerDocument, options));
        this.app.get(this.routerPrefix, (req, res) =>
            res.redirect(`${this.routerPrefix}api-doc/`));
    }

    function isAuthenticated(req, res, callback) {
        if (that.config.auth) {
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
                values.user = `system.user.${values.user}`;
            }

            that.adapter.checkPassword(values.user, values.pass, result => {
                if (result) {
                    req._user = values.user;
                    // that.adapter.log.debug(`Logged in: ${values.user}`);
                    callback(true);
                } else {
                    callback = null;
                    that.adapter.log.warn(`Invalid password or user name: ${values.user}`);
                    res.status(401).send({error: `Invalid password or user name: ${values.user}`});
                }
            });
        } else if (callback) {
            req._user = that.config.defaultUser;
            callback();
        }
    }

    async function _validateUrlHook(item) {
        try {
            await axios.post(item.urlHook, {test: true}, {
                timeout: that.config.hookTimeout,
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
            if (item.promise) {
                item.promise.resolve(JSON.stringify(data));
            } else {
                item.queue = item.queue || [];
                const now = Date.now();
                item.queue.push({data: JSON.stringify(data), ts: now});

                // delete too old entries
                for (let d = item.queue.length - 1; d >= 0; d--) {
                    if (now - item.queue[d].ts > 3000) {
                        that.adapter.log.debug(`[${item.urlHook}] Data update skipped, as no handler (${d + 1})`);
                        item.queue.splice(0, d);
                        break;
                    }
                }
            }
        } else {
            try {
                await axios.post(item.urlHook, data, {
                    timeout: that.config.hookTimeout,
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
                await _validateUrlHook(this.subscribes[hooks[i]]);
            }
        }
    }

    this._executeGC = () => {
        const hashes = Object.keys(this.subscribes)
            .filter(urlHash => this.subscribes[urlHash].polling);

        if (!hashes.length) {
            clearInterval(this.gcInterval);
            this.gcInterval = null;
        } else {
            const now = Date.now();
            hashes.forEach(async urlHash => {
                // kill all subscriptions after 2 minutes
                if (now - this.subscribes[urlHash].ts > (this.subscribes[urlHash].timeout || 30000) * 1.5) {
                    if (this.subscribes[urlHash].promise) {
                        debugger;
                        // this should never happen
                        this.subscribes[urlHash].promise.resolve();
                    }
                    // unsubscribe
                    if (this.subscribes[urlHash].state) {
                        for (let i = 0; i < this.subscribes[urlHash].state.length; i++) {
                            this.adapter.log.debug(`[${this.subscribes[urlHash].urlHook}] unsubscribe from state: ${this.subscribes[urlHash].state[i].id}`);
                            await this.adapter.unsubscribeForeignStatesAsync(this.subscribes[urlHash].state[i].id);
                        }
                    }
                    if (this.subscribes[urlHash].object) {
                        for (let i = 0; i < this.subscribes[urlHash].object.length; i++) {
                            this.adapter.log.debug(`[${this.subscribes[urlHash].urlHook}] unsubscribe from object: ${this.subscribes[urlHash].object[i].id}`);
                            await this.adapter.unsubscribeForeignObjectsAsync(this.subscribes[urlHash].object[i].id);
                        }
                    }

                    this.adapter.log.debug(`[${this.subscribes[urlHash].urlHook}] Destroy connection due inactivity`);

                    delete this.subscribes[urlHash];
                }
            });
        }
    };

    this.startGC = () => {
        this.gcInterval = this.gcInterval || setInterval(() => this._executeGC(), 30000);
    }

    this.registerSubscribe = async (urlHook, id, type, user, options) => {
        if (typeof options === 'string') {
            options = {method: options};
        }
        if (options.delta) {
            options.delta = parseFloat(options.delta);
        } else {
            delete options.delta;
        }
        if (options.onchange) {
            options.onchange = options.onchange === true || options.onchange === 'true';
        } else {
            delete options.onchange;
        }

        const urlHash = crypto.createHash('md5').update(urlHook).digest('hex');
        if (!this.subscribes[urlHash]) {
            if (options.method !== 'polling') {
                const error = await _validateUrlHook({urlHook});
                if (error) {
                    return `No valid answer from URL hook: ${error}`;
                }
            } else
            if (options.method === 'polling') {
                this.adapter.log.debug(`[${urlHook}] Subscribe on connection`);
                this.startGC();
            }

            this.subscribes[urlHash] = {
                state: [],
                object: [],
                timeout: 30000,
                urlHook,
                polling: options.method === 'polling',
                ts: Date.now()
            };
        }

        if (!this.subscribes[urlHash][type].find(item => item.id === id && (!item.method || item.method === options.method))) {
            const item = {id, delta: options.delta, onchange: options.onchange};
            this.subscribes[urlHash][type].push(item);
            if (item.id.includes('*')) {
                item.regEx = new RegExp(pattern2RegEx(item.id));
            }

            if (type === 'state') {
                this.adapter.log.debug(`[${urlHook}] Subscribe on state "${id}"`);
                await this.adapter.subscribeForeignStatesAsync(id, {user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner});
                if (!item.regEx && (options.onchange || options.delta)) {
                    item.val = await this.adapter.getForeignStateAsync(id, {user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner});
                    if (item.val) {
                        item.val = item.val.val;
                    } else {
                        item.val = null;
                    }
                }
            } else {
                this.adapter.log.debug(`[${urlHook}] Subscribe on object "${id}"`);
                await this.adapter.subscribeForeignObjectsAsync(id, {user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner});
            }
        }

        if (this.config.checkInterval) {
            if (this.checkInterval) {
                this.adapter.log.debug(`start checker`);
                this.checkInterval = setInterval(async () => await this._checkHooks(), this.config.checkInterval);
            }
        } else {
            this.adapter.log.warn('No check interval set! The connections are valid forever.');
        }

        return null; // success
    };

    this.getSubscribes = async (urlHook, id, type) => {
        const urlHash = crypto.createHash('md5').update(urlHook).digest('hex');
        if (this.subscribes[urlHash]) {
            return this.subscribes[urlHash][type].map(item => item.id);
        } else {
            return null;
        }
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
                            await this.adapter.unsubscribeForeignStatesAsync(id, {user: user || 'system.user.admin', limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner}); // allow unsubscribing always
                        } else {
                            this.adapter.log.debug(`Unsubscribe from object "${id}"`);
                            await this.adapter.unsubscribeForeignObjectsAsync(id, {user: user || 'system.user.admin', limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner}); // allow unsubscribing always
                        }
                    } else {
                        break;
                    }
                } while (pos !== -1)
            } else {
                for (let i = 0; i < this.subscribes[urlHash][type].length; i++) {
                    if (type === 'state') {
                        await this.adapter.unsubscribeForeignStatesAsync(this.subscribes[urlHash][type][i].id, {user: user || 'system.user.admin', limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner}); // allow unsubscribing always
                    } else {
                        await this.adapter.unsubscribeForeignObjectsAsync(this.subscribes[urlHash][type][i].id, {user: user || 'system.user.admin', limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner}); // allow unsubscribing always
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
                if ((!item.regEx && item.id === id) || (item.regEx && item.regEx.test(id))) {
                    if (state && item.delta && item.val !== null && Math.abs(item.val - state.val) < item.delta) {
                        // ignore
                        this.adapter.log.debug(`State change for "${id}" ignored as delta (${item.val} - ${state.val}) is less than ${item.delta}`);
                        return;
                    }
                    if (state && item.onchange && !item.delta && item.val === state.val) {
                        // ignore
                        this.adapter.log.debug(`State change for "${id}" ignored as does not changed (${state.val})`);
                        return;
                    }
                    if (state && (item.delta || item.onchange)) {
                        // remember last value
                        item.val = state.val;
                    }

                    await reportChange(this.subscribes[urlHash], {id, state});
                }
            });
        });
    };

    this.objectChange = (id, obj) => {
        Object.keys(this.subscribes).forEach(urlHash => {
            this.subscribes[urlHash].object.forEach(async item => {
                // check if id
                if ((!item.regEx && item.id === id) || (item.regEx && item.regEx.test(id))) {
                    await reportChange(this.subscribes[urlHash].urlHook, {id, obj});
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
            // remove this task from the list
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

    this.app.get('/favicon.ico', (req, res) => {
        res.set('Content-Type', 'image/x-icon');
        res.send(fs.readFileSync(`${__dirname}/../img/favicon.ico`));
    });

    // authenticate
    this.app.use(`${this.routerPrefix}v1/*`, (req, res, next) => {
        isAuthenticated(req, res, () => {
            req._adapter = this.adapter;
            req._swaggerObject = this;
            next();
        });
    });

    this.app.get(`${this.routerPrefix}v1/polling`, (req, res, next) => {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        const ip = req.query.sid || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const urlHash = crypto.createHash('md5').update(ip).digest('hex');

        let item = this.subscribes[urlHash];

        this.startGC();

        if (req.query.check === 'true' || req.query.connect === 'true' || req.query.connect === '') {
            if (!item) {
                this.adapter.log.debug(`[${ip}] Initiate connection`);
                this.subscribes[urlHash] = {state: [], object: [], urlHook: ip, polling: true, timeout: parseInt(req.query.timeout, 10) || 30000, ts: Date.now()};
                item = this.subscribes[urlHash];
            } else if (req.query.timeout) {
                item.timeout = parseInt(req.query.timeout, 10);
            }
            if (item.timeout < 1000) {
                item.timeout = 1000;
            } else
            if (item.timeout > 60000) {
                item.timeout = 60000;
            }
            return res.end('_');
        } else if (!item) {
            this.subscribes[urlHash] = {state: [], object: [], urlHook: ip, polling: true, timeout: parseInt(req.query.timeout, 10) || 30000, ts: Date.now()};
            item = this.subscribes[urlHash];
        } else {
            item.ts = Date.now();
        }

        // If some data wait to be sent
        if (item.queue && item.queue.length) {
            // delete too old entries
            const now = Date.now();
            for (let d = item.queue.length - 1; d >= 0; d--) {
                if (now - item.queue[d].ts > 3000) {
                    that.adapter.log.debug(`[${item.urlHook}] Data update  was too old and ignored`);
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
            item.promise = {
                resolve,
                timer: setTimeout(() => {
                    if (item.promise) {
                        // could never happen
                        item.promise.timer = null;
                    }
                    resolve();
                }, item ? item.timeout : 30000)};
        })
            .then(data => {
                if (item.promise) {
                    item.promise.timer && clearTimeout(item.promise.timer);
                    item.promise.timer = null;
                    item.promise.resolve = null;
                    item.promise = null;
                } else {
                    debugger;
                }
                res.end(data);
            });

        req.on('error', error => {
            if (!error.message.includes('aborted')) {
                this.adapter.log.warn(`[${item && item.urlHook}]Error in polling connection: ${error}`);
            }
            if (item.promise) {
                item.promise.timer && clearTimeout(item.promise.timer);
                item.promise.timer = null;
                item.promise.resolve = null;
                item.promise = null;
            }
        });
    });

    this.app.use(`${this.routerPrefix}v1/command/*`, async (req, res) => {
        if (this.adapter.config.noCommands) {
            res.status(404).json({error: `Commands are disabled`});
            return;
        }

        let command = req.originalUrl.startsWith(`/${WEB_EXTENSION_PREFIX}`) ? req.originalUrl.split('/')[4] : req.originalUrl.split('/')[3];
        command = command.split('?')[0];

        const handler = this.commands.getCommandHandler(command);
        if (handler && command !== 'cmdExec' && command !== 'sendToHost') {
            const args = common.getParamNames(handler).map(item => item[0] === '_' ? item.substring(1) : item);

            args.shift(); // remove socket
            // try to parse a query or body
            let params = parseQuery(req.originalUrl);
            if (req.body) {
                Object.assign(params, req.body);
            }
            if (common.DEFAULT_VALUES[command]) {
                params = Object.assign({}, common.DEFAULT_VALUES[command], params);
            }

            // check if all parameters are set
            const problem = args.find(name =>
                name !== 'callback' &&
                name !== 'options' &&
                name !== 'adapterName' &&
                name !== 'update' &&
                !params.hasOwnProperty(name)
            );

            if (problem) {
                res.status(422).json({error: `Argument '${problem}' not found. Following arguments are expected: '${args.join("', '")}'`});
                return;
            }

            const _acl = {
                user: req._user,
            };

            const _arguments = [{_acl}];
            let error = '';
            args.forEach(name => {
                if (name !== 'callback') {
                    if (name === 'options' || name === 'params' || name === 'obj' || name === 'message') {
                        // try to convert
                        if (typeof params[name] === 'string' && params[name].startsWith('{') && params[name].endsWith('}')) {
                            try {
                                params[name] = JSON.parse(params[name]);
                            } catch (_error) {
                                error = `Cannot parse ${name}: ${_error}`;
                                return;
                            }
                        }
                    }

                    if (name === 'update' && params[name] === undefined) {
                        params[name] = false;
                    }

                    if (params[name] === 'true') {
                        params[name] = true;
                    } else if (params[name] === 'false') {
                        params[name] = false;
                    }
                    _arguments.push(params[name]);
                }
            });

            // try to convert arguments for setState and setForeignState
            if (command === 'setState' || command === 'setForeignState') {
                // read object
                try {
                    const obj = await adapter.getForeignObjectAsync(_arguments[1], {user: req._user});
                    if (obj && obj.common && obj.common.type) {
                        if (obj.common.type === 'number') {
                            _arguments[2] = parseFloat(_arguments[2]);
                        } else if (obj.common.type === 'boolean') {
                            _arguments[2] = _arguments[2] === 'true' || _arguments[2] === true || _arguments[2] === 1 || _arguments[2] === '1' || _arguments[2] === 'on' || _arguments[2] === 'ON';
                        } else if (obj.common.type === 'string') {
                            _arguments[2] = _arguments[2].toString();
                        }
                    }
                } catch (error) {
                    res.status(501).json({error});
                    return;
                }
            }

            if (!error) {
                if (args[args.length - 1] === 'callback') {
                    _arguments.push((error, ...args) => {
                        if (command === 'sendTo') {
                            res.json(error);
                        } else if (command === 'getHostByIp') {
                            res.json({ip: error, result: args[0]});
                        } else
                        if (command === 'authEnabled') {
                            res.json({secure: error, user: args[0]});
                        } else
                        if (args.length === 1) {
                            res.status(error ? 500 : 200).json({error, result: args[0]});
                        } else {
                            // if file
                            if ((params.binary === null || params.binary === true || params.binary === 'true') && Buffer.isBuffer(args[0])) {
                                if (args[1] && typeof args[1] === 'string' && args[1].includes('/')) {
                                    res.set('Content-Type', args[1]);
                                }
                                res.send(args[0]);
                            } else if ((params.binary === null || params.binary === true || params.binary === 'true') && Buffer.isBuffer(args[1])) {
                                res.send(args[1]);
                            } else {
                                res.status(error ? 500 : 200).json({error, results: args});
                            }
                        }
                    });
                    handler.apply(null, _arguments);
                } else {
                    handler.apply(null, _arguments);
                    // just execute. No callback
                    res.json({result: 'OK'});
                }
            } else {
                res.status(422).json({error});
            }
        } else {
            res.status(404).json({error: `Command ${command} not found`});
        }
    });

    this.app.get(`${this.routerPrefix}log/*`,(req, res) => {
        let parts = decodeURIComponent(req.url).split('/');
        if (req.originalUrl.startsWith(`/${WEB_EXTENSION_PREFIX}`)) {
            parts.shift();
        }

        if (parts.length === 5) {
            parts.shift();
            parts.shift();
            const [host, transport] = parts;
            parts = parts.splice(2);
            let filename = parts.join('/');
            this.adapter.sendToHost(`system.host.${host}`, 'getLogFile', {filename, transport}, result => {
                if (!result || result.error) {
                    res.status(404).send(`File ${escapeHtml(filename)} not found`);
                } else {
                    if (result.gz) {
                        if (result.size > 1024 * 1024) {
                            res.header('Content-Type', 'application/gzip');
                            res.send(result.data);
                        } else {
                            try {
                                unzipFile(filename, result.data, res);
                            } catch (e) {
                                res.header('Content-Type', 'application/gzip');
                                res.send(result.data);
                                adapter.log.error(`Cannot extract file ${filename}: ${e}`);
                            }
                        }
                    } else if (result.data === undefined || result.data === null) {
                        res.status(404).send(`File ${escapeHtml(filename)} not found`);
                    } else if (result.size > 2 * 1024 * 1024) {
                        res.header('Content-Type', 'text/plain');
                        res.send(result.data);
                    } else {
                        res.header('Content-Type', 'text/html');
                        res.send(decorateLogFile(null, result.data));
                    }
                }
            });
        } else {
            parts = parts.splice(2);
            const transport = parts.shift();
            let filename = parts.join('/');
            const config = adapter.systemConfig;

            // detect file log
            if (config && config.log && config.log.transport) {
                if (config.log.transport.hasOwnProperty(transport) && config.log.transport[transport].type === 'file') {
                    let logFolder;
                    if (config.log.transport[transport].filename) {
                        parts = config.log.transport[transport].filename.replace(/\\/g, '/').split('/');
                        parts.pop();
                        logFolder = path.normalize(parts.join('/'));
                    } else {
                        logFolder = path.join(process.cwd(), 'log');
                    }

                    if (logFolder[0] !== '/' && logFolder[0] !== '\\' && !logFolder.match(/^[a-zA-Z]:/)) {
                        const _logFolder = path.normalize(path.join(`${__dirname}/../../../`, logFolder).replace(/\\/g, '/')).replace(/\\/g, '/');
                        if (!fs.existsSync(_logFolder)) {
                            logFolder = path.normalize(path.join(`${__dirname}/../../`, logFolder).replace(/\\/g, '/')).replace(/\\/g, '/');
                        } else {
                            logFolder = _logFolder;
                        }
                    }

                    filename = path.normalize(path.join(logFolder, filename).replace(/\\/g, '/')).replace(/\\/g, '/');

                    if (filename.startsWith(logFolder) && fs.existsSync(filename)) {
                        const stat = fs.lstatSync(filename);
                        // if file is archive
                        if (filename.toLowerCase().endsWith('.gz')) {
                            // try to not process to big files
                            if (stat.size > 1024 * 1024/* || !fs.existsSync('/dev/null')*/) {
                                res.header('Content-Type', 'application/gzip');
                                res.sendFile(filename);
                            } else {
                                try {
                                    unzipFile(filename, fs.readFileSync(filename), res);
                                } catch (e) {
                                    res.header('Content-Type', 'application/gzip');
                                    res.sendFile(filename);
                                    adapter.log.error(`Cannot extract file ${filename}: ${e}`);
                                }
                            }
                        } else if (stat.size > 2 * 1024 * 1024) {
                            res.header('Content-Type', 'text/plain');
                            res.sendFile(filename);
                        } else {
                            res.header('Content-Type', 'text/html');
                            res.send(decorateLogFile(filename));
                        }

                        return;
                    }
                }
            }

            res.status(404).send(`File ${escapeHtml(filename)} not found`);
        }
    });

    // parse binary files
    this.app.post(`${this.routerPrefix}v1/file/*`, multer().fields([{ name: 'file', maxCount: 1 }]), (req, res, next) => next());

    this.unload = async () => {
        if (this.config.webInstance) {
            await this.adapter.setForeignStateAsync(`${this.namespace}.info.extension`, false, true);
        }
        this.checkInterval && clearInterval(this.checkInterval);
        this.checkInterval = null;
        this.gcInterval && clearInterval(this.gcInterval);
        this.gcInterval = null;
        // send to all hooks, disconnect event

        const hooks = Object.keys(this.subscribes);
        for (let h = 0; h < hooks.length; h++) {
            await reportChange(this.subscribes[hooks[h]], {disconnect: true});
        }
        this.subscribes = {};
    }

    // deliver to web the link to Web interface
    this.welcomePage = () => {
        return {
            link: WEB_EXTENSION_PREFIX,
            name: 'REST-API',
            img: 'adapter/rest-api/rest-api.png',
            color: '#157c00',
            order: 10,
            pro: false
        };
    }

    // Say to web instance to wait till this instance is initialized
    this.waitForReady = cb => {
        callback = cb;
    }

    // read default history
    if (!this.config.dataSource) {
        this.adapter.getForeignObjectAsync('system.config')
            .then(obj => {
                if (obj && obj.common && obj.common.defaultHistory) {
                    this.config.dataSource = obj.common.defaultHistory;
                }
            });
    }

    this.adapter.WEB_EXTENSION_PREFIX = WEB_EXTENSION_PREFIX.replace('/', '');

    SwaggerRunner.create(_options, (err, swaggerRunner) => {
        if (this.config.webInstance) {
            this.adapter.setForeignState(this.namespace + '.info.extension', true, true);
        }
        if (err) {
            throw err;
        }

        this.swagger = swaggerRunner;

        // install middleware
        swaggerRunner.expressMiddleware().register(this.app);

        callback && callback(this.app);
    });
}

module.exports = SwaggerUI;
