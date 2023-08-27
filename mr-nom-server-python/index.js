var express = require("express");
var storage = require("node-persist");
var request = require("request");

var app = express();

var bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

storage.initSync();

app.post("/register", function (req, res) {
  log("post request to /register");
  var user = {
    username: req.body.username,
    password: req.body.password,
    email: req.body.email,
  };

  if (user.username.length < 5 || user.password.length < 5) {
    res.status(400).json({ status: "Bad username!" }).send();
    return;
  }

  var users = storage.getItem("users");

  if (!users) {
    users = "[]";
  }

  var jsonUsers = JSON.parse(users);

  for (var i = 0; i < jsonUsers.length; i++) {
    var u = jsonUsers[i];
    if (u.username == user.username) {
      log("REGISTER: User " + user.username + " already exists");
      res.status(409).json({ status: "User already exists!" }).send();
      return;
    }
  }

  jsonUsers.push(user);

  storage.setItem("users", JSON.stringify(jsonUsers));

  log("REGISTER: User " + user.username + " registered.");
  res.status(200).json({ status: "OK" }).send();
});

app.post("/login", function (req, res) {
  log("post request to /login");
  var login = {
    username: req.body.username,
    password: req.body.password,
  };

  var users = storage.getItem("users");
  if (!users) {
    log("LOGIN: User " + login.username + " does not exist.");
    res.status(401).json({ status: "Not a user!" }).send();
    return;
  }

  var jsonUsers = JSON.parse(users);
  for (var i = 0; i < jsonUsers.length; i++) {
    var u = jsonUsers[i];
    if (u.username == login.username) {
      if (u.password == login.password) {
        u.accessToken = createAccessToken();
        log("User " + u.username + " AccesToken " + u.accessToken);
        storage.setItem("users", JSON.stringify(jsonUsers));

        log("LOGIN: User " + login.username + " logged in.");

        res.status(200).json({ access_token: u.accessToken }).send();
        return;
      }
    }
  }

  log(
    "LOGIN: Login failed for user " + login.username + " : " + login.password
  );
  res.status(401).json({ status: "Not a user!" }).send();
});

app.get("/highscores/local", function (req, res) {
  log("get request to /highscores/local");
  var accessToken = req.query.accessToken;
  var user = getUserByAccessToken(accessToken);
  if (user) {
    var highscores = storage.getItem("highscores");
    if (highscores) {
      highscores = JSON.parse(highscores);
      var localHighscores = [];
      for (var i = 0; i < highscores.length; i++) {
        var highscore = highscores[i];
        if (highscore.user == user.username) {
          localHighscores.push(highscore);
        }
      }
      localHighscores.sort(function (left, right) {
        if (left.score == right.score) {
          return left.time - right.time;
        } else {
          return right.score - left.score;
        }
      });
      res.send(localHighscores);
    } else {
      res.send([]);
    }
  } else {
    res.status(401).json({ status: "Not a user!" }).send();
  }
});

app.get("/highscores/global", function (req, res) {
  log("get request to /highscores/global");
  var limit = req.query.limit;
  var highscores = storage.getItem("highscores");
  if (highscores) {
    highscores = JSON.parse(highscores);

    highscores = highscores.sort(function (left, right) {
      if (left.score == right.score) {
        return left.time - right.time;
      } else {
        return right.score - left.score;
      }
    });

    if (limit) {
      highscores = highscores.slice(0, limit);
    }
    res.send(highscores);
  } else {
    res.send([]);
  }
});

app.post("/highscores", function (req, res) {
  log("post request to /highscores");
  var userAgent = req.headers["user-agent"];
  log("HIGHSCORE POST: user agent: " + userAgent);
  if (userAgent.indexOf("Android") == -1) {
    res
      .status(403)
      .json({
        status:
          "Illegal device, please send highscores from an Android device!!!",
      })
      .send();
    return;
  }
  var accessToken = req.query.accessToken;
  var user = getUserByAccessToken(accessToken);
  if (user) {
    var highscore = {
      id: newId(),
      user: user.username,
      score: req.body.score,
      time: req.body.time,
      date: Date.now(),
    };

    log(
      "HIGHSCORE POST: new highscore from user: " +
        highscore.user +
        ", with score: " +
        highscore.score
    );

    checkHighscore(user, highscore.score, highscore.time);

    var highscores = storage.getItem("highscores");

    if (!highscores) {
      highscores = "[]";
    }

    highscores = JSON.parse(highscores);

    highscores.push(highscore);

    storage.setItem("highscores", JSON.stringify(highscores));

    res.status(200).json({ status: "OK" }).send();
  } else {
    res.status(401).json({ status: "Not a user!" }).send();
  }
});

function checkHighscore(user, score, time) {
  var highscores = storage.getItem("highscores");
  if (highscores) {
    highscores = JSON.parse(highscores);

    highscores = highscores.sort(function (left, right) {
      if (left.score == right.score) {
        return left.time - right.time;
      } else {
        return right.score - left.score;
      }
    });

    if (user.username == highscores[0].user) {
      // new score is from user that already has the top score -> ignore
      log(
        "HIGHSCORE POST: user already has the highest score, not sending notification..."
      );
      return;
    }
    if (highscores[0] && user.username != highscores[0].user) {
      log("HIGHSCORE POST: highest score: " + highscores[0].score);
      if (
        highscores[0].score < score ||
        (highscores[0].score == score && highscores[0].time > time)
      ) {
        log("HIGHSCORE POST: highscore beaten!");
        var username = highscores[0].user;
        var jsonUsers = storage.getItem("users");
        if (jsonUsers) {
          jsonUsers = JSON.parse(jsonUsers);
          for (var i = 0; i < jsonUsers.length; i++) {
            var u = jsonUsers[i];
            if (u.username == username) {
              log(
                "HIGHSCORE POST: user with old highest score found: " + username
              );
              if (u.fcm_registration_token) {
                log("HIGHSCORE POST: found token to sent notification to");
                sendNotificationToUser(
                  u.fcm_registration_token,
                  user.username,
                  score
                );
              }
            }
          }
        }
      } else {
        log(
          "HIGHSCORE POST: highscore not beaten, not sending notification..."
        );
      }
    }
  }
}

function sendNotificationToUser(fcmToken, username, score) {
  log("HIGHSCORE POST: sending notification");
  var options = {
    url: "https://fcm.googleapis.com/fcm/send",
    headers: {
      "Content-Type": "application/json",
      Authorization: `key=${process.env.FCM_TOKEN}`,
    },
    body: JSON.stringify({
      to: fcmToken,
      notification: {
        body: "Highscore beaten by " + username + " (" + score + " points)",
        title: "Mr. Nom highscore beaten!",
      },
    }),
    method: "POST",
  };
  var callback = function (error, response, body) {
    log(
      "FIREBASE NOTIFICATION: error: " +
        error +
        "response: " +
        response +
        "body: " +
        body
    );
  };

  request(options, callback);
}

/**
 * @param req.body.registration_token   registration token from request body
 */
app.post("/fcm_registration_token", function (req, res) {
  var token = req.body.registration_token;
  var accessToken = req.query.accessToken;

  var jsonUsers = storage.getItem("users");
  if (jsonUsers) {
    jsonUsers = JSON.parse(jsonUsers);
    for (var i = 0; i < jsonUsers.length; i++) {
      var u = jsonUsers[i];
      if (u.accessToken == accessToken) {
        u.fcm_registration_token = token;
        log("FCM_TOKEN: user:" + u.username + " fcm_token: " + token);
        break;
      }
    }
  }
  storage.setItem("users", JSON.stringify(jsonUsers));
  res.status(200).json({ status: "OK" }).send();
});

var port = 1338;
app.listen(port, function () {
  log("INFO: Server running on port " + port);
  lastHighscoreId = storage.getItem("last_highscore_id");
  if (!lastHighscoreId) {
    lastHighscoreId = 8000;
  }
});

function log(logMessage) {
  // log to console
  console.log(getFormattedDate() + logMessage);

  // log to file
  var currentLog = storage.getItem("log.txt");
  if (!currentLog) {
    currentLog = "";
  }
  currentLog += getFormattedDate() + logMessage + "\n";
  storage.setItem("log.txt", currentLog);
  // to view log, open in n++ and replace "\n" with real \n
  // since '\n' are added as \ and n characters in the log file
}

function getFormattedDate() {
  var date = new Date();
  var day = (date.getDate() <= 9 ? "0" : "") + date.getDate();
  var month = (date.getMonth() <= 8 ? "0" : "") + (date.getMonth() + 1);
  var year = date.getFullYear();
  var hour = (date.getHours() <= 9 ? "0" : "") + date.getHours();
  var minutes = (date.getMinutes() <= 9 ? "0" : "") + date.getMinutes();
  var seconds = (date.getSeconds() <= 9 ? "0" : "") + date.getSeconds();

  return (
    "[ " +
    year +
    "-" +
    month +
    "-" +
    day +
    " " +
    hour +
    ":" +
    minutes +
    ":" +
    seconds +
    " ]  "
  );
}

function getUserByAccessToken(accessToken) {
  var jsonUsers = storage.getItem("users");
  if (jsonUsers) {
    jsonUsers = JSON.parse(jsonUsers);
    for (var i = 0; i < jsonUsers.length; i++) {
      var u = jsonUsers[i];
      if (u.accessToken == accessToken) {
        return u;
      }
    }
  }
  return null;
}

function createAccessToken() {
  return (
    Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2)
  );
}

var lastHighscoreId;
function newId() {
  storage.setItem("last_highscore_id", lastHighscoreId++);
  return lastHighscoreId;
}
