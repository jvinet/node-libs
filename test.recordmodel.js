var sys     = require("sys");
var sqlite  = require("sqlite");

var inspect = require("./eyes").inspector();
var rm      = require("./recordmodel");

var db = sqlite.openDatabaseSync("db/db.sq3");

var model = new rm.RecordModel(db, "fiasco_users");

model.find("username=?", "judd").load(function(recs){
	inspect(recs);
});


var rec = {
	username: 'superdude',
	password: 'smellycat123',
	email:    'testy@mctestington.com'
};

model.save(rec, function(id) {
	sys.puts("Saved, new ID = "+id);
});

model.find("email LIKE 'testy%'").load(function(recs){
	sys.puts("Found "+recs.length+" records");
	inspect(recs);
});

model.find("email LIKE 'testy%'").remove(function(){
	sys.puts("Deleted 'em all!");
	model.find().load(function(recs){
		sys.puts("Here's what's left:");
		inspect(recs);
	});
});

model.load(1, function(rec){
	sys.puts("This is ID 1");
	inspect(rec);
});
