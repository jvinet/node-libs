/**
 * Handle file uploads.  This will also process additional parameters
 * (eg, form variables) that come in the POST.
 *
 * The callback will receive an object with all parameters, including
 * filenames for newly-uploaded files.
 *
 * Copyright (C) 2010 Judd Vinet <jvinet@zeroflux.org>
 *
 * MIT Licensed.
 */

var multipart = require("multipart");
var sys       = require("sys");
var fs        = require("fs");

exports.process = function(req, upload_dir, callback) {
	req.setBodyEncoding("binary");
	var stream = new multipart.Stream(req);
	var fd_cache = {};

	var params = {};

	function write_chunk(request, fd, chunk) {
		// Pause receiving request data (until current chunk is written)
		request.pause();
		fs.write(fd, chunk, null, 'binary', function(err, written) {
			sys.debug("Wrote "+written+" bytes");
			if(err) sys.puts("ERROR: "+err);
			request.resume();
		});
	}

	stream.addListener("body", function(chunk) {
		if(stream.part.filename) {
			write_chunk(req, fd_cache[stream.part.filename], chunk);
		} else {
			params[stream.part.name] += chunk;
		}
	});

	stream.addListener("partBegin", function(part) {
		sys.debug("Begin part name="+part.name+" filename="+part.filename);
		// if it's a file, open/create it
		if(part.filename) {
			fd_cache[part.filename] = fs.openSync(upload_dir+"/"+part.filename, 'w', 0600);
			params[part.name] = part.filename;
		} else {
			params[part.name] = "";
		}
	});

	stream.addListener("partEnd", function(part) {
		sys.debug("End part name="+part.name+" filename="+part.filename);
		// if we close the file here, there's a chance we'll cut off a write_chunk()
		// before it's done
		//if(part.filename) fs.closeSync(fd_cache[part.filename]);
	});

	stream.addListener("complete", function() {
		sys.debug("request complete");
		// close all open descriptors
		for(var fn in fd_cache) fs.close(fd_cache[fn]);
		callback(params);
	});
};

