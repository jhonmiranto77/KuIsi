from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room
import random
import string

app = Flask(__name__)
app.config["SECRET_KEY"] = "rahasia_kuisi_123"

socketio = SocketIO(app, cors_allowed_origins="*", max_http_buffer_size=10 * 1024 * 1024)

active_games = {}


def generate_pin():
    """Membuat 4 digit PIN unik berupa angka"""
    while True:
        pin = "".join(random.choices(string.digits, k=4))
        if pin not in active_games:
            return pin


@app.route("/")
def index():
    return render_template("index.html")

@socketio.on("host_create_quiz")
def handle_create_quiz(data):
    """Host mengirimkan judul, batas waktu, batas pemain, dan daftar soal"""
    try:
        max_players = int(data.get("max_players", 36))
    except (ValueError, TypeError):
        max_players = 36

    if max_players < 1 or max_players > 36:
        emit("error_msg", {"message": "Batas jumlah pemain tidak valid! Harus antara 1 sampai 36."})
        return

    pin = generate_pin()
    host_sid = request.sid
    active_games[pin] = {
        "host_sid": host_sid,
        "title": data.get("title", "Kuis Tanpa Judul"),
        "time_limit": data.get("time_limit", 20),
        "max_players": max_players,
        "questions": data.get("questions", []),
        "players": {},
        "status": "WAITING",
    }
    join_room(pin)
    emit("quiz_created", {"pin": pin})


@socketio.on("host_start_quiz")
def handle_start_quiz(data):
    """Host menekan tombol mulai"""
    pin = data.get("pin")
    if pin in active_games and active_games[pin]["host_sid"] == request.sid:
        active_games[pin]["status"] = "PLAYING"
        emit(
            "game_started",
            {
                "title": active_games[pin]["title"],
                "time_limit": active_games[pin]["time_limit"],
                "questions": active_games[pin]["questions"],
            },
            to=pin,
        )

@socketio.on("player_join")
def handle_player_join(data):
    """Pemain masuk menggunakan PIN dan Nama"""
    pin = data.get("pin")
    name = data.get("name")
    player_sid = request.sid

    if pin in active_games and active_games[pin]["status"] == "WAITING":
        max_p = active_games[pin]["max_players"]
        if len(active_games[pin]["players"]) >= max_p:
            emit(
                "error_msg",
                {"message": f"Maaf, ruangan sudah penuh (Maksimal {max_p} pemain)!"},
            )
            return

        active_games[pin]["players"][player_sid] = {
            "name": name,
            "score": 0,
            "done": False,
        }
        join_room(pin)
        emit("join_success", {"title": active_games[pin]["title"]})

        player_names = [p["name"] for p in active_games[pin]["players"].values()]
        emit("lobby_update", {"players": player_names}, to=pin)
    else:
        emit("error_msg", {"message": "PIN tidak valid atau Kuis sudah dimulai!"})


@socketio.on("player_update_score")
def handle_update_score(data):
    """Pemain mengirim skor baru"""
    pin = data.get("pin")
    added_score = data.get("added_score", 0)
    is_done = data.get("is_done", False)
    player_sid = request.sid

    if pin in active_games and player_sid in active_games[pin]["players"]:
        active_games[pin]["players"][player_sid]["score"] += added_score
        active_games[pin]["players"][player_sid]["done"] = is_done

        leaderboard = list(active_games[pin]["players"].values())
        leaderboard = sorted(leaderboard, key=lambda x: x["score"], reverse=True)

        emit("live_leaderboard_update", {"leaderboard": leaderboard}, to=pin)


@socketio.on("disconnect")
def handle_disconnect():
    """Menangani diskoneksi klien"""
    sid = request.sid
    for pin, game in list(active_games.items()):
        if game["host_sid"] == sid:
            emit(
                "host_ended_session",
                {"message": "Host telah mengakhiri sesi."},
                to=pin,
            )
            del active_games[pin]
            break
        elif sid in game["players"]:
            del game["players"][sid]
            if game["status"] == "WAITING":
                player_names = [p["name"] for p in game["players"].values()]
                emit("lobby_update", {"players": player_names}, to=pin)
            break

if __name__ == "__main__":
    import os

    port = int(os.environ.get("SERVER_PORT") or os.environ.get("PORT") or 5000)
    print(f"KuIsi running on 0.0.0.0:{port}", flush=True)
    socketio.run(app, host="0.0.0.0", port=port)