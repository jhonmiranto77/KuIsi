const socket = io();

let isHost = false;
let myPin = "";
let myQuestions = [];
let currentQuestionIndex = 0;
let myScore = 0;

let timeLimit = 20;
let timeLeft = 20;
let timerInterval;

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

let draftQuestions = [];

function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxWidth = 600;
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = () => resolve(e.target.result);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

async function addQuestion() {
    const qText = document.getElementById('q-text').value;
    const opt0 = document.getElementById('opt-0').value;
    const opt1 = document.getElementById('opt-1').value;
    const opt2 = document.getElementById('opt-2').value;
    const opt3 = document.getElementById('opt-3').value;
    const correctIdx = parseInt(document.getElementById('correct-opt').value);
    const fileInput = document.getElementById('q-image');

    if (!qText || !opt0 || !opt1 || !opt2 || !opt3) {
        alert("Harap isi semua kolom pertanyaan dan pilihan!");
        return;
    }

    let imageData = null;
    if (fileInput.files && fileInput.files[0]) {
        imageData = await compressImage(fileInput.files[0]);
    }

    draftQuestions.push({
        q: qText,
        image: imageData,
        options: [opt0, opt1, opt2, opt3],
        answer: correctIdx
    });

    ['q-text', 'opt-0', 'opt-1', 'opt-2', 'opt-3'].forEach(id => document.getElementById(id).value = "");
    fileInput.value = "";
    document.getElementById('q-count').innerText = draftQuestions.length;
}

function createQuiz() {
    const title = document.getElementById('quiz-title').value || "Kuis KUISI";
    const selectedTime = parseInt(document.getElementById('time-limit-setting').value);
    const maxPlayersInput = document.getElementById('max-players-setting').value;
    const selectedMaxPlayers = parseInt(maxPlayersInput);

    if (isNaN(selectedMaxPlayers) || selectedMaxPlayers < 1 || selectedMaxPlayers > 36) {
        alert("Batas jumlah pemain tidak valid! Masukkan angka antara 1 sampai 36.");
        return;
    }

    if (draftQuestions.length === 0) {
        alert("Belum ada soal!");
        return;
    }

    isHost = true;
    socket.emit('host_create_quiz', {
        title: title,
        time_limit: selectedTime,
        max_players: selectedMaxPlayers,
        questions: draftQuestions
    });
}

function startQuiz() {
    socket.emit('host_start_quiz', { pin: myPin });
    showScreen('screen-host-view');
    document.getElementById('btn-end-session').classList.remove('hidden');
}

function joinQuiz() {
    const pin = document.getElementById('input-pin').value;
    const name = document.getElementById('input-name').value;
    if (!pin || !name) return alert("Isi PIN dan Nama!");

    myPin = pin;
    socket.emit('player_join', { pin: pin, name: name });
}

function renderQuestion() {
    if (currentQuestionIndex >= myQuestions.length) {
        showScreen('screen-finish');
        document.getElementById('final-score').innerText = myScore;
        socket.emit('player_update_score', { pin: myPin, added_score: 0, is_done: true });
        return;
    }

    const currentQ = myQuestions[currentQuestionIndex];
    document.getElementById('question-counter').innerText = `Soal ${currentQuestionIndex + 1}/${myQuestions.length}`;
    document.getElementById('question-text').innerText = currentQ.q;

    const imgEl = document.getElementById('question-image');
    if (currentQ.image) {
        imgEl.src = currentQ.image;
        imgEl.classList.remove('hidden');
    } else {
        imgEl.src = "";
        imgEl.classList.add('hidden');
    }

    for (let i = 0; i < 4; i++) {
        document.getElementById(`btn-opt-${i}`).innerText = currentQ.options[i];
    }

    timeLeft = timeLimit;
    document.getElementById('timer-display').innerText = `${timeLeft}s`;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timer-display').innerText = `${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            submitAnswer(-1);
        }
    }, 1000);
}

function submitAnswer(selectedIdx) {
    clearInterval(timerInterval);
    const currentQ = myQuestions[currentQuestionIndex];
    let scoreToAdd = 0;

    if (selectedIdx === currentQ.answer) {
        const timeRatio = timeLeft / timeLimit;
        scoreToAdd = Math.round(500 + (500 * timeRatio));
        myScore += scoreToAdd;
        document.getElementById('player-score-display').innerText = `Skor: ${myScore}`;
    }

    socket.emit('player_update_score', { pin: myPin, added_score: scoreToAdd, is_done: false });
    currentQuestionIndex++;
    renderQuestion();
}

function viewLiveLeaderboard() {
    showScreen('screen-host-view');
    document.getElementById('btn-end-session').classList.add('hidden');
}

socket.on('quiz_created', (data) => {
    myPin = data.pin;
    document.getElementById('host-pin-area').classList.remove('hidden');
    document.getElementById('display-pin').innerText = myPin;
    document.getElementById('lobby-title').innerText = "Ruang Tunggu Host";
    showScreen('screen-lobby');
});

socket.on('join_success', (data) => {
    document.getElementById('lobby-title').innerText = `Menunggu "${data.title}"...`;
    showScreen('screen-lobby');
});

socket.on('lobby_update', (data) => {
    const listDiv = document.getElementById('player-list');
    listDiv.innerHTML = data.players.map(n => `<div class="player-badge">${n}</div>`).join('');
});

socket.on('game_started', (data) => {
    if (!isHost) {
        timeLimit = data.time_limit;
        myQuestions = [...data.questions].sort(() => Math.random() - 0.5);
        currentQuestionIndex = 0;
        myScore = 0;
        showScreen('screen-quiz');
        renderQuestion();
    }
});

socket.on('live_leaderboard_update', (data) => {
    const lbUl = document.getElementById('live-leaderboard');
    const podiumArea = document.getElementById('podium-area');
    lbUl.innerHTML = '';

    const allDone = data.leaderboard.length > 0 && data.leaderboard.every(p => p.done);

    if (allDone) {
        document.getElementById('leaderboard-subtitle').innerText = "PERMAINAN SELESAI";
        document.getElementById('leaderboard-subtitle').style.color = "#00c985";
        document.getElementById('leaderboard-subtitle').style.fontWeight = "bold";

        let podiumHTML = '';
        const top3 = data.leaderboard.slice(0, 3);

        if (top3[1]) podiumHTML += `<div class="podium-box rank-2"><div class="medal">🥈</div><div class="podium-name">${top3[1].name}</div><div class="podium-score">${top3[1].score} Pts</div></div>`;
        if (top3[0]) podiumHTML += `<div class="podium-box rank-1"><div class="medal">🥇</div><div class="podium-name">${top3[0].name}</div><div class="podium-score">${top3[0].score} Pts</div></div>`;
        if (top3[2]) podiumHTML += `<div class="podium-box rank-3"><div class="medal">🥉</div><div class="podium-name">${top3[2].name}</div><div class="podium-score">${top3[2].score} Pts</div></div>`;

        podiumArea.innerHTML = podiumHTML;
        podiumArea.classList.remove('hidden');

        data.leaderboard.slice(3).forEach((p, index) => {
            lbUl.innerHTML += `<li><span>#${index + 4} ${p.name}</span><span>${p.score} Pts</span></li>`;
        });
    } else {
        podiumArea.classList.add('hidden');
        data.leaderboard.forEach((p, index) => {
            const status = p.done ? "✅" : "⏳";
            lbUl.innerHTML += `<li><span>#${index + 1} ${p.name}</span><span>${p.score} Pts ${status}</span></li>`;
        });
    }
});

socket.on('error_msg', (data) => alert(data.message));

socket.on('host_ended_session', (data) => {
    if (!isHost) {
        alert(data.message);
        location.reload();
    }
});