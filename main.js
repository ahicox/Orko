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
    _keyChainData: [],
    cryptAlgorithm: 'aes-256-ctr'
}

// load up electron & global references
const electron = require('electron');
const app = electron.app;
const {ipcMain} = require('electron');
const BrowserWindow = electron.BrowserWindow;

// our handydandy keychain class, sucka
const keyChain = require('./keyChain.js');

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

           //mainWindow.webContents.openDevTools({mode: 'detach'});

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
app.on('ready', createWindow);

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

    cfg.keyChain = new keyChain({
        name:       arg.keyChain,
        fileName:   cfg.keyChains[arg.keyChain],
        passPhrase: arg.passKey
    });

    // check for auth failure
    if (cfg.keyChain.hasError){

        mainWindow.webContents.send('_authResponse', {
            status:         "bad password"
        });
        delete cfg.keyChain;
        return(false);
    }

    // get our table of contents
    let toc;
    if (! (toc = cfg.keyChain.getTableOfContents())){
        mainWindow.webContents.send('_authResponse', {
            status:         "bad password",
            error:          cfg.keyChain.error.message
        });
        return(false);
    }
    if (toc.length > 0){
        // render the table o contents in the gui
        mainWindow.webContents.send('_authResponse', {
            status:         "loaded",
            toc:            toc
        });
        return(true);

    }else{
        // it's empty, send 'em to the add one screen
        mainWindow.webContents.send('_authResponse', {
            status:         "loaded-empty"
        });
        return(true);
    }

});


/* add a new item to the specified keyChain */
ipcMain.on('_addKey', (event, arg) => {

    /*
       LEFT OFF HERE (10/26/2016)
       everything in this function is old and busted
       we need to update this to call keychain.addKey,
       with appropriate error traps etc.

       I'm damn close here. All the hard stuff is in
       keyChain.js now, and it all works, so it's just
       a matter of duct taping those calls into this
       gui.

       next step is properly rendering the key list
       and setting up jquery hooks to call the
       request-a-key-value-and-copy-it-to-clipboard
       stuff
   */


    // this should of course have an error check
    // to make sure we're not overwriting an existing key
    if (! cfg._keyChainData.hasOwnProperty(arg.keyChain)){
        cfg._keyChainData[arg.keyChain] = [];
    }

    cfg._keyChainData[arg.keyChain][arg.key] = arg.value;

    // also we should call some kind of serialize thing here
    // where we dump _keyChainData out to json, encrypt it
    // and dump it to the file

    // but that's for later. Let's see if we can just get
    // the pieces fitting together for now



    mainWindow.webContents.send('_renderKeyChain', {
        status:     1,
        fromAction: "_addKey",
        toc:        Object.keys(cfg._keyChainData[arg.keyChain])
    });

});
