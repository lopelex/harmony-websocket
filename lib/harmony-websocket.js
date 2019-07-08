const EventEmitter = require('events');
const request = require('request-promise');
const WebSocketClient = require('websocket').w3cwebsocket;
const WebSocketAsPromised = require('websocket-as-promised');
const url = require('url');

DEFAULT_HUB_PORT = 8088;

HUB_CONNECT_TIMEOUT = 10000;
HUB_SEND_TIMEOUT = 30000;

class Harmony extends EventEmitter {

    constructor() {

        super();
        this._remoteId = null;
        this._domain = null;
        this._client = null;
        this._interval = null;
        this._connectTimeout = HUB_CONNECT_TIMEOUT;
        this._sendTimeout = HUB_SEND_TIMEOUT;
    }

    set connectTimeout(timeout) {

        this._connectTimeout = timeout;
    }

    set sendTimeout(timeout) {

        this._sendTimeout = timeout;
    }

    connect(ip) {

        return this._getRemoteId(ip)
            .then(data => {
                this._remoteId = data.data.activeRemoteId;
                this._domain = url.parse(
                    data.data.discoveryServer
                ).hostname;
            })
            .then(() => this._connect(ip))
    }

    isOpened() {

        return (this._client) ? this._client.isOpened : false;
    }

    end() {

        return this.isOpened() ? this._client.close() : false;
    }

    _getRemoteId(ip) {

        const hubUrl = `http://${ip}:${DEFAULT_HUB_PORT}/`;

        const headers = {
            Origin: 'http://sl.dhg.myharmony.com',
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Accept-Charset': 'utf-8'
        };

        const jsonBody = {
            id: 1,
            cmd: 'setup.account?getProvisionInfo',
            params: {}
        };

        const payload = {
            url: hubUrl,
            method: 'POST',
            timeout: this._connectTimeout,
            headers: headers,
            json: true,
            body: jsonBody
        };

        return request(payload);
    }

    _connect(ip) {

        const url = `ws://${ip}:${DEFAULT_HUB_PORT}/?domain=${this._domain}&hubId=${this._remoteId}`;

        this._client = new WebSocketAsPromised(url, {
            createWebSocket: url => new WebSocketClient(url),
            packMessage: data => JSON.stringify(data),
            unpackMessage: message => JSON.parse(message),
            attachRequestId: (data, requestId) => {
                data.hbus.id = requestId;
                return data;
            },
            extractRequestId: data => data && data.id,
            connectionTimeout: this._connectTimeout,
            timeout: this._timeout
        });

        this._client.onClose.addListener(() => {
            clearInterval(this._interval);
            this.emit('close');
        });

        this._client.onOpen.addListener(() => {
            clearInterval(this._interval);
            this._heartbeat();
            this.emit('open');
        });

        var payload = {
            hubId: this._remoteId,
            timeout: 30,
            hbus: {
                cmd: 'vnd.logitech.connect/vnd.logitech.statedigest?get',
                id: 0,
                params: {
                    verb: 'get',
                    format: 'json'
                }
            }
        };

        return this._client.open()
            .then(() => this._client.onUnpackedMessage.addListener(this._onMessage.bind(this)))
            .then(() => this._client.sendPacked(payload))
    }

    _heartbeat() {

        // timeout = 60s
        this._interval = setInterval(() => {
            try {
                this._client.send('');
            } catch (e) {
                clearInterval(this._interval);
                this.emit('close');
            }
        }, 50000);
    }

    _onMessage(message) {

        if (message.type === 'connect.stateDigest?notify') {
            this.emit('stateDigest', message);
        } else if (message.type === 'automation.state?notify') {
            this.emit('automationState', message);
        }
    }

    getConfig() {

        var payload = {
            hubId: this._remoteId,
            timeout: 30,
            hbus: {
                cmd: 'vnd.logitech.harmony/vnd.logitech.harmony.engine?config',
                id: 0,
                params: {
                    verb: 'get',
                    format: 'json'
                }
            }
        };

        return this._client.open()
            .then(() => this._client.sendRequest(payload));
    }

    getActivities() {

        return this.getConfig()
            .then(response => {
                return response.data.activity.map(action => {
                    return {
                        id: action.id,
                        label: action.label
                    }
                });
            });
    }

    getCurrentActivity() {

        var payload = {
            hubId: this._remoteId,
            timeout: 30,
            hbus: {
                cmd: 'vnd.logitech.harmony/vnd.logitech.harmony.engine?getCurrentActivity',
                id: 0,
                params: {
                    verb: 'get',
                    format: 'json'
                }
            }
        };

        return this._client.open()
            .then(() => this._client.sendRequest(payload))
            .then(response => response.data.result);
    }

    startActivity(activityId) {

        var payload = {
            hubId: this._remoteId,
            timeout: 30,
            hbus: {
                cmd: 'harmony.activityengine?runactivity',
                id: 0,
                params: {
                    async: 'true',
                    timestamp: 0,
                    args: {
                        rule: 'start'
                    },
                    activityId: activityId
                }
            }
        };

        return this._client.open()
            .then(() => this._client.sendRequest(payload))
            .then(response => response);
    }

    getActivityCommands(activityId) {

        return this.getConfig()
            .then(response => {
                var activity = response.data.activity
                    .filter(act => {
                        return act.id === activityId
                    })
                    .pop();
                return activity.controlGroup
                    .map(group => {
                        return group.function
                    })
                    .reduce((prev, curr) => {
                        return prev.concat(curr)
                    })
                    .map(fn => {
                        return {
                            action: JSON.parse(fn.action),
                            label: fn.label
                        }
                    });
            });
    }

    getDevices() {

        return this.getConfig()
            .then(response => {
                return response.data.device
                    .filter(device => {
                        return device.controlGroup.length > 0
                    })
                    .map(device => {
                        return {
                            id: device.id,
                            label: device.label
                        }
                    });
            });
    }

    getDeviceCommands(deviceId) {

        return this.getConfig()
            .then(response => {
                var device = response.data.device
                    .filter(device => {
                        return device.id === deviceId
                    })
                    .pop();
                return device.controlGroup
                    .map(group => {
                        return group.function
                    })
                    .reduce((prev, curr) => {
                        return prev.concat(curr)
                    })
                    .map(fn => {
                        return {
                            action: JSON.parse(fn.action),
                            label: fn.label
                        }
                    });
            });
    }

    getAutomationCommands() {

        var payload = {
            hubId: this._remoteId,
            timeout: 30,
            hbus: {
                cmd: 'harmony.automation?getstate',
                id: 0,
                params: {
                    verb: 'get',
                    format: 'json'
                }
            }
        };

        return this._client.open()
            .then(() => this._client.sendRequest(payload));
    }

    /**
     * @deprecated use sendCommandWithDelay(action, hold)
     */
    sendCommandsWithDelay(action, hold) {

        return this.sendCommandWithDelay(action, hold);
    }

    sendCommandWithDelay(action, hold) {

        var payload = {
            hubId: this._remoteId,
            timeout: 30,
            hbus: {
                cmd: 'vnd.logitech.harmony/vnd.logitech.harmony.engine?holdAction',
                id: 0,
                params: {
                    status: 'press',
                    timestamp: '0',
                    verb: 'render',
                    action: action
                }
            }
        };

        return this._client.open()
            .then(() => {
                this._client.sendPacked(payload);
            })
            .then(() => {
                payload.hbus.params.status = 'release';
                payload.hbus.params.timestamp = hold.toString();
            })
            .then(() => {
                this._client.sendPacked(payload);
            })
            .then(() => Promise.resolve({
                cmd: payload.hbus.cmd,
                code: 200,
                id: payload.hbus.id,
                msg: 'OK'
            }));
    }

    /**
     * @deprecated use sendCommand(action)
     */
    sendCommands(action) {

        return this.sendCommand(action);
    }

    sendCommand(action) {

        var payload = {
            hubId: this._remoteId,
            timeout: 30,
            hbus: {
                cmd: 'vnd.logitech.harmony/vnd.logitech.harmony.engine?holdAction',
                id: 0,
                params: {
                    status: 'pressrelease',
                    timestamp: '0',
                    verb: 'render',
                    action: action
                }
            }
        };

        return this._client.open()
            .then(() => this._client.sendRequest(payload));
    }

    sendAutomationCommand(action) {

        var payload = {
            hubId: this._remoteId,
            timeout: 30,
            hbus: {
                cmd: 'harmony.automation?setstate',
                id: 0,
                params: {
                    state: {}
                }
            }
        };

        Object.assign(payload.hbus.params.state, action);

        return this._client.open()
            .then(() => this._client.sendRequest(payload));
    }
}

module.exports = Harmony;
