/**
 * Basic ORM for Node and SQLite.
 *
 * This code was originally ported from a PHP framework (Pronto), so
 * the resulting JavaScript is probably less than beautiful.
 *
 * See test.recordmodel.js for an idea how to use this.  It currently
 * requires the node-sqlite[1] addon, though another SQL store could
 * be hooked up with little effort.
 *
 * Copyright (C) 2010 Judd Vinet <jvinet@zeroflux.org>
 *
 * MIT Licensed.
 */

var sys = require("sys");

/**
 * Figure out the schema for a table.  This function will
 * only work in SQLite.
 */
var get_schema = function(db, table, cb) {
	var s = {};
	db.query('PRAGMA table_info("' + table + '")', function(recs){
		recs.forEach(function(row){ s[row.name] = row.type; });
		cb(s);
	});
};

/************************************************************************
 * RECORD MODEL
 ************************************************************************/

var RecordSelector = function(q, args, model) {
	var self   = this;
	var model  = model;
	var it_ptr = 0, id_cache = [];

	this.sql  = {where: '', order: '', limit: ''};
	this.args = {where: [], order: [], limit: []};

	this.where = function(q, args) {
		self._reset();
		if(!q) return self;

		if(self.sql.where) {
			self.sql.where += " AND ("+q+")";
		} else {
			self.sql.where = "WHERE ("+q+")";
		}
		var args = args || [];
		for(var i = 0; i < args.length; i++) self.args.where.push(args[i]);
		return self;
	};

	this.eq = function(col, val) {
		return self.where(col+"=?", [val]);
	};

	this.match = function(record) {
		var t = self;
		for(var x in record) t = t.eq(x, record[x]);
		return t;
	};

	this.order = function(col) {
		self._reset();
		if(self.sql.order) {
			self.sql.order += "," + col;
		} else {
			self.sql.order = "ORDER BY " + col;
		}
		return self;
	};

	this.limit = function(num, offset) {
		var offset = offset || 0;
		self._reset();
		self.sql.limit = "LIMIT " + num + " OFFSET " + offset;
		return self;
	};

	this.fetch = function(cb) {
		self._query("SELECT * FROM " + model.table, function(recs) {
			cb.call(self, recs[0] || false);
		});
	};

	this.count = function(cb) {
		self._query("SELECT COUNT(*) FROM " + model.table, function(recs) {
			cb.call(self, recs[0]['COUNT(*)']);
		});
	};

	/**
	 * Load all results, executing a callback after all records have loaded.
	 */
	this.load = function(cb) {
		self._get_ids(function(ids){
			if(ids == false) return cb.call(self, []);
			var ret = [];
			model.load(ids, function(recs){
				cb.call(self, recs);
			});
		});
	};

	/**
	 * Load a single result.  Iterable.
	 */
	this.one = function(cb) {
		self._get_ids(function(ids){
			if(typeof ids[it_ptr] == 'undefined') cb.call(self, false);
			model.load(ids[it_ptr++], function(rec){
				cb.call(self, rec);
			});
		});
	};

	this.remove = function(cb) {
		var ids = self._get_ids(function(ids){
			// TODO: eventually, make it use model.remove()
			for(var x in ids) model.erase(ids[x]);
			if(typeof cb == 'function') cb.call(self);
		});
	};

	this.set = function(key, val, cb) {
		var cb = cb || function(){};
		if(typeof key == 'object') {
			var kp = [], args = [];
			for(var x in key) {
				kp.push('"'+k+'"=?');
				args.push(key[x]);
			}
			self._query("UPDATE " + model.table + " SET " + kp.join(","), args, function(){ cb.call(self) });
		} else {
			self._query("UPDATE " + model.table + ' SET "' + key + '"=?', [val], function(){ cb.call(self) });
		}
	};

	this.get = function(cols, cb) {
		var cols = cols instanceof Array ? cols : [cols];
		var q = "SELECT \"" + cols.join('","') + "\" FROM " + model.table;
		self._query(q, function(recs){
			if(recs.length == 0) {
				cb.call(self, false);
				return;
			}
			var ret = [];
			if(cols.length > 1) {
				for(var i = 0; i < recs.length; i++) {
					rec = [];
					for(var j = 0; j < cols.length; j++) rec[cols[j]] = recs[i][cols[j]];
					ret.push(rec);
				}
			} else {
				for(var i = 0; i < recs.length; i++) ret.push(recs[i][cols[0]]);
			}
			cb.call(self, recs.length == 1 ? ret[0] : ret);
		});
	};

	/**
	 * Return a name-value-pair for the requested column(s).
	 *
	 * @param string key  Column to use as the array key
	 * @param mixed  val  Column to use as the array value.  To have multiple
	 *                    columns present in the array value, use an array.
	 * @param function cb Callback that receives the results.
	 */
	this.pair = function(key, val, cb) {
		var cols = [key];
		if(val instanceof Array) {
			for(var x in val) cols.push(val[x]);
		} else {
			cols.push(val);
		}
		self.get(cols, function(d){
			if(d == false) cb.call(self, []);
			var ret = {};
			for(var x in d) {
				if(cols.length > 2) {
					ret[d[x][key]] = [];
					for(var i = 1; i < cols.length; i++) ret[d[x][key]].push(d[x][cols[i]]);
				} else {
					ret[d[x][key]] = d[x][val];
				}
			}
			cb.call(self, ret);
		});
	};

	this._get_ids = function(cb) {
		if(id_cache.length) return id_cache; 
		self.get(model.pk, function(ids){
			if(ids && !(ids instanceof Array)) ids = [ids];
			id_cache = ids;
			cb.call(self, ids);
		});
	}

	this._reset = function() {
		it_ptr   = 0;
		id_cache = [];
	};

	this._query = function(q, args, cb) {
		var cb = typeof args == 'function' ? args : cb;
		var args = typeof args == 'function' ? [] : args;

		var c = self._build_clause();
		for(var i = 0; i < c[1].length; i++) args.push(c[1][i]);
		model.db.query(q + c[0], args, cb);
	};

	this._build_clause = function() {
		var sql = '';
		var args = [];
		if(self.sql.where) sql += ' ' + self.sql.where;
		if(self.sql.order) sql += ' ' + self.sql.order;
		if(self.sql.limit) sql += ' ' + self.sql.limit;
		for(var i = 0; i < self.args.where.length; i++) args.push(self.args.where[i]);
		for(var i = 0; i < self.args.order.length; i++) args.push(self.args.order[i]);
		for(var i = 0; i < self.args.limit.length; i++) args.push(self.args.limit[i]);
		return [sql, args];
	};

	// Todo: constructor, move to top
	if(q) self.where(q, args);
}

/************************************************************************
 * RECORD MODEL
 *
 * Code using a record model should call the save/load/remove functions.
 * The model object should override the *_record() routines, which are called
 * by the higher-level save/load/remove functions.  *_record() calls the
 * lower-level fetch/store/erase to do the actual DB work.
 *
 * @param object db    The node-sqlite object.
 * @param string table The name of the DB table this model operates on.
 ************************************************************************/

var RecordModel = function(db, table) {
	var self = this;
	this.db = db;
	this.table = table || '';
	this.pk = 'id';
	
	/**
	 * Return a new instance of RecordSelector.
	 *
	 * @param string query The initial query fragment (optional)
	 * @param string arg1  Argument 1
	 * @param string ...   ...
	 * @param string argN  Argument N
	 */
	this.find = function() {
		var q = arguments[0] || "";
		var a = [];
		for(var i = 1; i < arguments.length; i++) a.push(arguments[i]);
		return new RecordSelector(q, a, self);
	};

	this.find_arr = function(q, args) {
		return new RecordSelector(q, args, self);
	}

	/**
	 * Load one or more records, executing a callback ONCE after all
	 * records have been retrieved.
	 *
	 * NB: An array of objects is ALWAYS returned, even if only one result
	 *     was found.
	 */
	this.load = function(id, cb) {
		var ids  = id instanceof Array ? id : [id];
		var recs = [];
		// if no records are found, an empty array is returned
		for(var i = 0, n = ids.length; i < ids.length; i++) {
			self.load_record(ids[i], function(d){
				if(d) recs.push(d);
				if(--n < 1) cb.call(self, recs);
			});
		}
	};

	/**
	 * Save a record.
	 */
	this.save = function(rec, cb) {
		self.save_record(rec, cb);
	};

	/**
	 * Remove a record.
	 */
	this.remove = function(id, cb) {
		self.remove_record(id, cb);
	};

/********** OVERRIDEABLES *******************************************/
	this.load_record = function(id, cb) {
		self.fetch(id, cb);
	};

	this.save_record = function(rec, cb) {
		self.store(rec, cb);
	};

	this.remove_record = function(id, cb) {
		self.erase(id, cb);
	}
/********** /OVERRIDEABLES ******************************************/

	/**
	 * Fetch a single row from the DB.
	 */
	this.fetch = function(id, cb) {
		self.db.query("SELECT * FROM "+self.table+" WHERE "+self.pk+"=? LIMIT 1", [id], function(recs){
			cb.call(self, recs.length ? recs[0] : false);
		});
	};

	/**
	 * Insert/update a row in the DB.  Callback receives the insert ID.
	 */
	this.store = function(row, cb) {
		get_schema(self.db, self.table, function(schema){
			var fields = [], vals = [], toks = [];
			var ins = [], upd = [];
			for(var x in row) {
				// ignore variables that don't have a column in the table
				if(!(x in schema)) continue;
				fields.push(x);
				vals.push(row[x]);
				ins.push("?");
				upd.push(x+"=?");
			}
			if(typeof row[self.pk] == 'undefined') {
				var sql = "INSERT INTO " + self.table + " ";
				sql += "(" + fields.join(",") + ") VALUES (" + ins.join(",") + ")";
				self.db.query(sql, vals, function(r){ cb.call(self, r.insertId) });
			} else {
				var sql = "UPDATE " + self.table + " SET " + upd.join(",") + " WHERE " + self.pk + "=?";
				vals.push(row[self.pk]);
				self.db.query(sql, vals, function(){ cb.call(self, row[self.pk]) });
			}
		});
	};

	/**
	 * Delete a row from the DB.
	 */
	this.erase = function(id, cb) {
		var cb = typeof cb == 'function' ? cb : function(){};
		var sql = "DELETE FROM "+self.table+" WHERE "+self.pk+"=?";
		self.db.query(sql, [id], function(){ cb.call(self) });
	};

	this.enum_schema = {
		from:     self.table,
		exprs:    [],
		gexprs:   [],
		select:   '*',
		where:    '',
		group_by: '',
		having:   '',
		order:    self.pk+" ASC",
		limit:     50
	};
};

exports.RecordModel    = RecordModel;
exports.RecordSelector = RecordSelector;
