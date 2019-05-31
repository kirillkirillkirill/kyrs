var router = require("express").Router(); module.exports = router;
var db = require("../database"),
    helper = require("./helper");

var socket = require("../socket");
var socketEventEmitter = socket.eventEmitter;

Array.prototype.contains = function(k) {
    for (var i=0; i < this.length; i++) {
        if (this[i] == k) {
            return true;
        }
    }
    return false;
};

router.get("/getchats", function(req, res) {

    req.checkQuery("offset").optional().isInt();
    req.checkQuery("count").optional().isInt();

    var offset = req.query["offset"] || 0;
    var count = req.query["count"] || 20;

    if (req.validationErrors()) {
        return res.invalidInput();
    }

    var at = req.at;

    db.query("CALL chat.get_chats(?, ?, ?)", [at, offset, count], function(err, results) {
        if (err) return res.error(err);

        helper.comprehendMessages(at, results[0], function(err, result) {
            if (err) return res.error(err);

            res.json({messages: result.messages, users: result.users, groups: result.groups});
        });
    });
});

router.get("/get", function(req, res) {

    req.checkQuery("offset").optional().isInt();
    req.checkQuery("start_id").optional().isInt();
    req.checkQuery("count").optional().isInt();
    req.checkQuery("user_id").optional().isInt();
    req.checkQuery("group_id").optional().isInt();

    var user_id = req.query["user_id"];
    var group_id = req.query["group_id"];
    var start_id = req.query["start_id"];
    var offset = req.query["offset"] || 0;
    var count = req.query["count"] || 20;

    console.log("user_id = " + user_id + ", group_id = " + group_id + ", count = " + count);

    if (req.validationErrors() || !(user_id || group_id)) {
        return res.invalidInput();
    }

    var at = req.at;

    if (user_id) {
        db.query("CALL get_messages(?, ?, ?, ?, ?)", [at, user_id, offset, start_id, count], respond);
    } else {
        db.query("CALL get_group_messages(?, ?, ?, ?, ?)", [at, group_id, offset, start_id, count], respond);
    }

    function respond(err, results) {
        if (err) return res.error(err);

        helper.comprehendMessages(at, results[0], function(err, result) {
            if (err) return res.error(err);

            res.json({messages: result.messages, users: result.users, groups: result.groups});
        });
    }
});

router.get("/read", function(req, res) {

    req.checkQuery("message_id").isInt();
    req.checkQuery("user_id").optional().isInt();
    req.checkQuery("group_id").optional().isInt();

    var user_id = req.query["user_id"];
    var group_id = req.query["group_id"];
    if (user_id) { user_id = parseInt(user_id) }
    if (group_id) { group_id = parseInt(group_id) }

    if (req.validationErrors() || !(user_id || group_id)) {
        return res.invalidInput();
    }

    var message_id = parseInt(req.query["message_id"]);
    var at = req.at;

    if (user_id) {
        db.query("call read_messages(?, ?, ?)", [at, user_id, message_id], function(err) {
            if (err) return res.error(err);

            socketEventEmitter.emit(socket.events.read, [user_id], {user_id: at, message_id: message_id});

            res.ok();
        });
    } else {
        db.query("call read_group_messages(?, ?, ?)", [at, group_id, message_id], function(err, resultSets) {
            if (err) return res.error(err);

            var usersIds = resultSets[0].map(function(row) { return row["from_id"] });

            socketEventEmitter.emit(socket.events.read, usersIds, {group_id: group_id, message_id: message_id});

            res.ok();
        });
    }
});

router.get("/type", function(req, res) {

    req.checkQuery("user_id").optional().isInt();
    req.checkQuery("group_id").optional().isInt();

    var user_id = parseInt(req.query["user_id"]);
    var group_id = parseInt(req.query["group_id"]);

    if (req.validationErrors() || !(user_id || group_id)) {
        return res.invalidInput();
    }

    var at = req.at;

    if (user_id) {
        socketEventEmitter.emit(socket.events.type, [user_id], {user_id: at});
    } else {
        helper.getGroupMembersIds(group_id, function(err, members) {

            if (!err) {
                delete members[members.indexOf(at)];
                socketEventEmitter.emit(socket.events.type, members, {group_id: group_id, user_id: at});
            }
        });
    }

    res.ok();
});