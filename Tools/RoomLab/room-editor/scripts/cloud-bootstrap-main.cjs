'use strict';
const { app } = require('electron');
if (!process.env.ROOMLAB_BOOTSTRAP_PROFILE) throw Error('Missing isolated bootstrap profile');
app.disableHardwareAcceleration();
app.setPath('userData', process.env.ROOMLAB_BOOTSTRAP_PROFILE);
app.whenReady().then(() => {});
