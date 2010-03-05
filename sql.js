/**
 * A SQL generator for enumerating records based on criteria set in
 * the URL query string.
 *
 * This was ported from the Pronto Framework and is probably ugly
 * JavaScript.  It's mostly just string work.
 *
 * Copyright (C) 2010 Judd Vinet <jvinet@zeroflux.org>
 * MIT Licensed.
 */
 
var url = require("url");
var qs  = require("querystring");

// debuggin'
var sys = require("sys");
//var inspect = require("./eyes").inspector();

var Generator = function(db) {
	var self = this;
	this.db = db;

	var parse_qs = function(req) {
		var p = url.parse(req.url);
		return p.query ? qs.parse(p.query) : {};
	};

	this.enumerate = function(req, params, callback) {
		var p = params;  // shortcut
		with(p) {
			exprs  = exprs instanceof Array ? exprs : [];
			gexprs = gexprs instanceof Array ? gexprs : [];
			exprs.forEach(function(v, k){  select += "," + v + '"' + k + '"' });
			gexprs.forEach(function(v, k){ select += "," + v + '"' + k + '"' });
			// if p.select was empty, then we have a leading comma...
			if(select.substring(0, 1) == ',') select = select.substring(1);
		}

		// build WHERE/HAVING clauses from list params and criteria sent
		// from the browser
		cp = self.filter(req, p.exprs, p.gexprs);

		// WHERE
		if(p.where instanceof Array) {
			p.where.forEach(function(v){ cp.where.sql += " AND ("+v+")" });
		} else if(p.where.length) {
			cp.where.sql += " AND ("+p.where+")";
		}

		// HAVING
		if(p.having instanceof Array) {
			p.having.forEach(function(v,k){ cp.having.sql += " AND ("+v+")" });
		} else if(p.having.length) {
			cp.having.sql += " AND ("+p.having+")";
		}

		// Merge all SQL args if necessary (h_args could be empty)
		var args = cp.having.args.length ? cp.where.args.concat(cp.having.args) : cp.where.args;

		// ORDER/LIMIT
		var sort_sql = self.sort(req, p.order, p.exprs);
		var page_sql = self.paginate(req, p.limit);

		// Get data rows
		var sql = self.build_query(p.select, p.from, cp.where.sql, p.group_by, cp.having.sql, sort_sql, page_sql);
		//inspect(sql, "[sql] SQL"); inspect(args, "[sql] Args");
		// db.query clobbers its arguments, so clone it
		var _args = [].concat(args);
		self.db.query(sql, args, function(recs){
			// Count all matching rows
			var sql = self.build_query("COUNT(*)", p.from, cp.where.sql, p.group_by, cp.having.sql, sort_sql, page_sql);
			self.db.query(sql, _args, function(ct){
				var qv = parse_qs(req);
				var p  = typeof qv.p_p  != 'undefined' ? qv.p_p  : 1;
				var pp = typeof qv.p_pp != 'undefined' ? qv.p_pp : params.limit;
				callback(recs, ct[0]['COUNT(*)'], p, pp);
			});
		});
	};

	this.filter = function(req, exprs, gexprs) {
		var where  = {sql: [], args: []};
		var having = {sql: [], args: []};
		var qv = parse_qs(req);

		for(var k in qv) {
			var v = qv[k].toString();
			var sql = [], args = [];

			if(v === '') continue;
			if(!/^f_[dts]_/.test(k)) continue;
			var t = k.substr(2, 1);
			var k = k.substr(4);
			// only alphanumerics allowed
			if(!/^[A-z0-9_-]+$/.test(k)) continue;
			switch(t) {
				case 'd': var coltype = 'date';   break;
				case 's': var coltype = 'select'; break;
				case 't':
				default:  var coltype = 'text';
			}

			// look for an expression passed to the function first -- this is
			// used for trickier SQL expressions, eg, functions
			if(typeof exprs[k] != 'undefined') {
				var s = exprs[k];
				t = 'where';
			} else if(typeof gexprs[k] != 'undefined') {
				var s = gexprs[k];
				t = 'having';
			} else {
				// use the literal column name
				var s = '"' + k + '"';
				t = 'where';
			}

			var range = v.split('<>');
			if(range.length == 2) {
				sql.push("("+s+">=? AND "+s+"<=?)");
				args.push(range[0], range[1]);
			} else if(v.length == 1) {
				// no range (explicit)
				// FYI: this check is needed, as the "else" Block assumes a string
				// length of at least 2
				sql.push(/^[0-9]+$/.test(v) ? s+"=?" : s+" LIKE '%?%'");
				args.push(v);
			} else {
				// everything else: single-bounded range, eq, neq, like, not like
				var chop = 0;
				var like = false;
				switch(v.substr(0, 1)) {
					case '=': // exactly equals to
						s += '=';
						chop = 2;
						break;
					case '>': // greater than
						if(v.substr(1, 1) == '=') {
							s += ">=";
							chop = 2;
						} else {
							s += ">";
							chop = 1;
						}
						break;
					case '<': // less than
						if(v.substr(1, 1) == '=') {
							s += "<=";
							chop = 2;
						} else {
							s += "<";
							chop = 1;
						}
						break;
					case '!': // does not contain
						if(v.substr(1, 1) == '=') {
							s += "!=";
							chop = 2;
						} else {
							s += " NOT LIKE ";
							chop = 1;
							like = true;
						}
						break;
					default:  // contains
						s += " LIKE ";
						like = true;
				}
				v = v.substr(chop);
				s += '?';
				sql.push(s);

				// when using prepared statements (argument binding), we can't put ?
				// inside the quotes, so we massage the argument itself to contain
				// the % wildcards
				args.push(like ? '%'+v+'%' : v);

				// special handling for date filters
				if(coltype == 'date' && chop) {
					// don't include the default '0000-00-00' fields in ranged selections
					var s = typeof exprs[k]  != 'undefined' ? exprs[k] : '"'+k+'"';
					s += "!='0000-00-00'";
					sql.push(s);
				}
			}
			switch(t) {
				case 'where':
					where.sql = where.sql.concat(sql);
					where.args = where.args.concat(args);
					break;
				case 'having':
					having.sql = having.sql.concat(sql);
					having.args = having.args.concat(args);
			}
		}

		// ensure the WHERE clause always has something in it
		where.sql.push("1=1");

		var ret = {where: {sql: where.sql.join(" AND "), args: where.args}};
		if(having.sql) ret.having = {sql: having.sql.join(" AND "), args: having.args};
		return ret;
	};

	this.sort = function(req, def, exprs) {
		var cols = [], sortsql = [], dir = 'ASC';
		var qv = parse_qs(req);
		var field = qv.s_f;
		if(field) {
			if(typeof qv.s_d != 'undefined') dir = qv.s_d;
			cols = [ {field:field, dir:dir} ];
		} else {
			// use the default
			def.split(',').forEach(function(pair){
				pair = pair.replace(/^ */, '').replace(/ +$/, '');
				if(!pair.length) continue;
				var p = pair.split(' ');
				cols.push({field: p[0], dir: typeof p[1] != 'undefined' ? p[1] : 'ASC'});
			});
		}

		cols.forEach(function(c){
			// look for an expression passed to the function first -- this is
			// used for trickier SQL expressions, like functions
			if(typeof exprs[c.field] != 'undefined') {
				var s = exprs[c.field];
			} else {
				// use the literal column name
				var p = c.field.split('.');
				if(p.length > 1) {
					s = p[0]+'."'+p[1]+'"';
				} else {
					s = '"'+c.field+'"';
				}
			}
			sortsql.push(s+" "+c.dir);
		});
		return sortsql.join(',');
	};

	this.paginate = function(req, perpage) {
		if(perpage == 0) return '';  // zero means unlimited
		var perpage = perpage || 50;
		var qv = parse_qs(req);

		var page    = typeof qv.p_p  != 'undefined' ? qv.p_p  : 1;
		var perpage = typeof qv.p_pp != 'undefined' ? qv.p_pp : perpage;
		var offset  = Math.max(0, (page-1) * perpage);

		return perpage + " OFFSET " + offset;
	}

	this.build_query = function(select, from, where, group, having, order, limit) {
		var sql = "SELECT " + select + " FROM " + from;
		if(where)  sql += " WHERE "+where;
		if(group)  sql += " GROUP BY "+group;
		if(having) sql += " HAVING "+having;
		if(order)  sql += " ORDER BY "+order;
		if(limit)  sql += " LIMIT "+limit;
		return sql;
	};
};

exports.Generator = Generator;
