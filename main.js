/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

const utils       = require('@iobroker/adapter-core'); // Get common adapter utils
const RestAPI     = require('./lib/rest-api.js');
const LE          = require(utils.controllerDir + '/lib/letsencrypt.js');
const adapterName = require('./package.json').name.split('.').pop();

let webServer = null;
let adapter;

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
        name: adapterName,
        stateChange: (id, state) => {
            webServer && webServer.api && webServer.api.stateChange(id, state);
        },
        objectChange: (id, obj) => webServer && webServer.api && webServer.api.objectChange(id, obj),
        unload: callback => {
            try {
                adapter.setState('info.connection', false, true);
                adapter.log.info(`terminating http${adapter.config.secure ? 's' : ''} server on port ${adapter.config.port}`);
                if (webServer && webServer.api) {
                    webServer.api.unload()
                        .then(() => {
                            try {
                                if (webServer.server) {
                                    webServer.server.close();
                                    webServer.server = null;
                                }
                            } catch (error) {
                                // ignore
                                console.error('Cannot close server: ' + error);
                            }
                            webServer = null;
                            callback();
                        });
                } else {
                    if (webServer && webServer.server) {
                        webServer.server.close();
                        webServer.server = null;
                    }
                    webServer = null;
                    callback();
                }
            } catch (error) {
                console.error('Cannot close server: ' + error);
                callback();
            }
        },
        ready: main
    });

    adapter = new utils.Adapter(options);

    return adapter;
}

function main() {
    if (adapter.config.webInstance) {
        console.log('Adapter runs as a part of web service');
        adapter.log.warn('Adapter runs as a part of web service');
        adapter.setForeignState(`system.adapter.${adapter.namespace}.alive`, false, true, () =>
            setTimeout(() => process.exit(utils.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION), 1000));
    } else {
        if (adapter.config.secure) {
            // Load certificates
            adapter.getCertificates((err, certificates, leConfig) => {
                adapter.config.certificates = certificates;
                adapter.config.leConfig     = leConfig;
                initWebServer(adapter.config, server =>
                    webServer = server);
            });
        } else {
            initWebServer(adapter.config, server =>
                webServer = server);
        }
    }
}

//settings: {
//    "port":   8080,
//    "auth":   false,
//    "secure": false,
//    "bind":   "0.0.0.0", // "::"
//    "cache":  false
//}
function initWebServer(settings, callback) {
    settings.port = parseInt(settings.port, 10);

    const server = {
        app:    null,
        server: null,
        api:    null,
        io:     null,
        settings
    };

    server.api = new RestAPI(server.server, settings, adapter, null, null, async app => {
        if (settings.port) {
            if (settings.secure && !adapter.config.certificates) {
                return null;
            }

            try {
                server.server = await LE.createServerAsync(app, settings, adapter.config.certificates, adapter.config.leConfig, adapter.log);
            } catch (err) {
                adapter.log.error(`Cannot create webserver: ${err}`);
                adapter.terminate ? adapter.terminate(1) : process.exit(1);
                return;
            }
            server.server.__server = server;
        } else {
            adapter.log.error('port missing');
            process.exit(1);
        }

        if (server.server) {
            let serverListening = false;
            let serverPort = settings.port;

            server.server.on('error', e => {
                if (e.toString().includes('EACCES') && serverPort <= 1024) {
                    adapter.log.error(`node.js process has no rights to start server on the port ${serverPort}.\n` +
                        `Do you know that on linux you need special permissions for ports under 1024?\n` +
                        `You can call in shell following scrip to allow it for node.js: "iobroker fix"`
                    );
                } else {
                    adapter.log.error(`Cannot start server on ${settings.bind || '0.0.0.0'}:${serverPort}: ${e}`);
                }
                if (!serverListening) {
                    callback && callback(server);
                    adapter.terminate ? adapter.terminate(1) : process.exit(1);
                }
            });

            adapter.getPort(settings.port, port => {
                if (port !== settings.port && !adapter.config.findNextPort) {
                    adapter.log.error(`port ${settings.port} already in use`);
                    process.exit(1);
                }
                serverPort = port;

                server.server.listen(port, async () => {
                    await adapter.setStateAsync('info.connection', true, true);
                    adapter.log.info(`http${settings.secure ? 's' : ''} server listening on port ${port}`);
                    serverListening = true
                });
                callback && callback(server);
                callback = null;
            });
        } else if (callback) {
            callback(server);
            callback = null;
        }
    });
}

// If started as allInOne mode => return function to create instance
if (module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
