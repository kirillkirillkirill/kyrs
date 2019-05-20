exports = module.exports;
var db = require("./database"),
    helper = require("./routes/helper"),
    profile = require("./routes/profile");

var events = {
    online: "online",
    offline: "offline",
    type: "type",
    read: "read",
    message: "message"
};
exports.events = events;

exports.socket = function(server) {

    var messageFields = ["message_id", "from_id", "to_id", "group_id", "read_state", "time", "text", "photo_id", "action_id"];

    var eventsLib = require('events');
    var eventEmitter = new eventsLib.EventEmitter();
    exports.eventEmitter = eventEmitter;

    var url = require('url'),
        WebSocketServer = require('ws').Server,
        wss = new WebSocketServer({server: server});

    wss.on("connection", function connection(ws) {
        var location = url.parse(ws.upgradeReq.url, true);
        var at = parseInt(location.query["at"]);

        profile.setOnline(at, function(){});

        var listenerOnline = function(ids, user_id) {
            if (ids.contains(at)) {
                ws.send(JSON.stringify({
                    event: "online",
                    object: {user_id: user_id}
                }));
            }
        };
        eventEmitter.on(events.online, listenerOnline);

        var listenerOffline = function(ids, user_id) {
            if (ids.contains(at)) {
                ws.send(JSON.stringify({
                    event: "offline",
                    object: {user_id: user_id}
                }));
            }
        };
        eventEmitter.on(events.offline, listenerOffline);

        var listenerType = function(ids, info) {
            if (ids.contains(at)) {
                ws.send(JSON.stringify({
                    event: "type",
                    object: info
                }));
            }
        };
        eventEmitter.on(events.type, listenerType);

        var listenerRead = function(ids, info) {
            if (ids.contains(at)) {
                ws.send(JSON.stringify({
                    event: "read",
                    object: info
                }));
            }
        };
        eventEmitter.on(events.read, listenerRead);

        var listenerMessage = function(ids, message_id) {
            if (ids.contains(at)) {
                db.query("SELECT " + messageFields.join() + ", unread_count(?, if(? = from_id, to_id, from_id), group_id) unread_count FROM messages_view WHERE owner_id = ? AND message_id = ?", [at, at, at, message_id], function (err, messages) {
                    if (err) return res.error();

                    helper.comprehendMessages(at, messages, function (err, result) {
                        if (err) return res.error(err);

                        ws.send(JSON.stringify({
                            event: "message",
                            object: {
                                messages: result.messages,
                                users: result.users,
                                groups: result.groups
                            }
                        }));
                    });
                });
            }
        };
        eventEmitter.on(events.message, listenerMessage);

        ws.on("close", function close() {
            profile.setOffline(at, function(){});

            eventEmitter.removeListener(events.message, listenerMessage);
            eventEmitter.removeListener(events.online, listenerOnline);
            eventEmitter.removeListener(events.offline, listenerOffline);
            eventEmitter.removeListener(events.read, listenerRead);
            eventEmitter.removeListener(events.type, listenerType);
        });
    });
};