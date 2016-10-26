/* funkin' around with node.js */
const keyChain = require('./keyChain.js');

var myKeyChain = new keyChain({
    name:       "testKeyChain",
    passPhrase: "bevis74",
    fileName:   "testKeyChain.kc"
});

// make sure we gave the right pass
if (myKeyChain.hasError){
    console.log("error on instantiation: " + myKeyChain.error.message)
    process.exit(1);
}

// add something to it
if (! myKeyChain.addKey({
    key:    'spongeBobsPassword',
    value:  '1234567-A'
})){
    console.log("addKey failed: " + myKeyChain.error.message);
    console.log("[logs]:");
    myKeyChain.log.forEach(function(obj){
        console.log("[" + obj.time + " (" + obj.severity + ")]: " + obj.message);
    });
    process.exit(1);
}

// get the table of contents and show it
let toc;
if (! (toc = myKeyChain.getTableOfContents())){
    console.log("getTableOfContents failed: " + myKeyChain.error.message);
    process.exit(1);
}
toc.forEach(function(idx){
    console.log(idx);
});

// get a value off the keyChain
let val;
if (! (val = myKeyChain.getKeyValue({key: toc[0]}))){
    console.log("getKeyValue failed: " + myKeyChain.error.message);
    process.exit(1);
}
console.log("["  + toc[0] + "]: " + val);





// let's just show enumerable properties in the log for now
/*
console.log("object properties: ");
Object.keys(myKeyChain).forEach(function(key){
        console.log("[" + key + "]: " + myKeyChain[key]);
});
console.log();
*/
// spit out the log lines
/*
console.log("object log entries: ");
myKeyChain.log.forEach(function(obj){
    console.log("[" + obj.time + " (" + obj.severity + ")]: " + obj.message);
});
*/
