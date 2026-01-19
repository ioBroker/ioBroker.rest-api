"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const yamljs_1 = __importDefault(require("yamljs"));
const body_parser_1 = __importDefault(require("body-parser"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const axios_1 = __importDefault(require("axios"));
const cors_1 = __importDefault(require("cors"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const multer_1 = __importDefault(require("multer"));
const adapter_core_1 = require("@iobroker/adapter-core");
const socket_classes_1 = require("@iobroker/socket-classes");
const socketCommands_1 = require("@iobroker/socket-classes/dist/lib/socketCommands");
const common_1 = require("./common");
const node_zlib_1 = require("node:zlib");
const pattern2RegEx = adapter_core_1.commonTools.pattern2RegEx;
process.env.SUPPRESS_NO_CONFIG_WARNING = 'true';
const WEB_EXTENSION_PREFIX = 'rest-api/';
function parseQuery(_url) {
    let url;
    try {
        url = decodeURI(_url);
    }
    catch {
        url = _url;
    }
    const pos = url.indexOf('?');
    const values = {};
    if (pos !== -1) {
        const arr = url.substring(pos + 1).split('&');
        url = url.substring(0, pos);
        for (let i = 0; i < arr.length; i++) {
            const parts = arr[i].split('=');
            try {
                values[parts[0].trim()] =
                    parts[1] === undefined ? null : decodeURIComponent(`${parts[1]}`.replace(/\+/g, '%20'));
            }
            catch {
                console.error(`Unable to parse ${url}`);
                values[parts[0].trim()] = `${parts[1]}`.replace(/\+/g, '%20');
            }
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
    const str = `${string}`;
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
    return lastIndex !== index ? html + str.substring(lastIndex, index) : html;
}
function decorateLogFile(fileName, text) {
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
        '       className = "info";\n' +
        '       line = line.replace(/\\x1B\\[32m/g, "<span class=\\"type\\">");\n' +
        '   } else \n' +
        '   if (line.indexOf("[34m") !== -1) {\n' +
        '       className = "debug";\n' +
        '       line = line.replace(/\\x1B\\[34m/g, "<span class=\\"type\\">");\n' +
        '   } else \n' +
        '   if (line.indexOf("[33m") !== -1) {\n' +
        '       className = "warn";\n' +
        '       line = line.replace(/\\x1B\\[33m/g, "<span class=\\"type\\">");\n' +
        '   } else \n' +
        '   if (line.indexOf("[31m") !== -1) {\n' +
        '       className = "error";\n' +
        '       line = line.replace(/\\x1B\\[31m/g, "<span class=\\"type\\">");\n' +
        '   } else \n' +
        '   if (line.indexOf("[35m") !== -1) {\n' +
        '       className = "silly";\n' +
        '       line = line.replace(/\\x1B\\[35m/g, "<span class=\\"type\\">");\n' +
        '   } else {\n' +
        '   }\n' +
        '   return "<tr class=\\"" + className + "\\"><td>" + line + "</td></tr>";\n' +
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
    const log = text || node_fs_1.default.readFileSync(fileName).toString();
    return prefix + log + suffix;
}
function removeTextFromFile(fileName, start, end) {
    const file = node_fs_1.default.readFileSync(fileName).toString('utf8').split('\n');
    // find <!-- START -->
    const newFile = [];
    let foundStart = false;
    let foundEnd = false;
    for (let f = 0; f < file.length; f++) {
        if (!foundStart && file[f].includes(start)) {
            foundStart = true;
            continue;
        }
        else if (file[f].includes(end)) {
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
 * @param _ignore not used in this web extension
 * @param webSettings settings of the web server, like <pre><code>{secure: settings.secure, port: settings.port}</code></pre>
 * @param adapter web adapter object
 * @param instanceSettings instance object with common and native
 * @param app express application
 * @param callback called when the engine is initialized
 * @returns object instance
 */
class SwaggerUI {
    _waitFor = [];
    app;
    readyPromise;
    adapter;
    config;
    namespace;
    subscribes = {};
    checkInterval = null;
    extension;
    routerPrefix;
    gcInterval = null;
    commands;
    defaultUser;
    adminAcl;
    constructor(server, webSettings, adapter, instanceSettings, app) {
        this.app = app;
        this.adapter = adapter;
        this.config = instanceSettings ? instanceSettings.native : adapter.config;
        this.namespace = instanceSettings
            ? instanceSettings._id.substring('system.adapter.'.length)
            : this.adapter.namespace;
        this.extension = !!instanceSettings;
        this.routerPrefix = this.extension ? `/${WEB_EXTENSION_PREFIX}` : '/';
        this.commands = this.adapter.config.noAdminCommands ? new socket_classes_1.SocketCommands(adapter) : new socket_classes_1.SocketCommandsAdmin(adapter);
        this.config.defaultUser = this.extension
            ? this.config.defaultUser
            : this.config.defaultUser || 'system.user.admin';
        this.config.checkInterval =
            this.config.checkInterval === undefined ? 20000 : parseInt(this.config.checkInterval, 10);
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
        if (!this.config.defaultUser?.startsWith('system.user.')) {
            this.defaultUser = `system.user.${this.config.defaultUser || 'admin'}`;
        }
        else {
            this.defaultUser = this.config.defaultUser;
        }
        this.adapter.WEB_EXTENSION_PREFIX = WEB_EXTENSION_PREFIX.replace('/', '');
        // enable cors only if standalone
        if (!instanceSettings) {
            this.app.use((0, cors_1.default)());
        }
        this.adapter._addTimeout = this._addTimeout;
        const aclPromise = this.adapter
            .calculatePermissionsAsync('system.user.admin', socketCommands_1.COMMANDS_PERMISSIONS)
            .then((_acl) => (this.adminAcl = _acl));
        this.readyPromise = new Promise(resolve => aclPromise.then(() => this.init(resolve)));
    }
    ready() {
        return this.readyPromise;
    }
    init(readyCallback) {
        const jsonParser = body_parser_1.default.json({
            limit: '100mb',
        });
        const rawParser = body_parser_1.default.raw({
            limit: '100mb',
        });
        this.app.use((req, res, next) => {
            if (req.url.startsWith('/name')) {
                // User can ask server if authentication enabled
                res.setHeader('Content-Type', 'plain/text');
                res.send(this.namespace);
            }
            else if (req.method !== 'GET' && req.url.startsWith('/v1/binary/')) {
                rawParser(req, res, next);
            }
            else {
                jsonParser(req, res, next);
            }
        });
        const _options = {
            appRoot: __dirname,
            // prepare YAML
            swaggerFile: `${__dirname}/api/swagger/swagger.yaml`,
        };
        if (this.adapter.config.noCommands) {
            const newText = removeTextFromFile(_options.swaggerFile, '# commands start', '# commands stop');
            _options.swaggerFile = `${__dirname}/api/swagger/swaggerEdited.yaml`;
            if (!node_fs_1.default.existsSync(_options.swaggerFile) ||
                node_fs_1.default.readFileSync(_options.swaggerFile).toString('utf8') !== newText) {
                node_fs_1.default.writeFileSync(_options.swaggerFile, newText);
            }
        }
        else if (this.adapter.config.noAdminCommands) {
            const newText = removeTextFromFile(_options.swaggerFile, '# admin commands start', '# admin commands end');
            _options.swaggerFile = `${__dirname}/api/swagger/swaggerEdited.yaml`;
            if (!node_fs_1.default.existsSync(_options.swaggerFile) ||
                node_fs_1.default.readFileSync(_options.swaggerFile).toString('utf8') !== newText) {
                node_fs_1.default.writeFileSync(_options.swaggerFile, newText);
            }
        }
        // create swagger.yaml copy with changed basePath
        let customBasePath;
        let customSwaggerFile;
        if (this.extension) {
            customBasePath = `/${WEB_EXTENSION_PREFIX}v1`;
            customSwaggerFile = `${__dirname}/api/swagger/swagger_extension.yaml`;
        }
        else if (this.config.reversePath) {
            // Handle reverse proxy path
            const normalizedReversePath = this.config.reversePath.trim().replace(/^\/+|\/+$/g, '');
            customBasePath = normalizedReversePath ? `/${normalizedReversePath}/v1` : '/v1';
            customSwaggerFile = `${__dirname}/api/swagger/swagger_reverse_proxy.yaml`;
        }
        if (customBasePath && customSwaggerFile) {
            const originalFile = node_fs_1.default.readFileSync(_options.swaggerFile).toString('utf8');
            const swaggerDoc = yamljs_1.default.parse(originalFile);
            swaggerDoc.basePath = customBasePath;
            const modifiedFile = yamljs_1.default.stringify(swaggerDoc);
            if (!node_fs_1.default.existsSync(customSwaggerFile) ||
                node_fs_1.default.readFileSync(customSwaggerFile).toString('utf8') !== modifiedFile) {
                node_fs_1.default.writeFileSync(customSwaggerFile, modifiedFile);
            }
            _options.swaggerFile = customSwaggerFile;
        }
        const swaggerDocument = yamljs_1.default.load(_options.swaggerFile);
        if (customBasePath) {
            swaggerDocument.basePath = customBasePath;
        }
        const that = this;
        if (!this.config.noUI) {
            this.app.get(`${this.routerPrefix}api-docs/swagger.json`, (req, res) => res.json(swaggerDocument));
            const options = {
                customCss: '.swagger-ui .topbar { background-color: #4dabf5; }',
            };
            // show WEB CSS and so on
            this.app.use(`${this.routerPrefix}api-doc/`, swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerDocument, options));
            this.app.get(this.routerPrefix, (req, res) => res.redirect(`${this.routerPrefix}api-doc/`));
        }
        this.app.get('/favicon.ico', (req, res) => {
            res.set('Content-Type', 'image/x-icon');
            res.send(node_fs_1.default.readFileSync(`${__dirname}/../img/favicon.ico`));
        });
        // authenticate
        this.app.use(`${this.routerPrefix}v1/:param`, (req, res, next) => {
            this.isAuthenticated(req, res, () => {
                req._adapter = this.adapter;
                req._swaggerObject = this;
                next();
            });
        });
        this.app.get(`${this.routerPrefix}v1/polling`, (req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            const ip = req.query.sid ||
                req.headers['x-forwarded-for'] ||
                req.socket.remoteAddress ||
                '';
            const urlHash = node_crypto_1.default.createHash('md5').update(ip).digest('hex');
            let item = this.subscribes[urlHash];
            this.startGC();
            if (req.query.check === 'true' || req.query.connect === 'true' || req.query.connect === '') {
                if (!item) {
                    this.adapter.log.debug(`[${ip}] Initiate connection`);
                    this.subscribes[urlHash] = {
                        state: [],
                        object: [],
                        urlHook: ip,
                        polling: true,
                        timeout: parseInt(req.query.timeout, 10) || 30000,
                        ts: Date.now(),
                    };
                    item = this.subscribes[urlHash];
                }
                else if (req.query.timeout) {
                    item.timeout = parseInt(req.query.timeout, 10);
                }
                if (item.timeout < 1000) {
                    item.timeout = 1000;
                }
                else if (item.timeout > 60000) {
                    item.timeout = 60000;
                }
                return res.end('_');
            }
            if (!item) {
                this.subscribes[urlHash] = {
                    state: [],
                    object: [],
                    urlHook: ip,
                    polling: true,
                    timeout: parseInt(req.query.timeout, 10) || 30000,
                    ts: Date.now(),
                };
                item = this.subscribes[urlHash];
            }
            else {
                item.ts = Date.now();
            }
            // If some data wait to be sent
            if (item.queue?.length) {
                // delete too old entries
                const now = Date.now();
                for (let d = item.queue.length - 1; d >= 0; d--) {
                    if (now - item.queue[d].ts > 3000) {
                        that.adapter.log.debug(`[${item.urlHook}] Data update was too old and ignored`);
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
            void new Promise(resolve => {
                item.promise = {
                    resolve,
                    timer: this.adapter.setTimeout(() => {
                        if (item.promise) {
                            // could never happen
                            item.promise.timer = undefined;
                        }
                        resolve();
                    }, item ? item.timeout : 30000),
                };
            }).then(data => {
                if (item.promise) {
                    if (item.promise.timer) {
                        this.adapter.clearTimeout(item.promise.timer);
                        item.promise.timer = undefined;
                    }
                    item.promise.resolve = undefined;
                    item.promise = undefined;
                }
                else {
                    this.adapter.log.warn(`[${item?.urlHook}]Connection was aborted`);
                }
                if (!res.writableEnded) {
                    res.end(data);
                }
            });
            req.on('error', error => {
                if (!error.message.includes('aborted')) {
                    this.adapter.log.warn(`[${item?.urlHook}]Error in polling connection: ${error}`);
                }
                if (item.promise) {
                    if (item.promise.timer) {
                        this.adapter.clearTimeout(item.promise.timer);
                        item.promise.timer = undefined;
                    }
                    item.promise.resolve = undefined;
                    item.promise = undefined;
                }
            });
        });
        this.app.use(`${this.routerPrefix}v1/command/:command`, async (_req, res) => {
            const req = _req;
            if (this.adapter.config.noCommands) {
                res.status(404).json({ error: `Commands are disabled` });
                return;
            }
            let command = req.originalUrl.startsWith(`/${WEB_EXTENSION_PREFIX}`)
                ? req.originalUrl.split('/')[4]
                : req.originalUrl.split('/')[3];
            command = command.split('?')[0];
            const handler = this.commands.getCommandHandler(command);
            if (handler && command !== 'cmdExec' && command !== 'sendToHost') {
                const args = (0, common_1.getParamNames)(handler).map(item => (item[0] === '_' ? item.substring(1) : item));
                args.shift(); // remove socket
                // try to parse a query or body
                let params = parseQuery(req.originalUrl);
                if (req.body) {
                    Object.assign(params, req.body);
                }
                if (common_1.DEFAULT_VALUES[command]) {
                    params = Object.assign({}, common_1.DEFAULT_VALUES[command], params);
                }
                // check if all parameters are set
                const problem = args.find(name => name !== 'callback' &&
                    name !== 'options' &&
                    name !== 'adapterName' &&
                    name !== 'update' &&
                    !Object.prototype.hasOwnProperty.call(params, name));
                if (problem) {
                    res.status(422).json({
                        error: `Argument '${problem}' not found. Following arguments are expected: '${args.join("', '")}'`,
                    });
                    return;
                }
                // We must calculate _acl here, because socket-classes does not check it if a user is already defined
                let _acl;
                if (req._user) {
                    if (req._user === 'system.user.admin') {
                        _acl = this.adminAcl;
                    }
                    else {
                        _acl = await this.adapter.calculatePermissionsAsync(req._user, socketCommands_1.COMMANDS_PERMISSIONS);
                    }
                }
                else {
                    _acl = this.adminAcl;
                }
                const _arguments = [
                    // this object simulates the socket
                    { _acl },
                ];
                let error = '';
                args.forEach(name => {
                    if (name !== 'callback') {
                        if (name === 'options' || name === 'params' || name === 'obj' || name === 'message') {
                            // try to convert
                            if (typeof params[name] === 'string' &&
                                params[name].startsWith('{') &&
                                params[name].endsWith('}')) {
                                try {
                                    params[name] = JSON.parse(params[name]);
                                }
                                catch (_error) {
                                    error = `Cannot parse ${name}: ${_error}`;
                                    return;
                                }
                            }
                        }
                        if (name === 'update' && params.update === undefined) {
                            params.update = false;
                        }
                        if (params[name] === 'true') {
                            params[name] = true;
                        }
                        else if (params[name] === 'false') {
                            params[name] = false;
                        }
                        _arguments.push(params[name]);
                    }
                });
                // try to convert arguments for setState and setForeignState
                if (command === 'setState' || command === 'setForeignState') {
                    // read an object
                    try {
                        const stateObj = (await this.adapter.getForeignObjectAsync(_arguments[1], { user: req._user }));
                        if (stateObj?.common?.type) {
                            if (typeof _arguments[2] === 'string' &&
                                _arguments[2].trim().startsWith('{') &&
                                _arguments[2].trim().endsWith('}')) {
                                try {
                                    _arguments[2] = JSON.parse(_arguments[2]);
                                }
                                catch {
                                    this.adapter.log.warn(`Cannot parse JSON: ${_arguments[2]}`);
                                }
                            }
                            if (typeof _arguments[2] !== 'object') {
                                if (stateObj.common.type === 'number') {
                                    _arguments[2] = parseFloat(_arguments[2]);
                                }
                                else if (stateObj.common.type === 'boolean') {
                                    _arguments[2] =
                                        _arguments[2] === 'true' ||
                                            _arguments[2] === true ||
                                            _arguments[2] === 1 ||
                                            _arguments[2] === '1' ||
                                            _arguments[2] === 'on' ||
                                            _arguments[2] === 'ON';
                                }
                                else if (stateObj.common.type === 'string') {
                                    _arguments[2] = _arguments[2].toString();
                                }
                                if (params.ack === 'true') {
                                    _arguments[2] = { val: _arguments[2], ack: true };
                                }
                            }
                        }
                    }
                    catch (error) {
                        res.status(501).json({ error });
                        return;
                    }
                }
                if (!error) {
                    if (args[args.length - 1] === 'callback') {
                        _arguments.push((error, ...args) => {
                            if (command === 'sendTo') {
                                res.json(error);
                            }
                            else if (command === 'getHostByIp') {
                                res.json({ ip: error, result: args[0] });
                            }
                            else if (command === 'authEnabled') {
                                res.json({ secure: error, user: args[0] });
                            }
                            else if (args.length === 1) {
                                res.status(error ? 500 : 200).json({ error, result: args[0] });
                            }
                            else {
                                // if file
                                if ((params.binary === null || params.binary === true || params.binary === 'true') &&
                                    Buffer.isBuffer(args[0])) {
                                    if (args[1] && typeof args[1] === 'string' && args[1].includes('/')) {
                                        res.set('Content-Type', args[1]);
                                    }
                                    res.send(args[0]);
                                }
                                else if ((params.binary === null || params.binary === true || params.binary === 'true') &&
                                    Buffer.isBuffer(args[1])) {
                                    res.send(args[1]);
                                }
                                else {
                                    res.status(error ? 500 : 200).json({ error, results: args });
                                }
                            }
                        });
                        // @ts-expect-error
                        // eslint-disable-next-line prefer-spread
                        handler.apply(null, _arguments);
                    }
                    else {
                        // @ts-expect-error
                        // eslint-disable-next-line prefer-spread
                        handler.apply(null, _arguments);
                        // just execute. No callback
                        res.json({ result: 'OK' });
                    }
                }
                else {
                    res.status(422).json({ error });
                }
            }
            else {
                res.status(404).json({ error: `Command ${command} not found` });
            }
        });
        this.app.get(`${this.routerPrefix}log/:logFile`, (req, res) => {
            let parts = [];
            try {
                parts = decodeURIComponent(req.url).split('/');
            }
            catch {
                this.adapter.log.warn(`Cannot decode "${req.url}"`);
            }
            if (req.originalUrl.startsWith(`/${WEB_EXTENSION_PREFIX}`)) {
                parts.shift();
            }
            if (parts.length === 5) {
                parts.shift();
                parts.shift();
                const [host, transport] = parts;
                parts = parts.splice(2);
                const filename = parts.join('/');
                this.adapter.sendToHost(`system.host.${host}`, 'getLogFile', { filename, transport }, (result) => {
                    if (!result || result.error) {
                        res.status(404).send(`File ${escapeHtml(filename)} not found`);
                    }
                    else {
                        if (result.gz) {
                            if (result.size > 1024 * 1024) {
                                res.header('Content-Type', 'application/gzip');
                                res.send(result.data);
                            }
                            else {
                                try {
                                    this.unzipFile(filename, result.data, res);
                                }
                                catch (e) {
                                    res.header('Content-Type', 'application/gzip');
                                    res.send(result.data);
                                    this.adapter.log.error(`Cannot extract file ${filename}: ${e}`);
                                }
                            }
                        }
                        else if (result.data === undefined || result.data === null) {
                            res.status(404).send(`File ${escapeHtml(filename)} not found`);
                        }
                        else if (result.size > 2 * 1024 * 1024) {
                            res.header('Content-Type', 'text/plain');
                            res.send(result.data);
                        }
                        else {
                            res.header('Content-Type', 'text/html');
                            res.send(decorateLogFile(null, result.data));
                        }
                    }
                });
            }
            else {
                parts = parts.splice(2);
                const transport = parts.shift() || '';
                let filename = parts.join('/');
                const config = this.adapter.systemConfig;
                // detect file log
                if (config?.log?.transport) {
                    if (Object.prototype.hasOwnProperty.call(config.log.transport, transport) &&
                        config.log.transport[transport].type === 'file') {
                        let logFolder;
                        if (config.log.transport[transport].filename) {
                            parts = config.log.transport[transport].filename.replace(/\\/g, '/').split('/');
                            parts.pop();
                            logFolder = node_path_1.default.normalize(parts.join('/'));
                        }
                        else {
                            logFolder = node_path_1.default.join(process.cwd(), 'log');
                        }
                        if (logFolder[0] !== '/' && logFolder[0] !== '\\' && !logFolder.match(/^[a-zA-Z]:/)) {
                            const _logFolder = node_path_1.default
                                .normalize(node_path_1.default.join(`${__dirname}/../../../`, logFolder).replace(/\\/g, '/'))
                                .replace(/\\/g, '/');
                            if (!node_fs_1.default.existsSync(_logFolder)) {
                                logFolder = node_path_1.default
                                    .normalize(node_path_1.default.join(`${__dirname}/../../`, logFolder).replace(/\\/g, '/'))
                                    .replace(/\\/g, '/');
                            }
                            else {
                                logFolder = _logFolder;
                            }
                        }
                        filename = node_path_1.default
                            .normalize(node_path_1.default.join(logFolder, filename).replace(/\\/g, '/'))
                            .replace(/\\/g, '/');
                        if (filename.startsWith(logFolder) && node_fs_1.default.existsSync(filename)) {
                            const stat = node_fs_1.default.lstatSync(filename);
                            // if a file is archived
                            if (filename.toLowerCase().endsWith('.gz')) {
                                // try to not process to big files
                                if (stat.size > 1024 * 1024 /* || !fs.existsSync('/dev/null')*/) {
                                    res.header('Content-Type', 'application/gzip');
                                    res.sendFile(filename);
                                }
                                else {
                                    try {
                                        this.unzipFile(filename, node_fs_1.default.readFileSync(filename), res);
                                    }
                                    catch (e) {
                                        res.header('Content-Type', 'application/gzip');
                                        res.sendFile(filename);
                                        this.adapter.log.error(`Cannot extract file ${filename}: ${e}`);
                                    }
                                }
                            }
                            else if (stat.size > 2 * 1024 * 1024) {
                                res.header('Content-Type', 'text/plain');
                                res.sendFile(filename);
                            }
                            else {
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
        this.app.post(`${this.routerPrefix}v1/file/:file`, (0, multer_1.default)().fields([{ name: 'file', maxCount: 1 }]), (req, res, next) => next());
        // read default history
        if (!this.config.dataSource) {
            void this.adapter.getForeignObjectAsync('system.config').then(obj => {
                if (obj?.common?.defaultHistory) {
                    this.config.dataSource = obj.common.defaultHistory;
                }
            });
        }
        // Minimal manual binding of swagger paths (replacement for swagger-node-runner-fork)
        try {
            const paths = swaggerDocument.paths || {};
            const controllerCache = {};
            const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
            Object.keys(paths).forEach(swaggerPath => {
                const pathItem = paths[swaggerPath];
                METHODS.forEach(method => {
                    const op = pathItem[method];
                    if (!op) {
                        return;
                    }
                    const controllerName = op['x-swagger-router-controller'] || pathItem['x-swagger-router-controller'];
                    const operationId = op.operationId;
                    if (!controllerName || !operationId) {
                        return;
                    }
                    if (!controllerCache[controllerName]) {
                        try {
                            // eslint-disable-next-line @typescript-eslint/no-require-imports
                            controllerCache[controllerName] = require(node_path_1.default.join(__dirname, 'api', 'controllers', `${controllerName}.js`));
                        }
                        catch (e) {
                            this.adapter.log.error(`Cannot load controller '${controllerName}': ${e}`);
                            return;
                        }
                    }
                    const handler = controllerCache[controllerName][operationId];
                    if (typeof handler !== 'function') {
                        this.adapter.log.warn(`Handler '${operationId}' missing in controller '${controllerName}'`);
                        return;
                    }
                    // collect path params (merge path & op parameters)
                    const params = [];
                    if (Array.isArray(pathItem.parameters)) {
                        pathItem.parameters.forEach((p) => p?.in === 'path' && params.push({ in: p.in, name: p.name }));
                    }
                    if (Array.isArray(op.parameters)) {
                        op.parameters.forEach((p) => {
                            if (p?.in === 'path' && !params.find(pp => pp.name === p.name)) {
                                params.push({ in: p.in, name: p.name });
                            }
                        });
                    }
                    const expressPath = swaggerPath.replace(/\{([^}]+)}/g, ':$1');
                    const fullPath = `${this.routerPrefix}v1${expressPath.startsWith('/') ? '' : '/'}${expressPath}`.replace(/\/+/g, '/');
                    this.app[method](fullPath, (req, res) => {
                        this.adapter.log.silly?.(`Register route hit: [${method.toUpperCase()}] ${fullPath}`);
                        req.swagger = { operation: { parameters: params } };
                        try {
                            handler(req, res);
                        }
                        catch (e) {
                            this.adapter.log.error(`Error in handler ${operationId}: ${e}`);
                            res.status(500).json({ error: 'internal error' });
                        }
                    });
                    this.adapter.log.debug(`Bound route ${method.toUpperCase()} ${fullPath} -> ${controllerName}.${operationId}`);
                });
            });
        }
        catch (e) {
            this.adapter.log.error(`Failed to bind swagger routes: ${e}`);
        }
        if (this.config.webInstance) {
            this.adapter.setForeignState(`${this.namespace}.info.extension`, true, true); // ignore await
        }
        readyCallback();
    }
    unzipFile(fileName, data, res) {
        // extract the file
        try {
            const text = (0, node_zlib_1.gunzipSync)(data).toString('utf8');
            if (text.length > 2 * 1024 * 1024) {
                res.header('Content-Type', 'text/plain');
                res.send(text);
            }
            else {
                res.header('Content-Type', 'text/html');
                res.send(decorateLogFile(fileName, text));
            }
        }
        catch (e) {
            res.header('Content-Type', 'application/gzip');
            res.send(data);
            this.adapter.log.error(`Cannot extract file ${fileName}: ${e}`);
        }
    }
    isAuthenticated(req, res, callback) {
        if (this.config.auth) {
            let values = parseQuery(req.url);
            if (!values.user || !values.pass) {
                if (req.headers.authorization?.startsWith('Basic ')) {
                    const auth = Buffer.from(req.headers.authorization.substring(6), 'base64').toString('utf8');
                    const pos = auth.indexOf(':');
                    if (pos !== -1) {
                        values = {
                            user: auth.substring(0, pos),
                            pass: auth.substring(pos + 1),
                        };
                    }
                }
                else if (req.headers.authorization?.startsWith('Bearer ')) {
                    const accessToken = req.headers.authorization.split(' ')[1];
                    void this.adapter.getSession(`a:${accessToken}`, obj => {
                        if (obj) {
                            req._user = `system.user.${obj.user}`;
                            // that.adapter.log.debug(`Logged in: ${values.user}`);
                            callback?.(true);
                        }
                        else {
                            callback = undefined;
                            this.adapter.log.warn(`Invalid access token: ${values.user}`);
                            res.status(401).send({ error: `Invalid access token: ${values.user}` });
                        }
                    });
                    return;
                }
            }
            if (!values.user || !values.pass) {
                res.status(401).send({ error: 'User is required' });
                return;
            }
            if (!values.user.match(/^system\.user\./)) {
                values.user = `system.user.${values.user}`;
            }
            void this.adapter.checkPassword(values.user, values.pass, result => {
                if (result) {
                    req._user = values.user;
                    // that.adapter.log.debug(`Logged in: ${values.user}`);
                    callback?.(true);
                }
                else {
                    callback = undefined;
                    this.adapter.log.warn(`Invalid password or user name: ${values.user}`);
                    res.status(401).send({ error: `Invalid password or user name: ${values.user}` });
                }
            });
        }
        else if (callback) {
            req._user = this.defaultUser;
            callback();
        }
    }
    async _validateUrlHook(item) {
        try {
            await axios_1.default.post(item.urlHook, { test: true }, {
                timeout: this.config.hookTimeout,
                validateStatus: status => status < 400,
            });
        }
        catch (error) {
            if (error.response) {
                this.adapter.log.warn(`Cannot report to hook "${item.urlHook}": ${error.response.data || error.response.status}`);
            }
            else {
                this.adapter.log.warn(`Cannot report to hook "${item.urlHook}": ${JSON.stringify(error)}`);
            }
            item.errors = item.errors || 0;
            item.errors++;
            if (item.errors > 2) {
                this.adapter.log.warn(`3 errors by "${item.urlHook}": all subscriptions removed`);
                await this.unregisterSubscribe(item.urlHook, null, 'state');
                await this.unregisterSubscribe(item.urlHook, null, 'object');
            }
            return 'Cannot validate URL';
        }
    }
    async reportChange(item, data) {
        if (item.polling) {
            if (item.promise) {
                item.promise.resolve?.(JSON.stringify(data));
            }
            else {
                item.queue ||= [];
                const now = Date.now();
                item.queue.push({ data: JSON.stringify(data), ts: now });
                // delete too old entries
                for (let d = item.queue.length - 1; d >= 0; d--) {
                    if (now - item.queue[d].ts > 3000) {
                        this.adapter.log.debug(`[${item.urlHook}] Data update skipped, as no handler (${d + 1})`);
                        item.queue.splice(0, d);
                        break;
                    }
                }
            }
        }
        else {
            try {
                await axios_1.default.post(item.urlHook, data, {
                    timeout: this.config.hookTimeout,
                    validateStatus: status => status < 400,
                });
            }
            catch (error) {
                if (error.response) {
                    this.adapter.log.warn(`Cannot report to hook "${item.urlHook}": ${error.response.data || error.response.status}`);
                }
                else {
                    this.adapter.log.warn(`Cannot report to hook "${item.urlHook}": ${JSON.stringify(error)}`);
                }
                item.errors ||= 0;
                item.errors++;
                if (item.errors > 2) {
                    this.adapter.log.warn(`3 errors by "${item.urlHook}": all subscriptions removed`);
                    await this.unregisterSubscribe(item.urlHook, null, 'state');
                    await this.unregisterSubscribe(item.urlHook, null, 'object');
                }
            }
        }
    }
    async _checkHooks() {
        const hooks = Object.keys(this.subscribes);
        for (let i = 0; i < hooks.length; i++) {
            if (!this.subscribes[hooks[i]].polling) {
                await this._validateUrlHook(this.subscribes[hooks[i]]);
            }
        }
    }
    _executeGC = () => {
        const hashes = Object.keys(this.subscribes).filter(urlHash => this.subscribes[urlHash].polling);
        if (!hashes.length) {
            if (this.gcInterval) {
                clearInterval(this.gcInterval);
                this.gcInterval = null;
            }
        }
        else {
            const now = Date.now();
            hashes.forEach(async (urlHash) => {
                // kill all subscriptions after 2 minutes
                if (now - this.subscribes[urlHash].ts > (this.subscribes[urlHash].timeout || 30000) * 1.5) {
                    if (this.subscribes[urlHash].promise) {
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
    startGC() {
        this.gcInterval ||= setInterval(() => this._executeGC(), 30000);
    }
    registerSubscribe = async (urlHook, id, type, user, options) => {
        if (typeof options === 'string') {
            options = { method: options };
        }
        if (options.delta) {
            options.delta = parseFloat(options.delta);
        }
        else {
            delete options.delta;
        }
        if (options.onchange) {
            options.onchange = options.onchange === true || options.onchange === 'true';
        }
        else {
            delete options.onchange;
        }
        const urlHash = node_crypto_1.default.createHash('md5').update(urlHook).digest('hex');
        if (!this.subscribes[urlHash]) {
            if (options.method !== 'polling') {
                const error = await this._validateUrlHook({ urlHook });
                if (error) {
                    return `No valid answer from URL hook: ${error}`;
                }
            }
            else if (options.method === 'polling') {
                this.adapter.log.debug(`[${urlHook}] Subscribe on connection`);
                this.startGC();
            }
            this.subscribes[urlHash] = {
                state: [],
                object: [],
                timeout: 30000,
                urlHook,
                polling: options.method === 'polling',
                ts: Date.now(),
            };
        }
        if (!this.subscribes[urlHash][type].find(item => item.id === id)) {
            const item = { id, delta: options.delta, onchange: options.onchange };
            this.subscribes[urlHash][type].push(item);
            if (item.id.includes('*')) {
                item.regEx = new RegExp(pattern2RegEx(item.id));
            }
            if (type === 'state') {
                this.adapter.log.debug(`[${urlHook}] Subscribe on state "${id}"`);
                await this.adapter.subscribeForeignStatesAsync(id, {
                    user,
                    limitToOwnerRights: this.adapter.config.onlyAllowWhenUserIsOwner,
                });
                if (!item.regEx && (options.onchange || options.delta)) {
                    const stateValue = await this.adapter.getForeignStateAsync(id, {
                        user,
                        limitToOwnerRights: this.adapter.config.onlyAllowWhenUserIsOwner,
                    });
                    if (stateValue) {
                        item.val = stateValue.val;
                    }
                    else {
                        item.val = null;
                    }
                }
            }
            else {
                this.adapter.log.debug(`[${urlHook}] Subscribe on object "${id}"`);
                await this.adapter.subscribeForeignObjectsAsync(id, {
                    user,
                    limitToOwnerRights: this.adapter.config.onlyAllowWhenUserIsOwner,
                });
            }
        }
        if (this.config.checkInterval) {
            if (!this.checkInterval) {
                this.adapter.log.debug(`start checker`);
                this.checkInterval = setInterval(() => this._checkHooks(), this.config.checkInterval);
            }
        }
        else {
            this.adapter.log.warn('No check interval set! The connections are valid forever.');
        }
    };
    getSubscribes = (urlHook, id_, type) => {
        const urlHash = node_crypto_1.default.createHash('md5').update(urlHook).digest('hex');
        if (this.subscribes[urlHash]) {
            return this.subscribes[urlHash][type].map(item => item.id);
        }
        return null;
    };
    unregisterSubscribe = async (urlHook, id, type, user) => {
        const urlHash = node_crypto_1.default.createHash('md5').update(urlHook).digest('hex');
        if (this.subscribes[urlHash]) {
            if (id) {
                let pos;
                do {
                    pos = this.subscribes[urlHash][type].findIndex(item => item.id === id);
                    if (pos !== -1) {
                        this.subscribes[urlHash][type].splice(pos, 1);
                        if (type === 'state') {
                            this.adapter.log.debug(`Unsubscribe from state "${id}"`);
                            await this.adapter.unsubscribeForeignStatesAsync(id, {
                                user: user || 'system.user.admin',
                                limitToOwnerRights: this.adapter.config.onlyAllowWhenUserIsOwner,
                            }); // allow unsubscribing always
                        }
                        else {
                            this.adapter.log.debug(`Unsubscribe from object "${id}"`);
                            await this.adapter.unsubscribeForeignObjectsAsync(id, {
                                user: user || 'system.user.admin',
                                limitToOwnerRights: this.adapter.config.onlyAllowWhenUserIsOwner,
                            }); // allow unsubscribing always
                        }
                    }
                    else {
                        break;
                    }
                } while (pos !== -1);
            }
            else {
                for (let i = 0; i < this.subscribes[urlHash][type].length; i++) {
                    if (type === 'state') {
                        await this.adapter.unsubscribeForeignStatesAsync(this.subscribes[urlHash][type][i].id, {
                            user: user || 'system.user.admin',
                            limitToOwnerRights: this.adapter.config.onlyAllowWhenUserIsOwner,
                        }); // allow unsubscribing always
                    }
                    else {
                        await this.adapter.unsubscribeForeignObjectsAsync(this.subscribes[urlHash][type][i].id, {
                            user: user || 'system.user.admin',
                            limitToOwnerRights: this.adapter.config.onlyAllowWhenUserIsOwner,
                        }); // allow unsubscribing always
                    }
                }
                this.subscribes[urlHash][type] = [];
            }
            if (!this.subscribes[urlHash].state.length && !this.subscribes[urlHash].object.length) {
                delete this.subscribes[urlHash];
                if (!Object.keys(this.subscribes).length) {
                    this.adapter.log.debug(`Stop checker`);
                    if (this.checkInterval) {
                        clearInterval(this.checkInterval);
                        this.checkInterval = null;
                    }
                }
            }
        }
    };
    stateChange = (id, state) => {
        if (state?.ack) {
            for (let t = this._waitFor.length - 1; t >= 0; t--) {
                if (this._waitFor[t].id === id) {
                    const task = this._waitFor[t];
                    this._waitFor.splice(t, 1);
                    if (!Object.keys(this.subscribes).find(url => this.subscribes[url].state.find(task => task.id === id))) {
                        this.adapter.unsubscribeForeignStates(id);
                    }
                    if (task.timer) {
                        this.adapter.clearTimeout(task.timer);
                        task.timer = undefined;
                    }
                    setImmediate((_task, _val) => {
                        _task.res.json({ ...state, id });
                    }, task, state);
                }
            }
        }
        Object.keys(this.subscribes).forEach(urlHash => {
            this.subscribes[urlHash].state.forEach(async (item) => {
                // check if id
                if ((!item.regEx && item.id === id) || item.regEx?.test(id)) {
                    if (state &&
                        state.val !== null &&
                        item.delta &&
                        item.val !== null &&
                        Math.abs(item.val - state.val) < item.delta) {
                        // ignore
                        this.adapter.log.debug(`State change for "${id}" ignored as delta (${item.val} - ${state.val}) is less than ${item.delta}`);
                        return;
                    }
                    if (state && item.onchange && !item.delta && item.val === state.val) {
                        // ignore
                        this.adapter.log.debug(`State change for "${id}" ignored as does not changed (${state.val})`);
                        return;
                    }
                    if (state && state.val !== null && (item.delta || item.onchange)) {
                        // remember last value
                        item.val = state.val;
                    }
                    await this.reportChange(this.subscribes[urlHash], { id, state });
                }
            });
        });
    };
    objectChange = (id, obj) => {
        Object.keys(this.subscribes).forEach(urlHash => {
            this.subscribes[urlHash].object.forEach(async (item) => {
                // check if id
                if ((!item.regEx && item.id === id) || item.regEx?.test(id)) {
                    await this.reportChange(this.subscribes[urlHash], { id, obj });
                }
            });
        });
    };
    // wait for ack=true
    _addTimeout = async (toAdd) => {
        const task = toAdd;
        this._waitFor.push(task);
        // if not already subscribed
        if (!Object.keys(this.subscribes).find(url => this.subscribes[url].state.find(t => t.id === task.id))) {
            await this.adapter.subscribeForeignStatesAsync(task.id);
        }
        task.timer = this.adapter.setTimeout(_task => {
            // remove this task from the list
            const pos = this._waitFor.indexOf(_task);
            if (pos !== -1) {
                this._waitFor.splice(pos, 1);
            }
            if (!Object.keys(this.subscribes).find(url => this.subscribes[url].state.find(t => t.id === task.id))) {
                this.adapter.unsubscribeForeignStates(task.id);
            }
            _task.res.status(501).json({ error: 'timeout', id: _task.id, val: _task.val });
        }, task.timeout, task);
    };
    async unload() {
        if (this.config.webInstance) {
            await this.adapter.setForeignStateAsync(`${this.namespace}.info.extension`, false, true);
        }
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        if (this.gcInterval) {
            clearInterval(this.gcInterval);
            this.gcInterval = null;
        }
        // send to all hooks, disconnect event
        const hooks = Object.keys(this.subscribes);
        for (let h = 0; h < hooks.length; h++) {
            await this.reportChange(this.subscribes[hooks[h]], { disconnect: true });
        }
        this.subscribes = {};
    }
    // deliver to web the link to Web interface
    welcomePage() {
        return {
            link: WEB_EXTENSION_PREFIX,
            name: 'REST-API',
            img: 'adapter/rest-api/rest-api.png',
            color: '#157c00',
            order: 10,
            pro: false,
        };
    }
    // Say to web instance to wait till this instance is initialized
    waitForReady(cb) {
        void this.readyPromise.then(() => cb?.());
    }
}
exports.default = SwaggerUI;
//# sourceMappingURL=rest-api.js.map