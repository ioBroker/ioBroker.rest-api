class LongPolling {
    // options =
    // {
    //    onConnection
    //    onError
    //    onEvent
    //    reconnectInterval
    //    pollingInterval
    // }
    constructor(host, options) {
        // host is http://ip:port/
        if (host[host.length - 1] !== '/') {
            host += '/';
        }
        this.options = options || {};
        this.options.reconnectInterval = parseInt(this.options.reconnectInterval, 10) || 5000;
        this.options.pollingInterval = parseInt(this.options.pollingInterval, 10) || 15000;
        this.host = host;
        this.isConnected = false;
        this.terminate = false;
        this.connecTimeout = null;
        if (this.options.autoConnect) {
            setTimeout(() => this.connect(), 50);
        }
    }

    _sendConnectedEvent(isConnected) {
        if (isConnected !== this.isConnected) {
            this.isConnected = isConnected;
            this.options.onConnection && this.options.onConnection(this.isConnected);
        }
    }

    _longPolling(isStart) {
        fetch(`${this.host}v1/polling?${isStart ? `check=true&timeout=${this.options.pollingInterval}` : ''}`)
            .then(response => response.text())
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
                    }
                }

                if (!this.terminate) {
                    this._longPolling();
                }
            })
            .catch(error => {
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
            })
    }

    getState(id) {
        return fetch(`${IOBROKER_SWAGGER}v1/state/${id}`)
            .then(response => response.json())
    }

    getObject(id) {
        return fetch(`${IOBROKER_SWAGGER}v1/object/${id}`)
            .then(response => response.json())
    }

    subscribeState(id) {
        return fetch(`${IOBROKER_SWAGGER}v1/state/${id}/subscribe?method=polling`)
            .then(response => response.json());
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
