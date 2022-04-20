class LongPolling {
    // options =
    // {
    //    onConnection - called on connection change
    //    onError - called if some error occurs
    //    onEvent - called if some event received
    //    onConnectionAttempt - called when class tries to connect
    //    reconnectInterval - default 5000 ms. Class will try every 5 seconds to establish connection
    //    pollingInterval - default 30000 ms. Duration of each long polling request. After 30 seconds the request will be terminated by server and client must make a new request.
    // }
    constructor(host, options) {
        // host is http://ip:port/
        if (host[host.length - 1] !== '/') {
            host += '/';
        }
        this.options = options || {};
        this.options.reconnectInterval = parseInt(this.options.reconnectInterval, 10) || 5000;
        this.options.pollingInterval = parseInt(this.options.pollingInterval, 10) || 30000;
        this.host = host;
        this.isConnected = false;
        this.terminate = false;
        this.connecTimeout = null;
        this.subscriptions = {
            objects: {},
            states: {}
        };
        this.sid = Date.now() + '_' + Math.round(Math.random() * 10000);
        if (this.options.autoConnect) {
            setTimeout(() => this.connect(), 50);
        }
    }

    _sendConnectedEvent(isConnected) {
        if (isConnected !== this.isConnected) {
            this.isConnected = isConnected;
            if (this.isConnected) {
                // subscribe on all
                setTimeout(() => {
                    Object.keys(this.subscriptions.objects).forEach(id =>
                        fetch(`${IOBROKER_SWAGGER}v1/object/${id}/subscribe?sid=${this.sid}&method=polling`)
                            .then(response => response.json())
                            .catch(error => console.error('Cannot resubscribe: ' + error)));
                    Object.keys(this.subscriptions.states).forEach(id =>
                        fetch(`${IOBROKER_SWAGGER}v1/state/${id}/subscribe?sid=${this.sid}&method=polling`)
                            .then(response => response.json())
                            .catch(error => console.error('Cannot resubscribe: ' + error)));
                }, 0);
            }

            this.options.onConnection && this.options.onConnection(this.isConnected);
        }
    }

    _longPolling(isStart) {
        if (isStart) {
            this.sid = Date.now() + '_' + Math.round(Math.random() * 10000);
            // in real to the reconnect interval will be added the timeout for fetch which depends on browser.
            this.options.onConnectionAttempt && this.options.onConnectionAttempt(this.options.reconnectInterval);
        }
        const controller = new AbortController()
        let timeoutId = setTimeout(() => controller.abort(), this.options.pollingInterval + 1000);

        fetch(`${this.host}v1/polling?sid=${this.sid}${isStart ? `&check=true&timeout=${this.options.pollingInterval}` : ''}`, {
            signal: controller.signal
        })
            .then(response => {
                timeoutId && clearTimeout(timeoutId);
                timeoutId = null;
                return response.text();
            })
            .then(data => {
                if (data) {
                    if (isStart && data === '_') {
                        this._sendConnectedEvent(true);
                    } else {
                        try {
                            data = JSON.parse(data);
                        } catch (error) {
                            console.error('Cannot parse answer: ' + data);
                            this.options.onError && this.options.onError(error);
                            return;
                        }

                        if (data.disconnect) {
                            this._sendConnectedEvent(false);

                            if (!this.terminate) {
                                this.connecTimeout = setTimeout(() => {
                                    this.connecTimeout = null;
                                    this._longPolling(true);
                                }, this.options.reconnectInterval);
                            }
                            return;
                        }
                        this._sendConnectedEvent(true);
                        this.options.onEvent && this.options.onEvent(data);
                        if (data.id && data.state) {
                            if (this.subscriptions.states[data.id]) {
                                setTimeout(() => {
                                    this.subscriptions.states[data.id].forEach(cb => {
                                        try {
                                            cb(data.id, data.state);
                                        } catch (error) {
                                            console.log('Cannot call handler: ' + error);
                                        }
                                    });
                                })
                            }
                        } else if (data.id && data.obj) {
                            if (this.subscriptions.objects[data.id]) {
                                setTimeout(() => {
                                    this.subscriptions.objects[data.id].forEach(cb => {
                                        try {
                                            cb(data.id, data.obj);
                                        } catch (error) {
                                            console.log('Cannot call handler: ' + error);
                                        }
                                    });
                                })
                            }
                        } else if (data.id) {
                            // state and object where deleted
                            if (this.subscriptions.objects[data.id]) {
                                setTimeout(() => {
                                    this.subscriptions.objects[data.id].forEach(cb => {
                                        try {
                                            cb(data.id);
                                        } catch (error) {
                                            console.log('Cannot call handler: ' + error);
                                        }
                                    });
                                })
                            } else if (this.subscriptions.state[data.id]) {
                                setTimeout(() => {
                                    this.subscriptions.state[data.id].forEach(cb => {
                                        try {
                                            cb(data.id);
                                        } catch (error) {
                                            console.log('Cannot call handler: ' + error);
                                        }
                                    });
                                })
                            }
                        }
                    }
                }

                if (!this.terminate) {
                    this._longPolling();
                }
            })
            .catch(error => {
                timeoutId && clearTimeout(timeoutId);
                timeoutId = null;
                if (this.isConnected) {
                    console.error('Disconnected: ' + error);
                }

                this._sendConnectedEvent(false);

                if (!this.terminate) {
                    this.connecTimeout = this.connecTimeout || setTimeout(() => {
                        this.connecTimeout = null;
                        this._longPolling(true);
                    }, this.options.reconnectInterval);
                }
            });
    }

    getState(id) {
        return fetch(`${IOBROKER_SWAGGER}v1/state/${id}`)
            .then(response => response.json())
    }

    getObject(id) {
        return fetch(`${IOBROKER_SWAGGER}v1/object/${id}`)
            .then(response => response.json())
    }

    subscribeState(id, cb) {
        if (!this.subscriptions.states[id]) {
            this.subscriptions.states[id] = [];
            this.subscriptions.states[id].push(cb);
            return fetch(`${IOBROKER_SWAGGER}v1/state/${id}/subscribe?sid=${this.sid}&method=polling`)
                .then(response => response.json());
        } else {
            this.subscriptions.states[id].push(cb);
            return Promise.resolve();
        }
    }

    subscribeStates(pattern, cb) {
        if (!this.subscriptions.states[pattern]) {
            this.subscriptions.states[pattern] = [];
            this.subscriptions.states[pattern].push(cb);
            return fetch(`${IOBROKER_SWAGGER}v1/states/subscribe?sid=${this.sid}&method=polling`, {
                method: 'POST',
                cache: 'no-cache',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({method: 'polling', pattern})
            })
                .then(response => response.json());
        } else {
            this.subscriptions.states[pattern].push(cb);
            return Promise.resolve();
        }
    }

    unsubscribeStates(pattern, cb) {
        if (this.subscriptions.states[pattern]) {
            if (cb) {
                const pos = this.subscriptions.states[pattern].indexOf(cb);
                if (pos !== -1) {
                    this.subscriptions.states[pattern].splice(pos, 1);
                }
            } else {
                delete this.subscriptions.states[pattern];
            }

            if (!this.subscriptions.states[pattern] || !this.subscriptions.states[pattern].length) {
                if (this.subscriptions.states[pattern] && !this.subscriptions.states[pattern].length) {
                    delete this.subscriptions.states[pattern];
                }
                return fetch(`${IOBROKER_SWAGGER}v1/states/unsubscribe?sid=${this.sid}`, {
                    method: 'POST',
                    cache: 'no-cache',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({method: 'polling', pattern})
                })
                    .then(response => response.json());
            }
        } else {
            return Promise.resolve();
        }
    }

    unsubscribeState(id, cb) {
        if (this.subscriptions.states[id]) {
            if (cb) {
                const pos = this.subscriptions.states[id].indexOf(cb);
                if (pos !== -1) {
                    this.subscriptions.states[id].splice(pos, 1);
                }
            } else {
                delete this.subscriptions.states[id];
            }

            if (!this.subscriptions.states[id] || !this.subscriptions.states[id].length) {
                if (this.subscriptions.states[id] && !this.subscriptions.states[id].length) {
                    delete this.subscriptions.states[id];
                }
                return fetch(`${IOBROKER_SWAGGER}v1/state/${id}/unsubscribe?sid=${this.sid}&method=polling`)
                    .then(response => response.json());
            }
        } else {
            return Promise.resolve();
        }
    }

    subscribeObject(id, cb) {
        if (!this.subscriptions.objects[id]) {
            this.subscriptions.objects[id] = [];
            this.subscriptions.objects[id].push(cb);
            return fetch(`${IOBROKER_SWAGGER}v1/object/${id}/subscribe?sid=${this.sid}&method=polling`)
                .then(response => response.json());
        } else {
            this.subscriptions.objects[id].push(cb);
            return Promise.resolve();
        }
    }

    unsubscribeObject(id, cb) {
        if (this.subscriptions.objects[id]) {
            if (cb) {
                const pos = this.subscriptions.objects[id].indexOf(cb);
                if (pos !== -1) {
                    this.subscriptions.objects[id].splice(pos, 1);
                }
            } else {
                delete this.subscriptions.objects[id];
            }

            if (!this.subscriptions.objects[id] || !this.subscriptions.objects[id].length) {
                if (this.subscriptions.objects[id] && !this.subscriptions.objects[id].length) {
                    delete this.subscriptions.objects[id];
                }
                return fetch(`${IOBROKER_SWAGGER}v1/object/${id}/unsubscribe?sid=${this.sid}&method=polling`)
                    .then(response => response.json());
            }
        } else {
            return Promise.resolve();
        }
    }

    connect() {
        this.terminate = false;
        if (!this.connecTimeout) {
            this._longPolling(true);
        }
    }

    close() {
        this.connecTimeout && clearTimeout(this.connecTimeout);
        this.connecTimeout = null;
        this.terminate = true;
    }
}
