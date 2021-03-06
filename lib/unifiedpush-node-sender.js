/* Node.js Sender API for the AeroGear Unified Push server
* https://github.com/aerogear/aerogear-unifiedpush-nodejs-client
* JBoss, Home of Professional Open Source
* Copyright Red Hat, Inc., and individual contributors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
* http://www.apache.org/licenses/LICENSE-2.0
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var http = require( "http" ),
    https = require( "https" ),
    urlParser = require( "url" ),
    util = require( "util" ),
    events = require( "events" );

function doEvent( status, message, callback ) {
    if( !callback || typeof callback !== "function" ) {
        this.emit( status, message );
        return;
    }

    if( status === "error" ) {
        callback( message );
    } else {
        callback( null, message );
    }
}

function send( serverSettings, message, callback ) {
    // we stash the 'https' module on a local variable, IF the server is deployed using SSL.
    // Otherwise the 'http' module is stashed
    var caller = (serverSettings.protocol === "https:") ? https : http,
        that = this,
        req = caller.request( serverSettings, function( res ) {

            if( res.statusCode >= 400 ) {
                doEvent.call( that, "error", res.statusCode, callback );
            } else if( res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 ) {
                //Moved Status,  Need to resend
                if( !res.headers.location ) {
                    doEvent.call( that, "error", "redirect url is not available", callback );
                } else {
                    var url = urlParser.parse( res.headers.location );

                    //Better way i think
                    serverSettings.protocol = url.protocol;
                    serverSettings.hostname =  url.hostname;
                    serverSettings.port = url.port;
                    serverSettings.path = url.pathname;

                    send.call( that, serverSettings, message, callback );
                }
            } else {
                res.setEncoding('utf8');
                res.on( "data", function ( chunk ) {
                    doEvent.call( that, "success", chunk, callback );
                });
            }
        });

    req.on( "error", function( error ) {
        doEvent.call( that, "error", "problem with request: " + error.message, callback );
    });

    // write data to request body
    req.end( JSON.stringify( message ), "utf8" );
}

function createServerSettings( url, settings, message) {
    var messageString=JSON.stringify( message );
    var serverSettings = {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: {
            "Accept": "application/json",
            "Content-type": "application/json",
            "Content-Length": messageString.length,
            "aerogear-sender": "AeroGear Node.js Sender"
        },
        auth: settings.applicationID + ":" + settings.masterSecret,
        method: "POST"
    };
    return serverSettings;
}

function camelToDash( str ) {
    return str.replace( /\W+/g, "-" )
        .replace( /([a-z\d])([A-Z])/g, "$1-$2" ).toLowerCase();
}

var AeroGear = {};

/**
    The AeroGear.Sender does cool stuff
    @class
    @param {String} url - The URL of the Unified Push Server.
    @returns {Object} sender - a Sender Object Event Emitter
 */
AeroGear.Sender = function( url ) {
    if( !url ) {
        throw "UnifiedPushSenderError";
    }

    if ( !( this instanceof  AeroGear.Sender ) ) {
        return new  AeroGear.Sender( url );
    }

    events.EventEmitter.call( this );

    url = url.substr(-1) === '/' ? url : url + '/';
    url += "rest/sender/";

    this.getUrl = function() {
        return url;
    };
};

util.inherits( AeroGear.Sender, events.EventEmitter );

/**
    The send Method
    @param {Object} message={} - the message to be passed
    @param {String} [message.alert]
    @param {String} [message.actionCategory]
    @param {String} [message.sound]
    @param {String} [message.badge]
    @param {Boolean} [message.contentAvailable]
    @param {Object} settings={} - the settings to be passed
    @param {String} settings.applicationID - The Application ID
    @param {String} settings.masterSecret - The Master Secret
    @param {String} [settings.simplePush] - simplePush version number
    @param {Number} [settings.ttl] - the time to live in seconds. This value is supported by APNs and GCM Only
    @param {Object} [settings.criteria={}] - the criteria to select
    @param {Array} [settings.criteria.alias] - a list of email or name strings
    @param {Array} [settings.criteria.deviceType] - a list of device types as strings
    @param {Array} [settings.criteria.categories] - a list of categories as strings
    @param {Array} [settings.criteria.variants] - a list of variantID's as strings
    @returns {Object} itself

 */
AeroGear.Sender.prototype.send = function( message, settings, callback ) {

    settings = settings || {};

    if( !settings.applicationID || !settings.masterSecret ) {
        throw "UnifiedPushSenderError";
    }

    var serverSettings, setting, crit, key,
        url = urlParser.parse( this.getUrl() ),
        newMessage = {};

    for( setting in settings ) {
        if( setting !== "applicationID" && setting !== "masterSecret" )
        {
            if( setting === "criteria" ) {
                for( crit in settings.criteria ) {
                    newMessage[ crit ] = settings.criteria[ crit ];
                }
            } else if( setting === "simplePush" ) {
                newMessage[ "simple-push" ] = settings[setting];
                delete settings[setting];
            } else {
                newMessage[ setting ] = settings[ setting ];
            }
        }
    }

    for( key in message ) {
        if( key === "actionCategory" || key === "contentAvailable" ) {
            message[camelToDash(key)] = message[key];
            delete message[key];
        }
    }

    newMessage.message = message;

    serverSettings = createServerSettings( url, settings, newMessage );

    send.call( this, serverSettings, newMessage, callback );

    return this;
};

module.exports = AeroGear;
