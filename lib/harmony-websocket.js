const EventEmitter = require('events');
const request = require('request-promise');
const WebSocketClient = require('websocket').w3cwebsocket;
const WebSocketAsPromised = require('websocket-as-promised');

class Harmony extends EventEmitter {

    constructor() {

        super();
        this._remoteId = null;
        this._client = null;
        this._interval = null;
    }

    connect(ip) {

        return this._getRemoteId(ip)
            .then(data => this._remoteId = data.data.remoteId)
            .then(() => this._connect(ip))
    }

    end() {

        return this._client.close();
    }

    _getRemoteId(ip) {

        const payload = {
            url: 'http://' + ip + ':8088',
            method: 'POST',
            timeout: 5000,
            headers: {
                'Content-type': 'application/json',
                Accept: 'text/plain',
                Origin: 'http//:localhost.nebula.myharmony.com'
            },
            json: true,
            body: {
                id: 0,
                cmd: 'connect.discoveryinfo?get',
                params: {}
            }
        };
        return request(payload);
    }

    _connect(ip) {

        var url = 'ws://' + ip + ':8088/?domain=svcs.myharmony.com&hubId=' + this._remoteId;

        this._client = new WebSocketAsPromised(url, {
            createWebSocket: url => new WebSocketClient(url),
            packMessage: data => JSON.stringify(data),
            unpackMessage: message => JSON.parse(message),
            attachRequestId: (data, requestId) => {
                data.hbus.id = requestId;
                return data;
            },
            extractRequestId: data => data && data.id
        });

        this._client.onClose.addListener(() => {
            clearInterval(this._interval);
            this.emit('close');
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
            .then(() => this._heartbeat())
            .then(() => this._client.onUnpackedMessage.addListener(this._onMessage.bind(this)))
            .then(() => this._client.sendPacked(payload))
            .then(() => this.emit('open'));
    }

    _heartbeat() {

        // timeout = 60s
        // vnd.logitech.connect/vnd.logitech.pingvnd.logitech.ping => currentActivity
        this._interval = setInterval(() => this._client.send(''), 55000);
    }

    _onMessage(message) {

        if (message.type === 'connect.stateDigest?notify') {
            this.emit('stateDigest', message);
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
        return this._client.sendRequest(payload);
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
        return this._client.sendRequest(payload)
            .then(response => {
                return response.data.result;
            });
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
        return this._client.sendRequest(payload)
            .then(response => response);
    }

    getActivityCommands(activityId) {

        return this.getConfig()
            .then(response => {
                var activity = response.data.activity
                    .filter(function(act) {
                        return act.id === activityId
                    })
                    .pop();
                return activity.controlGroup
                    .map(function(group) {
                        return group.function
                    })
                    .reduce(function(prev, curr) {
                        return prev.concat(curr)
                    })
                    .map(function(fn) {
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
                    .filter(function(device) {
                        return device.controlGroup.length > 0
                    })
                    .map(function(device) {
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
                    .filter(function(device) {
                        return device.id === deviceId
                    })
                    .pop();
                return device.controlGroup
                    .map(function(group) {
                        return group.function
                    })
                    .reduce(function(prev, curr) {
                        return prev.concat(curr)
                    })
                    .map(function(fn) {
                        return {
                            action: JSON.parse(fn.action),
                            label: fn.label
                        }
                    });
            });
    }


    sendCommands(action, delay) {

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
        return this._client.sendRequest(payload)
            .then(response => {
                payload.hbus.params.status = 'release';
                payload.hbus.params.timestamp = delay.toString();
            })
            .then(() => this._client.sendRequest(payload));

    }

    sendCommands(action) {

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

        return this._client.sendRequest(payload);

    }
}

module.exports = Harmony;
