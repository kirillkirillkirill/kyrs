exports = module.exports;
var db = require("../database"),
    async = require("async");

Array.prototype.contains = function(k) {
    for (var i=0; i < this.length; i++) {
        if (this[i] == k) {
            return true;
        }
    }
    return false;
};

var usersFields = ["user_id", "username", "firstname", "lastname", "photo", "lastseen", "online", "contacts_count"];
exports.usersFields = usersFields;

exports.getUsers = getUsers;
function getUsers(at, ids, callback) {
    if (!ids || !ids.length) { return callback(null, []) }

    db.query("SELECT " + usersFields.join() + ", contact(?, user_id) contact" + " FROM users_view WHERE user_id IN (" + ids.join() + ")", [at], function(err, users) {
        callback(err, users);
    });
}

exports.getFollowersIds = getFollowersIds;
function getFollowersIds(id, callback) {
    db.query("SELECT user_id FROM friendship WHERE follow_id = ?", [id], function(err, rows) {
        if (err) return callback(err);

        var contacts = rows.map(function(row) { return row["user_id"] });
        callback(null, contacts);
    });
}

exports.getPhotos = getPhotos;
function getPhotos(ids, callback) {
    if (!ids || !ids.length) { return callback(null, []) }

    db.query("SELECT photo_id, photo, width, height FROM photos WHERE photo_id IN (" + ids.join() + ")", function(err, photos) {
        callback(err, photos);
    });
}

exports.getPhotosMap = getPhotosMap;
function getPhotosMap(ids, callback) {
    getPhotos(ids, function(err, photos) {
        if (err) return callback(err, null);

        var photosMap = {};
        photos.forEach(function (p) {
            photosMap[p["photo_id"]] =
            {
                file: p["photo"],
                w: p["width"],
                h: p["height"]
            };
        });

        callback(err, photosMap);
    });
}

exports.getGroupMembersIds = getGroupMembersIds;
function getGroupMembersIds(id, callback) {
    db.query("SELECT member_id FROM groups_members WHERE group_id = ? and suspended = 0", id, function (err, rows) {
        if (err) return callback(err);

        var members = rows.map(function(row) { return row["member_id"] });
        callback(null, members);
    });
}

exports.getGroupMembers = getGroupMembers;
function getGroupMembers(id, callback) {
    db.query("SELECT member_id, invited_id FROM groups_members WHERE group_id = ? and suspended = 0", id, function (err, rows) {
        if (err) return callback(err);

        callback(null, rows);
    });
}

exports.getGroups = getGroups;
function getGroups(at, ids, callback) {
    if (!ids || !ids.length) { return callback(null, []) }

    db.query("SELECT group_id, creator_id, name, photo FROM groups WHERE group_id IN (" + ids.join() + ")", function (err, groups) {
        if (err) return callback(err);

        var tasks = [];
        groups.forEach(function (g) {
            tasks.push(function (callback) {
                db.query("SELECT suspended FROM groups_members WHERE group_id = ? AND member_id = ?", [g["group_id"], at], function(err, rows) {
                    if (err) return callback(err);

                    if (rows.length == 1 && rows[0]["suspended"] == 1) {
                        g["suspended"] = 1;
                        callback();

                    } else {

                        getGroupMembers(g["group_id"], function (err, members) {
                            if (err) return callback(err);

                            var membersIds = members.map(function(member) { return member["member_id"] });
                            if (membersIds.contains(at)) {
                                g["members"] = members;
                            }

                            callback();
                        });
                    }
                });
            });
        });

        async.parallel(tasks,
            function (err) {
                callback(err, groups);
            }
        );
    });

}

exports.comprehendMessages = function(at, messages, callback) {

    var usersIds = [];
    var groupsIds = [];
    var photosIds = [];
    var actionsIds = [];

    messages.forEach(function (c) {
        var groupId = c["group_id"];
        var toId = c["to_id"];
        var fromId = c["from_id"];
        if (groupId) {
            groupsIds.push(groupId);
        } else {
            usersIds.push(toId);
        }
        usersIds.push(fromId);

        var photoId = c["photo_id"];
        if (photoId) {
            photosIds.push(photoId);
        }

        var actionId = c["action_id"];
        if (actionId) {
            actionsIds.push(actionId);
        }
    });

    var actionsMap = {};

    if (actionsIds.length > 0) {
        db.query("SELECT action_id, action, name, photo, user_id FROM actions WHERE action_id IN (" + actionsIds.join() + ")", function (err, actions) {
            if (err) return (err);

            actions.forEach(function (a) {
                actionsMap[a["action_id"]] = {
                    type: a["action"],
                    name: a["name"],
                    photo: a["photo"],
                    user_id: a["user_id"]
                };

                var userId = a["user_id"];
                if (userId) {
                    usersIds.push(userId);
                }
            });

            comprehend();
        });

    } else {
        comprehend();
    }

    function comprehend() {
        var tasks = {
            users: function (callback) {
                getUsers(at, usersIds, function(err, rows) {
                    callback(err, rows);
                });
            },
            groups: function (callback) {
                getGroups(at, groupsIds, function(err, rows) {
                    callback(err, rows);
                });
            }
        };

        if (photosIds.length > 0) {
            tasks.photosMap = function (callback) {
                getPhotosMap(photosIds, function(err, rows) {
                    callback(err, rows);
                });
            }
        }

        async.parallel(tasks, function (err, results) {
            if (err) return callback(err);

            messages.forEach(function (m) {
                if (m["photo_id"]) {
                    m["photo"] = results.photosMap[m["photo_id"]];
                    delete m["photo_id"];
                }

                if (m["action_id"]) {
                    m["action"] = actionsMap[m["action_id"]];
                    delete m["action_id"];
                }
            });

            callback(null, {messages: messages, users: results.users, groups: results.groups});
        });
    }
};
