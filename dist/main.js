"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const adapter_core_1 = require("@iobroker/adapter-core"); // Get common adapter utils
const webserver_1 = require("@iobroker/webserver");
const body_parser_1 = __importDefault(require("body-parser"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_1 = __importDefault(require("express"));
const rest_api_1 = __importDefault(require("./lib/rest-api"));
class RestApiAdapter extends adapter_core_1.Adapter {
    webServer;
    WEB_EXTENSION_PREFIX = '';
    _addTimeout = null;
    constructor(options = {}) {
        super({
            ...options,
            name: 'rest-api',
            stateChange: (id, state) => this.webServer?.api?.stateChange(id, state),
            objectChange: (id, obj) => this.webServer?.api?.objectChange(id, obj),
            unload: callback => this.onUnload(callback),
            ready: () => this.main(),
        });
        this.webServer = {
            app: null,
            server: null,
            api: null,
        };
    }
    onUnload(callback) {
        try {
            void this.setState('info.connection', false, true);
            this.log.info(`terminating http${this.config.secure ? 's' : ''} server on port ${this.config.port}`);
            if (this.webServer?.api) {
                void this.webServer.api.unload().then(() => {
                    try {
                        if (this.webServer.server) {
                            this.webServer.server.close();
                            this.webServer.server = null;
                        }
                    }
                    catch (error) {
                        // ignore
                        console.error(`Cannot close server: ${error}`);
                    }
                    callback();
                });
            }
            else {
                if (this.webServer?.server) {
                    this.webServer.server.close();
                    this.webServer.server = null;
                }
                callback();
            }
        }
        catch (error) {
            console.error(`Cannot close server: ${error}`);
            callback();
        }
    }
    async initWebServer() {
        this.config.port = parseInt(this.config.port, 10);
        this.webServer.app = (0, express_1.default)();
        this.webServer.api = new rest_api_1.default(this.webServer.server, this.config, this, null, this.webServer.app);
        if (this.config.port) {
            if (this.config.secure && !this.config.certificates) {
                return;
            }
            try {
                const webserver = new webserver_1.WebServer({
                    app: this.webServer.app,
                    adapter: this,
                    secure: this.config.secure,
                });
                this.webServer.server = await webserver.init();
                if (this.config.auth) {
                    // Install OAuth2 handler
                    this.webServer.app.use((0, cookie_parser_1.default)());
                    this.webServer.app.use(body_parser_1.default.urlencoded({ extended: true }));
                    this.webServer.app.use(body_parser_1.default.json());
                    (0, webserver_1.createOAuth2Server)(this, {
                        app: this.webServer.app,
                        secure: this.config.secure,
                        accessLifetime: parseInt(this.config.ttl, 10) || 3600,
                    });
                }
            }
            catch (err) {
                this.log.error(`Cannot create webserver: ${err}`);
                this.terminate ? this.terminate(1) : process.exit(1);
                return;
            }
        }
        else {
            this.log.error('port missing');
            process.exit(1);
        }
        if (this.webServer.server) {
            let serverListening = false;
            let serverPort = this.config.port;
            this.webServer.server.on('error', e => {
                if (e.toString().includes('EACCES') && serverPort <= 1024) {
                    this.log.error(`node.js process has no rights to start server on the port ${serverPort}.\n` +
                        `Do you know that on linux you need special permissions for ports under 1024?\n` +
                        `You can call in shell following scrip to allow it for node.js: "iobroker fix"`);
                }
                else {
                    this.log.error(`Cannot start server on ${this.config.bind || '0.0.0.0'}:${serverPort}: ${e}`);
                }
                if (!serverListening) {
                    this.terminate ? this.terminate(1) : process.exit(1);
                }
            });
            this.getPort(this.config.port, !this.config.bind || this.config.bind === '0.0.0.0' ? undefined : this.config.bind || undefined, port => {
                if (port !== this.config.port) {
                    this.log.error(`port ${this.config.port} already in use`);
                    process.exit(1);
                }
                serverPort = port;
                this.webServer.server.listen(port, !this.config.bind || this.config.bind === '0.0.0.0' ? undefined : this.config.bind || undefined, async () => {
                    await this.setStateAsync('info.connection', true, true);
                    this.log.info(`http${this.config.secure ? 's' : ''} server listening on port ${port}`);
                    serverListening = true;
                });
            });
        }
    }
    main() {
        if (this.config.webInstance) {
            console.log('Adapter runs as a part of web service');
            this.log.warn('Adapter runs as a part of web service');
            this.setForeignState(`system.adapter.${this.namespace}.alive`, false, true, () => setTimeout(() => process.exit(adapter_core_1.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION), 1000));
        }
        else {
            if (this.config.secure) {
                // Load certificates
                this.getCertificates(undefined, undefined, undefined, (err, certificates, leConfig) => {
                    this.config.certificates = certificates;
                    this.config.leConfig = leConfig;
                    void this.initWebServer();
                });
            }
            else {
                void this.initWebServer();
            }
        }
    }
}
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new RestApiAdapter(options);
}
else {
    // otherwise start the instance directly
    (() => new RestApiAdapter())();
}
//# sourceMappingURL=main.js.map