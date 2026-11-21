import json
import os
import secrets
import string
from datetime import datetime

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

PORT = int(os.getenv("PORT", 1337))
APP_DIR = os.path.dirname(os.path.abspath(__file__))
PERSIST_DIR = os.path.join(APP_DIR, "persist")
os.makedirs(PERSIST_DIR, exist_ok=True)
last_highscore_id: int = 0


def storage_get(key):
    path = os.path.join(PERSIST_DIR, key)
    if not os.path.exists(path):
        return None
    with open(path, "r") as f:
        return f.read()


def storage_get_json(key):
    value = storage_get(key)
    if value is None:
        return None
    try:
        parsed = json.loads(value)
        if isinstance(parsed, str):
            parsed = json.loads(parsed)
        return parsed
    except json.JSONDecodeError, TypeError:
        return None


def storage_set(key, value):
    path = os.path.join(PERSIST_DIR, key)
    with open(path, "w") as f:
        f.write(value)


def log(log_message):
    timestamp = datetime.now().strftime("[ %Y-%m-%d %H:%M:%S ]  ")
    full_message = timestamp + log_message + "\n"
    print(full_message, end="")
    current_log = storage_get("log.txt")
    if current_log is None:
        current_log = ""
    current_log += full_message
    storage_set("log.txt", current_log)


def get_user_by_access_token(access_token):
    users = storage_get_json("users")
    if users:
        for u in users:
            if u.get("accessToken") == access_token:
                return u
    return None


def create_access_token():
    return "".join(
        secrets.choice(string.digits + string.ascii_lowercase) for _ in range(32)
    )


def init_last_highscore_id():
    global last_highscore_id
    val = storage_get("last_highscore_id")
    if val:
        last_highscore_id = int(val)
    else:
        last_highscore_id = 8000

    # never hand out ids that are already in use, older versions stored the
    # counter before incrementing it, which reused the last id after a restart
    highscores = storage_get_json("highscores")
    if highscores:
        last_highscore_id = max(last_highscore_id, max(h["id"] for h in highscores))


def new_id():
    global last_highscore_id
    # increment first, so the stored value is the last id actually handed out
    last_highscore_id += 1
    storage_set("last_highscore_id", str(last_highscore_id))
    return last_highscore_id


@app.post("/register")
def register():
    log("post request to /register")
    data = request.get_json(force=True)
    user = {
        "username": data.get("username", ""),
        "password": data.get("password", ""),
        "email": data.get("email", ""),
    }

    if len(user["username"]) < 5 or len(user["password"]) < 5:
        return jsonify({"status": "Bad username!"}), 400

    json_users = storage_get_json("users")
    if not json_users:
        json_users = []

    for u in json_users:
        if u["username"] == user["username"]:
            log("REGISTER: User " + user["username"] + " already exists")
            return jsonify({"status": "User already exists!"}), 409

    json_users.append(user)
    storage_set("users", json.dumps(json_users))

    log("REGISTER: User " + user["username"] + " registered.")
    return jsonify({"status": "OK"}), 200


@app.post("/login")
def login():
    log("post request to /login")
    data = request.get_json(force=True)
    login = {
        "username": data.get("username", ""),
        "password": data.get("password", ""),
    }

    json_users = storage_get_json("users")
    if not json_users:
        log("LOGIN: User " + login["username"] + " does not exist.")
        return jsonify({"status": "Not a user!"}), 401

    for u in json_users:
        if u["username"] == login["username"]:
            if u["password"] == login["password"]:
                u["accessToken"] = create_access_token()
                log("User " + u["username"] + " AccesToken " + u["accessToken"])
                storage_set("users", json.dumps(json_users))

                log("LOGIN: User " + login["username"] + " logged in.")

                return jsonify({"access_token": u["accessToken"]}), 200

    log("LOGIN: Login failed for user " + login["username"] + " : " + login["password"])
    return jsonify({"status": "Not a user!"}), 401


@app.get("/highscores/local")
def highscores_local():
    log("get request to /highscores/local")
    access_token = request.args.get("accessToken")
    user = get_user_by_access_token(access_token)
    if user:
        highscores = storage_get_json("highscores")
        if highscores:
            local_highscores = []
            for highscore in highscores:
                if highscore["user"] == user["username"]:
                    local_highscores.append(highscore)
            local_highscores.sort(key=lambda h: (-h["score"], h["time"]))
            return jsonify(local_highscores)
        else:
            return jsonify([])
    else:
        return jsonify({"status": "Not a user!"}), 401


@app.get("/highscores/global")
def highscores_global():
    log("get request to /highscores/global")
    limit = request.args.get("limit")
    highscores = storage_get_json("highscores")
    if highscores:
        highscores.sort(key=lambda h: (-h["score"], h["time"]))

        if limit:
            highscores = highscores[: int(limit)]
        return jsonify(highscores)
    else:
        return jsonify([])


@app.post("/highscores")
def post_highscore():
    log("post request to /highscores")
    user_agent = request.headers.get("user-agent", "")
    log("HIGHSCORE POST: user agent: " + user_agent)
    if "Android" not in user_agent:
        return (
            jsonify(
                {
                    "status": "Illegal device, please send highscores from an Android device!!!"
                }
            ),
            403,
        )

    access_token = request.args.get("accessToken")
    user = get_user_by_access_token(access_token)
    if user:
        data = request.get_json(force=True)
        highscore = {
            "id": new_id(),
            "user": user["username"],
            "score": data.get("score", 0),
            "time": data.get("time", 0),
            "date": int(datetime.now().timestamp() * 1000),
        }

        log(
            "HIGHSCORE POST: new highscore from user: "
            + highscore["user"]
            + ", with score: "
            + str(highscore["score"])
        )

        check_highscore(user, highscore["score"], highscore["time"])

        highscores = storage_get_json("highscores")

        if not highscores:
            highscores = []

        highscores.append(highscore)

        storage_set("highscores", json.dumps(highscores))

        return jsonify({"status": "OK"}), 200
    else:
        return jsonify({"status": "Not a user!"}), 401


def check_highscore(user, score, time):
    highscores = storage_get_json("highscores")
    if highscores:
        highscores.sort(key=lambda h: (-h["score"], h["time"]))

        if highscores and user["username"] == highscores[0]["user"]:
            log(
                "HIGHSCORE POST: user already has the highest score, not sending notification..."
            )
            return
        if highscores and user["username"] != highscores[0]["user"]:
            log("HIGHSCORE POST: highest score: " + str(highscores[0]["score"]))
            if highscores[0]["score"] < score or (
                highscores[0]["score"] == score and highscores[0]["time"] > time
            ):
                log("HIGHSCORE POST: highscore beaten!")
                username = highscores[0]["user"]
                json_users = storage_get_json("users")
                if json_users:
                    for u in json_users:
                        if u["username"] == username:
                            log(
                                "HIGHSCORE POST: user with old highest score found: "
                                + username
                            )
                            if u.get("fcm_registration_token"):
                                log(
                                    "HIGHSCORE POST: found token to sent notification to"
                                )
                                send_notification_to_user(
                                    u["fcm_registration_token"],
                                    user["username"],
                                    score,
                                )
                            break
            else:
                log("HIGHSCORE POST: highscore not beaten, not sending notification...")


def send_notification_to_user(fcm_token, username, score):
    log("HIGHSCORE POST: sending notification")
    options = {
        "url": "https://fcm.googleapis.com/fcm/send",
        "headers": {
            "Content-Type": "application/json",
            "Authorization": "key=" + os.environ.get("FCM_TOKEN", ""),
        },
        "json": {
            "to": fcm_token,
            "notification": {
                "body": "Highscore beaten by "
                + username
                + " ("
                + str(score)
                + " points)",
                "title": "Mr. Nom highscore beaten!",
            },
        },
    }
    try:
        response = requests.post(**options)
        log(
            "FIREBASE NOTIFICATION: error: "
            + str(response.status_code)
            + "response: "
            + response.text
            + "body: "
            + response.text
        )
    except Exception as e:
        log("FIREBASE NOTIFICATION: error: " + str(e))


@app.post("/fcm_registration_token")
def fcm_registration_token():
    data = request.get_json(force=True)
    token = data.get("registration_token", "")
    access_token = request.args.get("accessToken")

    json_users = storage_get_json("users")
    if json_users:
        for u in json_users:
            if u.get("accessToken") == access_token:
                u["fcm_registration_token"] = token
                log("FCM_TOKEN: user:" + u["username"] + " fcm_token: " + token)
                break
        storage_set("users", json.dumps(json_users))
    return jsonify({"status": "OK"}), 200


if __name__ == "__main__":
    init_last_highscore_id()
    log("INFO: Server running on port " + str(PORT))
    app.run(host="0.0.0.0", port=PORT)
