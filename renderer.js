// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const {ipcRenderer} = require('electron');
const {clipboard} = require('electron');

// get outta dodge
ipcRenderer.on('_exit', (event, message) => {
	window.close();
});

// get a message
ipcRenderer.on('msg', (event, message) => {
	$("#msg").text(message);
});

//get focus
ipcRenderer.on('gainFocus', (event, message) => {
	$("#main").addClass("inFocus").removeClass("outFocus");
	$("#title").addClass("activeText").removeClass("inactiveText");
});

// lose focus
ipcRenderer.on('loseFocus', (event, message) => {
	$("#main").removeClass("inFocus").addClass("outFocus");
	$("#title").addClass("inactiveText").removeClass("activeText");
});

// _renderKeyChain
ipcRenderer.on('_renderKeyChain', (event, data) => {
	console.log("inside _renderKeyChain");
	var myHTML = [];
	data.toc.forEach(function(key, idx){
		console.log("_renderKeyChain (" + key + ")");
		myHTML.push("<div id='" + key + "' class='copyItem'><span>" + key + "</span></div>");
	});
	$("#copyItemTab").empty().html(myHTML.join(""));
	openTab("copyItemTab");
});

// _authResponse listener
ipcRenderer.on('_authResponse', (event, data) => {
	console.log("inside _authResponse: " + data.status);

	// what we do next depends on the status in the _authResponse
	switch(data.status){

		case "bad password":
			// tell the user the password was bad & reset the password field
			$("#msg").text("bad password");
			setWMFieldDefault($("#passKey"));
			break;

		case "error":
			// something unexpected went wrong
			$("#msg").text("[error]: " . data.error);
			break;

		case "loaded":
			// everything went ok, render the table of contents for the user
			// table of contents is on data.toc

			// insert code here

			break;

		case "loaded-empty":
			// the data file is empty, show 'em the add one screen
			$("#msg").text("no existing keys in keychain, add item ...");
			openTab("addItemTab");
			break;
	}


});

// start up the app
ipcRenderer.on('init', (event, data) => {
	$("#title").text(data.appName + " v." + data.version);
	$("#msg").text(data.defaultMsg);

	// hang a hook on the exit button
	$("#exit").on('click', function(){
		$("#msg").text("sending _exit ...");
		ipcRenderer.send('_exit', '');
	});

	// hang a hook on the reload button
	$("#reload").on('click', function(){
		//$("#msg").text("sending _restart ...");
		ipcRenderer.send('_restart', '');
	});

	// initialize the GUI
	initGui();

	/*
		ok actually this whole thing needs to go somewhere else
		this is the init procedure. Basically it needs to set up
		the GUI to show the login page and exit.

		something like this:

			1) show login page
			2) authenticate
					request controller to unlock keychain with login
					fail: back to 1
					success: retrieve key index
			3) render key index as .copyItem div nodes
			4) THEN hang all the copy to clipboard hooks (below) off the .copyItem nodes

		note: we also need some stuff to add keys to the datastore, encrypt them
		      and of course a serialize to disk. HTML5 localstorage would be right handy
			  but it honestly feels suspect, as it's directly in the whole web browser sphere
			  and some OS's like to centralize that shit (iOS in particular), so we should
			  keep the encrypted keychain file in a separate file I think.

			  Reminds me of java keystore stuff with SSL certs, etc.
			  it's a smart way to do it, and i wonder if someone's already ported the whole
			  shebang over to npm. bet they have. that oughta be the next step.
	*/

});


/*
setWMFieldDefault(jQueryObject)
initialize a WMField object with it's default text, state, etc
*/
function setWMFieldDefault(obj){
	obj.val(obj.attr('defaultText')).addClass("default");
	obj.attr('defaultState', 'true');

	// logic to dismiss the troublesome ios soft keys
	if (obj.is(":focus")){
		obj.attr('intentionalLoseFocus', 'true');
		obj.blur();
	}
}

/*
WMFieldGainFocus(jQueryObject)
handle a WMField gaining focus
*/
function WMFieldGainFocus(obj){

	// new hotness
	if ((obj.attr('defaultState') == 'true') || (obj.attr('allowChange') == "true") || (
		(obj.attr('allowChange') == "fromNull") && (obj.attr('allowFromNullEdit') == "true")
	)){

		obj.val("");
		obj.removeClass("default");
		if (obj.attr('focusHighlight') == "true"){
			obj.addClass("focusHighlight");
		}
	}else if ((obj.attr('allowChange') == "fromNull") && (obj.attr('allowFromNullEdit') != "true")){
		// bounce
		obj.attr('intentionalLoseFocus', "true");
		obj.blur();
	}
}

/*
WMFieldLoseFocus(jQueryObject)
handle a WMField losing focus
*/
function WMFieldLoseFocus(obj){
	// if we were just dismissing the ios keyboard with a lose focus event
	// reset the hook and exit
	if (obj.attr('intentionalLoseFocus') == "true"){
		obj.attr('intentionalLoseFocus', 'false');
		return(false);
	}
	if (obj.attr('focusHighlight') == "true"){
		obj.removeClass("focusHighlight");
	}
	if ((! obj.val().trim()) || (obj.val() == obj.attr('defaultText'))){
		if (obj.hasClass("maskField")){ obj.removeClass("maskMe"); }
		setWMFieldDefault(obj);
	}else{
		obj.attr('defaultState', 'false').removeClass("default");
		if (obj.hasClass("maskField")){ obj.addClass("maskMe"); }
		WMFieldReturn(obj);
	}
}

/*
WMFieldReturn(jQueryObject)
handle a WMField getting the return keypress
what we do depends on the id of the object who called it
so insert yer hooks here should you need 'em
*/
function WMFieldReturn(obj){
	//
	// insert hooks here for callbacks by
	// the id of the object who called it
	//

	// hook for the passkey
	switch(obj.attr('name')){

		case "passkey":

			// call authenticate service on parent
			// see _authResponse listener for what happens next
			ipcRenderer.send('_auth', {
				passKey: 	obj.val().trim(),
				keyChain: 	'default'
			});
			break;

		case "addKey_value":
			$("#msg").text("adding key ...")

			// add a new key/value pair to the keyChain
			ipcRenderer.send('_addKey', {
				key:		$("#addKey_key").val().trim(),
				value:		obj.val().trim(),
				keyChain: 	'default'
			});
			break;

	}
}

/* initGui()
   call this when we need to initialize the GUI on app startup
*/
function initGui() {
	// there's not a lot to do here (yet)

	// do the default text/watermark thing for stuff in WMField class
	$(".WMField").each(function(){
		setWMFieldDefault($(this));
		$(this).on('click focusin', function(){
			WMFieldGainFocus($(this));
		});

		$(this).on('blur focusout change', function(){
			WMFieldLoseFocus($(this));
		});

		$(this).on('keypress', function(e){
			if (e.keyCode == 13){ WMFieldReturn($(this)); }
		});
	});

	// I'M JUST KEEPING THIS HERE TEMPORARILY
	// hang the copy to clipboard function and special effects
	// onto all the .copyItem instances
	$(".copyItem").each(function(){
		$(this).on("click", function(){

			// ok, when we get there, this actually needs to
			// be the result of a synchronous event sent to the controller
			// to request the decrypted value of the key in the datastore
			// that this GUI layer will never see directly.
			//
			// the only thing the GUI should even know is the passcode ...
			// and even then maybe just a hash of the passcode.
			// which should be an argument to whatever service we send
			// to the parent controller.
			//
			// remember, this GUI will not be the only potential requester
			// if we do this right, there'll be a listener of some kind
			// so that external scripts can get things from the keychain.
			clipboard.writeText($(this).text().trim());

			// special effects
			$(this).addClass("copyItemHighlight");
			var that = $(this);
			setTimeout(function(){
				that.removeClass("copyItemHighlight");
			}, 1600);
			$("#msg").text("copied to clipboard");
		});
	});

	// except set the initial tab
	openTab('authenticationTab');
	return(true);
}

/* errorHandler(errorNumber, errorString, fatal)
   as the name implies this is an error handler
   just for catching generic app errors
*/
function errorHandler(errorNumber, errorString, fatal){
	// yeah I dunno, just put the error in the msg for now
	$("#msg").text("[" + errorNumber + "]: " + errorString);
	return(true);
}

/* openTab(<tabElementIDName>)
   show the tab with the given CSS element ID.
   also hide all other elements in the 'tab' class
*/
function openTab(tabElementIDName) {
	$(".tab").each(function(){
		if ($(this).attr('id') != tabElementIDName){
			$(this).slideUp("fast");
		}else{
			$(this).slideDown("slow");
		}
	});
}


/* auth
   handle calling the auth service in main.js
*/
function auth(authString){
	ipcRenderer.send('_auth', {
		passKey: 	authString,
		keyChain: 	'default'
	});

	// lockGUI
}
