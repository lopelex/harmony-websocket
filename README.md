# harmony-websocket
Websocket implementation for Harmony Hub



## Getting started

```
const Harmony = require('harmony-websocket');

const harmony = new Harmony();

harmony.on('open', () => {
    console.log('open');
});

harmony.on('close', () => {
    console.log('close');
});

harmony.on('stateDigest', (data) => {
    console.log(data);
});

harmony.connect('192.168.0.131')

    // .then(() => harmony.getConfig())
    // .then(response => console.log(response))

    .then(() => harmony.getActivities())
    .then(response => console.log(response))

    // .then(() => harmony.getCurrentActivity())
    // .then(response => console.log(response))

    // .then(() => harmony.startActivity(activityId))
    // .then(response => console.log(response))

    // .then(() => harmony.getActivityCommands(activityId))
    // .then(response => console.log(response))

    // .then(() => harmony.getDevices())
    // .then(response => console.log(response))

    // .then(() => harmony.getDeviceCommands(DeviceId))
    // .then(response => console.log(response))

    //.then(() => harmony.sendCommands('{"command":"command","type":"IRCommand","deviceId":"DeviceId"}', 50))
    //.then(response => console.log(response))


    .then(() => harmony.close())

    .catch(e => console.error(e.message));
```

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
