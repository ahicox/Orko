/* keyChain.js
   my attempt at a node.js modeule to encapsulate
   a simple key/value array, the idea being
   we can eventually dump it out to json, then
   encrypt it. and of course decrpyt it and restore it
*/

'use strict';
var fs = require('fs');
const crypt = require('crypto');

var nullRgx = /^\s*$/;

var defaultData = {
        version:        1.0,
        cryptAlgorithm: 'aes-256-ctr',
        hasError:       false,
        logLength:      40,
        log:            [],
        error:          {},
        name:           'default'
};

// here we go
module.exports = function(args){

    // merge class-global stuff into the object
    Object.keys(defaultData).forEach(function(key){
        Object.defineProperty(this, key, {
            value:        defaultData[key],
            writable:    true,
            enumerable:   true,
            configurable: true
        });
    }, this);

    // merge args
    Object.keys(args).forEach(function(key){
        if (this.hasOwnProperty(key)){
            // just overwrite it
            this[key] = args[key];
        }else{
            // define it
            Object.defineProperty(this, key, {
                value:        args[key],
                writable:    true,
                enumerable:   true,
                configurable: true
            });
        }
    }, this);

    // validation: passPhrase
    if ((this.passPhrase === undefined) || (this.passPhrase === null) || (nullRgx.test(this.passPhrase))){
        throw Error("passPhrase is required to instantiate keyChain");
    }

    // validation: fileName
    if ((this.fileName === undefined) || (this.fileName === null) || (nullRgx.test(this.fileName))){
        throw Error("fileName is required to instantiate keyChain");
    }

    /*
        if we've got this far, we have a passPhrase and a fileName
        if the file exists, we'll verify that we're able to decrypt it (then immediately throw away
        the data, as the goal here is to keep as little decrypted data in memory as possible, we just
        want to know if the passPhrase is correct). If the file doesn't exist, we will create one
        containing a json serialization of a null object.
    */
    try {
        fs.accessSync(this.fileName, fs.F_OK);
    }catch (e){
        // it's not there, make an empty one
        _log(this, {
            message: "specified fileName (" + this.fileName + ") does not exist. instantiating encrypted null file"
        });

        // encrypt a null header
        let encrypted;
        if (! (
            encrypted = _encryptData(this, { data: {
                created:        Math.floor(Date.now() / 1000),
                version:        this.version,
                cryptAlgorithm: this.cryptAlgorithm,
                name:           this.name,
                data:           {}
            }})
        )){
            throw("failed to encrypt null file? " + this.error.message);
        }

        // ok, now we've gotta make a file and write it
        try {
            fs.writeFileSync(this.fileName, encrypted, {mode: 0o600});
        }catch (fe){
            throw("failed to write encrypted string for null file to " + self.fileName + " / " + fe);
        }
    }

    /*
        if we got this far, the file exists, make sure we can load it up with the given password

    */
    let tmpMeta;
    if (! (tmpMeta = _getFileMeta(this))){
        this.hasError = true;
        this.error = {
            message:     "bad password",
            severity:    "error",
            errorNumber: 0
        }
        _log(this, {message: this.error.message});
    }

    /*
        ########################
        ## public functions
        ########################
    */

    /* addKey ({key: <key>, value: <value>})  /  return(bool) */
    this.addKey = function(args){
        this.hasError = false;
        let tmpData = {};
        tmpData[args.key] = args.value;
        if (! (_writeToFile(this, {
            data: tmpData
        }))){
            this.hasError = true;
            this.error = {
                message:     "[addKey]: _writeToFile failed",
                severity:    "error",
                errorNumber: 12
            }
            _log(this, {message: this.error.message});
            return(false);
        }
        return(true);
    }

    /* deleteKey ({key: <key>}) */
    this.deleteKey = function(args){
        this.hasError = false;
        if (! (_deleteFromFile(this, {
            key: args.key
        }))){
            this.hasError = true;
            this.error = {
                message:     "[addKey]: _deleteFromFile failed",
                severity:    "error",
                errorNumber: 12
            }
            _log(this, {message: this.error.message});
            return(false);
        }
        return(true);
    }

    /* getTableOfContents () */
    this.getTableOfContents = function(){
        this.hasError = false;
        let someData;
        if (! (someData = _getFileMeta(this))){
            this.hasError = true;
            this.error = {
                message:     "[getTableOfContents]: failed to retrieve table of contents",
                severity:    "error",
                errorNumber: 11
            }
            _log(this, {message: this.error.message});
            return(false);
        }
        return(someData.TOC);
    }

    /* getKeyValue ({key: <key>}) */
    this.getKeyValue = function(args){
        this.hasError = false;
        let myValue;
        if (! (myValue = _requestKeyValue(this, {key: args.key}))){
            this.hasError = true;
            this.error = {
                message:     "[getKeyValue]: failed to retrieve key value",
                severity:    "error",
                errorNumber: 18
            }
            _log(this, {message: this.error.message});
            return(false);
        }
        return(myValue);
    }

    // we out!
    return(this);
};


/*
    ########################
    ## private functions
    ########################
*/

/*
    _loadFromFile (self)
    treturn the (presumably encrypted) contents of the object's fileName
*/
function _loadFromFile(self){
    self.hasError = false;
    if ((! (self.hasOwnProperty('fileName'))) || nullRgx.test(self.fileName)){
        self.hasError = true;
        self.error = {
            message:     "[_loadFromFile]: object missing fileName attribute",
            severity:    "error",
            errorNumber: 6
        }
        _log(self, {message: self.error.message});
        return(false);
    }
    let enData;
    try {
        enData = fs.readFileSync(self.fileName, {encoding:'utf8'});
    }catch(e){
        self.hasError = true;
        self.error = {
            message:     "[_loadFromFile]: failed to read " + self.fileName + " / " + e,
            severity:    "error",
            errorNumber: 7
        }
        _log(self, {message: self.error.message});
        return(false);
    }
    return(enData);
}


/*
    _getFileMeta(self)
    get the table of contents and the meta info about the file
    doing it all down here, because I never want the entire unencrypted
    string in the object all at once ...

*/
function _getFileMeta(self){
    self.hasError = false;
    // make sure we've got fileName and passPhrase
    if (
        (! (self.hasOwnProperty('fileName'))) ||
        (nullRgx.test(self.fileName)) ||
        (! (self.hasOwnProperty('passPhrase'))) ||
        (nullRgx.test(self.passPhrase))
    ){
        self.hasError = true;
        self.error = {
            message:     "[_writeToFile]: object missing passPhrase or fileName",
            severity:    "error",
            errorNumber: 4
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // get the encrypted contents of the file
    let encrypted;
    if (! (encrypted = _loadFromFile(self))){
        self.hasError = true;
        self.error = {
            message:     "[_writeToFile]: failed to load encrypted data from " + self.fileName,
            severity:    "error",
            errorNumber: 5
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // decrypt it and parse it
    let theData;
    if (! (theData = _decryptData(self, {data: encrypted, passPhrase: self.passPhrase}))){
        self.hasError = true;
        self.error = {
            message:     "[_writeToFile]: failed to decrypt data",
            severity:    "error",
            errorNumber: 8
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // get the table of contents, then drop the secret data before we return
    theData.TOC = [];
    Object.keys(theData.data).forEach(function(key){
        theData.TOC.push(key);
    })
    delete theData.data;
    return(theData);
}

/*
    _decryptData (self, {data: <data>, passPhrase: <passPhrase>})
    spit back json deserialization of encrypted string using the object's passPhrase
*/
function _decryptData(self, args){
    self.hasError = false;
    const decipher = crypt.createDecipher(self.cryptAlgorithm, self.passPhrase);
    var deData = decipher.update(args.data, 'hex', 'utf8');
    deData += decipher.final('utf8');
    let deObj
    try {
        deObj = JSON.parse(deData);
    }catch(e){
        self.hasError = true;
        self.error = {
            message:     "failed to decrypt data / failed authentication / " + e,
            severity:    "error",
            errorNumber: 1
        }
        _log(self, {message: self.error.message});
        return(false);
    }
    return(deObj);
}


/*
    _encryptData (self, {data:<data>, passPhrase: <passPhrase>})
    spit back a json serialization of <data> encrypted with <passPhrase>
*/
function _encryptData(self, args){
    self.hasError = false;
    const cipher = crypt.createCipher(self.cryptAlgorithm, self.passPhrase);
    try {
        var jsData = JSON.stringify(args.data);
    }catch (e){
        self.hasError = true;
        self.error = {
            message:     "failed to serilize JSON for input data / " + e,
            severity:    "error",
            errorNumber: 2
        }
        _log(self, {message: self.error.message});
        return(false)
    }
    var enData = cipher.update(jsData, 'utf8', 'hex');
    enData += cipher.final('hex');
    return(enData);
}




/*
    _writeToFile (self, {data: <data>})
    read the object's fileName into memory. decrypt it with the object's passPhrase
    and deserialize it from JSON. Merge any data items present on the <data>
    argument into the deserialized object's .data attribute.
    re-serialize the object to JSON, reencrypt it, and overwrite the file
    returns bool
*/
function _writeToFile (self, args){
    self.hasError = false;

    // make sure we've got data
    if (! (args.hasOwnProperty('data'))){
        self.hasError = true;
        self.error = {
            message:     "[_writeToFile]: missing 'data' argument",
            severity:    "error",
            errorNumber: 3
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // make sure we've got fileName and passPhrase
    if (
        (! (self.hasOwnProperty('fileName'))) ||
        (nullRgx.test(self.fileName)) ||
        (! (self.hasOwnProperty('passPhrase'))) ||
        (nullRgx.test(self.passPhrase))
    ){
        self.hasError = true;
        self.error = {
            message:     "[_writeToFile]: object missing passPhrase or fileName",
            severity:    "error",
            errorNumber: 4
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // get the encrypted contents of the file
    let encrypted;
    if (! (encrypted = _loadFromFile(self))){
        self.hasError = true;
        self.error = {
            message:     "[_writeToFile]: failed to load encrypted data from " + self.fileName,
            severity:    "error",
            errorNumber: 5
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // decrypt it and parse it
    let theData;
    if (! (theData = _decryptData(self, {data: encrypted, passPhrase: self.passPhrase}))){
        self.hasError = true;
        self.error = {
            message:     "[_writeToFile]: failed to decrypt data",
            severity:    "error",
            errorNumber: 8
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // merge input data with what we got from the file
    Object.keys(args.data).forEach(function(key){
        theData.data[key] = args.data[key];
    });

    // re-encrypt it
    theData.updated =  Math.floor(Date.now() / 1000);
    let enData;
    if (! (
        enData = _encryptData(self, {data: theData})
    )){
        self.hasError = true;
        self.error = {
            message:     "[_writeToFile]: failed to encrypt updated data",
            severity:    "error",
            errorNumber: 9
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // write it back out
    try {
        fs.writeFileSync(self.fileName, enData, {mode: 0o600});
    }catch (fe){
        self.hasError = true;
        self.error = {
            message:     "[_writeToFile]: failed to write updated file: " + fe,
            severity:    "error",
            errorNumber: 10
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    return(true);
}

/*
    _deleteFromFile (self, {key: <keyToDelete>})
    just like _writeToFile, except we're deleting the specified key
*/
function _deleteFromFile (self, args){
    self.hasError = false;

    // make sure we've got data
    if (! (args.hasOwnProperty('key'))){
        self.hasError = true;
        self.error = {
            message:     "[_deleteFromFile]: missing 'key' argument",
            severity:    "error",
            errorNumber: 13
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // make sure we've got fileName and passPhrase
    if (
        (! (self.hasOwnProperty('fileName'))) ||
        (nullRgx.test(self.fileName)) ||
        (! (self.hasOwnProperty('passPhrase'))) ||
        (nullRgx.test(self.passPhrase))
    ){
        self.hasError = true;
        self.error = {
            message:     "[_deleteFromFile]: object missing passPhrase or fileName",
            severity:    "error",
            errorNumber: 14
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // get the encrypted contents of the file
    let encrypted;
    if (! (encrypted = _loadFromFile(self))){
        self.hasError = true;
        self.error = {
            message:     "[_deleteFromFile]: failed to load encrypted data from " + self.fileName,
            severity:    "error",
            errorNumber: 15
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // decrypt it and parse it
    let theData;
    if (! (theData = _decryptData(self, {data: encrypted, passPhrase: self.passPhrase}))){
        self.hasError = true;
        self.error = {
            message:     "[_deleteFromFile]: failed to decrypt data",
            severity:    "error",
            errorNumber: 16
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // delete the specified key
    delete theData.data[args.key];

    // merge input data with what we got from the file
    Object.keys(args.data).forEach(function(key){
        theData.data[key] = args.data[key];
    });

    // re-encrypt it
    theData.updated =  Math.floor(Date.now() / 1000);
    let enData;
    if (! (
        enData = _encryptData(self, {data: theData})
    )){
        self.hasError = true;
        self.error = {
            message:     "[_deleteFromFile]: failed to encrypt updated data",
            severity:    "error",
            errorNumber: 9
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // write it back out
    try {
        fs.writeFileSync(self.fileName, enData, {mode: 0o600});
    }catch (fe){
        self.hasError = true;
        self.error = {
            message:     "[_deleteFromFile]: failed to write updated file: " + fe,
            severity:    "error",
            errorNumber: 10
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    return(true);
}


/*
    _requestKeyValue(self, {key: <keyToGet>})
    get the value of just one key
*/
function _requestKeyValue (self, args){
    self.hasError = false;

    // make sure we've got data
    if (! (args.hasOwnProperty('key'))){
        self.hasError = true;
        self.error = {
            message:     "[_requestKeyValue]: missing 'key' argument",
            severity:    "error",
            errorNumber: 13
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // make sure we've got fileName and passPhrase
    if (
        (! (self.hasOwnProperty('fileName'))) ||
        (nullRgx.test(self.fileName)) ||
        (! (self.hasOwnProperty('passPhrase'))) ||
        (nullRgx.test(self.passPhrase))
    ){
        self.hasError = true;
        self.error = {
            message:     "[_requestKeyValue]: object missing passPhrase or fileName",
            severity:    "error",
            errorNumber: 14
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // get the encrypted contents of the file
    let encrypted;
    if (! (encrypted = _loadFromFile(self))){
        self.hasError = true;
        self.error = {
            message:     "[_requestKeyValue]: failed to load encrypted data from " + self.fileName,
            severity:    "error",
            errorNumber: 15
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    // decrypt it and parse it
    let theData;
    if (! (theData = _decryptData(self, {data: encrypted, passPhrase: self.passPhrase}))){
        self.hasError = true;
        self.error = {
            message:     "[_requestKeyValue]: failed to decrypt data",
            severity:    "error",
            errorNumber: 16
        }
        _log(self, {message: self.error.message});
        return(false);
    }

    if (! theData.data.hasOwnProperty(args.key)){
        self.hasError = true;
        self.error = {
            message:     "[_requestKeyValue]: specified key does not exist in keyChain",
            severity:    "error",
            errorNumber: 17
        }
        _log(self, {message: self.error.message});
        return(false);
    }
    return(theData.data[args.key]);
}



/*
   _log(self, {message: <logMessage>, severity: <info|warn|error|fatal>})
   inserts a log message into the object's log ?
*/
function _log(self, info){

    // catch no arguments
    if ((info === undefined) || (info === null)){
        info = {};
        info.message = "log called without arguments!";
        info.severity = "warn";
    }

    // insert default severty: info
    if ((! info.hasOwnProperty('severity')) || ((info.severity === undefined) || (info.severity === null) || (nullRgx.test(info.severity)))){
        info.severity = 'info';
    }

    // insert epoch datetime
    info.time = Math.floor(Date.now() / 1000);

    // push it (real good)
    self.log.push(info);

    // prune the log if necessary
    if ((self.logLength != 0) && (self.log.length > self.logLength)){ self.log.shift(); }
}
