var router = require("express").Router(); module.exports = router;
exports = module.exports;
var db = require("../database"),
    helper = require("./helper");

router.get("/get", function(req, res) {

    helper.getUsers(req.at, [req.at], function(err, result) {
        if (err) return res.error(err);

        res.json(result[0]);
    });
});

router.get("/edit", function(req, res) {

    req.checkQuery("username").optional().isAlphanumeric();

    if (req.validationErrors()) {
        return res.invalidInput();
    }

    var at = req.at;
    var username = req.query["username"];
    var firstname = req.query["firstname"];
    var lastname = req.query["lastname"];

    var updates = [], params = [];
    if (username) {
        updates.push("username = ?");
        params.push(username);
    }
    if (firstname) {
        updates.push("firstname = ?");
        params.push(firstname);
    }
    if (lastname) {
        updates.push("lastname = ?");
        params.push(lastname);
    }
    params.push(at);

    if (updates.length == 0) {
        return res.invalidInput();
    } else {
        db.query("UPDATE users SET " + updates.join() + " WHERE user_id = ?", params, function (err) {
            if (err) return res.error(err);

            helper.getUsers(at, [at], function (err, users) {
                if (err) return res.error(err);

                res.json(users[0])
            });
        });
    }

});

var socket = require("../socket");

router.get("/online", function(req, res) {
    var at = req.at;

    console.log(at);

    setOnline(at, function (err) {
        if (err) res.error(err);

        res.ok();
    });
});

exports.setOnline = setOnline;
function setOnline(at, callback) {
    console.log(at);

    db.query("SELECT online FROM users WHERE user_id = ?", [at], function(err, rows) {
        if (err) return callback(err);

        if (!rows[0]) {
            return callback("no rows for at = " + at);
        }

        var online = rows[0]["online"];

        if (!online) {

            db.query("UPDATE users SET online = 1, lastseen = now() WHERE user_id = ?", [at], function (err) {
                if (err) return callback(err);

                helper.getFollowersIds(at, function (err, contacts) {
                    if (err) return;

                    socket.eventEmitter.emit(socket.events.online, contacts, at);
                });

                callback();
            });
        } else {
            callback();
        }
    });
}

router.get("/offline", function(req, res) {
    var at = req.at;

    setOffline(at, function (err) {
        if (err) res.error(err);

        res.ok();
    });
});

exports.setOffline = setOffline;
function setOffline(at, callback) {

    db.query("SELECT online FROM users WHERE user_id = ?", [at], function(err, rows) {
        if (err) return callback(err);

        if (!rows[0]) {
            return callback("no rows for at = " + at);
        }

        var online = rows[0]["online"];

        if (online) {

            db.query("UPDATE users SET online = 0, lastseen = now() WHERE user_id = ?", [at], function(err) {
                if (err) return callback(err);

                helper.getFollowersIds(at, function(err, contacts) {
                    if (err) return;

                    socket.eventEmitter.emit(socket.events.offline, contacts, at);
                });

                callback();
            });
        }
    });
}
