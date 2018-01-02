/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

var utils     = require(__dirname + '/lib/utils'); // Get common adapter utils
var SwaggerUI = require(__dirname + '/lib/swagger-ui.js');
var LE        = require(utils.controllerDir + '/lib/letsencrypt.js');

var webServer = null;

var adapter = utils.Adapter({
    name: 'swagger',
    stateChange: function (id, state) {
        if (webServer && webServer.api) {
            webServer.api.stateChange(id, state);
        }
    },
    objectChange: function (id, obj) {
        if (webServer && webServer.api) {
            webServer.api.objectChange(id, obj);
        }
    },
    unload: function (callback) {
        try {
            adapter.log.info('terminating http' + (webServer.settings.secure ? 's' : '') + ' server on port ' + webServer.settings.port);
            if (webServer) {
                webServer.close();
                webServer = null;
            }

            callback();
        } catch (e) {
            callback();
        }
    },
    ready: function () {
        main();
    }
});

function main() {
    if (adapter.config.webInstance) {
        console.log('Adapter runs as a part of web service');
        adapter.log.warn('Adapter runs as a part of web service');
        adapter.setForeignState('system.adapter.' + adapter.namespace + '.alive', false, true, function () {
            setTimeout(function () {
                process.exit();
            }, 1000);
        });
        return;
    }

    if (adapter.config.secure) {
        // subscribe on changes of permissions
        adapter.subscribeForeignObjects('system.group.*');
        adapter.subscribeForeignObjects('system.user.*');

        // Load certificates
        adapter.getCertificates(function (err, certificates, leConfig) {
            adapter.config.certificates = certificates;
            adapter.config.leConfig     = leConfig;
            initWebServer(adapter.config, function (server) {
                webServer = server;
            });
        });
    } else {
        initWebServer(adapter.config, function (server) {
            webServer = server;
        });
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

    var server = {
        app:       null,
        server:    null,
        api:       null,
        io:        null,
        settings:  settings
    };

    server.api = new SwaggerUI(server.server, settings, adapter, function (app) {
        if (settings.port) {
            if (settings.secure && !adapter.config.certificates) return null;

            server.server = LE.createServer(app, settings, adapter.config.certificates, adapter.config.leConfig, adapter.log);
            server.server.__server = server;
        } else {
            adapter.log.error('port missing');
            process.exit(1);
        }

        if (server.server) {
            adapter.getPort(settings.port, function (port) {
                if (port !== settings.port && !adapter.config.findNextPort) {
                    adapter.log.error('port ' + settings.port + ' already in use');
                    process.exit(1);
                }
                server.server.listen(port);
                adapter.log.info('http' + (settings.secure ? 's' : '') + ' server listening on port ' + port);
                if (callback) {
                    callback(server ? server.server : null)
                }
            });
        } else if (callback) {
            callback(server ? server.server : null)
        }
    });
}
