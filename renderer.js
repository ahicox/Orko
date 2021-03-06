// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const {ipcRenderer} = require('electron');
let myData = {};

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
		myHTML.push(
				"<div id='" + key + "' class='copyItem'>" +
				"<div class='removeButton hideMe' key='" + key + "'></div>" +
				"<span>" + key + "</span></div>"
		);
	});
	$("#copyItemTab").empty().html(myHTML.join(""));

	$(".copyItem").each(function(){
		$(this).on("click", function(e){
			e.stopPropagation();
			ipcRenderer.send('_werk', {
				key:	$(this).attr('id')
			});

			// special effects
			$(this).addClass("copyItemHighlight");
			var that = $(this);
			setTimeout(function(){
				that.removeClass("copyItemHighlight");
			}, 1600);
			$("#msg").text("copied to clipboard");
		});

		$(this).find(".removeButton").each(function(){
			$(this).on("click", function(e){
				e.stopPropagation();
				ipcRenderer.send('_removeKey', {
					key: $(this).attr('key')
				});
			});
		});
		$("#msg").text(" ");
	});

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
			myData.unlocked = true;
			setTimeout(function(){
				myData.unlocked = false;
				openTab('authenticationTab');
			}, (1000 * 30));
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

	// initialize the GUI
	initGui();

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
			var pk = obj.val().trim();
			ipcRenderer.send('_auth', {
				passKey: 	pk,
				keyChain: 	'default'
			});
			obj.val('');
			break;

		case "addKey_value":
			$("#msg").text("adding key ...")

			// add a new key/value pair to the keyChain
			var k = $("#addKey_key").val().trim();
			var v = obj.val().trim();
			ipcRenderer.send('_addKey', {
				key:		k,
				value:		v,
				keyChain: 	'default'
			});
			setWMFieldDefault($("#addKey_key"));
			setWMFieldDefault(obj);
			break;

	}
}

/* initGui()
   call this when we need to initialize the GUI on app startup
*/
function initGui() {
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

	// hang a hook on the "add" button
	$("#add").on('click', function(){
		if ((myData.hasOwnProperty('unlocked')) && (myData.unlocked)){
			openTab('addItemTab');
		}
	});

	// the remove button
	$("#remove").on('click', function(){
		if (! myData.hasOwnProperty('removeMode')){ myData.removeMode = true; }
		if (myData.removeMode){
			$(".removeButton").show("slow");
			myData.removeMode = false;
		}else{
			$(".removeButton").hide("fast");
			myData.removeMode = true;
		}

	});

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


/*
	LEFT OFF HERE (11/9/2016)

		* need to blank out text input values on open add item tab

		* we still need something in the renderer to catch _mainException
		  events and do something with them

		* we need to figure out some kinda scrollbar situation

		* we need to explicitly lock and unlock the gui (so add / remove, etc)
		  when the auth times out

		* we need to reset the contents of the passPhrase field when auth times out

		* we need to make the auth timeout part of the cfg object in main.js

		* code cleanup still needed (of course)

		* one idea that might be worth exploring is adding meta data to each key like maybe
		  a version history (these are the last x values of this key), and the date maybe

		* even better might be a password generattor as in "even i don't know the password"
		  click a button, it makes a truly random 32 char string or whatever and inserts it into
		  the kechain blind. You can get it out onto the copy/paste bufer, maybe a right click to
		  get the old one for really tight password changes.
*/
