var express = require("express"),
    expressValidator = require("express-validator");
app = express(); module.exports = app;

var apiPrefix = "/api";

app.set("port", process.env.PORT || 8000);

var server = app.listen(app.get("port"), function() {
    console.log('Express server listening on port ' + server.address().port);
});
require("./socket").socket(server);

app.use(function(req, res, next) {

    req.checkQuery("at").isInt();
    if (req.validationErrors()) {
        return res.invalidInput();
    }
    var at = parseInt(req.query["at"]);

    if (at <= 0) {
        return res.invalidInput();
    }
    req.at = at;

    next();
});

var profile = require("./routes/profile");
app.use(apiPrefix + "/profile", profile);

var messages = require("./routes/messages");
app.use(apiPrefix + "/messages", messages);
