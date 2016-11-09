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
const {clipboard} = require('electron');

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

           if (cfg.devMode){
               mainWindow.webContents.openDevTools({mode: 'detach'});
           }

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
        mainWindow.webContents.send('_authResponse', {
            status:         "loaded"
        });

        // render the table o contents in the gui
        mainWindow.webContents.send('_renderKeyChain', {
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

    // add the key or die tryin' ...
    if (! (cfg.keyChain.addKey({
        key:    arg.key,
        value:  arg.value
    }))){
        // programming is an exceptional business
        mainWindow.webContents.send('_mainException', {
            status:      0,
            fromAction:  '_addKey',
            message:      "failed to add key to keyChain (addKey failed): " + cfg.keyChain.error.message,
            errorLog:     cfg.keyChain.log
        });
        return(false);
    }

    // I dub this style the "fiddy block"
    // because every thing we do, we do it ... or die tryin'
    let toc;
    if (! (toc = cfg.keyChain.getTableOfContents())){
        // gotta catch 'em all y'know ...
        mainWindow.webContents.send('_mainException', {
            status:      0,
            fromAction:  '_addKey',
            message:      "failed to retrieve keyChain table of contents (getTableOfContents failed): " + cfg.keyChain.error.message,
            errorLog:     cfg.keyChain.log
        });
        return(false);
    }

    // well if we've got down here and not been shot 5 times like our hero fiddy ...
    mainWindow.webContents.send('_renderKeyChain', {
        status:     1,
        fromAction: "_addKey",
        toc:        toc
    });
    return(true);
});


/* request the decrypted value for a given key into the OS copy/paste buffer */
ipcMain.on('_werk', (event, arg) => {

    // ain't havin' nun a that, yo!
    if (! arg.hasOwnProperty('key')){
        mainWindow.webContents.send('_mainException', {
            status:     0,
            fromAction: '_werk',
            message:    '_werk called with null "key" option'
        });
        return(false);
    }

    // get it
    let val;
    if (! (val = cfg.keyChain.getKeyValue({key: arg.key}))){
        mainWindow.webContents.send('_mainException', {
            status:      0,
            fromAction:  '_werk',
            message:      "failed to retrieve value from keyChain (getKeyValue failed): " + cfg.keyChain.error.message,
            errorLog:     cfg.keyChain.log
        });
        return(false);
    }

    // copy it to buffer
    clipboard.writeText(val);
    return(true);

});


/* remove a given key from the keychain */
ipcMain.on('_removeKey', (event, arg) => {
    // ain't havin' nun a that, yo!
    if (! arg.hasOwnProperty('key')){
        mainWindow.webContents.send('_mainException', {
            status:     0,
            fromAction: '_removeKey',
            message:    '_removeKey called with null "key" option'
        });
        return(false);
    }

    // remove it
    let val;
    if (! (val = cfg.keyChain.deleteKey({key: arg.key}))){
        mainWindow.webContents.send('_mainException', {
            status:      0,
            fromAction:  '_removeKey',
            message:      "failed to remove keu from keyChain (deleteKey failed): " + cfg.keyChain.error.message,
            errorLog:     cfg.keyChain.log
        });
        return(false);
    }

    let toc;
    if (! (toc = cfg.keyChain.getTableOfContents())){
        // gotta catch 'em all y'know ...
        mainWindow.webContents.send('_mainException', {
            status:      0,
            fromAction:  '_removeKey',
            message:      "failed to retrieve keyChain table of contents (getTableOfContents failed): " + cfg.keyChain.error.message,
            errorLog:     cfg.keyChain.log
        });
        return(false);
    }
    mainWindow.webContents.send('_renderKeyChain', {
        status:     1,
        fromAction: "_addKey",
        toc:        toc
    });
    return(true);
});
