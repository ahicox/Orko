'use strict';

// this is the global config for the applications
var cfg = {
    appName:    'Orko',
    defaultMsg: 'node: ' + process.versions.node + ' / chromium: ' + process.versions.chrome + ' / electron: ' + process.versions.electron,
    version:    0.1,
    devMode:    false,
    keyChains:  {
        default:    './defaultKeychain.crypt'
    },
    cryptAlgorithm: 'aes-256-ctr'
}

// load up electron & global references
const electron = require('electron');
const app = electron.app;
const {ipcMain} = require('electron');
const BrowserWindow = electron.BrowserWindow;

// stuff for dealin' with files
const fs = require('fs');

// stuff for dealin' with encryption
const crypt = require('crypto');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

// create the mainWindow
function createWindow () {

    // make the BrowserWindow but don't show it yet
    mainWindow = new BrowserWindow({
        width: 			    420,
        height:             260,
        autoHideMenuBar: 	true,
        darkTheme:		    true,
        transparent:		true,
        frame:			    false,
        show:			    false
    });

    // load the html app.
    mainWindow.loadURL(`file://${__dirname}/index.html`);

    // once the html app's initial GUI is loaded, showit
    mainWindow.once('ready-to-show', () => {
	       mainWindow.show();

           // temp
           //mainWindow.webContents.openDevTools();

	       // send the init event to the app, along with the config
  	       mainWindow.webContents.send('init', cfg);
    });

    // catch the event when the mainWindow is closed
    mainWindow.on('closed', function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null
  });

  // gain focus
  mainWindow.on('focus', function() {
      mainWindow.webContents.send('gainFocus', '');
  });

  // loose focus
  mainWindow.on('blur', function() {
      mainWindow.webContents.send('loseFocus', '');
  })

  // exit app (receive exit signal from html app)
  ipcMain.on('_exit', (event, arg) => {
	  mainWindow.webContents.send('_exit', "exit clicked!");
      app.on('window-all-closed', () => {
          app.quit();
      });
  });

  // eh, let's just open the devTools instead
  ipcMain.on('_restart', (event, arg) => {


      /* the idea was to reload the html content, thereby 'restarting'
         the embedded web application. howevz. both these tricks only
         seem to work once. Both buttons cease making callbacks
         after the reload. If ya really wanna figgure it out, it
         probably has to do with variable scoping ...

     mainWindow.webContents.reload();
     */

     // as it turns out, the only thing I really need is the devTools anyhoo
     if (cfg.devMode){
         mainWindow.webContents.closeDevTools();
         cfg.devMode = false;
     }else{
         mainWindow.webContents.openDevTools({mode: 'detach'});
         cfg.devMode = true;
     }
  });

}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})


// handle authentication (_auth / _authResponse)
// arg should be like {
//  passKey: <value>
//  keyChain: <keychain id>
//}
ipcMain.on('_auth', (event, arg) => {

    var authResponse = {};

    // load up the datafile (or save what we got for later if it's new)
    fs.exists(cfg.keyChains[arg.keyChain], function(exists){
        if (exists){

            /* read the contents of the file */

            // stat the file to get length
            fs.stat(cfg.keyChains[arg.keyChain], function(error, stats) {
                // open the file
                fs.open(cfg.keyChains[arg.keyChain], "r", function(error, fd) {
                    // define a buffer, into which we will place the file's contents
                    var buffer = new Buffer(stats.size);
                    fs.read(fd, buffer, 0, buffer.length, null, function(error, bytesRead, buffer) {

                        // decrypt the file contents with the given passkey
                        var decipher = crypto.createDecipher(cfg.cryptAlgorithm, arg.passKey);
                        var dec = Buffer.concat([decipher.update(buffer) , decipher.final()]);
                        cfg._data = dec.toString("utf8", 0, dec.length);

                        // set authResponse keys
                        authResponse.status = "loaded";
                        authResponse.keyChain = arg.keyChain;

                        // y'see, this is a thing we need to be doing here
                        // which means we need to define a datamodel now ...
                        // authResponse.tableOfContents =

                        // close the file
                        fs.close(fd);

                    });
                });
            });

        }else{

            /* create the file
               well actually, why bother creating an empty file
               just note that the file doesn't exist, and we'll deal
               with making the file if necessary on the write
            */
            authResponse.status = "doesNotExist";
            authResponse.keyChain = arg.keyChain;
            authResponse.passKey = arg.passKey;
        }
    });

    // send the _authResponse event
    mainWindow.webContents.send('_authResponse', authResponse);
    return(true);
});
