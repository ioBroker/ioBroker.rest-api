/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

const { EXIT_CODES, Adapter } = require('@iobroker/adapter-core'); // Get common adapter utils
const { WebServer, createOAuth2Server } = require('@iobroker/webserver');
const RestAPI = require('./lib/rest-api.js');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

class RestApiAdapter extends Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'rest-api',
            stateChange: (id, state) => this.webServer?.api?.stateChange(id, state),
            objectChange: (id, obj) => this.webServer?.api?.objectChange(id, obj),
            unload: (callback) => this.onUnload(callback),
            ready: ( )=> this.main(),
        });

        this.webServer = {
            app: null,
            server: null,
            api: null,
            io: null,
        };
    }

    onUnload = callback => {
        try {
            this.setState('info.connection', false, true);
            this.log.info(
                `terminating http${this.config.secure ? 's' : ''} server on port ${this.config.port}`,
            );
            if (this.webServer?.api) {
                this.webServer.api.unload().then(() => {
                    try {
                        if (this.webServer.server) {
                            this.webServer.server.close();
                            this.webServer.server = null;
                        }
                    } catch (error) {
                        // ignore
                        console.error('Cannot close server: ' + error);
                    }
                    this.webServer = null;
                    callback();
                });
            } else {
                if (this.webServer?.server) {
                    this.webServer.server.close();
                    this.webServer.server = null;
                }
                this.webServer = null;
                callback();
            }
        } catch (error) {
            console.error(`Cannot close server: ${error}`);
            callback();
        }
    }

    initWebServer() {
        this.config.port = parseInt(this.config.port, 10);

        this.webServer.api = new RestAPI(this.webServer.server, this.config, this, null, null, async app => {
            this.webServer.app = app;
            if (this.config.port) {
                if (this.config.secure && !this.config.certificates) {
                    return null;
                }

                try {
                    const webserver = new WebServer({
                        app,
                        adapter: this,
                        secure: this.config.secure,
                    });
                    this.webServer.server = await webserver.init();
                    if (this.config.auth) {
                        // Install OAuth2 handler
                        app.use(cookieParser());
                        app.use(bodyParser.urlencoded({ extended: true }));
                        app.use(bodyParser.json());

                        createOAuth2Server(this, {
                            app,
                            secure: this.config.secure,
                            accessLifetime: parseInt(this.config.ttl, 10) || 3600,
                        });
                    }
                } catch (err) {
                    this.log.error(`Cannot create webserver: ${err}`);
                    this.terminate ? this.terminate(1) : process.exit(1);
                    return;
                }
                this.webServer.server.__server = this.webServer;
            } else {
                this.log.error('port missing');
                process.exit(1);
            }

            if (this.webServer.server) {
                let serverListening = false;
                let serverPort = this.config.port;

                this.webServer.server.on('error', e => {
                    if (e.toString().includes('EACCES') && serverPort <= 1024) {
                        this.log.error(
                            `node.js process has no rights to start server on the port ${serverPort}.\n` +
                            `Do you know that on linux you need special permissions for ports under 1024?\n` +
                            `You can call in shell following scrip to allow it for node.js: "iobroker fix"`,
                        );
                    } else {
                        this.log.error(`Cannot start server on ${this.config.bind || '0.0.0.0'}:${serverPort}: ${e}`);
                    }
                    if (!serverListening) {
                        this.terminate ? this.terminate(1) : process.exit(1);
                    }
                });

                this.getPort(
                    this.config.port,
                    !this.config.bind || this.config.bind === '0.0.0.0' ? undefined : this.config.bind || undefined,
                    port => {
                        if (port !== this.config.port && !this.config.findNextPort) {
                            this.log.error(`port ${this.config.port} already in use`);
                            process.exit(1);
                        }
                        serverPort = port;

                        this.webServer.server.listen(
                            port,
                            !this.config.bind || this.config.bind === '0.0.0.0' ? undefined : this.config.bind || undefined,
                            async () => {
                                await this.setStateAsync('info.connection', true, true);
                                this.log.info(`http${this.config.secure ? 's' : ''} server listening on port ${port}`);
                                serverListening = true;
                            },
                        );
                    },
                );
            }
        });
    }

    main() {
        if (this.config.webInstance) {
            console.log('Adapter runs as a part of web service');
            this.log.warn('Adapter runs as a part of web service');
            this.setForeignState(`system.adapter.${this.namespace}.alive`, false, true, () =>
                setTimeout(() => process.exit(EXIT_CODES.ADAPTER_REQUESTED_TERMINATION), 1000),
            );
        } else {
            if (this.config.secure) {
                // Load certificates
                this.getCertificates((err, certificates, leConfig) => {
                    this.config.certificates = certificates;
                    this.config.leConfig = leConfig;
                    this.initWebServer();
                });
            } else {
                this.initWebServer();
            }
        }
    }
}

// If started as allInOne mode => return function to create instance
if (module.parent) {
    // Export the constructor in compact mode
    module.exports = options => new RestApiAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new RestApiAdapter())();
}
