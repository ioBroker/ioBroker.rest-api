import { EXIT_CODES, Adapter, type AdapterOptions } from '@iobroker/adapter-core'; // Get common adapter utils
import { WebServer, createOAuth2Server } from '@iobroker/webserver';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import express, { type Express, type Response } from 'express';
import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import RestAPI from './lib/rest-api';
import type { RestApiAdapterConfig } from './lib/types';

type Server = HttpServer | HttpsServer;

class RestApiAdapter extends Adapter {
    declare config: RestApiAdapterConfig;
    private readonly webServer: {
        api: RestAPI | null;
        server: Server | null;
        app: Express | null;
    };
    public WEB_EXTENSION_PREFIX: string = '';
    public _addTimeout:
        | ((task: { id: string; val: ioBroker.State; res: Response; timeout: number }) => Promise<void>)
        | null = null;

    public constructor(options: Partial<AdapterOptions> = {}) {
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

    onUnload(callback: () => void): void {
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
                    } catch (error) {
                        // ignore
                        console.error(`Cannot close server: ${error}`);
                    }
                    callback();
                });
            } else {
                if (this.webServer?.server) {
                    this.webServer.server.close();
                    this.webServer.server = null;
                }
                callback();
            }
        } catch (error) {
            console.error(`Cannot close server: ${error}`);
            callback();
        }
    }

    async initWebServer(): Promise<void> {
        this.config.port = parseInt(this.config.port as string, 10);

        this.webServer.app = express();

        this.webServer.api = new RestAPI(this.webServer.server!, this.config, this, null, this.webServer.app);

        if (this.config.port) {
            if (this.config.secure && !this.config.certificates) {
                return;
            }

            try {
                const webserver = new WebServer({
                    app: this.webServer.app,
                    adapter: this,
                    secure: this.config.secure,
                });

                this.webServer.server = await webserver.init();

                if (this.config.auth) {
                    // Install OAuth2 handler
                    this.webServer.app.use(cookieParser());
                    this.webServer.app.use(bodyParser.urlencoded({ extended: true }));
                    this.webServer.app.use(bodyParser.json());

                    createOAuth2Server(this, {
                        app: this.webServer.app,
                        secure: this.config.secure,
                        accessLifetime: parseInt(this.config.ttl as string, 10) || 3600,
                    });
                }
            } catch (err) {
                this.log.error(`Cannot create webserver: ${err}`);
                this.terminate ? this.terminate(1) : process.exit(1);
                return;
            }
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
                    if (port !== this.config.port) {
                        this.log.error(`port ${this.config.port} already in use`);
                        process.exit(1);
                    }
                    serverPort = port;

                    this.webServer.server!.listen(
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
    }

    main(): void {
        if (this.config.webInstance) {
            console.log('Adapter runs as a part of web service');
            this.log.warn('Adapter runs as a part of web service');
            this.setForeignState(`system.adapter.${this.namespace}.alive`, false, true, () =>
                setTimeout(() => process.exit(EXIT_CODES.ADAPTER_REQUESTED_TERMINATION), 1000),
            );
        } else {
            if (this.config.secure) {
                // Load certificates
                this.getCertificates(
                    undefined,
                    undefined,
                    undefined,
                    (
                        err: Error | null | undefined,
                        certificates: ioBroker.Certificates | undefined,
                        leConfig: boolean | undefined,
                    ): void => {
                        this.config.certificates = certificates;
                        this.config.leConfig = leConfig;
                        void this.initWebServer();
                    },
                );
            } else {
                void this.initWebServer();
            }
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new RestApiAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new RestApiAdapter())();
}
