/**
 * Templating for NodeJS.
 *
 * Like everything else on the net, this uses John Resig's cryptic
 * templating voodoo.  It makes sense, but only if you're drunk.
 * http://ejohn.org/blog/javascript-micro-templating/
 *
 * MIT Licensed.
 *
 * Tips:
 *
 * 1. Use semicolons after function calls in <% %> blocks.
 * 2. Do not use semicolons after function calls in <%= %> blocks.
 * 3. Do not use // style comments, use /* style.
 * 4. Avoid using single quotes when you can - they can cause errors.
 *
 */

var sys = require("sys");
var fs  = require("fs");

var cache = {};

exports.renderFile = function(filename, vars) {
	var str = fs.readFileSync(filename);
	return exports.render(str, vars);
};

exports.renderText = exports.render;

// John Resig - http://ejohn.org/ - MIT Licensed
exports.render = function(str, vars) {
	var data = vars || {};
	// use something like this for rudimentary plugins
	//var data = jQuery.extend({}, Jive.helpers || {}, vars || {});

	var fn = cache[str] = cache[str] || new Function("obj",
		"var p=[],print=function(){p.push.apply(p,arguments);};" +

		// Introduce the data as local variables using with(){}
		"with(obj){p.push('" +

		// Convert the template into pure JavaScript

		// http://www.west-wind.com/weblog/posts/509108.aspx
		str.replace(/[\r\t\n]/g, " ")
			.replace(/'(?=[^%]*%>)/g, "\t")
			.split("'").join("\\'")
			.split("\t").join("'")
			.replace(/<%=(.+?)%>/g, "',$1,'")
			.split("<%").join("');")
			.split("%>").join("p.push('") + "');}return p.join('');");

		// http://ejohn.org/blog/javascript-micro-templating/
		/*str.replace(/[\r\t\n]/g, " ")
			.split("<%").join("\t")
			.replace(/((^|%>)[^\t]*)'/g, "$1\r")
			.replace(/\t=(.*?)%>/g, "',$1,'")
			.split("\t").join("');")
			.split("%>").join("p.push('")
			.split("\r").join("\\'") + "');}return p.join('');");*/

	return fn(data);
};
