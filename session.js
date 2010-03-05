/**
 * Basic session control for NodeJS.  The easiest way to use this is with HTTP
 * cookies, as the examples below suggest.
 *
 * Note: Sessions are stored in memory, so they are lost if the server
 * process is restarted.
 *
 * Copyright (C) 2010 Judd Vinet <jvinet@zeroflux.org>
 * MIT Licensed.
 *
 * Creating a session and setting the cookie:
 *
 *   var sess = session.create();
 *   sess.set('userid', id);
 *   var d = new Date();
 *   d.setTime(d.getTime() + (604800 * 1000)); // expires in one week
 *   var c = ["Set-Cookie", "MyCookieName="+sess.sid+"; expires="+d.toUTCString()+"; path=/"];
 *   // now write the cookie header out in a res.writeHeader() call
 *
 *
 * Finding an existing session:
 *
 *   var sid = /MyCookieName=([a-z0-9]+)/.exec(req.headers.cookie || "");
 *   sid = sid ? sid[1] : '';
 *   return session.find(sid);
 *
 */

var session = {
	state: {},

	init: function(){
		var self = this;
		this.state.sessions = {};
		setInterval(function(){ self.gc() }, 60000);
	},

	find: function(sid){
		for(var s in this.state.sessions) {
			if(s == sid) return this.state.sessions[s];
		}
		return false;
	},

	create: function(){
		var sess = new function(){
			this.data = {};
			this.created_on = new Date();
			this.expires_on = new Date();

			this.set = function(k,v){ this.data[k] = v };
			this.get = function(k){ return this.data[k] };
		};

		// this is probably horribly insecure and predictable
		// O HAI FBI
		var sid = 'sess';
		var pool = 'abcdefghijklmnopqrstuvwxyz0123456789';
		for(var i = 0; i < 32; i++) {
			sid += pool.charAt(Math.round(Math.random() * pool.length));
		}
		sess.sid = sid;
		this.state.sessions[sid] = sess;
		return sess;
	},

	remove: function(sid){
		delete this.state.sessions[sid];
	},

	gc: function(){
		for(var s in this.state.sessions) {
			// TODO
		}
	}
};

// CommonJS module support
process.mixin(exports, session);

